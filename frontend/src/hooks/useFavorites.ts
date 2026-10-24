import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useNotify } from '@/components/ui/Notifications';
import { meApi } from '@/services/public';
import { errorMessage } from '@/services/api';
import { t } from '@/i18n';
import type { PublicAsset } from '@/types/api';

export const FAVORITES_KEY = ['me', 'favorites'] as const;

/** Favourites of the signed-in user, with an optimistic toggle that rolls back when the API refuses. */
export function useFavorites() {
  const { status } = useAuth();
  const qc = useQueryClient();
  const { fail } = useNotify();
  const navigate = useNavigate();
  const loc = useLocation();
  const signedIn = status === 'signed-in';
  const query = useQuery({ queryKey: FAVORITES_KEY, queryFn: meApi.favorites, enabled: signedIn, staleTime: 60_000, retry: false });
  const ids = useMemo(() => new Set((query.data ?? []).map((a) => a.id)), [query.data]);

  const toggle = async (asset: PublicAsset) => {
    if (!signedIn) {
      navigate(`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`);
      return;
    }
    const was = ids.has(asset.id);
    await qc.cancelQueries({ queryKey: FAVORITES_KEY });
    const previous = qc.getQueryData<PublicAsset[]>(FAVORITES_KEY);
    qc.setQueryData<PublicAsset[]>(FAVORITES_KEY, (old = []) => (was ? old.filter((a) => a.id !== asset.id) : [asset, ...old]));
    try {
      if (was) await meApi.removeFavorite(asset.id);
      else await meApi.addFavorite(asset.id);
    } catch (e) {
      qc.setQueryData(FAVORITES_KEY, previous);
      fail(was ? t('Couldn’t remove it from your favorites') : t('Couldn’t add it to your favorites'), errorMessage(e));
    }
  };
  return { ids, toggle, query, signedIn };
}
