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

function RequireSignIn({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const loc = useLocation();
  if (status === 'loading') return <div className="px-6"><Loading label="Checking your session…" /></div>;
  if (status === 'signed-out') return <Navigate to={`/admin/sign-in?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <>{children}</>;
}

export function Guard({ perm, children }: { perm: Permission; children: ReactNode }) {
  const { can } = useAuth();
  if (!can(perm)) return <Alert tone="warn" title="You don’t have access to this page">Your role doesn’t include <code>{perm}</code>. Ask a Super Admin if you need it.</Alert>;
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
        <Route path="audit" element={<Guard perm="analytics.view"><AuditLog /></Guard>} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Alert tone="warn" title="Page not found">That admin page doesn’t exist.</Alert>} />
      </Route>
    </Routes>
  );
}
