// Sign in / Create account (mockup "LOGIN" / "SIGNUP"). Both go through WorkSuite OneAuth (OIDC + PKCE): accounts are
// created on the OneAuth side. Without VITE_OIDC_ISSUER (development) the card offers the access-token field instead.
import { Link, Navigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useNextTarget, useOidcSignIn, useTokenSignIn } from '@/hooks/useTokenSignIn';
import { signInMethods } from '@/services/auth';
import { MAKE_CHIPS } from '@/content/site';
import { t, tr, tx } from '@/i18n';
import { Brand } from '@/components/site/SiteLayout';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const signup = mode === 'signup';
  useDocumentTitle(`${signup ? t('Create your account') : t('Sign in')} · FrameFlow`);
  const { status, isAdmin } = useAuth();
  const { token, setToken, error, busy, submit } = useTokenSignIn();
  const oidc = useOidcSignIn();
  const target = useNextTarget();
  if (status === 'signed-in') return <Navigate to={target(isAdmin)} replace />;
  const methods = signInMethods();
  return (
    <div className="gut grad grid min-h-[640px] place-items-center py-16">
      <div className="card w-full max-w-md p-10">
        {!signup && <Brand size="size-10" />}
        <h1 className={signup ? 'text-2xl font-medium' : 'mt-6 text-2xl font-medium'}>{signup ? t('Create your account') : t('Sign in to FrameFlow')}</h1>
        <p className="text-sm text-gray-500">{signup ? t('Free plan · 200 assets · no card needed.') : t('Use your WorkSuite account.')}</p>
        {methods.includes('oidc') && (
          <>
            <button type="button" disabled={oidc.busy} onClick={() => void oidc.start()} className="btn btn-p mt-6 w-full !py-2.5">
              {oidc.busy ? t('Redirecting…') : signup ? t('Create account with WorkSuite OneAuth') : t('Continue with WorkSuite OneAuth')}
            </button>
            {oidc.error && <p role="alert" className="mt-3 text-sm text-red-700">{oidc.error}</p>}
            <p className="mt-3 text-xs text-gray-500">{signup ? t('Your FrameFlow account is your WorkSuite account. You’ll set your name, email and password on the WorkSuite page, then come back here.') : t('You’ll sign in on the WorkSuite page and come back here.')}</p>
          </>
        )}
        {methods.includes('token') && (
          <form onSubmit={submit} noValidate className="mt-6">
            <label className="grid gap-1 text-sm">
              {t('Access token')}
              <input type="password" name="token" autoComplete="current-password" value={token} onChange={(e) => setToken(e.target.value)} aria-invalid={error ? true : undefined} className="field" />
            </label>
            <p className="mt-2 text-xs text-gray-500">{tr('Development build: sign-in with Worksuite Cloud is off (no VITE_OIDC_ISSUER). Local token: {token}.', { token: <code>dev-admin</code> })}</p>
            {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={busy} className="btn btn-p mt-6 w-full">{busy ? t('Signing in…') : signup ? t('Create account') : t('Sign in')}</button>
          </form>
        )}
        {signup && (
          <div className="mt-6">
            <p className="text-sm">{t('What do you mostly make?')}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">{MAKE_CHIPS.map((c) => <Link key={c} to={`/library?q=${encodeURIComponent(tx(c))}`} className="btn btn-o">{tx(c)}</Link>)}</div>
          </div>
        )}
        <p className="mt-6 text-center text-sm text-gray-500">
          {signup ? <>{t('Already have an account?')} <Link to="/login" className="font-medium text-gray-950">{t('Sign in')}</Link></> : <>{t('New here?')} <Link to="/signup" className="font-medium text-gray-950">{t('Create an account')}</Link></>}
        </p>
      </div>
    </div>
  );
}
