// Public site shell from the FrameFlow Library mockup (Radiant look): sticky blurred header with "/" search
// shortcut, call-to-action band and five-column footer with the language switch.
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { clsx } from 'clsx';
import { useAuth } from '@/hooks/useAuth';
import { LOCALES, msg, t, useLocale, type MessageKey } from '@/i18n';
import { LanguageSwitcher } from '@/components/radiant/language-switcher';

const NAV: [string, MessageKey][] = [
  ['/library', msg('Library')],
  ['/#types', msg('Categories')],
  ['/collections', msg('Collections')],
  ['/pricing', msg('Pricing')],
  ['/creators', msg('Creators')],
  ['/blog', msg('Blog')],
  ['/help', msg('Help')],
];

export function Brand({ size = 'size-8', className }: { size?: string; className?: string }) {
  return <span aria-hidden="true" className={clsx('grad grid place-items-center rounded-lg font-bold text-gray-950', size, className)}>F</span>;
}

function Header() {
  const [open, setOpen] = useState(false);
  const { status } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
        e.preventDefault();
        navigate('/library?focus=1');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navigate]);
  const signedIn = status === 'signed-in';
  const navClass = ({ isActive }: { isActive: boolean }) => clsx('rounded-lg px-2.5 py-2 hover:bg-black/5', isActive && 'bg-black/5');
  return (
    <header className="gut sticky top-0 z-30 border-b border-black/5 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 py-3">
        <Link to="/" className="flex shrink-0 items-center gap-2 text-lg font-semibold">
          <Brand />
          FrameFlow <span className="hidden font-normal text-gray-400 sm:inline">{t('Library')}</span>
        </Link>
        <nav aria-label={t('Main')} className="hidden min-w-0 gap-0.5 overflow-x-auto text-sm font-medium whitespace-nowrap xl:flex">
          {NAV.map(([to, name]) => (
            <NavLink key={to} to={to} end={to === '/library'} className={navClass}>{t(name)}</NavLink>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Link to="/library?focus=1" className="hidden items-center gap-2 rounded-full px-3 py-1.5 text-sm whitespace-nowrap text-gray-500 ring-1 ring-black/10 md:flex xl:hidden 2xl:flex">
            <span aria-hidden="true">⌕</span> {t('Search assets')} <kbd className="rounded bg-gray-100 px-1.5 text-xs">/</kbd>
          </Link>
          <Link to={signedIn ? '/account' : '/login'} className="hidden px-2 text-sm font-medium sm:inline">{signedIn ? t('My library') : t('Sign in')}</Link>
          <Link to="/download" className="btn btn-p text-sm max-sm:hidden">{t('Get FrameFlow')}</Link>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="mobile-nav" className="btn btn-o xl:hidden" aria-label={t('Open main menu')}>☰</button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label={t('Main')} className="mx-auto grid max-w-7xl grid-cols-2 gap-1 pb-3 text-sm xl:hidden">
          {[...NAV, [signedIn ? '/account' : '/login', signedIn ? msg('My library') : msg('Sign in')] as [string, MessageKey]].map(([to, name]) => (
            <Link key={to} to={to} className="rounded-lg bg-gray-50 px-3 py-2">{t(name)}</Link>
          ))}
          <div className="col-span-2"><LanguageSwitcher className="-ml-3" /></div>
        </nav>
      )}
    </header>
  );
}

const FOOT: [MessageKey, [string, MessageKey][]][] = [
  [msg('Library'), [['/library', msg('Browse')], ['/#types', msg('Categories')], ['/collections', msg('Collections')], ['/whats-new', msg('What’s new')]]],
  [msg('Product'), [['/download', msg('Download app')], ['/pricing', msg('Pricing')], ['/creators', msg('For creators')], ['/blog', msg('Blog')]]],
  [msg('Support'), [['/help', msg('Help center')], ['/contact', msg('Contact')], ['/licence', msg('Licence')], ['/account', msg('My account')]]],
  [msg('Company'), [['/about', msg('About')], ['/contact', msg('Careers')], ['/licence', msg('Terms')], ['/licence', msg('Privacy')]]],
];

export function CtaBand() {
  return (
    <div className="grad my-8 rounded-4xl p-10 text-center sm:p-16">
      <p className="eyebrow !text-gray-800">{t('Get started')}</p>
      <h2 className="mt-2 text-4xl font-medium tracking-tight sm:text-5xl">{t('Ready to edit faster?')}</h2>
      <p className="mt-4 text-gray-950/75">{t('Free plan includes 200 assets. Upgrade any time.')}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/download" className="btn btn-p">{t('Download FrameFlow')}</Link>
        <Link to="/pricing" className="btn btn-s">{t('Compare plans')}</Link>
      </div>
    </div>
  );
}

function Footer() {
  const { locale, setLocale } = useLocale();
  return (
    <footer className="gut">
      <div className="mx-auto max-w-7xl">
        <CtaBand />
        <div className="grid grid-cols-2 gap-8 border-t border-black/10 py-12 text-sm md:grid-cols-5">
          <div className="col-span-2 md:col-span-1">
            <p className="flex items-center gap-2 font-semibold"><Brand size="size-7" className="text-xs" />FrameFlow</p>
            <p className="mt-3 text-gray-500">{t('Creative assets that install themselves.')}</p>
          </div>
          {FOOT.map(([h, links]) => (
            <div key={h}>
              <p className="eyebrow">{t(h)}</p>
              <ul className="mt-3 space-y-2">
                {links.map(([to, name], i) => (
                  <li key={i}><Link to={to} className="text-gray-700 hover:text-gray-950">{t(name)}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-t border-black/10 py-6 text-xs text-gray-500">
          <span>© {new Date().getFullYear()} {t('Livezen Technologies. FrameFlow is part of WorkSuite.')}</span>
          <span role="group" aria-label={t('Language')}>
            {LOCALES.map((l, i) => (
              <span key={l.code}>
                {i > 0 && ' · '}
                <button type="button" lang={l.code} onClick={() => setLocale(l.code)} aria-pressed={l.code === locale} className={clsx('hover:text-gray-950', l.code === locale && 'font-semibold text-gray-950')}>{l.name}</button>
              </span>
            ))}
          </span>
        </div>
      </div>
    </footer>
  );
}

export function SiteLayout() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo?.(0, 0);
  }, [pathname, hash]);
  return (
    <div className="site min-h-full">
      <a href="#site-main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2">{t('Skip to content')}</a>
      <Header />
      <main id="site-main">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

/** Page without the CTA band (sign-in flows) still uses the header and footer: same shell. */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={clsx('eyebrow', className)}>{children}</p>;
}
