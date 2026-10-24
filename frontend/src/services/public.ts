/** Client API (§7.2) used by the public site. No auth; plan defaults to free. */
import { api } from '@/services/api';
import type { AssetType, Tier } from '@/core/schema';
import type { Device, DownloadRecord, CatalogType, Category, Collection, Page, PublicAsset, PublicAssetDetail, SortKey } from '@/types/api';

export interface SearchQuery {
  q?: string;
  type?: AssetType | '';
  category?: string;
  tier?: Tier | '';
  sort?: SortKey;
  cursor?: string;
  limit?: number;
}

export const publicApi = {
  types: () => api.get<{ data: CatalogType[] }>('/catalog/types').then((r) => r.data),
  categories: (type?: AssetType | '') => api.get<{ data: Category[] }>('/catalog/categories', { type: type || undefined }).then((r) => r.data),
  search: (q: SearchQuery) => api.get<Page<PublicAsset>>('/assets', { limit: 24, ...q }),
  suggest: (q: string) => api.get<{ data: { id: string; title: string; type: AssetType }[] }>('/search/suggest', { q }).then((r) => r.data),
  asset: (idOrSlug: string) => api.get<PublicAssetDetail>(`/assets/${encodeURIComponent(idOrSlug)}`),
  collections: () => api.get<{ data: Collection[] }>('/collections').then((r) => r.data),
};

/** Signed-in library user (§ My library, devices). */
export const meApi = {
  favorites: () => api.get<{ data: PublicAsset[] }>('/me/favorites').then((r) => r.data),
  addFavorite: (assetId: string) => api.put<void>(`/me/favorites/${encodeURIComponent(assetId)}`),
  removeFavorite: (assetId: string) => api.del(`/me/favorites/${encodeURIComponent(assetId)}`),
  downloads: (cursor?: string) => api.get<{ data: DownloadRecord[]; next_cursor: string | null }>('/me/downloads', { cursor, limit: 25 }),
  devices: () => api.get<{ data: Device[]; limit: number }>('/me/devices'),
  revokeDevice: (id: string) => api.del(`/me/devices/${encodeURIComponent(id)}`),
};
