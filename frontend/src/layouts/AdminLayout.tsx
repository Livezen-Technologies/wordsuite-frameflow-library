// Tailwind Plus Application UI · application-shells/sidebar (03 sidebar with header):
// off-canvas Dialog sidebar on phones, fixed sidebar from lg, sticky top bar with search and profile menu.
import { useState, type FormEvent } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { Dialog, DialogBackdrop, DialogPanel, Menu, MenuButton, MenuItem, MenuItems, TransitionChild } from '@headlessui/react';
import { Bars3Icon, XMarkIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { ChevronDownIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid';
import { useAuth } from '@/hooks/useAuth';
import { ADMIN_NAV, SETTINGS_NAV, type NavItem } from '@/layouts/adminNav';
import { ROLE_LABELS } from '@/core/schema';
import { classNames } from '@/core/format';
import { feedApi } from '@/services/admin';

function Brand() {
  return (
    <div className="flex h-16 shrink-0 items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-md bg-indigo-600 text-sm font-bold text-white dark:bg-indigo-500">F</span>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">FrameFlow</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">Download Center</p>
      </div>
    </div>
  );
}

function NavItemLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        classNames(
          isActive ? 'bg-gray-50 text-indigo-600 dark:bg-white/5 dark:text-white' : 'text-gray-700 hover:bg-gray-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white',
          'group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold focus-visible:outline-2 focus-visible:outline-indigo-600',
        )
      }
    >
      {({ isActive }) => (
        <>
          <item.icon aria-hidden="true" className={classNames(isActive ? 'text-indigo-600 dark:text-white' : 'text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-white', 'size-6 shrink-0')} />
          {item.name}
        </>
      )}
    </NavLink>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useAuth();
  const items = ADMIN_NAV.filter((i) => !i.perm || can(i.perm));
  return (
    <nav aria-label="Download Center" className="flex flex-1 flex-col">
      <ul role="list" className="flex flex-1 flex-col gap-y-7">
        <li>
          <ul role="list" className="-mx-2 space-y-1">
            {items.map((item) => (
              <li key={item.to}>
                <NavItemLink item={item} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </li>
        <li>
          <div className="text-xs/6 font-semibold text-gray-400">FrameFlow feed</div>
          <ul role="list" className="-mx-2 mt-2 space-y-1">
            {(['stable', 'beta'] as const).map((ch) => (
              <li key={ch}>
                <a href={feedApi.catalogUrl(ch)} target="_blank" rel="noreferrer" className="group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold text-gray-700 hover:bg-gray-50 hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-[0.625rem] font-medium text-gray-400 group-hover:border-indigo-600 group-hover:text-indigo-600 dark:border-white/10 dark:bg-white/5">{ch[0].toUpperCase()}</span>
                  <span className="truncate capitalize">{ch} catalog</span>
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </li>
        <li className="mt-auto">
          <div className="-mx-2">
            <NavItemLink item={SETTINGS_NAV} onNavigate={onNavigate} />
          </div>
        </li>
      </ul>
    </nav>
  );
}

export function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { me, signOut } = useAuth();
  const navigate = useNavigate();
  const search = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get('search') ?? '').trim();
    navigate(`/admin/assets${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  };

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-900">
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:shadow">
        Skip to content
      </a>
      <Dialog open={sidebarOpen} onClose={setSidebarOpen} className="relative z-50 lg:hidden">
        <DialogBackdrop transition className="fixed inset-0 bg-gray-900/80 transition-opacity duration-300 ease-linear data-closed:opacity-0" />
        <div className="fixed inset-0 flex">
          <DialogPanel transition className="relative mr-16 flex w-full max-w-xs flex-1 transform transition duration-300 ease-in-out data-closed:-translate-x-full">
            <TransitionChild>
              <div className="absolute top-0 left-full flex w-16 justify-center pt-5 duration-300 ease-in-out data-closed:opacity-0">
                <button type="button" onClick={() => setSidebarOpen(false)} className="-m-2.5 p-2.5">
                  <span className="sr-only">Close sidebar</span>
                  <XMarkIcon aria-hidden="true" className="size-6 text-white" />
                </button>
              </div>
            </TransitionChild>
            <div className="relative flex grow flex-col gap-y-5 overflow-y-auto bg-white px-6 pb-4 dark:bg-gray-900 dark:ring dark:ring-white/10">
              <Brand />
              <SidebarNav onNavigate={() => setSidebarOpen(false)} />
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
        <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 bg-white px-6 pb-4 dark:border-white/10 dark:bg-gray-900">
          <Brand />
          <SidebarNav />
        </div>
      </div>

      <div className="lg:pl-72">
        <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white px-4 shadow-xs sm:gap-x-6 sm:px-6 lg:px-8 dark:border-white/10 dark:bg-gray-900 dark:shadow-none">
          <button type="button" onClick={() => setSidebarOpen(true)} className="-m-2.5 p-2.5 text-gray-700 hover:text-gray-900 lg:hidden dark:text-gray-400 dark:hover:text-white">
            <span className="sr-only">Open sidebar</span>
            <Bars3Icon aria-hidden="true" className="size-6" />
          </button>
          <div aria-hidden="true" className="h-6 w-px bg-gray-200 lg:hidden dark:bg-white/10" />
          <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
            <form role="search" onSubmit={search} className="grid flex-1 grid-cols-1">
              <input name="search" type="search" placeholder="Search assets by title, tag, slug…" aria-label="Search assets" className="col-start-1 row-start-1 block size-full bg-white pl-8 text-base text-gray-900 outline-hidden placeholder:text-gray-400 sm:text-sm/6 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500" />
              <MagnifyingGlassIcon aria-hidden="true" className="pointer-events-none col-start-1 row-start-1 size-5 self-center text-gray-400" />
            </form>
            <div className="flex items-center gap-x-4 lg:gap-x-6">
              <a href="/" className="-m-2.5 hidden p-2.5 text-gray-400 hover:text-gray-500 sm:block dark:hover:text-white" title="Public site">
                <span className="sr-only">Open the public site</span>
                <ArrowTopRightOnSquareIcon aria-hidden="true" className="size-6" />
              </a>
              <div aria-hidden="true" className="hidden lg:block lg:h-6 lg:w-px lg:bg-gray-200 dark:lg:bg-white/10" />
              <Menu as="div" className="relative">
                <MenuButton className="relative flex items-center rounded-md focus-visible:outline-2 focus-visible:outline-indigo-600">
                  <span className="absolute -inset-1.5" />
                  <span className="sr-only">Open user menu</span>
                  <span className="grid size-8 place-items-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700 uppercase outline -outline-offset-1 outline-black/5 dark:bg-gray-800 dark:text-gray-200 dark:outline-white/10">{me?.id.slice(0, 2) ?? '?'}</span>
                  <span className="hidden lg:flex lg:items-center">
                    <span aria-hidden="true" className="ml-4 text-sm/6 font-semibold text-gray-900 dark:text-white">
                      {me ? ROLE_LABELS[me.role] ?? me.role : ''}
                    </span>
                    <ChevronDownIcon aria-hidden="true" className="ml-2 size-5 text-gray-400 dark:text-gray-500" />
                  </span>
                </MenuButton>
                <MenuItems transition className="absolute right-0 z-10 mt-2.5 w-56 origin-top-right rounded-md bg-white py-2 shadow-lg outline-1 outline-gray-900/5 transition data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in dark:bg-gray-800 dark:shadow-none dark:-outline-offset-1 dark:outline-white/10">
                  <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                    Signed in as <span className="font-medium text-gray-900 dark:text-white">{me?.id}</span>
                    <br />
                    {me ? ROLE_LABELS[me.role] ?? me.role : ''}
                  </div>
                  <MenuItem>
                    <button type="button" onClick={() => navigate('/admin/settings')} className="block w-full px-3 py-1 text-left text-sm/6 text-gray-900 data-focus:bg-gray-50 data-focus:outline-hidden dark:text-white dark:data-focus:bg-white/5">
                      Settings
                    </button>
                  </MenuItem>
                  <MenuItem>
                    <button type="button" onClick={signOut} className="block w-full px-3 py-1 text-left text-sm/6 text-gray-900 data-focus:bg-gray-50 data-focus:outline-hidden dark:text-white dark:data-focus:bg-white/5">
                      Sign out
                    </button>
                  </MenuItem>
                </MenuItems>
              </Menu>
            </div>
          </div>
        </div>
        <main id="admin-main" tabIndex={-1} className="py-8 focus:outline-none">
          <div className="px-4 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
