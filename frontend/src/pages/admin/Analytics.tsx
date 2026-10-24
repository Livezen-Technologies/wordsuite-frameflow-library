// A11 Analytics. Tailwind Plus Application UI: headings/page-headings (01 with actions: period select),
// data-display/stats (05 with shared borders), layout/cards, lists/tables (03 simple in card).
// API: GET /admin/analytics/overview?from=&to= (downloads_by_day, downloads_by_type, installs_30d, applies_30d),
// GET /admin/analytics/search ({ top, misses }).
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/services/admin';
import { errorMessage } from '@/services/api';
import { Card, PageHeading } from '@/components/ui/Layout';
import { Loading } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { TableCard, TBody, EmptyRow, th, td, tdFirst, thFirst } from '@/components/ui/Table';
import { BarList, Stat, TimeBarChart, dailySeries, statGridClass } from '@/components/charts';
import { RangePicker, rangeFor } from '@/components/AssetAnalytics';
import { ASSET_TYPES, TYPE_KEYS, typeName, type AssetType } from '@/core/schema';
import { formatNumber, timeAgo, formatDateTime } from '@/core/format';
import { t } from '@/i18n';

export function Analytics() {
  const [days, setDays] = useState(30);
  const range = rangeFor(days);
  const overview = useQuery({ queryKey: ['overview', range], queryFn: () => adminApi.overview(range), retry: false });
  const search = useQuery({ queryKey: ['analytics', 'search'], queryFn: adminApi.searchAnalytics, retry: false });
  const o = overview.data;
  const byType = o?.downloads_by_type;
  const nameToType = Object.fromEntries(TYPE_KEYS.map((k) => [typeName(k), k])) as Record<string, AssetType>;

  return (
    <div className="space-y-8">
      <PageHeading title={t('Analytics')} meta={t('Downloads, installs and applies from FrameFlow, and what people search for.')} actions={<RangePicker id="overview-range" days={days} onChange={setDays} />} />

      {overview.isPending ? <Loading /> : overview.isError ? (
        <Alert tone="error" title={t('Couldn’t load analytics')}>{errorMessage(overview.error)}</Alert>
      ) : (
        <>
          <dl className={`${statGridClass} lg:grid-cols-4`}>
            <Stat name={t('Downloads (30d)')} value={o!.downloads_30d} />
            <Stat name={t('Installs (30d)')} value={o!.installs_30d} />
            <Stat name={t('Applies (30d)')} value={o!.applies_30d} />
            <Stat name={t('Active devices (30d)')} value={o!.active_devices_30d} />
          </dl>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card title={t('Downloads per day')} className="lg:col-span-2">
              <TimeBarChart points={dailySeries(o!.downloads_by_day, range.from, range.to)} valueLabel={t('Downloads')} />
            </Card>
            <Card title={t('Downloads by type')}>
              {byType ? (
                <BarList items={Object.entries(byType).map(([k, n]) => ({ label: typeName(k), value: n ?? 0 }))} valueLabel={t('Downloads by type')} color={(l) => ASSET_TYPES[nameToType[l]]?.color} />
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('The API didn’t return downloads by type.')}</p>
              )}
            </Card>
          </div>
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="misses-h">
          <h2 id="misses-h" className="mb-1 text-base font-semibold text-gray-900 dark:text-white">{t('Searches with no results')}</h2>
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">{t('Terms people looked for and didn’t find: candidates for new assets, tags or Sinhala / Tamil keywords.')}</p>
          {search.isPending ? <Loading /> : search.isError ? <Alert tone="error">{errorMessage(search.error)}</Alert> : (
            <TableCard caption={t('Searches with no results')}>
              <thead>
                <tr>
                  <th scope="col" className={thFirst}>{t('Term')}</th>
                  <th scope="col" className={th}>{t('Searches')}</th>
                  <th scope="col" className={th}>{t('Last searched')}</th>
                </tr>
              </thead>
              <TBody>
                {search.data.misses.map((m) => (
                  <tr key={m.term}>
                    <td className={tdFirst}>{m.term}</td>
                    <td className={`${td} tabular-nums`}>{formatNumber(m.count)}</td>
                    <td className={td}><time dateTime={m.last_at} title={formatDateTime(m.last_at)}>{timeAgo(m.last_at)}</time></td>
                  </tr>
                ))}
                {!search.data.misses.length && <EmptyRow colSpan={3}>{t('Every search found something.')}</EmptyRow>}
              </TBody>
            </TableCard>
          )}
        </section>
        <section aria-labelledby="top-h">
          <h2 id="top-h" className="mb-1 text-base font-semibold text-gray-900 dark:text-white">{t('Top searches')}</h2>
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">{t('The most frequent search terms.')}</p>
          {search.isPending ? <Loading /> : search.isError ? null : (
            <Card>
              <BarList items={search.data.top.map((x) => ({ label: x.term, value: x.count }))} valueLabel={t('Top searches')} />
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
