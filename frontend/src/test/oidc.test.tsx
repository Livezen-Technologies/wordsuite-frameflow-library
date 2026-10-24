import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { config } from '@/core/config';
import { base64url, buildAuthorizationUrl, challengeS256, completeOidcSignIn, decodeJwt, oidcSession, randomString, resetDiscovery, safeNext, validateIdToken } from '@/services/oidc';
import { getToken, setToken } from '@/services/auth';
import { AuthCallback, resetCallback } from '@/pages/auth/AuthCallback';
import { mockFetch, renderAt, Route } from './utils';

const ISSUER = 'https://id.example.test';
const CLIENT = 'frameflow-web';

const jwt = (claims: Record<string, unknown>) => `${base64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256' })))}.${base64url(new TextEncoder().encode(JSON.stringify(claims)))}.sig`;

function idp(opts: { nonce?: (n: string) => string; tokenStatus?: number } = {}) {
  let lastNonce = '';
  const m = mockFetch({
    'GET /.well-known/openid-configuration': () => ({ issuer: ISSUER, authorization_endpoint: `${ISSUER}/authorize`, token_endpoint: `${ISSUER}/token`, end_session_endpoint: `${ISSUER}/logout` }),
    'POST /token': () =>
      opts.tokenStatus
        ? { status: opts.tokenStatus, body: { error: 'invalid_grant', error_description: 'Code expired' } }
        : { access_token: 'at-123', refresh_token: 'rt-456', expires_in: 3600, token_type: 'Bearer', id_token: jwt({ iss: ISSUER, aud: CLIENT, sub: 'user-1', name: 'Nimal', nonce: opts.nonce ? opts.nonce(lastNonce) : lastNonce, exp: Math.floor(Date.now() / 1000) + 300 }) },
    'GET /api/v1/admin/me': () => ({ status: 403, body: { error: { code: 'FORBIDDEN', message: 'No role' } } }),
    'GET /api/v1/me/favorites': () => ({ data: [] }),
  });
  return {
    ...m,
    async start(next = '/account/favorites') {
      const url = new URL(await buildAuthorizationUrl(next));
      lastNonce = url.searchParams.get('nonce')!;
      return url;
    },
  };
}

beforeEach(() => {
  Object.assign(config, { oidcIssuer: ISSUER, oidcClientId: CLIENT });
  resetDiscovery();
  resetCallback();
  setToken(null);
});
afterEach(() => {
  vi.unstubAllGlobals();
  Object.assign(config, { oidcIssuer: '', oidcClientId: '' });
});

describe('PKCE, state and nonce', () => {
  it('computes the RFC 7636 S256 challenge', async () => {
    // RFC 7636 appendix B
    expect(await challengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('makes URL-safe random strings of the right length that differ each time', () => {
    const a = randomString();
    const b = randomString();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    expect(randomString(48)).toHaveLength(64);
  });

  it('builds the authorization URL with S256, state and nonce and remembers them', async () => {
    const m = idp();
    const url = await m.start('/account/devices');
    expect(url.origin + url.pathname).toBe(`${ISSUER}/authorize`);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe(CLIENT);
    expect(url.searchParams.get('redirect_uri')).toBe(`${window.location.origin}/auth/callback`);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toContain('openid');
    const pending = JSON.parse(sessionStorage.getItem('fflib.oidc.pending')!);
    expect(pending.state).toBe(url.searchParams.get('state'));
    expect(pending.nonce).toBe(url.searchParams.get('nonce'));
    expect(await challengeS256(pending.verifier)).toBe(url.searchParams.get('code_challenge'));
    expect(pending.next).toBe('/account/devices');
  });

  it('rejects a callback whose state doesn’t match, without calling the token endpoint', async () => {
    const m = idp();
    await m.start();
    await expect(completeOidcSignIn('?code=abc&state=forged')).rejects.toMatchObject({ code: 'state_mismatch' });
    expect(m.calls.some((c) => c.path === '/token')).toBe(false);
    // The pending sign-in is spent: replaying the real state fails too.
    await expect(completeOidcSignIn('?code=abc&state=whatever')).rejects.toMatchObject({ code: 'no_pending' });
  });

  it('rejects an ID token with the wrong nonce', async () => {
    const m = idp({ nonce: () => 'someone-elses-nonce' });
    const url = await m.start();
    await expect(completeOidcSignIn(`?code=abc&state=${url.searchParams.get('state')}`)).rejects.toMatchObject({ code: 'nonce_mismatch' });
  });

  it('exchanges the code with the verifier and stores the refresh token', async () => {
    const m = idp();
    const url = await m.start('/account/downloads');
    const r = await completeOidcSignIn(`?code=the-code&state=${url.searchParams.get('state')}`);
    expect(r.tokens.access_token).toBe('at-123');
    expect(r.next).toBe('/account/downloads');
    expect(r.claims?.sub).toBe('user-1');
    const body = new URLSearchParams(String(m.calls.find((c) => c.path === '/token')!.body));
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('the-code');
    expect(body.get('client_id')).toBe(CLIENT);
    expect(await challengeS256(body.get('code_verifier')!)).toBe(url.searchParams.get('code_challenge'));
    expect(oidcSession.get()?.refresh_token).toBe('rt-456');
  });

  it('surfaces an error returned by the issuer', async () => {
    idp();
    await expect(completeOidcSignIn('?error=access_denied&error_description=User%20cancelled')).rejects.toMatchObject({ code: 'access_denied', message: 'User cancelled' });
  });

  it('checks issuer, audience and expiry of the ID token', () => {
    const base = { iss: ISSUER, aud: CLIENT, nonce: 'n', exp: 2_000_000_000 };
    expect(validateIdToken(jwt(base), { issuer: ISSUER, clientId: CLIENT, nonce: 'n' }).iss).toBe(ISSUER);
    expect(() => validateIdToken(jwt({ ...base, iss: 'https://evil.test' }), { issuer: ISSUER, clientId: CLIENT, nonce: 'n' })).toThrow();
    expect(() => validateIdToken(jwt({ ...base, aud: ['other'] }), { issuer: ISSUER, clientId: CLIENT, nonce: 'n' })).toThrow();
    expect(() => validateIdToken(jwt({ ...base, exp: 1 }), { issuer: ISSUER, clientId: CLIENT, nonce: 'n' })).toThrow();
    expect(decodeJwt(jwt({ name: 'ශ්‍රී' })).name).toBe('ශ්‍රී');
  });

  it('only follows local next paths', () => {
    expect(safeNext('/account/devices', '/')).toBe('/account/devices');
    expect(safeNext('//evil.test', '/')).toBe('/');
    expect(safeNext('https://evil.test', '/')).toBe('/');
  });
});

describe('/auth/callback', () => {
  it('signs a library user in and goes to the stored next page', async () => {
    const m = idp();
    const url = await m.start('/account/favorites');
    renderAt(`/auth/callback?code=c1&state=${url.searchParams.get('state')}`, <><Route path="/auth/callback" element={<AuthCallback />} /><Route path="/account/favorites" element={<p>favorites page</p>} /></>, { signedIn: false });
    expect(await screen.findByText('favorites page')).toBeInTheDocument();
    expect(getToken()).toBe('at-123');
    // /admin/me answered 403: still signed in, as a user without a Download Center role.
    await waitFor(() => expect(m.calls.filter((c) => c.path === '/api/v1/admin/me').length).toBeGreaterThan(0));
    expect(m.calls.find((c) => c.path === '/api/v1/admin/me')!.headers.Authorization).toBe('Bearer at-123');
  });

  it('shows the problem and a way back when the exchange fails', async () => {
    const m = idp({ tokenStatus: 400 });
    const url = await m.start();
    renderAt(`/auth/callback?code=c1&state=${url.searchParams.get('state')}`, <Route path="/auth/callback" element={<AuthCallback />} />, { signedIn: false });
    expect(await screen.findByRole('alert')).toHaveTextContent('Code expired');
    expect(screen.getByRole('link', { name: 'Try again' })).toHaveAttribute('href', '/login');
    expect(getToken()).toBeNull();
  });
});
