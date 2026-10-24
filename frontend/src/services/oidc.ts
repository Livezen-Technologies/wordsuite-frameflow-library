/**
 * OpenID Connect sign-in: Authorization Code flow with PKCE (S256), for admins and library users alike.
 *
 *  - discovery: `${VITE_OIDC_ISSUER}/.well-known/openid-configuration`
 *  - start: random `state`, `nonce` and code verifier kept in sessionStorage, redirect to the authorization endpoint
 *  - callback (`/auth/callback`): `state` must match, the code is exchanged with the verifier, and the ID token's
 *    `nonce`, `iss`, `aud` and `exp` are checked. The signature is verified by the API on every request (it checks the
 *    access token against the issuer's keys), so the browser does not fetch JWKS.
 *  - tokens: access token in memory + sessionStorage (services/auth.ts); refresh token, if issued, in sessionStorage
 *  - sign-out: clears the session and goes to `end_session_endpoint` when the issuer has one
 */
import { config } from '@/core/config';
import { t } from '@/i18n';

export interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
  userinfo_endpoint?: string;
}

export interface TokenSet {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

export interface StoredSession {
  refresh_token?: string;
  id_token?: string;
  /** epoch ms */
  expires_at?: number;
}

interface Pending {
  state: string;
  nonce: string;
  verifier: string;
  next: string;
  created_at: number;
}

const PENDING_KEY = 'fflib.oidc.pending';
const SESSION_KEY = 'fflib.oidc.session';
export const SCOPES = 'openid profile email offline_access';

export class OidcError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'OidcError';
    this.code = code;
  }
}

// ---------------------------------------------------------------- PKCE, state, nonce

export function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** URL-safe random string from `bytes` random bytes (32 → 43 characters, within RFC 7636's 43–128). */
export function randomString(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64url(buf);
}

/** RFC 7636 S256: BASE64URL(SHA-256(ASCII(verifier))). */
export async function challengeS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

/** Decodes a JWT's payload (no signature check). */
export function decodeJwt(token: string): Record<string, unknown> {
  const part = token.split('.')[1];
  if (!part) throw new OidcError('invalid_id_token', t('The sign-in response was malformed.'));
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

/** Checks the ID token claims that bind it to this sign-in. Returns the claims. */
export function validateIdToken(idToken: string, expected: { issuer: string; clientId: string; nonce: string; now?: number }): Record<string, unknown> {
  const c = decodeJwt(idToken);
  const now = Math.floor((expected.now ?? Date.now()) / 1000);
  const trim = (s: unknown) => String(s ?? '').replace(/\/+$/, '');
  if (trim(c.iss) !== trim(expected.issuer)) throw new OidcError('invalid_id_token', t('The sign-in response came from an unexpected issuer.'));
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(expected.clientId)) throw new OidcError('invalid_id_token', t('The sign-in response was meant for another app.'));
  if (c.nonce !== expected.nonce) throw new OidcError('nonce_mismatch', t('The sign-in response didn’t match this sign-in attempt. Try again.'));
  if (typeof c.exp === 'number' && c.exp + 60 < now) throw new OidcError('expired', t('The sign-in response has expired. Try again.'));
  return c;
}

// ---------------------------------------------------------------- storage

const ss = {
  get<T>(k: string): T | null {
    try {
      const v = sessionStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : null;
    } catch {
      return null;
    }
  },
  set(k: string, v: unknown) {
    try {
      if (v == null) sessionStorage.removeItem(k);
      else sessionStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* storage blocked */
    }
  },
};

export const oidcSession = {
  get: () => ss.get<StoredSession>(SESSION_KEY),
  set: (s: StoredSession | null) => ss.set(SESSION_KEY, s),
};

// ---------------------------------------------------------------- endpoints

export const oidcEnabled = (): boolean => !!config.oidcIssuer && !!config.oidcClientId;

export function redirectUri(): string {
  const base = config.basePath === '/' ? '' : config.basePath;
  return `${window.location.origin}${base}/auth/callback`;
}

let discoveryCache: Promise<Discovery> | null = null;
export function resetDiscovery(): void {
  discoveryCache = null;
}

export function discover(issuer: string = config.oidcIssuer): Promise<Discovery> {
  discoveryCache ??= fetch(`${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`, { headers: { Accept: 'application/json' } })
    .then(async (r) => {
      if (!r.ok) throw new OidcError('discovery_failed', t('Couldn’t reach the sign-in service ({status}).', { status: r.status }));
      return (await r.json()) as Discovery;
    })
    .catch((e) => {
      discoveryCache = null;
      throw e instanceof OidcError ? e : new OidcError('discovery_failed', t('Couldn’t reach the sign-in service.'));
    });
  return discoveryCache;
}

/** Only same-site paths are allowed after sign-in. */
export const safeNext = (next: string | null | undefined, fallback: string): string => (next && next.startsWith('/') && !next.startsWith('//') ? next : fallback);

/** Builds the authorization URL and stores the pending state. Exposed for tests; `startOidcSignIn` redirects to it. */
export async function buildAuthorizationUrl(next: string): Promise<string> {
  const d = await discover();
  const pending: Pending = { state: randomString(), nonce: randomString(), verifier: randomString(48), next, created_at: Date.now() };
  ss.set(PENDING_KEY, pending);
  const u = new URL(d.authorization_endpoint);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', config.oidcClientId);
  u.searchParams.set('redirect_uri', redirectUri());
  u.searchParams.set('scope', SCOPES);
  u.searchParams.set('state', pending.state);
  u.searchParams.set('nonce', pending.nonce);
  u.searchParams.set('code_challenge', await challengeS256(pending.verifier));
  u.searchParams.set('code_challenge_method', 'S256');
  return u.toString();
}

export async function startOidcSignIn(next = '/'): Promise<void> {
  window.location.assign(await buildAuthorizationUrl(next));
}

async function tokenRequest(d: Discovery, params: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(d.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(params).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as TokenSet & { error?: string; error_description?: string };
  if (!res.ok || !body.access_token) throw new OidcError(body.error ?? 'token_failed', body.error_description ?? t('The sign-in service didn’t issue a token.'));
  return body;
}

function remember(tokens: TokenSet, previous?: StoredSession | null): StoredSession {
  const s: StoredSession = {
    refresh_token: tokens.refresh_token ?? previous?.refresh_token,
    id_token: tokens.id_token ?? previous?.id_token,
    expires_at: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
  };
  oidcSession.set(s);
  return s;
}

/** Handles `/auth/callback?code&state`: checks state, exchanges the code, checks the nonce. */
export async function completeOidcSignIn(search: string): Promise<{ tokens: TokenSet; claims: Record<string, unknown> | null; next: string }> {
  const params = new URLSearchParams(search);
  const pending = ss.get<Pending>(PENDING_KEY);
  if (params.get('error')) {
    ss.set(PENDING_KEY, null);
    throw new OidcError(params.get('error')!, params.get('error_description') ?? t('Sign-in was cancelled or refused.'));
  }
  const code = params.get('code');
  const state = params.get('state');
  if (!pending) throw new OidcError('no_pending', t('This sign-in link has already been used or has expired. Start again.'));
  if (!code || !state || state !== pending.state) {
    ss.set(PENDING_KEY, null);
    throw new OidcError('state_mismatch', t('The sign-in response didn’t match this sign-in attempt. Try again.'));
  }
  ss.set(PENDING_KEY, null);
  const d = await discover();
  const tokens = await tokenRequest(d, { grant_type: 'authorization_code', code, redirect_uri: redirectUri(), client_id: config.oidcClientId, code_verifier: pending.verifier });
  const claims = tokens.id_token ? validateIdToken(tokens.id_token, { issuer: d.issuer || config.oidcIssuer, clientId: config.oidcClientId, nonce: pending.nonce }) : null;
  remember(tokens);
  return { tokens, claims, next: pending.next };
}

/** Uses the stored refresh token, if any. Resolves to null when there is nothing to refresh. */
export async function refreshTokens(): Promise<TokenSet | null> {
  const s = oidcSession.get();
  if (!s?.refresh_token) return null;
  const d = await discover();
  const tokens = await tokenRequest(d, { grant_type: 'refresh_token', refresh_token: s.refresh_token, client_id: config.oidcClientId });
  remember(tokens, s);
  return tokens;
}

/** Where to send the browser after a local sign-out (the issuer's end-session endpoint), or null. */
export async function endSessionUrl(): Promise<string | null> {
  const s = oidcSession.get();
  oidcSession.set(null);
  if (!oidcEnabled()) return null;
  try {
    const d = await discover();
    if (!d.end_session_endpoint) return null;
    const u = new URL(d.end_session_endpoint);
    if (s?.id_token) u.searchParams.set('id_token_hint', s.id_token);
    u.searchParams.set('client_id', config.oidcClientId);
    u.searchParams.set('post_logout_redirect_uri', `${window.location.origin}${config.basePath === '/' ? '/' : `${config.basePath}/`}`);
    return u.toString();
  } catch {
    return null;
  }
}
