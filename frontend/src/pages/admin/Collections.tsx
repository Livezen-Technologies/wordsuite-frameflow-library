// A9 Collections list. Tailwind Plus Application UI: headings/page-headings (01 with actions), lists/tables (03 simple in
// card), elements/badges, feedback/empty-states (01). API: GET /admin/collections.
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from '@heroicons/react/20/solid';
import { QueueListIcon } from '@heroicons/react/24/outline';
import { adminApi } from '@/services/admin';
import { errorMessage } from '@/services/api';
import { EmptyState, PageHeading } from '@/components/ui/Layout';
import { ButtonLink, Loading } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Badge, type Tone } from '@/components/ui/Badge';
import { TableCard, TBody, th, td, tdFirst, thFirst } from '@/components/ui/Table';
import { classNames, formatDateTime } from '@/core/format';
import { t, tn } from '@/i18n';
import type { AdminCollection } from '@/types/api';

export type WindowState = 'hidden' | 'scheduled' | 'live' | 'ended';
/** Where a collection stands right now: hidden, before its window, in it, or after it. */
export function windowState(c: Pick<AdminCollection, 'visible' | 'publish_at' | 'unpublish_at'>, now = Date.now()): WindowState {
  if (!c.visible) return 'hidden';
  if (c.publish_at && new Date(c.publish_at).getTime() > now) return 'scheduled';
  if (c.unpublish_at && new Date(c.unpublish_at).getTime() <= now) return 'ended';
  return 'live';
}

export function WindowBadge({ c }: { c: AdminCollection }) {
  const s = windowState(c);
  const tone: Record<WindowState, Tone> = { hidden: 'gray', scheduled: 'yellow', live: 'green', ended: 'orange' };
  const name: Record<WindowState, string> = { hidden: t('Hidden'), scheduled: t('Scheduled'), live: t('Live'), ended: t('Ended') };
  return <Badge tone={tone[s]}>{name[s]}</Badge>;
}

export function Collections() {
  const q = useQuery({ queryKey: ['collections'], queryFn: adminApi.collections, retry: false });
  return (
    <div className="space-y-6">
      <PageHeading
        title={t('Collections')}
        meta={t('Curated rails for FrameFlow and the public site. Visible collections in their window come before Featured, New and Trending.')}
        actions={<ButtonLink to="/admin/collections/new"><PlusIcon aria-hidden="true" className="-ml-0.5 size-5" />{t('New collection')}</ButtonLink>}
      />
      {q.isPending ? <Loading /> : q.isError ? (
        <Alert tone="error" title={t('Couldn’t load collections')}>{errorMessage(q.error)}</Alert>
      ) : !q.data.length ? (
        <div className="rounded-lg bg-white shadow-sm dark:bg-gray-800/50">
          <EmptyState icon={<QueueListIcon />} title={t('No collections yet')} action={<ButtonLink to="/admin/collections/new">{t('New collection')}</ButtonLink>}>
            {t('Group assets into a rail, such as “Wedding season” or “Vesak”.')}
          </EmptyState>
        </div>
      ) : (
        <TableCard caption={t('Collections')}>
          <thead>
            <tr>
              <th scope="col" className={thFirst}>{t('Title')}</th>
              <th scope="col" className={classNames(th, 'hidden sm:table-cell')}>{t('Slug')}</th>
              <th scope="col" className={th}>{t('Assets')}</th>
              <th scope="col" className={classNames(th, 'hidden lg:table-cell')}>{t('Window')}</th>
              <th scope="col" className={th}>{t('Status')}</th>
            </tr>
          </thead>
          <TBody>
            {q.data.map((c) => (
              <tr key={c.slug}>
                <td className={tdFirst}>
                  <Link to={`/admin/collections/${encodeURIComponent(c.slug)}`} className="hover:text-indigo-600">{c.title}</Link>
                  {c.description && <span className="block max-w-sm truncate text-xs font-normal text-gray-500 dark:text-gray-400">{c.description}</span>}
                </td>
                <td className={classNames(td, 'hidden font-mono text-xs sm:table-cell')}>{c.slug}</td>
                <td className={classNames(td, 'tabular-nums')}>{tn('{n} asset', '{n} assets', c.asset_ids.length)}</td>
                <td className={classNames(td, 'hidden lg:table-cell')}>
                  {c.publish_at || c.unpublish_at ? `${c.publish_at ? formatDateTime(c.publish_at) : t('now')} → ${c.unpublish_at ? formatDateTime(c.unpublish_at) : t('no end')}` : t('Always')}
                </td>
                <td className={td}><WindowBadge c={c} /></td>
              </tr>
            ))}
          </TBody>
        </TableCard>
      )}
    </div>
  );
}
