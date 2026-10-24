// Asset card from the mockup: gradient (or real) thumbnail, type pill, plan badge, hover "+ Add to FrameFlow",
// title and download count. The heart (favorites) sits in the corner and stays outside the link.
import { useRef } from 'react';
import { Link } from 'react-router';
import { clsx } from 'clsx';
import { mediaUrl } from '@/core/config';
import { formatNumber } from '@/core/format';
import { TYPE_DISPLAY } from '@/content/site';
import { t, tx } from '@/i18n';
import { FavoriteButton } from '@/components/radiant/favorite-button';
import type { AssetType } from '@/core/schema';
import type { PublicAsset } from '@/types/api';

export const typeLabel = (type: string) => tx(TYPE_DISPLAY[type as AssetType]?.label ?? type);
export const gradient = (type: string) => {
  const d = TYPE_DISPLAY[type as AssetType];
  return { '--a': d?.a ?? '#6366f1', '--b': d?.b ?? '#111827' } as React.CSSProperties;
};

export function Thumb({ asset, className, children }: { asset: Pick<PublicAsset, 'type' | 'thumbnail_url' | 'preview'>; className?: string; children?: React.ReactNode }) {
  const url = mediaUrl(asset.thumbnail_url ?? asset.preview?.thumbnail);
  return (
    <div className={clsx('thumb relative overflow-hidden', className)} style={gradient(asset.type)}>
      {url ? <img src={url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" /> : asset.type === 'sfx' ? <div className="wave absolute inset-x-4 inset-y-6" /> : asset.type === 'font' ? <span className="absolute inset-0 grid place-items-center text-4xl font-semibold text-white">අආ Aa</span> : null}
      {children}
    </div>
  );
}

export function AssetTile({ asset }: { asset: PublicAsset }) {
  const video = useRef<HTMLVideoElement>(null);
  const hover = mediaUrl(asset.preview?.hover);
  const play = () => void video.current?.play().catch(() => {});
  const stop = () => {
    if (video.current) {
      video.current.pause();
      video.current.currentTime = 0;
    }
  };
  return (
    <div className="lift relative">
      <Link to={`/library/${asset.slug}`} className="group card block !rounded-3xl" onPointerEnter={play} onPointerLeave={stop} onFocus={play} onBlur={stop}>
        <Thumb asset={asset} className="aspect-video">
          {hover && <video ref={video} src={hover} muted loop playsInline preload="none" aria-hidden="true" className="absolute inset-0 size-full object-cover opacity-0 transition-opacity group-hover:opacity-100" />}
          <span className="absolute top-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium">{typeLabel(asset.type).split(' ')[0]}</span>
          {asset.licence_tier !== 'free' && <span className="absolute top-2 right-12 rounded-full bg-gray-950 px-2 py-0.5 text-[11px] text-white capitalize">{tx(asset.licence_tier)}</span>}
          <span aria-hidden="true" className="absolute right-2 bottom-2 rounded-full bg-white px-3 py-1 text-xs font-medium opacity-0 shadow group-hover:opacity-100 group-focus-visible:opacity-100">+ {t('Add to FrameFlow')}</span>
        </Thumb>
        <div className="p-3">
          <p className="truncate text-sm font-medium">{asset.title}</p>
          <p className="text-xs text-gray-500">{t('{n} downloads', { n: formatNumber(asset.stats?.downloads ?? 0) })}</p>
        </div>
      </Link>
      <FavoriteButton asset={asset} className="absolute top-1.5 right-1.5 z-10 !size-8" />
    </div>
  );
}

export function TileGrid({ assets, loading, error, count = 8, className = 'grid-cols-2 md:grid-cols-4', empty }: { assets?: PublicAsset[]; loading?: boolean; error?: string | null; count?: number; className?: string; empty?: string }) {
  if (error) return <p role="alert" className="mt-6 rounded-3xl bg-red-50 p-6 text-sm text-red-800 ring-1 ring-red-900/10">{error}</p>;
  if (loading)
    return (
      <div className={clsx('mt-6 grid gap-4', className)} aria-busy="true" aria-label={t('Loading…')}>
        {Array.from({ length: count }, (_, i) => <div key={i} className="card aspect-[4/3] !rounded-3xl animate-pulse bg-gray-100" />)}
      </div>
    );
  if (!assets?.length) return <p className="mt-6 rounded-3xl bg-gray-50 p-8 text-center text-sm text-gray-600 ring-1 ring-black/5">{empty ?? t('Nothing here yet — check back soon.')}</p>;
  return (
    <ul role="list" className={clsx('mt-6 grid gap-4', className)}>
      {assets.slice(0, count).map((a) => <li key={a.id}><AssetTile asset={a} /></li>)}
    </ul>
  );
}

export function Faq({ items }: { items: [string, string][] }) {
  return (
    <div className="mt-6 divide-y divide-black/10">
      {items.map(([q, a]) => (
        <details key={q} className="py-4">
          <summary className="cursor-pointer font-medium">{q}</summary>
          <p className="mt-2 text-gray-600">{a}</p>
        </details>
      ))}
    </div>
  );
}
