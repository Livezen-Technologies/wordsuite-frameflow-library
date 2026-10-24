// FrameFlow asset card in Radiant's visual language (rounded-4xl frames, ring-black/5, Subheading eyebrow).
import { clsx } from 'clsx';
import { Link } from './link';
import { Subheading } from './text';
import { typeColor, typeName } from '@/core/schema';
import type { PublicAsset } from '@/types/api';

export function AssetThumb({ asset, className }: { asset: Pick<PublicAsset, 'thumbnail_url' | 'type' | 'title'>; className?: string }) {
  if (asset.thumbnail_url) return <img src={asset.thumbnail_url} alt="" loading="lazy" className={clsx(className, 'object-cover')} />;
  return (
    <div aria-hidden="true" className={clsx(className, 'flex items-end p-4')} style={{ background: `linear-gradient(135deg, ${typeColor(asset.type)}, #111827)` }}>
      <span className="font-mono text-xs/5 font-semibold tracking-widest text-white/80 uppercase">{typeName(asset.type)}</span>
    </div>
  );
}

export function TierPill({ tier, dark = false }: { tier: string; dark?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs/5 font-medium capitalize ring-1', tier === 'free' ? (dark ? 'bg-white/10 text-white ring-white/20' : 'bg-gray-50 text-gray-700 ring-black/10') : 'bg-fuchsia-950/80 text-white ring-fuchsia-950/10')}>
      {tier === 'free' ? 'Free' : tier}
    </span>
  );
}

export function AssetCard({ asset, dark = false }: { asset: PublicAsset; dark?: boolean }) {
  return (
    <Link
      href={`/library/${asset.slug}`}
      data-dark={dark ? 'true' : undefined}
      className="group relative flex flex-col overflow-hidden rounded-3xl bg-white shadow-xs ring-1 ring-black/5 data-dark:bg-gray-800 data-dark:ring-white/15 data-hover:shadow-md"
    >
      <AssetThumb asset={asset} className="aspect-video w-full" />
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
  );
}
