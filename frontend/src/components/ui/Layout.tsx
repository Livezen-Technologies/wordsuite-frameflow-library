// Tailwind Plus Application UI · headings/page-headings (01 with actions, 03 with breadcrumbs),
// headings/card-headings, layout/cards, feedback/empty-states (01 simple), navigation/tabs (01 underline).
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronRightIcon, ChevronDownIcon } from '@heroicons/react/20/solid';
import { classNames } from '@/core/format';

export function PageHeading({ title, meta, actions, breadcrumbs }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode; breadcrumbs?: { name: string; to?: string }[] }) {
  return (
    <div>
      {breadcrumbs && (
        <nav aria-label="Breadcrumb" className="mb-2">
          <ol role="list" className="flex flex-wrap items-center gap-x-2 text-sm">
            {breadcrumbs.map((b, i) => (
              <li key={i} className="flex items-center gap-x-2">
                {i > 0 && <ChevronRightIcon aria-hidden="true" className="size-5 shrink-0 text-gray-400 dark:text-gray-500" />}
                {b.to ? (
                  <Link to={b.to} className="font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                    {b.name}
                  </Link>
                ) : (
                  <span aria-current="page" className="font-medium text-gray-500 dark:text-gray-400">
                    {b.name}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="md:flex md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl/7 font-bold break-words text-gray-900 sm:text-3xl sm:tracking-tight dark:text-white">{title}</h1>
          {meta && <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">{meta}</div>}
        </div>
        {actions && <div className="mt-4 flex flex-wrap gap-3 md:mt-0 md:ml-4">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ title, actions, children, className, bodyClassName = 'px-4 py-5 sm:p-6' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={classNames('overflow-hidden rounded-lg bg-white shadow-sm dark:bg-gray-800/50 dark:shadow-none dark:outline dark:-outline-offset-1 dark:outline-white/10', className)}>
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-4 sm:px-6 dark:border-white/10">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
          {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="py-10 text-center">
      {icon && <div className="mx-auto size-12 text-gray-400 dark:text-gray-500">{icon}</div>}
      <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      {children && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export interface TabItem<K extends string> {
  key: K;
  name: string;
  count?: number;
}

/** Underline tabs; a native select on phones. Buttons (not links) with aria-pressed semantics via role=tablist. */
export function Tabs<K extends string>({ tabs, current, onChange, label }: { tabs: TabItem<K>[]; current: K; onChange: (k: K) => void; label: string }) {
  return (
    <div>
      <div className="grid grid-cols-1 sm:hidden">
        <select value={current} onChange={(e) => onChange(e.target.value as K)} aria-label={label} className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white py-2 pr-8 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 dark:bg-white/5 dark:text-gray-100 dark:outline-white/10 dark:*:bg-gray-800">
          {tabs.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
              {t.count != null ? ` (${t.count})` : ''}
            </option>
          ))}
        </select>
        <ChevronDownIcon aria-hidden="true" className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end fill-gray-500" />
      </div>
      <div className="hidden sm:block">
        <div className="border-b border-gray-200 dark:border-white/10">
          <nav aria-label={label} role="tablist" className="-mb-px flex space-x-6 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={t.key === current}
                onClick={() => onChange(t.key)}
                className={classNames(
                  t.key === current
                    ? 'border-indigo-500 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-white/20 dark:hover:text-gray-200',
                  'flex border-b-2 px-1 py-4 text-sm font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-indigo-600',
                )}
              >
                {t.name}
                {t.count != null && (
                  <span className={classNames(t.key === current ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400' : 'bg-gray-100 text-gray-900 dark:bg-white/10 dark:text-gray-300', 'ml-3 hidden rounded-full px-2.5 py-0.5 text-xs font-medium md:inline-block')}>{t.count}</span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}

/** Coloured tile standing in for a thumbnail (admin has no authenticated thumbnail endpoint). */
export function TypeTile({ color, label, className = 'size-10' }: { color: string; label: string; className?: string }) {
  return (
    <span aria-hidden="true" style={{ background: `linear-gradient(135deg, ${color}, #1f2937)` }} className={classNames('inline-flex shrink-0 items-center justify-center rounded-md text-[10px] font-semibold text-white/90 uppercase', className)}>
      {label.slice(0, 3)}
    </span>
  );
}
