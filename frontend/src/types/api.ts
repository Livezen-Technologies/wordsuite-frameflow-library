import type { AssetStatus, AssetType, LicenceTerms, Role, Tier, Visibility } from '@/core/schema';

/** Error envelope: { error: { code, message, details[] } } */
export interface ErrorDetail {
  field?: string;
  rule?: string;
  value?: unknown;
  message?: string;
  [k: string]: unknown;
}
export interface ApiErrorBody {
  error: { code: string; message: string; details?: ErrorDetail[]; request_id?: string };
}

export interface Me {
  id: string;
  role: Role;
  plan?: string;
}

export interface Check {
  check: string;
  passed: boolean;
  detail?: ErrorDetail | null;
  /** "worker" for checks added by apps/workers after upload. */
  source?: string;
}

export interface Upload {
  id: string;
  filename: string;
  sha256: string;
  size: number;
  type: AssetType | null;
  checks: Check[];
  meta: Record<string, unknown>;
  duplicate_of: string | null;
  created_by: string;
  created_at: string;
}

export interface VersionFile {
  role: 'main' | 'thumbnail' | string;
  filename: string;
  sha256: string;
  size: number;
}

export interface AssetVersion {
  id: string;
  version: string;
  changelog: string;
  is_breaking: boolean;
  min_app_version: string;
  files: VersionFile[];
  checks: Check[];
  meta: Record<string, unknown>;
  status: 'ready' | 'failed' | 'published' | 'retired' | string;
  package: { sha256: string; size: number; signature: string; thumbnail: { ext: string } | null; built_at: string } | null;
  created_by: string;
  created_at: string;
  retired_at?: string;
  processing?: { status: JobStatus; job_id: string; error?: string | null; finished_at?: string } | null;
  previews?: Record<string, { key: string; ext: string; size: number }>;
}

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
export interface Job {
  id: string;
  asset_id: string;
  version: string;
  type: AssetType;
  status: JobStatus;
  attempts: number;
  lease_until: string | null;
  worker_id: string | null;
  error: string | null;
  previews: Record<string, { key: string; ext: string; size: number }>;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface Category {
  id: string;
  type: AssetType;
  name: string;
  slug: string;
  parent_id: string | null;
  sort: number;
  icon: string | null;
  visible: boolean;
}

export interface Asset {
  id: string;
  type: AssetType;
  slug: string;
  title: string;
  description: string;
  tags: string[];
  keywords: string[];
  min_app_version: string;
  licence_tier: Tier;
  licence_terms: LicenceTerms;
  licence_text: string;
  visibility: Visibility;
  category_id: string | null;
  category?: Category | null;
  attribution_required: boolean;
  attribution_text: string;
  author: string;
  aspect_ratios: string[];
  platforms: string[];
  audience_rules: unknown[];
  dependencies: { asset_id: string; [k: string]: unknown }[];
  featured: boolean;
  publish_at: string | null;
  unpublish_at: string | null;
  meta: Record<string, unknown>;
  thumbnail_file: { filename: string; sha256: string } | null;
  status: AssetStatus;
  current_version: string | null;
  published_version: string | null;
  pending_version?: string | null;
  versions: AssetVersion[];
  stats: { downloads: number; installs: number; favorites: number; applies: number };
  review?: { by: string; at: string; approved: boolean; reason: string } | null;
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
  published_by: string | null;
  published_at: string | null;
}

export interface Page<T> {
  data: T[];
  next_cursor: string | null;
  total: number;
}

export interface Overview {
  published: number;
  drafts: number;
  in_review: number;
  approved: number;
  failed: number;
  processing: number;
  downloads_30d: number;
  active_devices_30d: number;
  downloads_by_day: Record<string, number>;
  top_assets: { id: string; title: string; type: AssetType; downloads: number; applies: number; version: string | null }[];
  review_queue: { id: string; title: string; type: AssetType }[];
}

export interface AuditEntry {
  id?: string;
  at: string;
  actor_id?: string;
  actor_role: string;
  action: string;
  entity: string;
  entity_id: string;
  diff: { before: unknown; after: unknown };
}

export type BulkAction = 'publish' | 'unpublish' | 'archive' | 'tag_add' | 'tag_remove' | 'move_category' | 'set_tier' | 'set_visibility';
export interface BulkResult {
  job_id: string;
  status: string;
  results: { id: string; ok: boolean; error?: { code: string; message: string } }[];
}

export interface CreateItemResult {
  ok: boolean;
  asset?: Asset;
  upload_id?: string;
  error?: { code: string; message: string; details?: ErrorDetail[] };
}

// ---------------------------------------------------------------- client API (§7.2)

export interface PublicAsset {
  id: string;
  slug: string;
  type: AssetType;
  title: string;
  description: string;
  category: { id: string; name: string; slug: string } | null;
  tags: string[];
  keywords: string[];
  aspect_ratios: string[];
  licence_tier: Tier;
  licence_terms: LicenceTerms;
  attribution_required: boolean;
  attribution_text: string;
  author: string;
  min_app_version: string;
  current_version: string | null;
  file_size_bytes: number | null;
  checksum_sha256: string | null;
  featured: boolean;
  meta: Record<string, unknown>;
  pack_id: string;
  pack_type: string;
  thumbnail_url: string | null;
  /** Generated previews by kind (hover, audio_preview, waveform, specimen, before_after_N, poster, swatches…) → URL. */
  preview?: Record<string, string>;
  published_at: string | null;
  stats: { downloads: number; installs: number; favorites: number; applies: number };
}

export interface PublicAssetDetail extends PublicAsset {
  versions: { version: string; changelog: string; is_breaking: boolean; status: string; size: number; sha256: string }[];
  dependencies: { asset_id: string; asset: PublicAsset | null }[];
  entitlement: { can_download: boolean; reason: string | null };
}

export interface CatalogType {
  key: AssetType;
  name: string;
  pack_type: string;
  editor_target: string;
  count: number;
}

export interface Collection {
  slug: string;
  title: string;
  assets: PublicAsset[];
}

export type SortKey = 'popular' | 'new' | 'trending' | 'az';
