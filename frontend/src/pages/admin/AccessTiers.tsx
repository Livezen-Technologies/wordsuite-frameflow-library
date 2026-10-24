// A10 Access & tiers. Tailwind Plus Application UI: page-examples/settings-screens (sectioned form: title + description
// left, fields right), forms/input-groups, forms/toggles (04), forms/checkboxes (01 list with description),
// forms/textareas, feedback/alerts. API: GET/PUT /admin/settings (settings.manage, audited).
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/services/admin';
import { ApiError, errorMessage } from '@/services/api';
import { PageHeading } from '@/components/ui/Layout';
import { Button, Loading } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Checkbox, TextArea, TextField, Toggle } from '@/components/ui/Form';
import { useNotify } from '@/components/ui/Notifications';
import { TIERS, VISIBILITIES, label, tierLabel, type Tier, type Visibility } from '@/core/schema';
import { t } from '@/i18n';
import type { LibrarySettings } from '@/types/api';

export const DEFAULT_LIMITS: Record<Tier, number> = { free: 2, pro: 3, business: 10, enterprise: 50 };
const FEED_VISIBILITIES = VISIBILITIES.filter((v) => v !== 'draft');

/** Problems with a CORS origin list (one origin per line): returns the bad lines. */
export function badOrigins(lines: string[]): string[] {
  return lines.filter((o) => {
    if (o === '*') return false;
    try {
      const u = new URL(o);
      return !['http:', 'https:'].includes(u.protocol) || u.origin !== o;
    } catch {
      return true;
    }
  });
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-6 py-10 md:grid-cols-3">
      <div>
        <h2 className="text-base/7 font-semibold text-gray-900 dark:text-white">{title}</h2>
        <p className="mt-1 text-sm/6 text-gray-500 dark:text-gray-400">{description}</p>
      </div>
      <div className="rounded-lg bg-white p-4 shadow-sm sm:p-6 md:col-span-2 dark:bg-gray-800/50 dark:outline dark:-outline-offset-1 dark:outline-white/10">{children}</div>
    </div>
  );
}

export function AccessTiers() {
  const qc = useQueryClient();
  const { notify, fail } = useNotify();
  const q = useQuery({ queryKey: ['settings'], queryFn: adminApi.settings, retry: false });
  const [form, setForm] = useState<LibrarySettings | null>(null);
  const [origins, setOrigins] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!q.data) return;
    setForm({ ...q.data, device_limits: { ...DEFAULT_LIMITS, ...q.data.device_limits }, feed: { stable: q.data.feed?.stable ?? ['public'], beta: q.data.feed?.beta ?? ['public', 'internal'] } });
    setOrigins((q.data.cors_origins ?? []).join('\n'));
  }, [q.data]);

  if (q.isPending) return <Loading />;
  if (q.isError || !form)
    return (
      <div className="space-y-6">
        <PageHeading title={t('Access & tiers')} />
        <Alert tone="error" title={t('Couldn’t load the access settings')}>
          {q.error ? errorMessage(q.error) : t('Not found.')}
          <p className="mt-2">{t('This needs GET /admin/settings on the Library API.')}</p>
        </Alert>
      </div>
    );

  const toggleFeed = (channel: 'stable' | 'beta', v: Visibility, on: boolean) =>
    setForm({ ...form, feed: { ...form.feed, [channel]: on ? [...new Set([...form.feed[channel], v])] : form.feed[channel].filter((x) => x !== v) } });

  const save = async () => {
    const list = origins.split(/\s*\n\s*/).map((s) => s.trim()).filter(Boolean);
    const e: Record<string, string> = {};
    const bad = badOrigins(list);
    if (bad.length) e.cors_origins = t('Not an origin: {list}. Use scheme://host[:port] with no path.', { list: bad.join(', ') });
    for (const tier of TIERS) if (!(form.device_limits[tier] >= 1)) e[`device_limits.${tier}`] = t('At least 1');
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const saved = await adminApi.saveSettings({ ...form, cors_origins: list });
      if (saved) qc.setQueryData(['settings'], saved);
      notify(t('Access settings saved'));
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
      fail(t('Couldn’t save the access settings'), errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <PageHeading title={t('Access & tiers')} meta={t('Device limits, the publish gate, feed channels and allowed origins. Changes are audited.')} actions={<Button type="submit" loading={saving}>{t('Save changes')}</Button>} />
      <div className="divide-y divide-gray-900/10 dark:divide-white/10">
        <Section title={t('Device limits per plan')} description={t('How many computers each plan can sign FrameFlow in on. One more returns DEVICE_LIMIT until the user revokes a device.')}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {TIERS.map((tier) => (
              <TextField key={tier} type="number" min={1} max={1000} label={tierLabel(tier)} value={String(form.device_limits[tier] ?? '')} error={errors[`device_limits.${tier}`]} onChange={(e) => setForm({ ...form, device_limits: { ...form.device_limits, [tier]: Number(e.target.value) } })} />
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{t('Defaults: Free 2, Pro 3, Business 10, Enterprise 50.')}</p>
        </Section>

        <Section title={t('Publish gate')} description={t('Whether a version must finish processing (previews, deep checks) before it can be published.')}>
          <Toggle label={t('Require processing before publishing')} description={t('Same as LIBRARY_REQUIRE_PROCESSING=1 on the server.')} checked={form.require_processing} onChange={(e) => setForm({ ...form, require_processing: e.target.checked })} />
        </Section>

        <Section title={t('Feed channels')} description={t('Which visibilities each FrameFlow feed channel includes. Stable is what FrameFlow installs from by default; beta is for internal testers.')}>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
            {(['stable', 'beta'] as const).map((ch) => (
              <fieldset key={ch}>
                <legend className="text-sm/6 font-semibold text-gray-900 dark:text-white">{ch === 'stable' ? t('Stable catalog') : t('Beta catalog')}</legend>
                <div className="mt-3 space-y-3">
                  {FEED_VISIBILITIES.map((v) => (
                    <Checkbox key={v} label={label(v)} checked={form.feed[ch].includes(v)} onChange={(e) => toggleFeed(ch, v, e.target.checked)} />
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
          {!form.feed.stable.length && <Alert tone="warn" className="mt-4">{t('The stable feed would be empty.')}</Alert>}
        </Section>

        <Section title={t('Allowed origins (CORS)')} description={t('Web apps that may call the client API and read the feed from a browser. One origin per line; * allows any.')}>
          <TextArea label={t('Origins')} rows={5} value={origins} error={errors.cors_origins} placeholder={'https://frameflow.worksuitecloud.com\nhttps://library.frameflow.worksuitecloud.com'} onChange={(e) => setOrigins(e.target.value)} className="font-mono" />
        </Section>
      </div>
      <div className="flex justify-end border-t border-gray-900/10 pt-6 dark:border-white/10">
        <Button type="submit" loading={saving}>{t('Save changes')}</Button>
      </div>
    </form>
  );
}
