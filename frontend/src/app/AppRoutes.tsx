import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { Loading } from '@/components/ui/Button';
import { SiteLayout } from '@/components/site/SiteLayout';
import { Home } from '@/pages/site/Home';
import { Browse, Category } from '@/pages/site/Library';
import { AssetDetail } from '@/pages/site/AssetDetail';
import { About, Blog, BlogPost, Collections, Contact, Creators, Download, Help, Licence, Pricing, WhatsNew } from '@/pages/site/Pages';
import { AuthPage } from '@/pages/site/Auth';
import NotFoundSite from '@/pages/site/NotFound';
import { AuthCallback } from '@/pages/auth/AuthCallback';
import { AccountOverview } from '@/pages/account/AccountOverview';
import { FavoritesPage } from '@/pages/account/FavoritesPage';
import { DownloadsPage } from '@/pages/account/DownloadsPage';
import { DevicesPage } from '@/pages/account/DevicesPage';
import { t } from '@/i18n';

// The admin is its own chunk so the public pages stay light.
const AdminApp = lazy(() => import('@/pages/admin/AdminApp'));

export function AppRoutes() {
  return (
    <Routes>
      <Route path="auth/callback" element={<AuthCallback />} />
      <Route element={<SiteLayout />}>
        <Route index element={<Home />} />
        <Route path="library" element={<Browse />} />
        <Route path="library/category/:type" element={<Category />} />
        <Route path="library/:slug" element={<AssetDetail />} />
        <Route path="collections" element={<Collections />} />
        <Route path="pricing" element={<Pricing />} />
        <Route path="download" element={<Download />} />
        <Route path="whats-new" element={<WhatsNew />} />
        <Route path="blog" element={<Blog />} />
        <Route path="blog/:slug" element={<BlogPost />} />
        <Route path="help" element={<Help />} />
        <Route path="creators" element={<Creators />} />
        <Route path="about" element={<About />} />
        <Route path="contact" element={<Contact />} />
        <Route path="licence" element={<Licence />} />
        <Route path="login" element={<AuthPage mode="login" />} />
        <Route path="signup" element={<AuthPage mode="signup" />} />
        <Route path="account" element={<AccountOverview />} />
        <Route path="account/favorites" element={<FavoritesPage />} />
        <Route path="account/downloads" element={<DownloadsPage />} />
        <Route path="account/devices" element={<DevicesPage />} />
        <Route path="*" element={<NotFoundSite />} />
      </Route>
      <Route
        path="admin/*"
        element={
          <Suspense fallback={<div className="px-6"><Loading label={t('Loading Download Center…')} /></div>}>
            <AdminApp />
          </Suspense>
        }
      />
    </Routes>
  );
}
