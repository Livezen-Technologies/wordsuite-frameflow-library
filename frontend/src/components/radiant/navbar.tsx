// Ported from Tailwind Plus Radiant (src/components/navbar.tsx) with FrameFlow links.
import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react';
import { Bars2Icon } from '@heroicons/react/24/solid';
import { motion } from 'framer-motion';
import { Link } from './link';
import { Logo } from './logo';
import { PlusGrid, PlusGridItem, PlusGridRow } from './plus-grid';
import { LanguageSwitcher } from './language-switcher';
import { useAuth } from '@/hooks/useAuth';
import { t } from '@/i18n';

function useLinks() {
  const { status, isAdmin } = useAuth();
  const signedIn = status === 'signed-in';
  return [
    { href: '/library', label: t('Library') },
    { href: '/pricing', label: t('Pricing') },
    ...(signedIn ? [{ href: '/account/favorites', label: t('My library') }] : []),
    ...(signedIn && isAdmin ? [{ href: '/admin', label: t('Download Center') }] : []),
    ...(signedIn ? [] : [{ href: '/login', label: t('Sign in') }]),
  ];
}

function DesktopNav() {
  const links = useLinks();
  return (
    <nav aria-label={t('Main')} className="relative hidden lg:flex">
      {links.map(({ href, label }) => (
        <PlusGridItem key={href} className="relative flex">
          <Link href={href} className="flex items-center px-4 py-3 text-base font-medium text-gray-950 bg-blend-multiply data-hover:bg-black/2.5">
            {label}
          </Link>
        </PlusGridItem>
      ))}
      <PlusGridItem className="relative flex items-center px-2">
        <LanguageSwitcher />
      </PlusGridItem>
    </nav>
  );
}

function MobileNavButton() {
  return (
    <DisclosureButton className="flex size-12 items-center justify-center self-center rounded-lg data-hover:bg-black/5 lg:hidden" aria-label={t('Open main menu')}>
      <Bars2Icon className="size-6" />
    </DisclosureButton>
  );
}

function MobileNav() {
  const links = useLinks();
  return (
    <DisclosurePanel className="lg:hidden">
      <nav aria-label={t('Main')} className="flex flex-col gap-6 py-4">
        {links.map(({ href, label }, linkIndex) => (
          <motion.div
            initial={{ opacity: 0, rotateX: -90 }}
            animate={{ opacity: 1, rotateX: 0 }}
            transition={{ duration: 0.15, ease: 'easeInOut', rotateX: { duration: 0.3, delay: linkIndex * 0.1 } }}
            key={href}
          >
            <Link href={href} className="text-base font-medium text-gray-950">
              {label}
            </Link>
          </motion.div>
        ))}
        <div className="-mx-3">
          <LanguageSwitcher />
        </div>
      </nav>
      <div className="absolute left-1/2 w-screen -translate-x-1/2">
        <div className="absolute inset-x-0 top-0 border-t border-black/5" />
        <div className="absolute inset-x-0 top-2 border-t border-black/5" />
      </div>
    </DisclosurePanel>
  );
}

export function Navbar({ banner }: { banner?: React.ReactNode }) {
  return (
    <Disclosure as="header" className="pt-12 sm:pt-16">
      <PlusGrid>
        <PlusGridRow className="relative flex justify-between">
          <div className="relative flex gap-6">
            <PlusGridItem className="py-3">
              <Link href="/" title={t('FrameFlow home')}>
                <Logo className="h-9" />
              </Link>
            </PlusGridItem>
            {banner && <div className="relative hidden items-center py-3 lg:flex">{banner}</div>}
          </div>
          <DesktopNav />
          <MobileNavButton />
        </PlusGridRow>
      </PlusGrid>
      <MobileNav />
    </Disclosure>
  );
}
