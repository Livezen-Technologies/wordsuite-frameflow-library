// Tailwind Plus Application UI · lists/tables (03 simple in card, 08 hidden columns on mobile, 17 with checkboxes).
import type { ReactNode } from 'react';
import { classNames } from '@/core/format';

export const th = 'px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white';
export const thFirst = 'py-3.5 pr-3 pl-4 text-left text-sm font-semibold text-gray-900 sm:pl-6 dark:text-white';
export const td = 'px-3 py-4 text-sm whitespace-nowrap text-gray-500 dark:text-gray-400';
export const tdFirst = 'py-4 pr-3 pl-4 text-sm font-medium text-gray-900 sm:pl-6 dark:text-white';

export function TableCard({ children, caption }: { children: ReactNode; caption?: string }) {
  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-sm outline-1 outline-black/5 dark:bg-gray-800/50 dark:shadow-none dark:-outline-offset-1 dark:outline-white/10">
      <div className="overflow-x-auto">
        <table className="relative min-w-full divide-y divide-gray-300 dark:divide-white/15">
          {caption && <caption className="sr-only">{caption}</caption>}
          {children}
        </table>
      </div>
    </div>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-gray-200 bg-white dark:divide-white/10 dark:bg-gray-900/40">{children}</tbody>;
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className={classNames(td, 'py-10 text-center')}>
        {children}
      </td>
    </tr>
  );
}
