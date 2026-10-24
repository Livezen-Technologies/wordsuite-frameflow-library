// Small SVG/CSS charts for the admin (no chart library: the house frontend doesn't ship one).
// Colours follow Application UI's indigo accent; every chart has a text summary and a data table for screen readers.
import { useId } from 'react';
import { classNames, formatDate, formatNumber } from '@/core/format';
import { t } from '@/i18n';

export interface Point {
  label: string;
  value: number;
}

/** Fills missing days with 0 so a quiet day shows as a gap, not a skipped bar. */
export function dailySeries(byDay: Record<string, number> | undefined, from?: string, to?: string): Point[] {
  const keys = Object.keys(byDay ?? {}).sort();
  const start = from ?? keys[0];
  const end = to ?? keys.at(-1);
  if (!start || !end) return [];
  const out: Point[] = [];
  const d = new Date(`${start.slice(0, 10)}T00:00:00Z`);
  const last = new Date(`${end.slice(0, 10)}T00:00:00Z`);
  for (let i = 0; d <= last && i < 400; i++) {
    const k = d.toISOString().slice(0, 10);
    out.push({ label: k, value: byDay?.[k] ?? 0 });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function niceMax(n: number): number {
  if (n <= 5) return Math.max(1, Math.ceil(n));
  const p = 10 ** Math.floor(Math.log10(n));
  const m = n / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

function DataTable({ points, valueLabel }: { points: Point[]; valueLabel: string }) {
  return (
    <details className="mt-3 text-xs text-gray-500 dark:text-gray-400">
      <summary className="cursor-pointer select-none">{t('Show data')}</summary>
      <table className="mt-2 w-full max-w-sm text-left">
        <thead>
          <tr>
            <th scope="col" className="py-1 font-medium">{t('Date')}</th>
            <th scope="col" className="py-1 text-right font-medium">{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.label}>
              <td className="py-0.5">{formatDate(p.label)}</td>
              <td className="py-0.5 text-right tabular-nums">{formatNumber(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** Vertical bars over time with a y gridline scale and first / middle / last date labels. */
export function TimeBarChart({ points, valueLabel, height = 176 }: { points: Point[]; valueLabel: string; height?: number }) {
  const id = useId();
  if (!points.length) return <p className="text-sm text-gray-500 dark:text-gray-400">{t('No data for this period.')}</p>;
  const max = niceMax(Math.max(...points.map((p) => p.value)));
  const total = points.reduce((n, p) => n + p.value, 0);
  const peak = points.reduce((a, b) => (b.value > a.value ? b : a));
  const w = 100 / points.length;
  const ticks = [0, max / 2, max];
  const summary = t('{label}: {total} in {days} days, peak {peak} on {date}', { label: valueLabel, total: formatNumber(total), days: points.length, peak: formatNumber(peak.value), date: formatDate(peak.label) });
  return (
    <figure aria-labelledby={id}>
      <div className="flex gap-2">
        <div className="flex flex-col justify-between text-right text-[10px] text-gray-400 tabular-nums" style={{ height }} aria-hidden="true">
          {[...ticks].reverse().map((v) => <span key={v}>{formatNumber(v)}</span>)}
        </div>
        <svg role="img" aria-labelledby={id} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full overflow-visible" style={{ height }}>
          {ticks.map((v) => (
            <line key={v} x1="0" x2="100" y1={height - (v / max) * height} y2={height - (v / max) * height} className="stroke-gray-200 dark:stroke-white/10" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          {points.map((p, i) => {
            const h = (p.value / max) * height;
            return (
              <rect key={p.label} x={i * w + w * 0.15} width={w * 0.7} y={height - h} height={Math.max(h, p.value ? 1 : 0)} rx="0.4" className="fill-indigo-500 dark:fill-indigo-400">
                <title>{`${formatDate(p.label)}: ${formatNumber(p.value)}`}</title>
              </rect>
            );
          })}
        </svg>
      </div>
      <div className="mt-2 flex justify-between pl-8 text-xs text-gray-500 dark:text-gray-400" aria-hidden="true">
        <span>{formatDate(points[0].label)}</span>
        {points.length > 2 && <span>{formatDate(points[Math.floor(points.length / 2)].label)}</span>}
        <span>{formatDate(points.at(-1)!.label)}</span>
      </div>
      <figcaption id={id} className="sr-only">{summary}</figcaption>
      <DataTable points={points} valueLabel={valueLabel} />
    </figure>
  );
}

/** Horizontal bars for categories (downloads by type, by version), largest first. */
export function BarList({ items, valueLabel, color }: { items: Point[]; valueLabel: string; color?: (label: string) => string | undefined }) {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...sorted.map((i) => i.value));
  if (!sorted.length) return <p className="text-sm text-gray-500 dark:text-gray-400">{t('No data for this period.')}</p>;
  return (
    <ul role="list" aria-label={valueLabel} className="space-y-2.5">
      {sorted.map((i) => (
        <li key={i.label} className="text-sm">
          <div className="flex justify-between gap-3">
            <span className="truncate text-gray-700 dark:text-gray-300">{i.label}</span>
            <span className="font-medium text-gray-900 tabular-nums dark:text-white">{formatNumber(i.value)}</span>
          </div>
          <div aria-hidden="true" className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
            <div className={classNames('h-full rounded-full', color?.(i.label) ? undefined : 'bg-indigo-500 dark:bg-indigo-400')} style={{ width: `${(i.value / max) * 100}%`, background: color?.(i.label) }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Tailwind Plus Application UI · data-display/stats (05 with shared borders) cell. */
export function Stat({ name, value, note, warn }: { name: string; value: number | null | undefined; note?: string; warn?: boolean }) {
  return (
    <div className="px-4 py-5 sm:p-6">
      <dt className="text-sm font-normal text-gray-900 dark:text-gray-100">{name}</dt>
      <dd className="mt-1 flex items-baseline justify-between md:block lg:flex">
        <div className={classNames('flex items-baseline text-2xl font-semibold tabular-nums', warn ? 'text-red-600 dark:text-red-400' : 'text-indigo-600 dark:text-indigo-400')}>
          {formatNumber(value)}
          {note && <span className="ml-2 text-sm font-medium text-gray-500 dark:text-gray-400">{note}</span>}
        </div>
      </dd>
    </div>
  );
}

export const statGridClass =
  'grid grid-cols-1 divide-y divide-gray-200 overflow-hidden rounded-lg bg-white shadow-sm sm:grid-cols-2 sm:divide-y-0 lg:divide-x dark:divide-white/10 dark:bg-gray-800/75 dark:shadow-none dark:inset-ring dark:inset-ring-white/10';
