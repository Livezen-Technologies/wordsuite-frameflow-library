import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { AdminLayout } from '@/layouts/AdminLayout';
import { Alert } from '@/components/ui/Alert';
import { Loading } from '@/components/ui/Button';
import type { Permission } from '@/core/schema';
import { SignInPage } from '@/pages/auth/SignInPage';
import { Dashboard } from './Dashboard';
import { AssetLibrary } from './AssetLibrary';
import { UploadCenter } from './UploadCenter';
import { AssetEditor } from './AssetEditor';
import { ReviewQueue } from './ReviewQueue';
import { Processing } from './Processing';
import { Categories } from './Categories';
import { AuditLog } from './AuditLog';
import { Settings } from './Settings';
import { Collections } from './Collections';
import { CollectionEditor } from './CollectionEditor';
import { AccessTiers } from './AccessTiers';
import { Analytics } from './Analytics';
import { t, tr } from '@/i18n';

function RequireSignIn({ children }: { children: ReactNode }) {
  const { status, isAdmin } = useAuth();
  const loc = useLocation();
  if (status === 'loading') return <div className="px-6"><Loading label={t('Checking your session…')} /></div>;
  if (status === 'signed-out' || !isAdmin) return <Navigate to={`/admin/sign-in?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <>{children}</>;
}

export function Guard({ perm, children }: { perm: Permission; children: ReactNode }) {
  const { can } = useAuth();
  if (!can(perm)) return <Alert tone="warn" title={t('You don’t have access to this page')}>{tr('Your role doesn’t include {perm}. Ask a Super Admin if you need it.', { perm: <code>{perm}</code> })}</Alert>;
  return <>{children}</>;
}

export default function AdminApp() {
  return (
    <Routes>
      <Route path="sign-in" element={<SignInPage />} />
      <Route
        element={
          <RequireSignIn>
            <AdminLayout />
          </RequireSignIn>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="assets" element={<AssetLibrary />} />
        <Route path="assets/:id" element={<AssetEditor />} />
        <Route path="upload" element={<Guard perm="asset.create"><UploadCenter /></Guard>} />
        <Route path="processing" element={<Guard perm="asset.create"><Processing /></Guard>} />
        <Route path="review" element={<Guard perm="asset.review"><ReviewQueue /></Guard>} />
        <Route path="categories" element={<Categories />} />
        <Route path="collections" element={<Guard perm="taxonomy.manage"><Collections /></Guard>} />
        <Route path="collections/new" element={<Guard perm="taxonomy.manage"><CollectionEditor /></Guard>} />
        <Route path="collections/:slug" element={<Guard perm="taxonomy.manage"><CollectionEditor /></Guard>} />
        <Route path="analytics" element={<Guard perm="analytics.view"><Analytics /></Guard>} />
        <Route path="access" element={<Guard perm="settings.manage"><AccessTiers /></Guard>} />
        <Route path="audit" element={<Guard perm="analytics.view"><AuditLog /></Guard>} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Alert tone="warn" title={t('Page not found')}>{t('That admin page doesn’t exist.')}</Alert>} />
      </Route>
    </Routes>
  );
}
