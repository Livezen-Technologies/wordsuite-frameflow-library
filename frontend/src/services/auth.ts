/**
 * Session token storage. The access token comes from the OIDC sign-in (services/oidc.ts) or, in development
 * builds without `VITE_OIDC_ISSUER`, is entered by hand (static tokens, `LIBRARY_ADMIN_TOKENS`).
 * It lives in memory and in sessionStorage (this tab only).
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

/** OIDC when an issuer is configured; otherwise (development) the access-token form. */
export function signInMethods(): SignInMethod[] {
  return config.oidcIssuer ? ['oidc'] : ['token'];
}
