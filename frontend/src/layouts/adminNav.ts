import type { ComponentType, SVGProps } from 'react';
import { ArrowUpTrayIcon, ChartBarIcon, ClipboardDocumentCheckIcon, Cog6ToothIcon, CpuChipIcon, HomeIcon, KeyIcon, QueueListIcon, RectangleStackIcon, ShieldCheckIcon, TagIcon } from '@heroicons/react/24/outline';
import type { Permission } from '@/core/schema';
import { msg, type MessageKey } from '@/i18n';

export interface NavItem {
  name: MessageKey;
  to: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Hidden unless the role has it (same rules as the old admin). */
  perm?: Permission;
  end?: boolean;
}

export const ADMIN_NAV: NavItem[] = [
  { name: msg('Dashboard'), to: '/admin', icon: HomeIcon, end: true },
  { name: msg('Asset Library'), to: '/admin/assets', icon: RectangleStackIcon },
  { name: msg('Upload Center'), to: '/admin/upload', icon: ArrowUpTrayIcon, perm: 'asset.create' },
  { name: msg('Processing'), to: '/admin/processing', icon: CpuChipIcon, perm: 'asset.create' },
  { name: msg('Review Queue'), to: '/admin/review', icon: ClipboardDocumentCheckIcon, perm: 'asset.review' },
  { name: msg('Categories & Tags'), to: '/admin/categories', icon: TagIcon },
  { name: msg('Collections'), to: '/admin/collections', icon: QueueListIcon, perm: 'taxonomy.manage' },
  { name: msg('Analytics'), to: '/admin/analytics', icon: ChartBarIcon, perm: 'analytics.view' },
  { name: msg('Access & tiers'), to: '/admin/access', icon: KeyIcon, perm: 'settings.manage' },
  { name: msg('Audit log'), to: '/admin/audit', icon: ShieldCheckIcon, perm: 'analytics.view' },
];

export const SETTINGS_NAV: NavItem = { name: msg('Settings'), to: '/admin/settings', icon: Cog6ToothIcon };
