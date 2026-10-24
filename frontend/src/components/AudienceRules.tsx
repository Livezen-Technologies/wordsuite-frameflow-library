// A10 per-asset audience rules. Tailwind Plus Application UI: lists/stacked-lists (rows), forms/input-groups,
// forms/select-menus (native), elements/buttons. Saved with the asset (PATCH /admin/assets/:id { audience_rules }).
import { PlusIcon, TrashIcon } from '@heroicons/react/20/solid';
import { Button } from '@/components/ui/Button';
import { NativeSelect, inputClass } from '@/components/ui/Form';
import { TIERS, tierLabel } from '@/core/schema';
import { t } from '@/i18n';
import type { AudienceRule } from '@/types/api';

/** Drops empty conditions and trims values; region codes are upper case. */
export function normalizeRules(rules: AudienceRule[]): AudienceRule[] {
  return rules.map((r) => {
    const out: AudienceRule = { effect: r.effect === 'deny' ? 'deny' : 'allow' };
    for (const k of ['org_id', 'plan', 'role', 'region'] as const) {
      const v = String(r[k] ?? '').trim();
      if (v) out[k] = k === 'region' ? v.toUpperCase() : v;
    }
    return out;
  });
}

export function describeRule(r: AudienceRule): string {
  const parts = [r.org_id && t('org {v}', { v: r.org_id }), r.plan && t('plan {v}', { v: tierLabel(r.plan) }), r.role && t('role {v}', { v: r.role }), r.region && t('region {v}', { v: r.region })].filter(Boolean);
  return `${r.effect === 'deny' ? t('Deny') : t('Allow')} ${parts.length ? parts.join(' · ') : t('everyone')}`;
}

export function AudienceRulesEditor({ rules, onChange, disabled, errors }: { rules: AudienceRule[]; onChange: (r: AudienceRule[]) => void; disabled?: boolean; errors?: string }) {
  const set = (i: number, patch: Partial<AudienceRule>) => onChange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm/6 font-medium text-gray-900 dark:text-white">{t('Audience rules')}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('Narrow who can see and download this asset beyond its tier. Leave a field empty to match anyone. With no rules, everyone on a covering plan can download it.')}</p>
        </div>
        <Button variant="soft" size="sm" disabled={disabled} icon={<PlusIcon aria-hidden="true" className="size-4" />} onClick={() => onChange([...rules, { effect: 'allow' }])}>
          {t('Add rule')}
        </Button>
      </div>
      {rules.length > 0 && (
        <ol role="list" aria-label={t('Audience rules')} className="mt-4 divide-y divide-gray-100 rounded-md outline-1 outline-gray-200 dark:divide-white/5 dark:outline-white/10">
          {rules.map((r, i) => {
            const n = i + 1;
            return (
              <li key={i} className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-12 sm:items-end">
                <div className="sm:col-span-2">
                  <label htmlFor={`ar-effect-${i}`} className="block text-xs font-medium text-gray-700 dark:text-gray-300">{t('Effect')}</label>
                  <NativeSelect id={`ar-effect-${i}`} className="mt-1" disabled={disabled} value={r.effect} onChange={(e) => set(i, { effect: e.target.value as AudienceRule['effect'] })} aria-label={t('Effect, rule {n}', { n })}>
                    <option value="allow">{t('Allow')}</option>
                    <option value="deny">{t('Deny')}</option>
                  </NativeSelect>
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor={`ar-plan-${i}`} className="block text-xs font-medium text-gray-700 dark:text-gray-300">{t('Plan')}</label>
                  <NativeSelect id={`ar-plan-${i}`} className="mt-1" disabled={disabled} value={r.plan ?? ''} onChange={(e) => set(i, { plan: e.target.value || undefined })}>
                    <option value="">{t('Any')}</option>
                    {TIERS.map((tier) => <option key={tier} value={tier}>{tierLabel(tier)}</option>)}
                  </NativeSelect>
                </div>
                <div className="sm:col-span-3">
                  <label htmlFor={`ar-org-${i}`} className="block text-xs font-medium text-gray-700 dark:text-gray-300">{t('Organisation id')}</label>
                  <input id={`ar-org-${i}`} className={`${inputClass} mt-1`} disabled={disabled} value={r.org_id ?? ''} placeholder={t('Any')} onChange={(e) => set(i, { org_id: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor={`ar-role-${i}`} className="block text-xs font-medium text-gray-700 dark:text-gray-300">{t('Role')}</label>
                  <input id={`ar-role-${i}`} className={`${inputClass} mt-1`} disabled={disabled} value={r.role ?? ''} placeholder={t('Any')} onChange={(e) => set(i, { role: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor={`ar-region-${i}`} className="block text-xs font-medium text-gray-700 dark:text-gray-300">{t('Region')}</label>
                  <input id={`ar-region-${i}`} className={`${inputClass} mt-1 uppercase`} disabled={disabled} value={r.region ?? ''} maxLength={2} placeholder="LK" pattern="[A-Za-z]{2}" title={t('Two-letter country code, e.g. LK')} onChange={(e) => set(i, { region: e.target.value })} />
                </div>
                <div className="flex justify-end sm:col-span-1">
                  <Button variant="danger" size="sm" disabled={disabled} onClick={() => onChange(rules.filter((_, j) => j !== i))} icon={<TrashIcon aria-hidden="true" className="size-4" />}>
                    <span className="sr-only">{t('Remove rule {n}', { n })}</span>
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {errors && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors}</p>}
    </div>
  );
}
