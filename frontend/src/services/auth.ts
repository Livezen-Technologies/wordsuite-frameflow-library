/**
 * Session token storage. Today the token is entered by hand (static admin tokens, `LIBRARY_ADMIN_TOKENS`);
 * a OneAuth OIDC access token goes through the same path: `startOidcSignIn()` will redirect to the issuer
 * and the callback route will call `setToken(accessToken)`.
 */
import { config } from '@/core/config';
import { setTokenGetter } from '@/services/api';

const KEY = 'fflib.token';
let memory: string | null = null;

export function getToken(): string | null {
  if (memory) return memory;
  try {
    memory = sessionStorage.getItem(KEY);
  } catch {
    /* storage blocked */
  }
  return memory;
}

export function setToken(token: string | null): void {
  memory = token;
  try {
    if (token) sessionStorage.setItem(KEY, token);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the token lives for this tab only */
  }
}

setTokenGetter(getToken);

export type SignInMethod = 'token' | 'oidc';

/** Which sign-in methods the screen offers. */
export function signInMethods(): SignInMethod[] {
  return config.oidcIssuer ? ['oidc', 'token'] : ['token'];
}

/** OIDC authorization-code + PKCE redirect. Not implemented yet: the API already verifies OneAuth tokens. */
export function startOidcSignIn(): never {
  throw new Error('Sign-in with Worksuite Cloud is not set up in this build yet. Use an access token.');
}
