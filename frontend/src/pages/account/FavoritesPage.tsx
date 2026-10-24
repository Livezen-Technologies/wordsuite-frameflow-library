import { AccountLayout, Notice } from './AccountLayout';
import { useFavorites } from '@/hooks/useFavorites';
import { AssetTile } from '@/components/site/AssetTile';
import { Button } from '@/components/radiant/button';
import { errorMessage } from '@/services/api';
import { t, tn } from '@/i18n';

export function FavoritesPage() {
  const { query } = useFavorites();
  const items = query.data ?? [];
  return (
    <AccountLayout title={t('Favorites')} lead={t('Assets you’ve saved with the heart. They sync to FrameFlow when you sign in there.')}>
      {query.isPending ? (
        <p role="status" className="text-sm/6 text-gray-600">{t('Loading…')}</p>
      ) : query.isError ? (
        <Notice tone="error" title={t('Couldn’t load your favorites')} action={<Button variant="outline" onClick={() => void query.refetch()}>{t('Try again')}</Button>}>
          {errorMessage(query.error)}
        </Notice>
      ) : !items.length ? (
        <Notice title={t('No favorites yet')} action={<Button href="/library">{t('Browse the library')}</Button>}>{t('Tap the heart on any asset to keep it here.')}</Notice>
      ) : (
        <>
          <p className="text-sm/6 text-gray-600" role="status">{tn('{n} saved asset', '{n} saved assets', items.length)}</p>
          <ul role="list" className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((a) => (
              <li key={a.id}>
                <AssetTile asset={a} />
              </li>
            ))}
          </ul>
        </>
      )}
    </AccountLayout>
  );
}
