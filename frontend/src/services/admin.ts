/** Typed calls for /api/v1/admin/* (blueprint §7.3). */
import { api, request } from '@/services/api';
import { config } from '@/core/config';
import type { AssetType, Tier, Visibility } from '@/core/schema';
import type { Asset, AuditEntry, BulkAction, BulkResult, Category, CreateItemResult, Me, Overview, Page, Upload } from '@/types/api';

export interface AssetListQuery {
  type?: AssetType | '';
  status?: string;
  q?: string;
  owner?: string;
  cursor?: string;
  limit?: number;
}

export interface BatchDefaults {
  tags?: string;
  licence_tier?: Tier;
  min_app_version?: string;
  category_id?: string;
  visibility?: Visibility;
  submit_for_review?: boolean;
}

export const adminApi = {
  me: () => api.get<Me>('/admin/me'),
  overview: () => api.get<Overview>('/admin/analytics/overview'),

  listAssets: (q: AssetListQuery = {}) => api.get<Page<Asset>>('/admin/assets', { limit: 200, ...q }),
  getAsset: (id: string) => api.get<Asset>(`/admin/assets/${encodeURIComponent(id)}`),
  updateAsset: (id: string, patch: Record<string, unknown>) => api.patch<Asset>(`/admin/assets/${encodeURIComponent(id)}`, patch),
  createDrafts: (defaults: BatchDefaults, items: { upload_id: string; type: AssetType }[]) => api.post<{ data: CreateItemResult[] }>('/admin/assets', { defaults, items }),
  bulk: (ids: string[], action: BulkAction, payload: Record<string, unknown> = {}) => api.post<BulkResult>('/admin/assets/bulk', { ids, action, payload }),

  upload: (file: File, type?: AssetType | null) => api.upload<Upload>('/admin/uploads', file, file.name, { type: type || undefined }),
  getUpload: (id: string) => api.get<Upload>(`/admin/uploads/${encodeURIComponent(id)}`),

  addVersion: (id: string, body: { upload_id: string; changelog?: string; is_breaking?: boolean; version?: string }) => api.post<Asset>(`/admin/assets/${encodeURIComponent(id)}/versions`, body),
  publishVersion: (id: string, version: string) => api.post<Asset>(`/admin/assets/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}/publish`, {}),
  rollback: (id: string, version: string) => api.post<Asset>(`/admin/assets/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}/rollback`, {}),

  submitReview: (id: string) => api.post<Asset>(`/admin/assets/${encodeURIComponent(id)}/submit-review`),
  approve: (id: string) => api.post<Asset>(`/admin/assets/${encodeURIComponent(id)}/approve`),
  reject: (id: string, reason: string) => api.post<Asset>(`/admin/assets/${encodeURIComponent(id)}/reject`, { reason }),
  publish: (id: string, body: { publish_at?: string } = {}) => api.post<Asset>(`/admin/assets/${encodeURIComponent(id)}/publish`, body),
  unpublish: (id: string, reason?: string) => api.post<Asset>(`/admin/assets/${encodeURIComponent(id)}/unpublish`, reason ? { reason } : {}),
  deprecate: (id: string, reason?: string) => api.post<Asset>(`/admin/assets/${encodeURIComponent(id)}/deprecate`, reason ? { reason } : {}),
  archive: (id: string) => api.post<Asset>(`/admin/assets/${encodeURIComponent(id)}/archive`),

  categories: (type?: AssetType) => api.get<{ data: Category[] }>('/admin/categories', { type }).then((r) => r.data),
  createCategory: (body: { type: AssetType; name: string }) => api.post<Category>('/admin/categories', body),

  auditLog: (entityId?: string) => api.get<{ data: AuditEntry[] }>('/admin/audit-log', { entity_id: entityId }).then((r) => r.data),
};

/** Public feed endpoints (no auth needed). */
export const feedApi = {
  catalogUrl: (channel: 'stable' | 'beta') => `${config.feedBase}/${channel}/catalog.json`,
  signatureUrl: (channel: 'stable' | 'beta') => `${config.feedBase}/${channel}/catalog.json.sig`,
  publicKeyUrl: () => `${config.feedBase}/public-key.pem`,
  publicKey: () => request<string>(`${config.feedBase}/public-key.pem`, { text: true, absolute: true }),
  catalog: (channel: 'stable' | 'beta') => request<{ packs?: unknown[]; [k: string]: unknown }>(`${config.feedBase}/${channel}/catalog.json`, { absolute: true }),
};
