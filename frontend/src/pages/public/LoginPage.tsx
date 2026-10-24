// Sign in. Tailwind Plus Radiant: app/login/page.tsx (GradientBackground, card form, Headless Field/Input/Label, Button).
// Signs into the Download Center admin with an access token for now; the OIDC button appears when VITE_OIDC_ISSUER is set.
import { Field, Input, Label } from '@headlessui/react';
import { clsx } from 'clsx';
import { Navigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useTokenSignIn } from '@/hooks/useTokenSignIn';
import { signInMethods, startOidcSignIn } from '@/services/auth';
import { errorMessage } from '@/services/api';
import { Button } from '@/components/radiant/button';
import { GradientBackground } from '@/components/radiant/gradient';
import { Link } from '@/components/radiant/link';
import { Mark } from '@/components/radiant/logo';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useState } from 'react';

export function LoginPage() {
  useDocumentTitle('Sign in · FrameFlow');
  const { status } = useAuth();
  const { token, setToken, error, busy, submit } = useTokenSignIn('/admin');
  const [oidcError, setOidcError] = useState<string | null>(null);
  if (status === 'signed-in') return <Navigate to="/admin" replace />;
  return (
    <main className="radiant overflow-hidden bg-gray-50">
      <GradientBackground />
      <div className="isolate flex min-h-dvh items-center justify-center p-6 lg:p-8">
        <div className="w-full max-w-md rounded-xl bg-white shadow-md ring-1 ring-black/5">
          <form onSubmit={submit} className="p-7 sm:p-11" noValidate>
            <div className="flex items-start">
              <Link href="/" title="FrameFlow home">
                <Mark className="h-9 fill-black" />
                <span className="sr-only">FrameFlow home</span>
              </Link>
            </div>
            <h1 className="mt-8 text-base/6 font-medium">Welcome back!</h1>
            <p className="mt-1 text-sm/5 text-gray-600">Sign in to the FrameFlow Download Center.</p>
            {signInMethods().includes('oidc') && (
              <div className="mt-8">
                <Button type="button" variant="outline" className="w-full" onClick={() => { try { startOidcSignIn(); } catch (e) { setOidcError(errorMessage(e)); } }}>
                  Continue with Worksuite Cloud
                </Button>
                {oidcError && <p className="mt-2 text-sm/5 text-red-700">{oidcError}</p>}
              </div>
            )}
            <Field className="mt-8 space-y-3">
              <Label className="text-sm/5 font-medium">Access token</Label>
              <Input
                required
                autoFocus
                type="password"
                name="token"
                autoComplete="current-password"
                value={token}
                invalid={!!error}
                onChange={(e) => setToken(e.target.value)}
                className={clsx(
                  'block w-full rounded-lg border border-transparent shadow-sm ring-1 ring-black/10',
                  'px-[calc(--spacing(2)-1px)] py-[calc(--spacing(1.5)-1px)] text-base/6 sm:text-sm/6',
                  'data-focus:outline-2 data-focus:-outline-offset-1 data-focus:outline-black data-invalid:ring-red-500',
                )}
              />
              <p className="text-xs/5 text-gray-500">Issued by Worksuite OneAuth. Local development: <code>dev-admin</code>.</p>
            </Field>
            {error && <p role="alert" className="mt-4 text-sm/5 text-red-700">{error}</p>}
            <div className="mt-8">
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
            </div>
          </form>
          <div className="m-1.5 rounded-lg bg-gray-50 py-4 text-center text-sm/5 ring-1 ring-black/5">
            Just browsing?{' '}
            <Link href="/library" className="font-medium hover:text-gray-600">
              Explore the library
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
