// Language picker in Radiant's style (the pricing table's phone Menu: rounded-lg panel, ring-gray-200, data-focus rows).
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/react/16/solid';
import { clsx } from 'clsx';
import { LOCALES, t, useLocale } from '@/i18n';

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  const current = LOCALES.find((l) => l.code === locale)!;
  return (
    <Menu>
      <MenuButton className={clsx('flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm/6 font-medium text-gray-950 data-hover:bg-black/2.5', className)}>
        <span aria-hidden="true">{current.name}</span>
        <span className="sr-only">{t('Language: {name}. Change language', { name: current.name })}</span>
        <ChevronUpDownIcon aria-hidden="true" className="size-4 fill-gray-900" />
      </MenuButton>
      <MenuItems anchor="bottom end" className="z-30 min-w-36 rounded-lg bg-white p-1 shadow-lg ring-1 ring-gray-200 [--anchor-gap:6px]">
        {LOCALES.map((l) => (
          <MenuItem key={l.code}>
            <button type="button" lang={l.code} onClick={() => setLocale(l.code)} data-selected={l.code === locale ? true : undefined} className="group flex w-full items-center justify-between gap-3 rounded-md px-2 py-1 text-left text-sm/6 data-focus:bg-gray-100">
              {l.name}
              <CheckIcon aria-hidden="true" className="hidden size-4 group-data-selected:block" />
            </button>
          </MenuItem>
        ))}
      </MenuItems>
    </Menu>
  );
}
