// OIDC redirect target (/auth/callback). Tailwind Plus Radiant: login page card (GradientBackground, rounded card, Button).
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { completeOidcSignIn, type TokenSet } from '@/services/oidc';
import { errorMessage } from '@/services/api';
import { GradientBackground } from '@/components/radiant/gradient';
import { Button } from '@/components/radiant/button';
import { Mark } from '@/components/radiant/logo';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { t } from '@/i18n';

// StrictMode runs effects twice; the code may only be exchanged once.
let inflight: { search: string; p: Promise<{ tokens: TokenSet; next: string }> } | null = null;
function exchangeOnce(search: string) {
  if (!inflight || inflight.search !== search) inflight = { search, p: completeOidcSignIn(search) };
  return inflight.p;
}
/** Tests only. */
export const resetCallback = () => void (inflight = null);

export function AuthCallback() {
  useDocumentTitle(`${t('Signing in…')} · FrameFlow`);
  const { search } = useLocation();
  const navigate = useNavigate();
  const { completeSignIn } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    exchangeOnce(search)
      .then(async ({ tokens, next }) => {
        const me = await completeSignIn(tokens);
        if (live) navigate(next || (me.role ? '/admin' : '/account/favorites'), { replace: true });
      })
      .catch((e) => live && setError(errorMessage(e)));
    return () => {
      live = false;
    };
  }, [search, completeSignIn, navigate]);

  return (
    <main className="radiant overflow-hidden bg-gray-50">
      <GradientBackground />
      <div className="isolate flex min-h-dvh items-center justify-center p-6 lg:p-8">
        <div className="w-full max-w-md rounded-xl bg-white p-7 shadow-md ring-1 ring-black/5 sm:p-11">
          <Mark className="h-9 fill-black" />
          {error ? (
            <>
              <h1 className="mt-8 text-base/6 font-medium">{t('Sign-in didn’t complete')}</h1>
              <p role="alert" className="mt-2 text-sm/6 text-red-700">{error}</p>
              <div className="mt-8">
                <Button href="/login" className="w-full">{t('Try again')}</Button>
              </div>
            </>
          ) : (
            <>
              <h1 className="mt-8 text-base/6 font-medium">{t('Signing in…')}</h1>
              <p role="status" className="mt-2 text-sm/6 text-gray-600">{t('Finishing sign-in with Worksuite Cloud.')}</p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
