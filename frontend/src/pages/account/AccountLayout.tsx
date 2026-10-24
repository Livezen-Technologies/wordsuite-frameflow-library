// My library shell (mockup "ACCOUNT"): sidebar with name, plan and sections; content on the right.
import type { ReactNode } from 'react';
import { Navigate, NavLink, useLocation } from 'react-router';
import { clsx } from 'clsx';
import { useAuth } from '@/hooks/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { t, tx } from '@/i18n';

export function AccountLayout({ title, lead, children }: { title: string; lead?: ReactNode; children: ReactNode }) {
  useDocumentTitle(`${title} · ${t('My library')} · FrameFlow`);
  const { status, me, signOut } = useAuth();
  const loc = useLocation();
  if (status === 'signed-out') return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  const tabs = [
    { to: '/account', name: t('Overview'), end: true },
    { to: '/account/favorites', name: t('Favorites') },
    { to: '/account/downloads', name: t('Download history') },
    { to: '/account/devices', name: t('Devices') },
  ];
  return (
    <div className="gut">
      <div className="mx-auto grid max-w-7xl gap-10 py-12 lg:grid-cols-[220px_1fr]">
        <aside className="space-y-1 text-sm">
          <p className="truncate text-base font-medium">{me?.name ?? me?.email ?? me?.id ?? '…'}</p>
          <p className="mb-4 text-gray-500">{me?.plan ? t('{plan} plan', { plan: tx(me.plan) }) : t('Signed in with WorkSuite')}</p>
          <nav aria-label={t('My library')} className="space-y-1">
            {tabs.map((tab) => (
              <NavLink key={tab.to} to={tab.to} end={tab.end} className={({ isActive }) => clsx('block rounded-lg px-3 py-2', isActive ? 'bg-gray-100 font-medium' : 'hover:bg-gray-50')}>
                {tab.name}
              </NavLink>
            ))}
          </nav>
          <button type="button" onClick={() => signOut({ remote: true })} className="mt-4 block px-3 py-2 text-gray-500 hover:text-gray-950">{t('Sign out')}</button>
        </aside>
        <div className="min-w-0">
          <h1 className="text-3xl font-medium">{title}</h1>
          {lead && <p className="mt-2 max-w-2xl text-gray-600">{lead}</p>}
          <div className="mt-6">{status === 'loading' ? <p role="status" className="text-sm text-gray-600">{t('Loading…')}</p> : children}</div>
        </div>
      </div>
    </div>
  );
}

/** Radiant-style framed message (empty and error states). */
export function Notice({ title, children, tone = 'plain', action }: { title: string; children?: ReactNode; tone?: 'plain' | 'error'; action?: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : undefined} className={clsx('rounded-3xl p-10 text-center ring-1', tone === 'error' ? 'bg-red-50 ring-red-900/10' : 'bg-gray-50 ring-black/5')}>
      <p className={clsx('text-base/6 font-medium', tone === 'error' ? 'text-red-900' : 'text-gray-950')}>{title}</p>
      {children && <p className={clsx('mx-auto mt-2 max-w-xl text-sm/6', tone === 'error' ? 'text-red-800' : 'text-gray-600')}>{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
