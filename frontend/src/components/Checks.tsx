import { CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/20/solid';
import type { Check } from '@/types/api';
import { humanize } from '@/core/schema';

/** "Blocked · …" text for a failed check, same wording as the old admin. */
export function checkProblem(c: Check): string {
  const d = c.detail;
  if (d?.message) return String(d.message);
  const rule = d?.rule ?? c.check;
  return d?.value != null ? `${rule} = ${JSON.stringify(d.value)}` : String(rule);
}

export const checksPassed = (checks: Check[] | undefined | null): boolean => !!checks && checks.every((c) => c.passed);

export function ChecksList({ checks, extra = [] }: { checks: Check[]; extra?: { label: string; ok: boolean; text: string }[] }) {
  return (
    <ul role="list" aria-label="Checks" className="divide-y divide-gray-100 text-sm dark:divide-white/5">
      {checks.map((c, i) => (
        <li key={`${c.check}-${i}`} data-status={c.passed ? 'pass' : 'fail'} className="flex items-start justify-between gap-3 py-2">
          <span className="text-gray-700 capitalize dark:text-gray-300">{humanize(c.check.replace(/[.]/g, ' '))}</span>
          {c.passed ? (
            <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400"><CheckCircleIcon aria-hidden="true" className="size-4" />Passed</span>
          ) : (
            <span className="inline-flex items-start gap-1 text-right text-red-700 dark:text-red-400"><XCircleIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span><span className="sr-only">Failed: </span>{checkProblem(c)}</span></span>
          )}
        </li>
      ))}
      {extra.map((x) => (
        <li key={x.label} className="flex items-start justify-between gap-3 py-2">
          <span className="text-gray-700 dark:text-gray-300">{x.label}</span>
          <span className={x.ok ? 'inline-flex items-center gap-1 text-green-700 dark:text-green-400' : 'inline-flex items-center gap-1 text-amber-700 dark:text-amber-400'}>
            {x.ok ? <CheckCircleIcon aria-hidden="true" className="size-4" /> : <ExclamationTriangleIcon aria-hidden="true" className="size-4" />}
            {x.text}
          </span>
        </li>
      ))}
    </ul>
  );
}
