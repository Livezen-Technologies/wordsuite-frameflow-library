// FrameFlow asset card in Radiant's visual language (rounded-4xl frames, ring-black/5, Subheading eyebrow).
import { useRef } from 'react';
import { clsx } from 'clsx';
import { mediaUrl } from '@/core/config';
import { Link } from './link';
import { Subheading } from './text';
import { typeColor, typeName } from '@/core/schema';
import type { PublicAsset } from '@/types/api';
import { FavoriteButton } from './favorite-button';
import { t } from '@/i18n';

export function AssetThumb({ asset, className }: { asset: Pick<PublicAsset, 'thumbnail_url' | 'type' | 'title'>; className?: string }) {
  if (asset.thumbnail_url) return <img src={mediaUrl(asset.thumbnail_url)!} alt="" loading="lazy" className={clsx(className, 'object-cover')} />;
  return (
    <div aria-hidden="true" className={clsx(className, 'flex items-end p-4')} style={{ background: `linear-gradient(135deg, ${typeColor(asset.type)}, #111827)` }}>
      <span className="font-mono text-xs/5 font-semibold tracking-widest text-white/80 uppercase">{typeName(asset.type)}</span>
    </div>
  );
}

export function TierPill({ tier, dark = false }: { tier: string; dark?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs/5 font-medium capitalize ring-1', tier === 'free' ? (dark ? 'bg-white/10 text-white ring-white/20' : 'bg-gray-50 text-gray-700 ring-black/10') : 'bg-fuchsia-950/80 text-white ring-fuchsia-950/10')}>
      {tier === 'free' ? t('Free') : tier}
    </span>
  );
}

/** Thumbnail that plays the generated hover MP4 (preview.hover) on pointer hover or keyboard focus. */
function HoverThumb({ asset }: { asset: PublicAsset }) {
  const video = useRef<HTMLVideoElement>(null);
  const hover = mediaUrl(asset.preview?.hover);
  if (!hover) return <AssetThumb asset={asset} className="aspect-video w-full" />;
  const play = () => void video.current?.play().catch(() => {});
  const stop = () => {
    if (!video.current) return;
    video.current.pause();
    video.current.currentTime = 0;
  };
  return (
    <div className="relative aspect-video w-full" onPointerEnter={play} onPointerLeave={stop} onFocus={play} onBlur={stop} data-hover-preview>
      <AssetThumb asset={asset} className="absolute inset-0 size-full" />
      <video ref={video} src={hover} muted loop playsInline preload="none" aria-hidden="true" className="absolute inset-0 size-full object-cover opacity-0 transition-opacity group-data-hover:opacity-100 group-focus-visible:opacity-100" />
    </div>
  );
}

export function AssetCard({ asset, dark = false }: { asset: PublicAsset; dark?: boolean }) {
  return (
    <div className="relative flex w-full">
    <Link
      href={`/library/${asset.slug}`}
      data-dark={dark ? 'true' : undefined}
      className="group relative flex w-full flex-col overflow-hidden rounded-3xl bg-white shadow-xs ring-1 ring-black/5 data-dark:bg-gray-800 data-dark:ring-white/15 data-hover:shadow-md"
    >
      <HoverThumb asset={asset} />
      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex items-center justify-between gap-2">
          <Subheading as="div" dark={dark}>
            {typeName(asset.type)}
            {asset.category ? ` · ${asset.category.name}` : ''}
          </Subheading>
          <TierPill tier={asset.licence_tier} dark={dark} />
        </div>
        <p className="text-base/6 font-medium tracking-tight text-gray-950 group-data-dark:text-white">{asset.title}</p>
        {asset.description && <p className="line-clamp-2 text-sm/6 text-gray-600 group-data-dark:text-gray-400">{asset.description}</p>}
      </div>
    </Link>
      <FavoriteButton asset={asset} className="absolute top-3 right-3 z-10" />
    </div>
  );
}
