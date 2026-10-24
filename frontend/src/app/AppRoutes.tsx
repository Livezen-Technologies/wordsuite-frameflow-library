import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { Loading } from '@/components/ui/Button';
import { PublicLayout } from '@/layouts/PublicLayout';
import { HomePage } from '@/pages/public/HomePage';
import { BrowsePage } from '@/pages/public/BrowsePage';
import { AssetPage } from '@/pages/public/AssetPage';
import { PricingPage } from '@/pages/public/PricingPage';
import { LoginPage } from '@/pages/public/LoginPage';
import { NotFound } from '@/pages/public/NotFound';

// The admin is its own chunk so the public pages stay light.
const AdminApp = lazy(() => import('@/pages/admin/AdminApp'));

export function AppRoutes() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="library" element={<BrowsePage />} />
        <Route path="library/:slug" element={<AssetPage />} />
        <Route path="pricing" element={<PricingPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route
        path="admin/*"
        element={
          <Suspense fallback={<div className="px-6"><Loading label="Loading Download Center…" /></div>}>
            <AdminApp />
          </Suspense>
        }
      />
    </Routes>
  );
}
