// Tailwind Plus Application UI · forms/sign-in-forms (01 simple).
import { Navigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useTokenSignIn } from '@/hooks/useTokenSignIn';
import { signInMethods, startOidcSignIn } from '@/services/auth';
import { inputClass } from '@/components/ui/Form';
import { Alert } from '@/components/ui/Alert';
import { buttonClass } from '@/components/ui/Button';
import { useNotify } from '@/components/ui/Notifications';
import { errorMessage } from '@/services/api';

export function SignInPage() {
  const { status } = useAuth();
  const { token, setToken, error, busy, submit } = useTokenSignIn();
  const { fail } = useNotify();
  if (status === 'signed-in') return <Navigate to="/admin" replace />;
  const methods = signInMethods();
  return (
    <div className="flex min-h-full flex-col justify-center bg-white px-6 py-12 lg:px-8 dark:bg-gray-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-sm">
        <span className="mx-auto grid size-10 place-items-center rounded-lg bg-indigo-600 text-lg font-bold text-white dark:bg-indigo-500">F</span>
        <h1 className="mt-10 text-center text-2xl/9 font-bold tracking-tight text-gray-900 dark:text-white">Sign in to the Download Center</h1>
        <p className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">FrameFlow Asset Library administration</p>
      </div>
      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
        {methods.includes('oidc') && (
          <>
            <button type="button" className={buttonClass('secondary', 'md', 'w-full')} onClick={() => { try { startOidcSignIn(); } catch (e) { fail('Not available', errorMessage(e)); } }}>
              Continue with Worksuite Cloud
            </button>
            <div className="my-6 flex items-center gap-x-4 text-xs text-gray-500"><div className="h-px flex-1 bg-gray-200 dark:bg-white/10" />or<div className="h-px flex-1 bg-gray-200 dark:bg-white/10" /></div>
          </>
        )}
        <form onSubmit={submit} className="space-y-6" noValidate>
          <div>
            <label htmlFor="token" className="block text-sm/6 font-medium text-gray-900 dark:text-gray-100">
              Access token
            </label>
            <div className="mt-2">
              <input id="token" name="token" type="password" autoComplete="current-password" required value={token} onChange={(e) => setToken(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby="token-help" className={inputClass} />
            </div>
            <p id="token-help" className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Issued by Worksuite OneAuth or set in <code>LIBRARY_ADMIN_TOKENS</code>. Local dev: <code>dev-admin</code>.
            </p>
          </div>
          {error && <Alert tone="error">{error}</Alert>}
          <button type="submit" disabled={busy} className={buttonClass('primary', 'md', 'w-full')}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-10 text-center text-sm/6 text-gray-500 dark:text-gray-400">
          <a href="/" className="font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">← Back to the public library</a>
        </p>
      </div>
    </div>
  );
}
