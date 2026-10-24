// Tailwind Plus Application UI · elements/badges (01 with border).
import type { ReactNode } from 'react';
import { classNames } from '@/core/format';
import { humanize } from '@/core/schema';

export type Tone = 'gray' | 'red' | 'yellow' | 'green' | 'blue' | 'indigo' | 'purple' | 'pink' | 'orange';

const tones: Record<Tone, string> = {
  gray: 'bg-gray-50 text-gray-600 inset-ring-gray-500/10 dark:bg-gray-400/10 dark:text-gray-400 dark:inset-ring-gray-400/20',
  red: 'bg-red-50 text-red-700 inset-ring-red-600/10 dark:bg-red-400/10 dark:text-red-400 dark:inset-ring-red-400/20',
  yellow: 'bg-yellow-50 text-yellow-800 inset-ring-yellow-600/20 dark:bg-yellow-400/10 dark:text-yellow-500 dark:inset-ring-yellow-400/20',
  green: 'bg-green-50 text-green-700 inset-ring-green-600/20 dark:bg-green-400/10 dark:text-green-400 dark:inset-ring-green-500/20',
  blue: 'bg-blue-50 text-blue-700 inset-ring-blue-700/10 dark:bg-blue-400/10 dark:text-blue-400 dark:inset-ring-blue-400/30',
  indigo: 'bg-indigo-50 text-indigo-700 inset-ring-indigo-700/10 dark:bg-indigo-400/10 dark:text-indigo-400 dark:inset-ring-indigo-400/30',
  purple: 'bg-purple-50 text-purple-700 inset-ring-purple-700/10 dark:bg-purple-400/10 dark:text-purple-400 dark:inset-ring-purple-400/30',
  pink: 'bg-pink-50 text-pink-700 inset-ring-pink-700/10 dark:bg-pink-400/10 dark:text-pink-400 dark:inset-ring-pink-400/20',
  orange: 'bg-orange-50 text-orange-700 inset-ring-orange-600/20 dark:bg-orange-400/10 dark:text-orange-400 dark:inset-ring-orange-400/20',
};

export function Badge({ tone = 'gray', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={classNames('inline-flex items-center rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap inset-ring', tones[tone], className)}>{children}</span>;
}

const STATUS_TONE: Record<string, Tone> = {
  published: 'green',
  ready_for_review: 'yellow',
  approved: 'indigo',
  processing: 'blue',
  failed: 'red',
  draft: 'gray',
  deprecated: 'orange',
  archived: 'gray',
  ready: 'blue',
  retired: 'gray',
  queued: 'yellow',
  running: 'blue',
  done: 'green',
  cancelled: 'gray',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'gray'}>{humanize(status)}</Badge>;
}

const TIER_TONE: Record<string, Tone> = { free: 'gray', pro: 'indigo', business: 'purple', enterprise: 'pink' };
export function TierBadge({ tier }: { tier: string }) {
  return <Badge tone={TIER_TONE[tier] ?? 'gray'}>{tier}</Badge>;
}
