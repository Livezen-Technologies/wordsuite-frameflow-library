import { tx } from '@/i18n';

/**
 * The bits of packages/asset-schema the admin UI needs, ported to TypeScript.
 * Keep in sync with packages/asset-schema/index.js (the API enforces the real rules).
 */

export const ASSET_TYPES = {
  graphic: { name: 'Graphic Elements & Overlays', short: 'Graphics', ext: ['png', 'svg', 'webp', 'psd', 'mov', 'webm'], maxBytes: 200 * 1024 ** 2, dir: 'graphics', target: 'Canvas / overlay track', color: '#0ea5e9' },
  sfx: { name: 'Sound Effects & Audio', short: 'Sound', ext: ['wav', 'flac', 'mp3', 'aac', 'ogg'], maxBytes: 100 * 1024 ** 2, dir: 'audio', target: 'Audio track', color: '#10b981' },
  text_template: { name: 'Text Templates & Animations', short: 'Text', ext: ['fftext', 'json'], maxBytes: 500 * 1024 ** 2, dir: 'text', target: 'Text track / title editor', color: '#f59e0b' },
  video_template: { name: 'Video Templates', short: 'Video', ext: ['fftemplate'], maxBytes: 2 * 1024 ** 3, dir: 'templates', target: 'New project / insert sequence', color: '#8b5cf6' },
  motion: { name: 'Motion Graphics & Animated Elements', short: 'Motion', ext: ['ffmotion', 'mov', 'webm', 'json'], maxBytes: 500 * 1024 ** 2, dir: 'motion', target: 'Overlay track', color: '#ec4899' },
  transition: { name: 'Video Effects & Transitions', short: 'Transitions', ext: ['ffx'], maxBytes: 500 * 1024 ** 2, dir: 'effects', target: 'Clip / between-clip', color: '#6366f1' },
  lut: { name: 'LUTs & Color Presets', short: 'LUTs', ext: ['cube', '3dl', 'ffcolor'], maxBytes: 10 * 1024 ** 2, dir: 'luts', target: 'Clip color panel', color: '#f97316' },
  font: { name: 'Fonts & Font Packs', short: 'Fonts', ext: ['ttf', 'otf', 'woff2'], maxBytes: 50 * 1024 ** 2, dir: 'fonts', target: 'Text engine', color: '#64748b' },
  filter: { name: 'Video & Image Filters', short: 'Filters', ext: ['ffx'], maxBytes: 500 * 1024 ** 2, dir: 'filters', target: 'Clip effects panel', color: '#14b8a6' },
  brand_kit: { name: 'Brand Kits', short: 'Brand kits', ext: ['ffbrand', 'json'], maxBytes: 200 * 1024 ** 2, dir: 'brandkits', target: 'Brand panel / project defaults', color: '#a855f7' },
  gif_sticker: { name: 'GIFs & Animated Stickers', short: 'Stickers', ext: ['gif', 'apng', 'png', 'webp'], maxBytes: 30 * 1024 ** 2, dir: 'stickers', target: 'Canvas / overlay track', color: '#eab308' },
  lottie: { name: 'Lottie Animations', short: 'Lottie', ext: ['json', 'lottie'], maxBytes: 5 * 1024 ** 2, dir: 'lottie', target: 'Canvas / overlay track', color: '#22c55e' },
} as const;

export type AssetType = keyof typeof ASSET_TYPES;
export const TYPE_KEYS = Object.keys(ASSET_TYPES) as AssetType[];

export const STATUSES = ['draft', 'processing', 'ready_for_review', 'approved', 'published', 'deprecated', 'archived', 'failed'] as const;
export type AssetStatus = (typeof STATUSES)[number];
export const VISIBILITIES = ['draft', 'private', 'internal', 'public', 'unlisted'] as const;
export type Visibility = (typeof VISIBILITIES)[number];
export const TIERS = ['free', 'pro', 'business', 'enterprise'] as const;
export type Tier = (typeof TIERS)[number];
export const LICENCE_TERMS = ['royalty_free', 'editorial_only', 'personal_only', 'custom'] as const;
export type LicenceTerms = (typeof LICENCE_TERMS)[number];

export const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
export const SLUG = /^[a-z0-9-]{3,80}$/;

export const ROLES = {
  super_admin: ['asset.create', 'asset.edit.all', 'asset.review', 'asset.publish', 'asset.publish.direct', 'asset.delete', 'asset.archive', 'version.rollback', 'taxonomy.manage', 'access.manage', 'analytics.view', 'settings.manage'],
  library_manager: ['asset.create', 'asset.edit.all', 'asset.review', 'asset.publish', 'asset.archive', 'version.rollback', 'taxonomy.manage', 'access.manage', 'analytics.view'],
  content_editor: ['asset.create', 'asset.edit.own', 'analytics.view.own'],
  reviewer: ['asset.review', 'analytics.view'],
  analyst: ['analytics.view'],
} as const satisfies Record<string, readonly string[]>;

export type Role = keyof typeof ROLES;
export type Permission = (typeof ROLES)[Role][number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin',
  library_manager: 'Library Manager',
  content_editor: 'Content Editor',
  reviewer: 'Reviewer',
  analyst: 'Analyst',
};

export function can(role: string | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ((ROLES as Record<string, readonly string[]>)[role] ?? []).includes(permission);
}

/** Short type name in the current language ("LUTs"). */
export const typeName = (t: string): string => tx((ASSET_TYPES as Record<string, { short: string }>)[t]?.short ?? t);
/** Full type name in the current language ("LUTs & Color Presets"). */
export const typeLongName = (t: string): string => tx((ASSET_TYPES as Record<string, { name: string }>)[t]?.name ?? t);
/** Where the type installs in FrameFlow, translated. */
export const typeTarget = (t: string): string => tx((ASSET_TYPES as Record<string, { target: string }>)[t]?.target ?? t);
/** Enum value (status, visibility, tier, licence terms) as a translated label. */
export const label = (s: string | null | undefined): string => tx(String(s ?? '').replace(/_/g, ' '));
export const tierLabel = (tier: string): string => tx(tier);
export const roleLabel = (r: string | null | undefined): string => tx((ROLE_LABELS as Record<string, string>)[r ?? ''] ?? r ?? '');
export const typeColor = (t: string): string => (ASSET_TYPES as Record<string, { color: string }>)[t]?.color ?? '#6366f1';
export const humanize = (s: string | null | undefined): string => String(s ?? '').replace(/_/g, ' ');

export const extOf = (name: string): string => String(name).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';

/** Types a filename could be (by extension). Used to pre-filter the type picker; the API decides. */
export function typesForFile(name: string): AssetType[] {
  const ext = extOf(name);
  return TYPE_KEYS.filter((t) => (ASSET_TYPES[t].ext as readonly string[]).includes(ext));
}
