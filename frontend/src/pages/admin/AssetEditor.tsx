// A4 Asset Editor + A5 Version History. Tailwind Plus: page-examples/detail-screens (01 sidebar: main column + right rail),
// headings/page-headings (03 with breadcrumbs), navigation/tabs (01), forms/form-layouts (01 stacked), layout/cards,
// lists/tables (versions), lists/feeds (activity), overlays/modal-dialogs (confirm/reject/rollback), overlays/drawers (new version).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, previewUrl } from '@/services/admin';
import { PreviewGallery } from '@/components/Previews';
import { ApiError, api, errorMessage } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { PageHeading, Card, Tabs, TypeTile } from '@/components/ui/Layout';
import { Button, Loading } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Badge, StatusBadge, TierBadge } from '@/components/ui/Badge';
import { Checkbox, SelectField, TextArea, TextField, inputClass, Label } from '@/components/ui/Form';
import { Drawer, Modal } from '@/components/ui/Modal';
import { useNotify } from '@/components/ui/Notifications';
import { TableCard, TBody, EmptyRow, th, td, tdFirst, thFirst } from '@/components/ui/Table';
import { ChecksList } from '@/components/Checks';
import { LICENCE_TERMS, TIERS, VISIBILITIES, label, roleLabel, tierLabel, typeColor, typeLongName, typeName } from '@/core/schema';
import { msg, t, type MessageKey } from '@/i18n';
import { AudienceRulesEditor, normalizeRules } from '@/components/AudienceRules';
import { AssetAnalyticsCard } from '@/components/AssetAnalytics';
import { useAdminPreviews } from '@/hooks/useAdminPreviews';
import { classNames, formatBytes, formatDateTime, shortHash, splitList, timeAgo } from '@/core/format';
import type { Asset, AssetVersion, AudienceRule } from '@/types/api';

type TabKey = 'details' | 'versions' | 'licence' | 'dependencies' | 'activity';
type Act = 'submit-review' | 'approve' | 'reject' | 'publish' | 'unpublish' | 'deprecate' | 'archive';

interface Draft {
  title: string;
  slug: string;
  category_id: string;
  description: string;
  tags: string;
  keywords: string;
  min_app_version: string;
  author: string;
  featured: boolean;
  licence_tier: string;
  licence_terms: string;
  licence_text: string;
  attribution_required: boolean;
  attribution_text: string;
  visibility: string;
  unpublish_at: string;
  audience_rules?: AudienceRule[];
}

const toDraft = (a: Asset): Draft => ({
  title: a.title,
  slug: a.slug,
  category_id: a.category_id ?? '',
  description: a.description ?? '',
  tags: a.tags.join(', '),
  keywords: a.keywords.join(', '),
  min_app_version: a.min_app_version,
  author: a.author ?? '',
  featured: !!a.featured,
  licence_tier: a.licence_tier,
  licence_terms: a.licence_terms,
  licence_text: a.licence_text ?? '',
  attribution_required: !!a.attribution_required,
  attribution_text: a.attribution_text ?? '',
  visibility: a.visibility,
  unpublish_at: a.unpublish_at ? toLocalInput(a.unpublish_at) : '',
  audience_rules: Array.isArray(a.audience_rules) ? a.audience_rules : [],
});

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The PATCH body for what changed in the draft. */
export function patchFrom(a: Asset, d: Draft): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  const base = toDraft(a);
  for (const k of Object.keys(d) as (keyof Draft)[]) if (k !== 'audience_rules' && d[k] !== base[k]) p[k] = d[k];
  const rules = normalizeRules(d.audience_rules ?? []);
  if (JSON.stringify(rules) !== JSON.stringify(normalizeRules(base.audience_rules ?? []))) p.audience_rules = rules;
  if ('tags' in p) p.tags = splitList(d.tags);
  if ('keywords' in p) p.keywords = splitList(d.keywords);
  if ('category_id' in p) p.category_id = d.category_id || null;
  if ('unpublish_at' in p) p.unpublish_at = d.unpublish_at ? new Date(d.unpublish_at).toISOString() : null;
  return p;
}

/** Which publishing actions the role may take on this asset (same rules as the old admin). */
export function availableActions(a: Asset, can: (p: Parameters<ReturnType<typeof useAuth>['can']>[0]) => boolean, editable: boolean): Act[] {
  const out: Act[] = [];
  if (editable && ['draft', 'failed'].includes(a.status)) out.push('submit-review');
  if (can('asset.review') && a.status === 'ready_for_review') out.push('approve', 'reject');
  if (can('asset.publish') && (['approved', 'deprecated'].includes(a.status) || a.pending_version || (can('asset.publish.direct') && ['draft', 'ready_for_review'].includes(a.status)))) out.push('publish');
  if (can('asset.publish') && a.status === 'published') out.push('unpublish', 'deprecate');
  if (can('asset.archive') && a.status !== 'archived') out.push('archive');
  return out;
}

const ACT_LABEL: Record<Act, MessageKey> = { 'submit-review': msg('Submit for review'), approve: msg('Approve'), reject: msg('Reject…'), publish: msg('Publish'), unpublish: msg('Unpublish'), deprecate: msg('Deprecate'), archive: msg('Archive') };
const ACT_CONFIRM: Record<Act, MessageKey> = { 'submit-review': msg('Submit for review'), approve: msg('Approve'), reject: msg('Reject'), publish: msg('Publish'), unpublish: msg('Unpublish'), deprecate: msg('Deprecate'), archive: msg('Archive') };

function metaDiff(prev: Record<string, unknown> | undefined, next: Record<string, unknown>): string[] {
  if (!prev) return [];
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  return [...keys].filter((k) => JSON.stringify(prev[k]) !== JSON.stringify(next[k])).map((k) => `${k}: ${JSON.stringify(prev[k]) ?? '—'} → ${JSON.stringify(next[k]) ?? '—'}`);
}

export function AssetEditor() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const { me, can } = useAuth();
  const { notify, fail } = useNotify();
  const q = useQuery({
    queryKey: ['asset', id],
    queryFn: () => adminApi.getAsset(id),
    // Follow the worker while the current version is queued or running.
    refetchInterval: (qq) => (qq.state.data?.versions.some((v) => v.processing && ['queued', 'running'].includes(v.processing.status)) ? 3000 : false),
  });
  const a = q.data;
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => adminApi.categories() });
  const activity = useQuery({ queryKey: ['audit', id], queryFn: () => adminApi.auditLog(id), enabled: can('analytics.view') });
  const preview = useQuery({
    queryKey: ['preview', id, a?.published_version],
    queryFn: () => api.get<{ thumbnail_url: string | null }>(`/assets/${encodeURIComponent(id)}/preview`),
    enabled: !!a && a.status === 'published' && ['public', 'unlisted'].includes(a.visibility),
    retry: false,
  });

  const [tab, setTab] = useState<TabKey>('details');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<{ act: Act } | { rollback: string } | { publishVersion: string } | null>(null);
  const [reason, setReason] = useState('');
  const [working, setWorking] = useState(false);
  const [schedule, setSchedule] = useState('');
  const [versionOpen, setVersionOpen] = useState(false);
  const [blockers, setBlockers] = useState<string[]>([]);

  useEffect(() => {
    if (a) setDraft(toDraft(a));
  }, [a]);

  const currentV: AssetVersion | undefined = a ? (a.versions.find((v) => v.version === (a.pending_version ?? a.current_version)) ?? a.versions.at(-1)) : undefined;
  const isLive = !!a && a.status === 'published' && ['public', 'unlisted'].includes(a.visibility);
  const shownV = a && isLive ? (a.versions.find((v) => v.version === a.published_version) ?? currentV) : currentV;
  // Drafts and unlisted versions: the authenticated admin preview route (object URLs); live assets use the public /previews.
  const adminPreviews = useAdminPreviews(a?.id ?? id, shownV, !isLive && Object.keys(shownV?.previews ?? {}).length > 0);

  const editable = !!a && (can('asset.edit.all') || (can('asset.edit.own') && a.created_by === me?.id));
  const tierEditable = can('access.manage') || me?.role === 'content_editor';
  const cats = useMemo(() => (categories.data ?? []).filter((c) => c.type === a?.type), [categories.data, a?.type]);

  if (q.isPending) return <Loading />;
  if (q.isError || !a || !draft) return <Alert tone="error" title={t('Couldn’t load this asset')}>{q.error ? errorMessage(q.error) : t('Not found.')}</Alert>;

  const current = currentV;
  const actions = availableActions(a, can, editable);
  const live = isLive;
  const shownVersion = shownV;
  const previewMap: Record<string, string> = live ? Object.fromEntries(Object.entries(shownVersion?.previews ?? {}).map(([k, p]) => [k, previewUrl(a.id, shownVersion!.version, k, p.ext)])) : adminPreviews.urls;
  const thumbUrl = preview.data?.thumbnail_url ?? (!live ? adminPreviews.urls.thumbnail : undefined);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...draft, [k]: v });
  const refresh = (next?: Asset) => {
    if (next) qc.setQueryData(['asset', id], next);
    void qc.invalidateQueries({ queryKey: ['asset', id] });
    void qc.invalidateQueries({ queryKey: ['assets'] });
    void qc.invalidateQueries({ queryKey: ['overview'] });
    void qc.invalidateQueries({ queryKey: ['audit'] });
  };

  async function save() {
    const patch = patchFrom(a!, draft!);
    if (!Object.keys(patch).length) return notify(t('Nothing to save'));
    setSaving(true);
    setFieldErrors({});
    try {
      refresh(await adminApi.updateAsset(a!.id, patch));
      notify(t('Saved'));
    } catch (e) {
      if (e instanceof ApiError) setFieldErrors(e.fieldErrors);
      fail(t('Couldn’t save'), errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function run(fn: () => Promise<Asset>, done: string) {
    setWorking(true);
    setBlockers([]);
    try {
      refresh(await fn());
      notify(done);
      setConfirm(null);
      setReason('');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'PUBLISH_BLOCKED') setBlockers(e.details.map((d) => String(d.message ?? d.rule)));
      fail(t('That didn’t work'), errorMessage(e));
      setConfirm(null);
    } finally {
      setWorking(false);
    }
  }

  const doAct = (act: Act) => {
    const fns: Record<Act, () => Promise<Asset>> = {
      'submit-review': () => adminApi.submitReview(a.id),
      approve: () => adminApi.approve(a.id),
      reject: () => adminApi.reject(a.id, reason),
      publish: () => adminApi.publish(a.id),
      unpublish: () => adminApi.unpublish(a.id, reason || undefined),
      deprecate: () => adminApi.deprecate(a.id, reason || undefined),
      archive: () => adminApi.archive(a.id),
    };
    const done: Record<Act, string> = { 'submit-review': t('Submitted for review'), approve: t('Approved'), reject: t('Rejected'), publish: t('Published to the FrameFlow feed'), unpublish: t('Unpublished'), deprecate: t('Deprecated'), archive: t('Archived') };
    void run(fns[act], done[act]);
  };

  async function replaceThumbnail(file: File | undefined) {
    if (!file) return;
    setWorking(true);
    try {
      const up = await adminApi.upload(file);
      refresh(await adminApi.updateAsset(a!.id, { thumbnail_upload_id: up.id }));
      notify(t('Thumbnail replaced'), t('It ships with the next publish.'));
    } catch (e) {
      fail(t('Couldn’t replace the thumbnail'), errorMessage(e));
    } finally {
      setWorking(false);
    }
  }

  const tabs: { key: TabKey; name: string; count?: number }[] = [
    { key: 'details', name: t('Details') },
    { key: 'versions', name: t('Files & Versions'), count: a.versions.length },
    { key: 'licence', name: t('Licence & Access') },
    { key: 'dependencies', name: t('Dependencies'), count: a.dependencies?.length ?? 0 },
    ...(can('analytics.view') ? [{ key: 'activity' as const, name: t('Activity') }] : []),
  ];

  const saveBar = editable && (
    <div className="flex items-center gap-3 border-t border-gray-900/10 pt-6 dark:border-white/10">
      <Button onClick={() => void save()} loading={saving}>{t('Save changes')}</Button>
      <Button variant="secondary" onClick={() => { setDraft(toDraft(a)); setFieldErrors({}); }}>{t('Discard')}</Button>
    </div>
  );

  const confirmTitle = !confirm ? '' : 'act' in confirm ? t('{action} “{title}”?', { action: t(ACT_CONFIRM[confirm.act]), title: a.title }) : 'rollback' in confirm ? t('Roll back to {version}?', { version: confirm.rollback }) : t('Publish version {version}?', { version: confirm.publishVersion });
  const confirmText: ReactNode = !confirm
    ? null
    : 'rollback' in confirm
      ? t('{version} becomes the live version in the FrameFlow feed again.', { version: confirm.rollback })
      : 'publishVersion' in confirm
        ? t('This version is packaged, signed and added to the FrameFlow feed.')
        : confirm.act === 'publish'
          ? a.visibility === 'internal'
            ? t('Version {version} is packaged, signed and added to the beta FrameFlow feed.', { version: a.pending_version ?? a.current_version ?? '' })
            : t('Version {version} is packaged, signed and added to the stable FrameFlow feed.', { version: a.pending_version ?? a.current_version ?? '' })
          : confirm.act === 'archive'
            ? t('Archived assets leave the feed and the library. They can be restored to draft later.')
            : confirm.act === 'unpublish'
              ? t('The asset leaves the FrameFlow feed and returns to draft.')
              : confirm.act === 'deprecate'
                ? t('Installed copies keep working; FrameFlow stops offering it to new users.')
                : confirm.act === 'reject'
                  ? t('The asset goes back to draft with your reason.')
                  : null;

  return (
    <div className="space-y-6">
      <PageHeading
        breadcrumbs={[{ name: t('Asset Library'), to: '/admin/assets' }, { name: typeName(a.type), to: `/admin/assets?type=${a.type}` }, { name: a.title }]}
        title={<span className="flex flex-wrap items-center gap-3"><TypeTile color={typeColor(a.type)} label={typeName(a.type)} className="size-9" />{a.title}<StatusBadge status={a.status} /></span>}
        meta={
          <>
            <span className="font-mono">v{a.current_version ?? '—'}</span>
            {a.published_version && <span>{t('live {version}', { version: a.published_version })}</span>}
            {a.pending_version && <Badge tone="yellow">{t('pending {version}', { version: a.pending_version })}</Badge>}
            <span>{typeLongName(a.type)}</span>
            <span>{t('updated {when}', { when: timeAgo(a.updated_at) })}</span>
          </>
        }
      />
      {a.review && !a.review.approved && a.status === 'draft' && <Alert tone="error" title={t('Rejected in review')}>{a.review.reason}</Alert>}
      {blockers.length > 0 && <Alert tone="error" title={t('Publishing is blocked')} items={blockers} />}
      {!editable && <Alert tone="info">{t('You can view this asset but not edit it with your role.')}</Alert>}

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Tabs label={t('Editor sections')} tabs={tabs} current={tab} onChange={setTab} />

          {tab === 'details' && (
            <fieldset disabled={!editable} className="space-y-6">
              <legend className="sr-only">{t('Details')}</legend>
              <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-6">
                <TextField className="sm:col-span-6" label={t('Title')} value={draft.title} error={fieldErrors.title} onChange={(e) => set('title', e.target.value)} />
                <TextField className="sm:col-span-3" label={t('Slug')} value={draft.slug} readOnly={!!a.published_at} hint={a.published_at ? t('Immutable after first publish') : undefined} error={fieldErrors.slug} onChange={(e) => set('slug', e.target.value)} />
                <SelectField className="sm:col-span-3" label={t('Category')} value={draft.category_id} error={fieldErrors.category_id} onChange={(e) => set('category_id', e.target.value)} options={[['', t('None')], ...cats.map((c): [string, string] => [c.id, c.name])]} />
                <TextArea className="sm:col-span-6" label={t('Description')} value={draft.description} error={fieldErrors.description} onChange={(e) => set('description', e.target.value)} />
                <TextField className="sm:col-span-6" label={t('Tags')} hint={t('Comma separated, up to 20')} value={draft.tags} error={fieldErrors.tags} onChange={(e) => set('tags', e.target.value)} />
                <TextField className="sm:col-span-6" label={t('Search keywords')} hint={t('Incl. Sinhala / Tamil terms')} value={draft.keywords} error={fieldErrors.keywords} onChange={(e) => set('keywords', e.target.value)} />
                <TextField className="sm:col-span-3" label={t('Min FrameFlow version')} value={draft.min_app_version} error={fieldErrors.min_app_version} onChange={(e) => set('min_app_version', e.target.value)} />
                <TextField className="sm:col-span-3" label={t('Author / source')} value={draft.author} onChange={(e) => set('author', e.target.value)} />
                <Checkbox className="sm:col-span-6" label={t('Featured')} description={t('Shown in the Featured rail in FrameFlow and on the public site.')} checked={draft.featured} onChange={(e) => set('featured', e.target.checked)} />
                <div className="sm:col-span-6">
                  <p className="text-sm/6 font-medium text-gray-900 dark:text-white">{t('Detected metadata')}</p>
                  <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-gray-50 p-3 text-xs text-gray-800 outline-1 outline-gray-200 dark:bg-white/5 dark:text-gray-200 dark:outline-white/10">{JSON.stringify(a.meta, null, 2)}</pre>
                </div>
              </div>
              {saveBar}
            </fieldset>
          )}

          {tab === 'licence' && (
            <fieldset disabled={!editable} className="space-y-6">
              <legend className="sr-only">{t('Licence and access')}</legend>
              <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-6">
                <SelectField className="sm:col-span-3" label={t('Licence tier')} value={draft.licence_tier} disabled={!tierEditable} hint={tierEditable ? t('Which FrameFlow plans can download it') : t('Needs the access.manage permission')} error={fieldErrors.licence_tier} onChange={(e) => set('licence_tier', e.target.value)} options={TIERS.map((x) => [x, tierLabel(x)])} />
                <SelectField className="sm:col-span-3" label={t('Licence terms')} value={draft.licence_terms} onChange={(e) => set('licence_terms', e.target.value)} options={LICENCE_TERMS.map((x) => [x, label(x)])} />
                <TextArea className="sm:col-span-6" label={t('Licence text')} value={draft.licence_text} onChange={(e) => set('licence_text', e.target.value)} />
                <Checkbox className="sm:col-span-6" label={t('Attribution required')} checked={draft.attribution_required} onChange={(e) => set('attribution_required', e.target.checked)} />
                <TextField className="sm:col-span-6" label={t('Attribution text')} value={draft.attribution_text} error={fieldErrors.attribution_text} onChange={(e) => set('attribution_text', e.target.value)} />
                <SelectField className="sm:col-span-3" label={t('Visibility')} value={draft.visibility} hint={t('public → stable feed · internal → beta feed')} error={fieldErrors.visibility} onChange={(e) => set('visibility', e.target.value)} options={VISIBILITIES.map((x) => [x, label(x)])} />
                <TextField className="sm:col-span-3" type="datetime-local" label={t('Scheduled unpublish')} value={draft.unpublish_at} onChange={(e) => set('unpublish_at', e.target.value)} hint={t('Leave empty for none')} />
                <div className="sm:col-span-6">
                  <AudienceRulesEditor rules={draft.audience_rules ?? []} onChange={(r) => set('audience_rules', r)} disabled={!editable || !can('access.manage')} errors={fieldErrors.audience_rules} />
                  {!can('access.manage') && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{t('Needs the access.manage permission')}</p>}
                </div>
              </div>
              {saveBar}
            </fieldset>
          )}

          {tab === 'versions' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('Versions never overwrite. Publish or roll back any packaged version.')}</p>
                {editable && <Button variant="soft" onClick={() => setVersionOpen(true)}>{t('Upload new version')}</Button>}
              </div>
              <TableCard caption={t('Versions')}>
                <thead>
                  <tr>
                    <th scope="col" className={thFirst}>{t('Version')}</th>
                    <th scope="col" className={th}>{t('Status')}</th>
                    <th scope="col" className={classNames(th, 'hidden md:table-cell')}>{t('Changelog')}</th>
                    <th scope="col" className={classNames(th, 'hidden sm:table-cell')}>{t('Package')}</th>
                    <th scope="col" className={classNames(th, 'hidden lg:table-cell')}>{t('Created')}</th>
                    <th scope="col" className={th}><span className="sr-only">{t('Actions')}</span></th>
                  </tr>
                </thead>
                <TBody>
                  {[...a.versions].reverse().map((v) => {
                    const idx = a.versions.indexOf(v);
                    const diff = metaDiff(a.versions[idx - 1]?.meta, v.meta);
                    return (
                      <tr key={v.id}>
                        <td className={tdFirst}>
                          <span className="font-mono">{v.version}</span>
                          {v.is_breaking && <Badge tone="red" className="ml-2">{t('breaking')}</Badge>}
                          {v.version === a.published_version && <Badge tone="green" className="ml-2">{t('live')}</Badge>}
                          {diff.length > 0 && (
                            <details className="mt-1 text-xs font-normal text-gray-500 dark:text-gray-400">
                              <summary className="cursor-pointer">{t('Metadata changes ({n})', { n: diff.length })}</summary>
                              <ul className="mt-1 space-y-0.5 font-mono">{diff.map((d) => <li key={d} className="break-all">{d}</li>)}</ul>
                            </details>
                          )}
                        </td>
                        <td className={td}><StatusBadge status={v.status} /></td>
                        <td className={classNames(td, 'hidden max-w-xs truncate whitespace-normal md:table-cell')}>{v.changelog || '—'}</td>
                        <td className={classNames(td, 'hidden sm:table-cell')}>{v.package ? <span title={v.package.sha256}>{formatBytes(v.package.size)} · <span className="font-mono text-xs">{shortHash(v.package.sha256)}</span></span> : '—'}</td>
                        <td className={classNames(td, 'hidden lg:table-cell')}><time dateTime={v.created_at}>{formatDateTime(v.created_at)}</time></td>
                        <td className={classNames(td, 'text-right')}>
                          <div className="flex justify-end gap-3">
                            {can('asset.publish') && v.status === 'ready' && v.version !== a.published_version && (
                              <Button variant="link" onClick={() => setConfirm({ publishVersion: v.version })}>{t('Publish')}<span className="sr-only"> {v.version}</span></Button>
                            )}
                            {can('version.rollback') && v.package && v.version !== a.published_version && (
                              <Button variant="link" onClick={() => setConfirm({ rollback: v.version })}>{t('Roll back')}<span className="sr-only"> {v.version}</span></Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!a.versions.length && <EmptyRow colSpan={6}>{t('No versions.')}</EmptyRow>}
                </TBody>
              </TableCard>

              <Card title={`${t('Generated previews')}${shownVersion ? ` · v${shownVersion.version}` : ''}`} actions={!live && Object.keys(shownVersion?.previews ?? {}).length > 0 ? <Badge tone="yellow">{t('Not live: admin preview')}</Badge> : undefined}>
                {!live && adminPreviews.status === 'loading' ? (
                  <Loading label={t('Loading previews…')} />
                ) : !live && adminPreviews.status === 'error' ? (
                  <Alert tone="error" title={t('Couldn’t load the previews')}>
                    {adminPreviews.error}
                    <p className="mt-1">{t('Generated: {files}.', { files: Object.entries(shownVersion?.previews ?? {}).map(([k, p]) => `${k}.${p.ext} (${formatBytes(p.size)})`).join(', ') })}</p>
                  </Alert>
                ) : Object.keys(previewMap).length ? (
                  <PreviewGallery previews={previewMap} exts={live ? undefined : adminPreviews.exts} title={a.title} tileClassName="rounded-md outline-1 outline-black/5 dark:outline-white/10" captionClassName="mt-1 text-xs text-gray-500 dark:text-gray-400" />
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">{shownVersion?.processing && ['queued', 'running'].includes(shownVersion.processing.status) ? t('A worker is generating previews…') : t('No generated previews for this version.')}</p>
                )}
              </Card>

              <Card title={t('Files')}>
                <ul role="list" className="divide-y divide-gray-100 text-sm dark:divide-white/5">
                  {(current?.files ?? []).map((f) => (
                    <li key={f.sha256 + f.role} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="min-w-0 truncate"><Badge tone="gray" className="mr-2">{f.role}</Badge>{f.filename}</span>
                      <span className="text-gray-500 dark:text-gray-400">{formatBytes(f.size)} · <span className="font-mono text-xs" title={f.sha256}>{shortHash(f.sha256)}</span></span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-gray-100 pt-4 dark:border-white/5">
                  {thumbUrl ? (
                    <img src={thumbUrl} alt={t('Thumbnail of {title}', { title: a.title })} className="h-20 w-36 rounded-md object-cover outline-1 outline-black/5" />
                  ) : (
                    <TypeTile color={typeColor(a.type)} label={typeName(a.type)} className="h-20 w-36" />
                  )}
                  <div className="text-sm">
                    <p className="font-medium text-gray-900 dark:text-white">{t('Thumbnail')}</p>
                    <p className="text-gray-500 dark:text-gray-400">{a.thumbnail_file ? a.thumbnail_file.filename : t('Missing')}</p>
                    {editable && (
                      <div className="mt-2">
                        <Label htmlFor="thumb">{t('Replace thumbnail (PNG or WebP, 640×360)')}</Label>
                        <input id="thumb" type="file" accept="image/png,image/webp" disabled={working} onChange={(e) => void replaceThumbnail(e.target.files?.[0])} className="mt-1 block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-indigo-600 dark:text-gray-300 dark:file:bg-indigo-500/20 dark:file:text-indigo-300" />
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          )}

          {tab === 'dependencies' && <Dependencies asset={a} editable={editable} onSaved={refresh} />}

          {tab === 'activity' && <AssetAnalyticsCard assetId={a.id} />}
          {tab === 'activity' && (
            <Card title={t('Activity')}>
              {activity.isPending ? <Loading /> : activity.isError ? <p className="text-sm text-red-600">{errorMessage(activity.error)}</p> : (
                <ul role="list" className="space-y-3 text-sm">
                  {activity.data.map((e, i) => (
                    <li key={e.id ?? i} className="flex flex-wrap justify-between gap-2">
                      <span><span className="font-mono text-xs text-gray-900 dark:text-white">{e.action}</span> <span className="text-gray-500 dark:text-gray-400">{t('by {who}', { who: e.actor_role ? roleLabel(e.actor_role) : t('system') })}</span></span>
                      <time dateTime={e.at} className="text-gray-500 dark:text-gray-400" title={formatDateTime(e.at)}>{timeAgo(e.at)}</time>
                    </li>
                  ))}
                  {!activity.data.length && <li className="text-gray-500">{t('No activity.')}</li>}
                </ul>
              )}
            </Card>
          )}
        </div>

        <aside className="space-y-6" aria-label={t('Publishing')}>
          <Card title={t('Publishing')}>
            <dl className="mb-4 grid grid-cols-2 gap-2 text-sm">
              <dt className="text-gray-500 dark:text-gray-400">{t('Status')}</dt><dd><StatusBadge status={a.status} /></dd>
              <dt className="text-gray-500 dark:text-gray-400">{t('Tier')}</dt><dd><TierBadge tier={a.licence_tier} /></dd>
              <dt className="text-gray-500 dark:text-gray-400">{t('Visibility')}</dt><dd className="text-gray-900 dark:text-white">{label(a.visibility)}</dd>
              <dt className="text-gray-500 dark:text-gray-400">{t('Published')}</dt><dd className="text-gray-900 dark:text-white">{a.published_at ? timeAgo(a.published_at) : '—'}</dd>
            </dl>
            <div className="flex flex-col gap-2">
              {actions.map((act) => (
                <Button
                  key={act}
                  variant={act === 'publish' ? 'primary' : act === 'approve' ? 'success' : act === 'archive' || act === 'reject' ? 'danger' : 'secondary'}
                  disabled={working}
                  onClick={() => (act === 'submit-review' || act === 'approve' ? doAct(act) : setConfirm({ act }))}
                >
                  {act === 'publish' && a.pending_version ? t('Publish {version}', { version: a.pending_version }) : t(ACT_LABEL[act])}
                </Button>
              ))}
              {!actions.length && <p className="text-sm text-gray-500 dark:text-gray-400">{t('No publishing actions for your role in this state.')}</p>}
            </div>
            {can('asset.publish') && a.status !== 'archived' && (
              <form className="mt-5 border-t border-gray-100 pt-4 dark:border-white/5" onSubmit={(e) => { e.preventDefault(); if (schedule) void run(() => adminApi.publish(a.id, { publish_at: new Date(schedule).toISOString() }), t('Publish scheduled')); }}>
                <Label htmlFor="sched">{t('Schedule publish')}</Label>
                <input id="sched" type="datetime-local" value={schedule} onChange={(e) => setSchedule(e.target.value)} className={classNames(inputClass, 'mt-2')} />
                <Button type="submit" variant="soft" size="sm" className="mt-2" disabled={!schedule || working}>{t('Schedule')}</Button>
                {a.publish_at && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{t('Scheduled for {when}', { when: formatDateTime(a.publish_at) })}</p>}
              </form>
            )}
          </Card>
          <ProcessingCard asset={a} version={current} editable={editable} onQueued={() => refresh()} />
          <Card title={`${t('Checks')} · v${current?.version ?? '—'}`}>
            <ChecksList
              checks={current?.checks ?? []}
              extra={[
                { label: t('Thumbnail'), ok: !!a.thumbnail_file, text: a.thumbnail_file ? t('Present') : t('Missing') },
                { label: t('Reviewer approval'), ok: ['approved', 'published'].includes(a.status), text: ['approved', 'published'].includes(a.status) ? t('Done') : t('Pending') },
              ]}
            />
          </Card>
          <Card title={t('Stats')}>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {([['downloads', t('Downloads')], ['installs', t('Installs')], ['applies', t('Applies')], ['favorites', t('Favorites')]] as const).map(([k, name]) => (
                <div key={k}><dt className="text-gray-500 dark:text-gray-400">{name}</dt><dd className="text-lg font-semibold text-gray-900 tabular-nums dark:text-white">{a.stats[k]}</dd></div>
              ))}
            </dl>
            {a.status === 'published' && <p className="mt-3 text-xs"><Link to={`/library/${a.slug}`} className="font-semibold text-indigo-600 dark:text-indigo-400">{t('View on the public site')} →</Link></p>}
          </Card>
        </aside>
      </div>

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirmTitle}
        description={confirmText}
        tone={confirm && 'act' in confirm && ['archive', 'unpublish', 'reject', 'deprecate'].includes(confirm.act) ? 'danger' : 'primary'}
        confirmLabel={!confirm ? '' : 'act' in confirm ? t(ACT_CONFIRM[confirm.act]) : 'rollback' in confirm ? t('Roll back') : t('Publish')}
        busy={working}
        confirmDisabled={!!confirm && 'act' in confirm && confirm.act === 'reject' && !reason.trim()}
        onConfirm={() => {
          if (!confirm) return;
          if ('act' in confirm) doAct(confirm.act);
          else if ('rollback' in confirm) void run(() => adminApi.rollback(a.id, confirm.rollback), t('Rolled back to {version}', { version: confirm.rollback }));
          else void run(() => adminApi.publishVersion(a.id, confirm.publishVersion), t('Published {version}', { version: confirm.publishVersion }));
        }}
      >
        {confirm && 'act' in confirm && ['reject', 'unpublish', 'deprecate'].includes(confirm.act) && (
          <TextArea label={confirm.act === 'reject' ? t('Reason (sent to the editor)') : t('Reason (optional)')} value={reason} onChange={(e) => setReason(e.target.value)} required={confirm.act === 'reject'} autoFocus />
        )}
      </Modal>

      <NewVersionDrawer open={versionOpen} onClose={() => setVersionOpen(false)} asset={a} onDone={(next) => { refresh(next); setVersionOpen(false); notify(t('New version uploaded'), `v${next.current_version}`); }} />
    </div>
  );
}

function NewVersionDrawer({ open, onClose, asset, onDone }: { open: boolean; onClose: () => void; asset: Asset; onDone: (a: Asset) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [changelog, setChangelog] = useState('');
  const [breaking, setBreaking] = useState(false);
  const [version, setVersion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!file) return setError(t('Choose a file.'));
    setBusy(true);
    setError(null);
    try {
      const up = await adminApi.upload(file, asset.type);
      onDone(await adminApi.addVersion(asset.id, { upload_id: up.id, changelog, is_breaking: breaking, ...(version.trim() ? { version: version.trim() } : {}) }));
      setFile(null);
      setChangelog('');
      setBreaking(false);
      setVersion('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open={open} onClose={onClose} title={t('Upload new version')} description={t('Checked as {type}. Live assets keep the current version until the new one is published.', { type: typeName(asset.type) })}
      footer={<><Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button><Button onClick={() => void submit()} loading={busy}>{t('Upload version')}</Button></>}>
      <div className="space-y-6">
        <div>
          <Label htmlFor="nv-file">{t('File')}</Label>
          <input id="nv-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-2 block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-indigo-600 dark:text-gray-300" />
        </div>
        <TextField label={t('Version')} placeholder={t('Auto (next minor, or major if breaking)')} value={version} onChange={(e) => setVersion(e.target.value)} />
        <TextArea label={t('Changelog')} value={changelog} onChange={(e) => setChangelog(e.target.value)} />
        <Checkbox label={t('Breaking change')} description={t('FrameFlow warns users before updating.')} checked={breaking} onChange={(e) => setBreaking(e.target.checked)} />
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Drawer>
  );
}

function Dependencies({ asset, editable, onSaved }: { asset: Asset; editable: boolean; onSaved: (a: Asset) => void }) {
  const { notify, fail } = useNotify();
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const deps = asset.dependencies ?? [];
  const save = async (next: Asset['dependencies']) => {
    setBusy(true);
    try {
      onSaved(await adminApi.updateAsset(asset.id, { dependencies: next }));
      notify(t('Dependencies saved'));
      setRef('');
    } catch (e) {
      fail(t('Couldn’t save dependencies'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const add = async () => {
    try {
      const target = await adminApi.getAsset(ref.trim());
      if (target.id === asset.id || deps.some((d) => d.asset_id === target.id)) return fail(t('Already listed'));
      await save([...deps, { asset_id: target.id }]);
    } catch (e) {
      fail(t('No such asset'), errorMessage(e));
    }
  };
  return (
    <Card title={t('Dependencies')}>
      <p className="text-sm text-gray-500 dark:text-gray-400">{t('Assets that must be published for this one to publish (e.g. a font a text template uses).')}</p>
      <ul role="list" className="mt-4 divide-y divide-gray-100 text-sm dark:divide-white/5">
        {deps.map((d) => (
          <li key={d.asset_id} className="flex items-center justify-between gap-3 py-2">
            <Link to={`/admin/assets/${d.asset_id}`} className="font-mono text-xs text-indigo-600 dark:text-indigo-400">{d.asset_id}</Link>
            {editable && <Button variant="link" disabled={busy} onClick={() => void save(deps.filter((x) => x.asset_id !== d.asset_id))}>{t('Remove')}</Button>}
          </li>
        ))}
        {!deps.length && <li className="py-2 text-gray-500 dark:text-gray-400">{t('No dependencies.')}</li>}
      </ul>
      {editable && (
        <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (ref.trim()) void add(); }}>
          <TextField className="min-w-60 flex-1" label={t('Add by asset id or slug')} value={ref} onChange={(e) => setRef(e.target.value)} />
          <Button type="submit" variant="secondary" loading={busy}>{t('Add')}</Button>
        </form>
      )}
    </Card>
  );
}

function ProcessingCard({ asset, version, editable, onQueued }: { asset: Asset; version: AssetVersion | undefined; editable: boolean; onQueued: () => void }) {
  const { notify, fail } = useNotify();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const p = version?.processing;
  const reprocess = async () => {
    setBusy(true);
    try {
      await adminApi.reprocess(asset.id, version?.version);
      notify(t('Reprocessing queued'), `v${version?.version}`);
      void qc.invalidateQueries({ queryKey: ['jobs'] });
      onQueued();
    } catch (e) {
      fail(t('Couldn’t reprocess'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title={t('Processing')} actions={<Link to="/admin/processing" className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">{t('Jobs')} →</Link>}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-gray-500 dark:text-gray-400">v{version?.version ?? '—'}</span>
        {p ? <StatusBadge status={p.status} /> : <Badge tone="gray">{t('not queued')}</Badge>}
      </div>
      {p?.error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{p.error}</p>}
      {p?.finished_at && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{t('Finished {when}', { when: timeAgo(p.finished_at) })}</p>}
      {p && ['queued', 'running'].includes(p.status) && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400" role="status">{t('Waiting for a worker; this page refreshes on its own.')}</p>}
      {editable && version && !(p && ['queued', 'running'].includes(p.status)) && (
        <Button className="mt-3" size="sm" variant={p?.status === 'failed' ? 'soft' : 'secondary'} loading={busy} onClick={() => void reprocess()}>
          {p?.status === 'failed' ? t('Retry processing') : t('Reprocess')}
        </Button>
      )}
    </Card>
  );
}
