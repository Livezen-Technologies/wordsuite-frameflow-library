import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/services/admin';
import { ApiError, setUnauthorizedHandler } from '@/services/api';
import { getToken, setToken } from '@/services/auth';
import { decodeJwt, endSessionUrl, oidcSession, refreshTokens, type TokenSet } from '@/services/oidc';
import { can as canRole, type Permission } from '@/core/schema';
import { t } from '@/i18n';
import type { Me } from '@/types/api';

type Status = 'loading' | 'signed-out' | 'signed-in';
interface AuthState {
  me: Me | null;
  status: Status;
  /** Signed in with a Download Center role. */
  isAdmin: boolean;
  /** Validates the token with GET /admin/me; throws ApiError when it isn't accepted. */
  signInWithToken: (token: string) => Promise<Me>;
  /** Finishes an OIDC sign-in (the callback page). */
  completeSignIn: (tokens: TokenSet) => Promise<Me>;
  /** Local sign-out; `remote` also ends the issuer session when it supports it. */
  signOut: (opts?: { remote?: boolean }) => void;
  can: (perm: Permission) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

/** Who the stored ID token says the user is (library users have no /admin/me). */
function claimsUser(): Me {
  const idt = oidcSession.get()?.id_token;
  try {
    const c = idt ? decodeJwt(idt) : {};
    return { id: String(c.sub ?? 'user'), role: null, name: c.name ? String(c.name) : undefined, email: c.email ? String(c.email) : undefined };
  } catch {
    return { id: 'user', role: null };
  }
}

/** GET /admin/me; a 403 means a signed-in library user without a Download Center role. */
async function loadMe(): Promise<Me> {
  try {
    return await adminApi.me();
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) return claimsUser();
    throw e;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<Status>(() => (getToken() ? 'loading' : 'signed-out'));
  const [expiresAt, setExpiresAt] = useState<number | undefined>(() => oidcSession.get()?.expires_at);

  const signOut = useCallback(
    (opts: { remote?: boolean } = {}) => {
      setToken(null);
      setMe(null);
      setStatus('signed-out');
      setExpiresAt(undefined);
      qc.clear();
      const ending = endSessionUrl();
      if (opts.remote)
        void ending.then((url) => {
          if (url) window.location.assign(url);
        });
    },
    [qc],
  );

  useEffect(() => {
    setUnauthorizedHandler(() => signOut());
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  useEffect(() => {
    if (!getToken()) return;
    let live = true;
    loadMe()
      .then((m) => {
        if (!live) return;
        setMe(m);
        setStatus('signed-in');
      })
      .catch(() => live && signOut());
    return () => {
      live = false;
    };
  }, [signOut]);

  // Refresh the access token a minute before it expires, when the issuer gave us a refresh token.
  useEffect(() => {
    if (!expiresAt || status !== 'signed-in') return;
    const wait = Math.max(5_000, expiresAt - Date.now() - 60_000);
    const timer = setTimeout(() => {
      refreshTokens()
        .then((tokens) => {
          if (!tokens) return;
          setToken(tokens.access_token);
          setExpiresAt(oidcSession.get()?.expires_at);
        })
        .catch(() => signOut());
    }, wait);
    return () => clearTimeout(timer);
  }, [expiresAt, status, signOut]);

  const accept = useCallback(async (token: string) => {
    setToken(token);
    try {
      const m = await loadMe();
      setMe(m);
      setStatus('signed-in');
      return m;
    } catch (e) {
      setToken(null);
      setStatus('signed-out');
      throw e instanceof ApiError && e.status === 401 ? new ApiError(401, e.code, t('That token wasn’t accepted.')) : e;
    }
  }, []);

  const signInWithToken = useCallback((token: string) => accept(token.trim()), [accept]);
  const completeSignIn = useCallback(
    async (tokens: TokenSet) => {
      const m = await accept(tokens.access_token);
      setExpiresAt(oidcSession.get()?.expires_at);
      return m;
    },
    [accept],
  );

  const value = useMemo<AuthState>(
    () => ({ me, status, isAdmin: !!me?.role, signInWithToken, completeSignIn, signOut, can: (p) => canRole(me?.role, p) }),
    [me, status, signInWithToken, completeSignIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
