// Heart toggle in Radiant's language (white pill, ring-black/10). Optimistic: see hooks/useFavorites.
import { HeartIcon as HeartOutline } from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolid } from '@heroicons/react/24/solid';
import { clsx } from 'clsx';
import { useFavorites } from '@/hooks/useFavorites';
import { t } from '@/i18n';
import type { PublicAsset } from '@/types/api';

export function FavoriteButton({ asset, className, withLabel = false }: { asset: PublicAsset; className?: string; withLabel?: boolean }) {
  const { ids, toggle } = useFavorites();
  const on = ids.has(asset.id);
  const Icon = on ? HeartSolid : HeartOutline;
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={withLabel ? undefined : on ? t('Remove {title} from favorites', { title: asset.title }) : t('Add {title} to favorites', { title: asset.title })}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void toggle(asset);
      }}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-full bg-white/90 text-gray-950 shadow-sm ring-1 ring-black/10 backdrop-blur-sm transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-950',
        withLabel ? 'px-4 py-2 text-sm/6 font-medium' : 'size-9',
        className,
      )}
    >
      <Icon aria-hidden="true" className={clsx('size-5', on ? 'text-fuchsia-700' : 'text-gray-700')} />
      {withLabel && (on ? t('Saved to favorites') : t('Save to favorites'))}
    </button>
  );
}
