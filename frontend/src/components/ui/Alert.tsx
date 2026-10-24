// Tailwind Plus Application UI · feedback/alerts (01 with description, 02 with list).
import type { ReactNode } from 'react';
import { CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, XCircleIcon } from '@heroicons/react/20/solid';
import { classNames } from '@/core/format';

type Tone = 'error' | 'warn' | 'success' | 'info';
const styles: Record<Tone, { box: string; icon: string; title: string; body: string; Icon: typeof XCircleIcon }> = {
  error: { box: 'bg-red-50 dark:bg-red-500/15 dark:outline dark:outline-red-500/25', icon: 'text-red-400', title: 'text-red-800 dark:text-red-200', body: 'text-red-700 dark:text-red-200/80', Icon: XCircleIcon },
  warn: { box: 'bg-yellow-50 dark:bg-yellow-500/10 dark:outline dark:outline-yellow-500/15', icon: 'text-yellow-400 dark:text-yellow-300', title: 'text-yellow-800 dark:text-yellow-100', body: 'text-yellow-700 dark:text-yellow-100/80', Icon: ExclamationTriangleIcon },
  success: { box: 'bg-green-50 dark:bg-green-500/10 dark:outline dark:outline-green-500/20', icon: 'text-green-400', title: 'text-green-800 dark:text-green-200', body: 'text-green-700 dark:text-green-200/85', Icon: CheckCircleIcon },
  info: { box: 'bg-blue-50 dark:bg-blue-500/10 dark:outline dark:outline-blue-500/20', icon: 'text-blue-400', title: 'text-blue-800 dark:text-blue-200', body: 'text-blue-700 dark:text-blue-300', Icon: InformationCircleIcon },
};

export function Alert({ tone = 'info', title, children, items, className }: { tone?: Tone; title?: ReactNode; children?: ReactNode; items?: ReactNode[]; className?: string }) {
  const s = styles[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={classNames('rounded-md p-4', s.box, className)}>
      <div className="flex">
        <div className="shrink-0">
          <s.Icon aria-hidden="true" className={classNames('size-5', s.icon)} />
        </div>
        <div className="ml-3 min-w-0">
          {title && <h3 className={classNames('text-sm font-medium', s.title)}>{title}</h3>}
          {(children || items) && (
            <div className={classNames('text-sm', title ? 'mt-2' : null, s.body)}>
              {children}
              {items && items.length > 0 && (
                <ul role="list" className="list-disc space-y-1 pl-5">
                  {items.map((it, i) => (
                    <li key={i}>{it}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
