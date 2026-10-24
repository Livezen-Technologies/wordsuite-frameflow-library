// A11 per-asset analytics on the editor's Activity tab. Tailwind Plus Application UI: data-display/stats (05),
// layout/cards, lists/tables (03). GET /admin/analytics/assets/:id?from=&to=
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/services/admin';
import { errorMessage } from '@/services/api';
import { Card } from '@/components/ui/Layout';
import { Loading } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { NativeSelect } from '@/components/ui/Form';
import { BarList, Stat, TimeBarChart, dailySeries, statGridClass } from '@/components/charts';
import { t } from '@/i18n';

export const RANGES = [7, 30, 90] as const;
export function rangeFor(days: number, now = new Date()): { from: string; to: string } {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function RangePicker({ days, onChange, id }: { days: number; onChange: (d: number) => void; id: string }) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm text-gray-500 dark:text-gray-400">{t('Period')}</label>
      <NativeSelect id={id} value={String(days)} onChange={(e) => onChange(Number(e.target.value))} className="w-36">
        {RANGES.map((d) => <option key={d} value={d}>{t('Last {n} days', { n: d })}</option>)}
      </NativeSelect>
    </div>
  );
}

export function AssetAnalyticsCard({ assetId }: { assetId: string }) {
  const [days, setDays] = useState(30);
  const range = rangeFor(days);
  const q = useQuery({ queryKey: ['analytics', 'asset', assetId, range], queryFn: () => adminApi.assetAnalytics(assetId, range), retry: false });
  return (
    <Card title={t('Analytics')} actions={<RangePicker id="asset-range" days={days} onChange={setDays} />}>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <Alert tone="error" title={t('Couldn’t load analytics')}>{errorMessage(q.error)}</Alert>
      ) : (
        <div className="space-y-6">
          <dl className={`${statGridClass} lg:grid-cols-3`}>
            <Stat name={t('Installs')} value={q.data.installs} />
            <Stat name={t('Applies')} value={q.data.applies} />
            <Stat name={t('Favorites')} value={q.data.favorites} />
          </dl>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">{t('Downloads per day')}</h3>
            <TimeBarChart points={dailySeries(q.data.downloads_by_day, range.from, range.to)} valueLabel={t('Downloads')} height={128} />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">{t('Downloads by version')}</h3>
            <BarList items={(q.data.versions ?? []).map((v) => ({ label: `v${v.version}`, value: v.downloads }))} valueLabel={t('Downloads by version')} />
          </div>
        </div>
      )}
    </Card>
  );
}
