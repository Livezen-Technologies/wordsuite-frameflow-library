// Tailwind Plus Application UI · forms/sign-in-forms (01 simple).
import { Navigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useOidcSignIn, useTokenSignIn } from '@/hooks/useTokenSignIn';
import { signInMethods } from '@/services/auth';
import { inputClass } from '@/components/ui/Form';
import { Alert } from '@/components/ui/Alert';
import { buttonClass } from '@/components/ui/Button';
import { LanguageMenu } from '@/components/ui/LanguageMenu';
import { t, tr } from '@/i18n';

export function SignInPage() {
  const { status, isAdmin } = useAuth();
  const { token, setToken, error, busy, submit } = useTokenSignIn('/admin');
  const oidc = useOidcSignIn('/admin');
  if (status === 'signed-in' && isAdmin) return <Navigate to="/admin" replace />;
  const methods = signInMethods();
  return (
    <div className="flex min-h-full flex-col justify-center bg-white px-6 py-12 lg:px-8 dark:bg-gray-900">
      <div className="absolute top-4 right-6">
        <LanguageMenu />
      </div>
      <div className="sm:mx-auto sm:w-full sm:max-w-sm">
        <span className="mx-auto grid size-10 place-items-center rounded-lg bg-indigo-600 text-lg font-bold text-white dark:bg-indigo-500">F</span>
        <h1 className="mt-10 text-center text-2xl/9 font-bold tracking-tight text-gray-900 dark:text-white">{t('Sign in to the Download Center')}</h1>
        <p className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">{t('FrameFlow Asset Library administration')}</p>
      </div>
      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
        {status === 'signed-in' && !isAdmin && (
          <Alert tone="warn" className="mb-6" title={t('Your account has no Download Center role')}>
            {t('You’re signed in as a library user. Ask a Super Admin to give you a role (library_roles claim).')}
          </Alert>
        )}
        {methods.includes('oidc') && (
          <>
            <button type="button" disabled={oidc.busy} className={buttonClass('primary', 'md', 'w-full')} onClick={() => void oidc.start()}>
              {oidc.busy ? t('Redirecting…') : t('Continue with Worksuite Cloud')}
            </button>
            {oidc.error && <Alert tone="error" className="mt-4">{oidc.error}</Alert>}
          </>
        )}
        {methods.includes('token') && (
          <form onSubmit={submit} className="space-y-6" noValidate>
            <div>
              <label htmlFor="token" className="block text-sm/6 font-medium text-gray-900 dark:text-gray-100">
                {t('Access token')}
              </label>
              <div className="mt-2">
                <input id="token" name="token" type="password" autoComplete="current-password" required value={token} onChange={(e) => setToken(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby="token-help" className={inputClass} />
              </div>
              <p id="token-help" className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {tr('Development build: set in {env}. Local dev: {token}.', { env: <code>LIBRARY_ADMIN_TOKENS</code>, token: <code>dev-admin</code> })}
              </p>
            </div>
            {error && <Alert tone="error">{error}</Alert>}
            <button type="submit" disabled={busy} className={buttonClass('primary', 'md', 'w-full')}>
              {busy ? t('Signing in…') : t('Sign in')}
            </button>
          </form>
        )}
        <p className="mt-10 text-center text-sm/6 text-gray-500 dark:text-gray-400">
          <a href="/" className="font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">← {t('Back to the public library')}</a>
        </p>
      </div>
    </div>
  );
}
