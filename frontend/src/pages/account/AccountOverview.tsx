// My library overview (mockup "ACCOUNT"): stats, favorites, recent downloads and devices, all from /me/*.
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AccountLayout } from './AccountLayout';
import { meApi } from '@/services/public';
import { api, errorMessage } from '@/services/api';
import { useFavorites } from '@/hooks/useFavorites';
import { TileGrid } from '@/components/site/AssetTile';
import { formatDate, formatNumber, timeAgo } from '@/core/format';
import { label } from '@/core/schema';
import { t } from '@/i18n';

function Stat({ name, value, extra, tone }: { name: string; value: string; extra?: string; tone?: string }) {
  return (
    <div className="card p-5">
      <dt className="text-sm text-gray-500">{name}</dt>
      <dd className={`text-3xl font-medium ${tone ?? ''}`}>{value}{extra && <span className="text-base text-gray-400"> {extra}</span>}</dd>
    </div>
  );
}

export function AccountOverview() {
  const fav = useFavorites();
  const downloads = useQuery({ queryKey: ['me', 'downloads', 'recent'], queryFn: () => meApi.downloads(), retry: false });
  const devices = useQuery({ queryKey: ['me', 'devices'], queryFn: meApi.devices, retry: false });
  const installs = useQuery({ queryKey: ['me', 'installs'], queryFn: () => api.get<{ data: unknown[] }>('/me/installs').then((r) => r.data), retry: false });
  const deviceName = (id: string | null) => devices.data?.data.find((d) => d.id === id)?.name ?? '—';
  const n = (x: number | undefined) => (x == null ? '—' : formatNumber(x));
  return (
    <AccountLayout title={t('My library')}>
      <dl className="grid gap-4 sm:grid-cols-3">
        <Stat name={t('Installed')} value={n(installs.data?.length)} />
        <Stat name={t('Favorites')} value={n(fav.query.data?.length)} />
        <Stat name={t('Devices')} value={n(devices.data?.data.length)} extra={devices.data?.limit != null ? `/ ${devices.data.limit}` : undefined} />
      </dl>

      <div className="mt-10 flex items-end justify-between"><h2 className="text-xl font-medium">{t('Favorites')}</h2><Link to="/account/favorites" className="text-sm underline">{t('See all')}</Link></div>
      <TileGrid assets={fav.query.data} loading={fav.query.isPending} error={fav.query.isError ? errorMessage(fav.query.error) : null} count={4} empty={t('Tap the heart on any asset to keep it here.')} />

      <div className="mt-10 flex items-end justify-between"><h2 className="text-xl font-medium">{t('Recent downloads')}</h2><Link to="/account/downloads" className="text-sm underline">{t('See all')}</Link></div>
      <div className="card mt-4 overflow-x-auto">
        {downloads.isError ? (
          <p role="alert" className="p-5 text-sm text-red-700">{t('Couldn’t load your downloads')}: {errorMessage(downloads.error)}</p>
        ) : (
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-gray-50 text-left text-gray-500"><tr><th scope="col" className="px-5 py-3">{t('Asset')}</th><th scope="col">{t('Version')}</th><th scope="col">{t('Device')}</th><th scope="col">{t('Date')}</th><th scope="col">{t('Status')}</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {(downloads.data?.data ?? []).slice(0, 5).map((d) => (
                <tr key={d.id}>
                  <td className="px-5 py-3 font-medium">{d.asset ? <Link to={`/library/${d.asset.slug}`}>{d.asset.title}</Link> : t('An asset that’s no longer available')}</td>
                  <td className="font-mono text-xs">{d.version}</td>
                  <td>{deviceName(d.device_id)}</td>
                  <td><time dateTime={d.started_at}>{formatDate(d.started_at)}</time></td>
                  <td className={d.status === 'failed' ? 'text-red-600' : 'text-emerald-600'}>{label(d.status)}</td>
                </tr>
              ))}
              {downloads.isPending && <tr><td colSpan={5} className="px-5 py-3 text-gray-500">{t('Loading…')}</td></tr>}
              {downloads.data && !downloads.data.data.length && <tr><td colSpan={5} className="px-5 py-3 text-gray-500">{t('No downloads yet')}</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-10 flex items-end justify-between"><h2 className="text-xl font-medium">{t('Devices')}</h2><Link to="/account/devices" className="text-sm underline">{t('Manage devices')}</Link></div>
      {devices.isError ? (
        <p role="alert" className="card mt-4 p-5 text-sm text-red-700">{t('Couldn’t load your devices')}: {errorMessage(devices.error)}</p>
      ) : (
        <ul className="card mt-4 divide-y divide-black/5 text-sm">
          {(devices.data?.data ?? []).map((d) => (
            <li key={d.id} className="flex flex-wrap justify-between gap-2 px-5 py-4"><span>{d.name} · {label(d.os)} · FrameFlow {d.app_version}</span><span className="text-gray-500">{t('last seen {when}', { when: timeAgo(d.last_seen_at) })}</span></li>
          ))}
          {devices.isPending && <li className="px-5 py-4 text-gray-500">{t('Loading…')}</li>}
          {devices.data && !devices.data.data.length && <li className="px-5 py-4 text-gray-500">{t('Sign in to FrameFlow on your computer and it appears here.')}</li>}
        </ul>
      )}
    </AccountLayout>
  );
}
