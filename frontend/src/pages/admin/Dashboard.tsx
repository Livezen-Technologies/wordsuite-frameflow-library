// A1 Dashboard. Tailwind Plus: data-display/stats (05 with shared borders), layout/cards, lists/tables (03), lists/feeds (01).
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpTrayIcon } from '@heroicons/react/20/solid';
import { adminApi } from '@/services/admin';
import { useAuth } from '@/hooks/useAuth';
import { PageHeading, Card, TypeTile } from '@/components/ui/Layout';
import { ButtonLink, Loading } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { TableCard, TBody, EmptyRow, th, thFirst, td, tdFirst } from '@/components/ui/Table';
import { errorMessage } from '@/services/api';
import { typeColor, typeName, humanize } from '@/core/schema';
import { t, tx } from '@/i18n';
import { TimeBarChart, dailySeries } from '@/components/charts';
import { classNames, formatNumber, timeAgo } from '@/core/format';

function Stat({ name, value, note, warn }: { name: string; value: number; note?: string; warn?: boolean }) {
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

export function Dashboard() {
  const { can } = useAuth();
  const overview = useQuery({ queryKey: ['overview'], queryFn: () => adminApi.overview() });
  const activity = useQuery({ queryKey: ['audit', 'recent'], queryFn: () => adminApi.auditLog(), enabled: can('analytics.view') });

  if (overview.isPending) return <Loading />;
  if (overview.isError) return <Alert tone="error" title={t('Couldn’t load the dashboard')}>{errorMessage(overview.error)}</Alert>;
  const o = overview.data;
  const days = dailySeries(o.downloads_by_day);

  return (
    <div className="space-y-8">
      <PageHeading
        title={t('Dashboard')}
        meta={t('Asset Library at a glance · last 30 days')}
        actions={can('asset.create') && <ButtonLink to="/admin/upload"><ArrowUpTrayIcon aria-hidden="true" className="-ml-0.5 size-5" />{t('Upload assets')}</ButtonLink>}
      />

      <dl className="grid grid-cols-1 divide-y divide-gray-200 overflow-hidden rounded-lg bg-white shadow-sm sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-5 lg:divide-x dark:divide-white/10 dark:bg-gray-800/75 dark:shadow-none dark:inset-ring dark:inset-ring-white/10">
        <Stat name={t('Published assets')} value={o.published} note={t('{n} drafts', { n: o.drafts })} />
        <Stat name={t('Downloads (30d)')} value={o.downloads_30d} />
        <Stat name={t('Active devices (30d)')} value={o.active_devices_30d} />
        <Stat name={t('In review')} value={o.in_review} note={t('{n} approved', { n: o.approved })} />
        <Stat name={t('Failed checks')} value={o.failed} note={o.processing ? t('{n} processing', { n: o.processing }) : undefined} warn={o.failed > 0} />
      </dl>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title={t('Downloads per day')} className="lg:col-span-2" actions={can('analytics.view') && <Link to="/admin/analytics" className="text-sm font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">{t('Analytics')}<span aria-hidden="true"> →</span></Link>}>
          {days.length ? <TimeBarChart points={days} valueLabel={t('Downloads')} /> : <p className="text-sm text-gray-500 dark:text-gray-400">{t('No downloads in the last 30 days.')}</p>}
        </Card>

        <Card title={<span className="flex items-center gap-2">{t('Review queue')} <Badge tone="yellow">{o.review_queue.length}</Badge></span>} actions={can('asset.review') && <Link to="/admin/review" className="text-sm font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">{t('Open queue')}<span aria-hidden="true"> →</span></Link>}>
          <ul role="list" className="-my-3 divide-y divide-gray-100 dark:divide-white/5">
            {o.review_queue.slice(0, 6).map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-3">
                <TypeTile color={typeColor(r.type)} label={typeName(r.type)} className="size-8" />
                <Link to={`/admin/assets/${r.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 hover:text-indigo-600 dark:text-white">
                  {r.title}
                </Link>
                <span className="text-xs text-gray-500 dark:text-gray-400">{typeName(r.type)}</span>
              </li>
            ))}
            {!o.review_queue.length && <li className="py-3 text-sm text-gray-500 dark:text-gray-400">{t('Nothing waiting.')}</li>}
          </ul>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">{t('Top assets')}</h2>
          <TableCard caption={t('Top assets by downloads')}>
            <thead>
              <tr>
                <th scope="col" className={thFirst}>{t('Asset')}</th>
                <th scope="col" className={classNames(th, 'hidden sm:table-cell')}>{t('Type')}</th>
                <th scope="col" className={th}>{t('Downloads')}</th>
                <th scope="col" className={classNames(th, 'hidden sm:table-cell')}>{t('Applied')}</th>
                <th scope="col" className={th}>{t('Version')}</th>
              </tr>
            </thead>
            <TBody>
              {o.top_assets.map((a) => (
                <tr key={a.id}>
                  <td className={tdFirst}>
                    <Link to={`/admin/assets/${a.id}`} className="hover:text-indigo-600">{a.title}</Link>
                  </td>
                  <td className={classNames(td, 'hidden sm:table-cell')}>{typeName(a.type)}</td>
                  <td className={classNames(td, 'tabular-nums')}>{a.downloads}</td>
                  <td className={classNames(td, 'hidden tabular-nums sm:table-cell')}>{a.applies}</td>
                  <td className={classNames(td, 'font-mono text-xs')}>{a.version ?? '—'}</td>
                </tr>
              ))}
              {!o.top_assets.length && <EmptyRow colSpan={5}>{t('No assets yet.')}</EmptyRow>}
            </TBody>
          </TableCard>
        </div>
        {can('analytics.view') && (
          <Card title={t('Recent activity')}>
            {activity.isPending ? (
              <Loading />
            ) : activity.isError ? (
              <p className="text-sm text-red-600">{errorMessage(activity.error)}</p>
            ) : (
              <div className="flow-root">
                <ul role="list" className="-mb-8">
                  {activity.data.slice(0, 8).map((e, i, arr) => (
                    <li key={e.id ?? `${e.at}-${i}`}>
                      <div className="relative pb-8">
                        {i !== arr.length - 1 && <span aria-hidden="true" className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200 dark:bg-white/10" />}
                        <div className="relative flex space-x-3">
                          <span className="flex size-8 items-center justify-center rounded-full bg-gray-400 text-[10px] font-bold text-white uppercase ring-8 ring-white dark:bg-gray-600 dark:ring-gray-900">{e.action.split('.').at(-1)?.slice(0, 2)}</span>
                          <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                            <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                              {tx(humanize(e.action.replace('.', ' ')))}{' '}
                              {e.entity === 'asset' ? <Link to={`/admin/assets/${e.entity_id}`} className="font-medium text-gray-900 dark:text-white">{t('asset')}</Link> : <span className="font-medium text-gray-900 dark:text-white">{e.entity}</span>}
                            </p>
                            <time dateTime={e.at} className="text-right text-xs whitespace-nowrap text-gray-500 dark:text-gray-400">{timeAgo(e.at)}</time>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                  {!activity.data.length && <li className="pb-8 text-sm text-gray-500">{t('No activity yet.')}</li>}
                </ul>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
