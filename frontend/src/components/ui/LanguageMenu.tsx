// Tailwind Plus Application UI · elements/dropdowns (01 simple), as the admin top bar's language picker.
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { CheckIcon, LanguageIcon } from '@heroicons/react/20/solid';
import { LOCALES, t, useLocale } from '@/i18n';
import { classNames } from '@/core/format';

export function LanguageMenu() {
  const { locale, setLocale } = useLocale();
  const current = LOCALES.find((l) => l.code === locale)!;
  return (
    <Menu as="div" className="relative">
      <MenuButton className="-m-1.5 flex items-center gap-x-1.5 rounded-md p-1.5 text-sm/6 font-semibold text-gray-700 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-gray-300 dark:hover:text-white">
        <LanguageIcon aria-hidden="true" className="size-5 text-gray-400" />
        <span className="hidden sm:inline">{current.name}</span>
        <span className="sr-only">{t('Language: {name}. Change language', { name: current.name })}</span>
      </MenuButton>
      <MenuItems transition className="absolute right-0 z-10 mt-2.5 w-44 origin-top-right rounded-md bg-white py-2 shadow-lg outline-1 outline-gray-900/5 transition data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in dark:bg-gray-800 dark:shadow-none dark:-outline-offset-1 dark:outline-white/10">
        {LOCALES.map((l) => (
          <MenuItem key={l.code}>
            <button type="button" lang={l.code} onClick={() => setLocale(l.code)} aria-current={l.code === locale ? 'true' : undefined} className={classNames('flex w-full items-center justify-between px-3 py-1 text-left text-sm/6 text-gray-900 data-focus:bg-gray-50 data-focus:outline-hidden dark:text-white dark:data-focus:bg-white/5', l.code === locale && 'font-semibold')}>
              {l.name}
              {l.code === locale && <CheckIcon aria-hidden="true" className="size-4 text-indigo-600 dark:text-indigo-400" />}
            </button>
          </MenuItem>
        ))}
      </MenuItems>
    </Menu>
  );
}
