import { useInfiniteQuery } from '@tanstack/react-query';
import { AccountLayout, Notice } from './AccountLayout';
import { meApi } from '@/services/public';
import { errorMessage } from '@/services/api';
import { AssetThumb } from '@/components/radiant/asset-card';
import { Button } from '@/components/radiant/button';
import { Link } from '@/components/radiant/link';
import { formatBytes, formatDateTime } from '@/core/format';
import { label, typeName } from '@/core/schema';
import { t } from '@/i18n';

export function DownloadsPage() {
  const q = useInfiniteQuery({
    queryKey: ['me', 'downloads'],
    queryFn: ({ pageParam }) => meApi.downloads(pageParam || undefined),
    initialPageParam: '',
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    retry: false,
  });
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <AccountLayout title={t('Downloads')} lead={t('Everything you’ve downloaded into FrameFlow, newest first.')}>
      {q.isPending ? (
        <p role="status" className="text-sm/6 text-gray-600">{t('Loading…')}</p>
      ) : q.isError ? (
        <Notice tone="error" title={t('Couldn’t load your downloads')} action={<Button variant="outline" onClick={() => void q.refetch()}>{t('Try again')}</Button>}>
          {errorMessage(q.error)}
        </Notice>
      ) : !rows.length ? (
        <Notice title={t('No downloads yet')} action={<Button href="/library">{t('Browse the library')}</Button>}>{t('Assets you download in FrameFlow show up here.')}</Notice>
      ) : (
        <>
          <ul role="list" className="divide-y divide-gray-100 rounded-3xl bg-white ring-1 ring-black/5">
            {rows.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4 sm:px-6">
                {d.asset ? <AssetThumb asset={d.asset} className="aspect-video w-24 shrink-0 rounded-lg ring-1 ring-black/5" /> : <div aria-hidden="true" className="aspect-video w-24 shrink-0 rounded-lg bg-gray-100" />}
                <div className="min-w-0 flex-1">
                  {d.asset ? (
                    <Link href={`/library/${d.asset.slug}`} className="text-base/6 font-medium text-gray-950 data-hover:underline">{d.asset.title}</Link>
                  ) : (
                    <span className="text-base/6 font-medium text-gray-500">{t('An asset that’s no longer available')}</span>
                  )}
                  <p className="text-sm/6 text-gray-600">
                    {d.asset && <>{typeName(d.asset.type)} · </>}
                    <span className="font-mono">v{d.version}</span> · {formatBytes(d.bytes)}
                  </p>
                </div>
                <div className="text-right text-sm/6">
                  <span className={d.status === 'completed' ? 'font-medium text-green-700' : 'font-medium text-gray-600'}>{label(d.status)}</span>
                  <p className="text-gray-500"><time dateTime={d.started_at}>{formatDateTime(d.started_at)}</time></p>
                </div>
              </li>
            ))}
          </ul>
          {q.hasNextPage && (
            <div className="mt-8 text-center">
              <Button variant="outline" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>{q.isFetchingNextPage ? t('Loading…') : t('Load more')}</Button>
            </div>
          )}
        </>
      )}
    </AccountLayout>
  );
}
