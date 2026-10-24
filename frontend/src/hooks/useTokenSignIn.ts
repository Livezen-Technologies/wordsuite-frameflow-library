import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { errorMessage } from '@/services/api';
import { safeNext, startOidcSignIn } from '@/services/oidc';
import { t } from '@/i18n';

/** Where to go after signing in: `?next=` if it's a local path, else the admin for admins and My library for users. */
export function useNextTarget(defaultNext?: string) {
  const [params] = useSearchParams();
  return (isAdmin: boolean) => safeNext(params.get('next'), defaultNext ?? (isAdmin ? '/admin' : '/account/favorites'));
}

/** Development token sign-in, shared by the admin sign-in screen and the public /login page. */
export function useTokenSignIn(defaultNext?: string) {
  const { signInWithToken } = useAuth();
  const navigate = useNavigate();
  const target = useNextTarget(defaultNext);
  const [token, setTokenValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return setError(t('Enter your access token.'));
    setBusy(true);
    setError(null);
    try {
      const me = await signInWithToken(token);
      navigate(target(!!me.role), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return { token, setToken: setTokenValue, error, busy, submit };
}

/** OIDC redirect button state, shared by both sign-in screens. */
export function useOidcSignIn(defaultNext?: string) {
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      await startOidcSignIn(safeNext(params.get('next'), defaultNext ?? ''));
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return { start, error, busy };
}
