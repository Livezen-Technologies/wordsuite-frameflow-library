import { Link } from 'react-router';
import { t } from '@/i18n';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function NotFoundSite() {
  useDocumentTitle(`404 · FrameFlow`);
  return (
    <div className="gut grid min-h-[560px] place-items-center text-center">
      <div>
        <p className="eyebrow">404</p>
        <h1 className="mt-2 text-6xl font-medium tracking-tight">{t('This frame was cut.')}</h1>
        <p className="mt-4 text-gray-600">{t('The page you’re looking for doesn’t exist or has moved.')}</p>
        <div className="mt-8 flex justify-center gap-3"><Link to="/" className="btn btn-p">{t('Go home')}</Link><Link to="/library" className="btn btn-o">{t('Browse library')}</Link></div>
      </div>
    </div>
  );
}
