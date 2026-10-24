import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { errorMessage } from '@/services/api';

/** Shared by the admin sign-in screen and the public /login page. */
export function useTokenSignIn(defaultNext = '/admin') {
  const { signInWithToken } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [token, setTokenValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = params.get('next');
  const target = next && next.startsWith('/admin') ? next : defaultNext;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return setError('Enter your access token.');
    setBusy(true);
    setError(null);
    try {
      await signInWithToken(token);
      navigate(target, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return { token, setToken: setTokenValue, error, busy, submit };
}
