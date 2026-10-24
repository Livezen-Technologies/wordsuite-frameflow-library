import type { ComponentType, SVGProps } from 'react';
import { ArrowUpTrayIcon, ClipboardDocumentCheckIcon, Cog6ToothIcon, CpuChipIcon, HomeIcon, RectangleStackIcon, ShieldCheckIcon, TagIcon } from '@heroicons/react/24/outline';
import type { Permission } from '@/core/schema';

export interface NavItem {
  name: string;
  to: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Hidden unless the role has it (same rules as the old admin). */
  perm?: Permission;
  end?: boolean;
}

export const ADMIN_NAV: NavItem[] = [
  { name: 'Dashboard', to: '/admin', icon: HomeIcon, end: true },
  { name: 'Asset Library', to: '/admin/assets', icon: RectangleStackIcon },
  { name: 'Upload Center', to: '/admin/upload', icon: ArrowUpTrayIcon, perm: 'asset.create' },
  { name: 'Processing', to: '/admin/processing', icon: CpuChipIcon, perm: 'asset.create' },
  { name: 'Review Queue', to: '/admin/review', icon: ClipboardDocumentCheckIcon, perm: 'asset.review' },
  { name: 'Categories & Tags', to: '/admin/categories', icon: TagIcon },
  { name: 'Audit log', to: '/admin/audit', icon: ShieldCheckIcon, perm: 'analytics.view' },
];

export const SETTINGS_NAV: NavItem = { name: 'Settings', to: '/admin/settings', icon: Cog6ToothIcon };
