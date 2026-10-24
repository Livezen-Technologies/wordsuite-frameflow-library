import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/services/admin';
import { ApiError, setUnauthorizedHandler } from '@/services/api';
import { getToken, setToken } from '@/services/auth';
import { can as canRole, type Permission } from '@/core/schema';
import type { Me } from '@/types/api';

type Status = 'loading' | 'signed-out' | 'signed-in';
interface AuthState {
  me: Me | null;
  status: Status;
  /** Validates the token with GET /admin/me; throws ApiError when it isn't accepted. */
  signInWithToken: (token: string) => Promise<Me>;
  signOut: () => void;
  can: (perm: Permission) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<Status>(() => (getToken() ? 'loading' : 'signed-out'));

  const signOut = useCallback(() => {
    setToken(null);
    setMe(null);
    setStatus('signed-out');
    qc.clear();
  }, [qc]);

  useEffect(() => {
    setUnauthorizedHandler(signOut);
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  useEffect(() => {
    if (!getToken()) return;
    let live = true;
    adminApi
      .me()
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

  const signInWithToken = useCallback(async (token: string) => {
    setToken(token.trim());
    try {
      const m = await adminApi.me();
      setMe(m);
      setStatus('signed-in');
      return m;
    } catch (e) {
      setToken(null);
      setStatus('signed-out');
      throw e instanceof ApiError && e.status === 401 ? new ApiError(401, e.code, 'That token wasn’t accepted.') : e;
    }
  }, []);

  const value = useMemo<AuthState>(() => ({ me, status, signInWithToken, signOut, can: (p) => canRole(me?.role, p) }), [me, status, signInWithToken, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
