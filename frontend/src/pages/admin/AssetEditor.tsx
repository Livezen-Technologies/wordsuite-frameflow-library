// A4 Asset Editor + A5 Version History. Tailwind Plus: page-examples/detail-screens (01 sidebar: main column + right rail),
// headings/page-headings (03 with breadcrumbs), navigation/tabs (01), forms/form-layouts (01 stacked), layout/cards,
// lists/tables (versions), lists/feeds (activity), overlays/modal-dialogs (confirm/reject/rollback), overlays/drawers (new version).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/services/admin';
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
import { LICENCE_TERMS, TIERS, VISIBILITIES, humanize, typeColor, typeName, ASSET_TYPES } from '@/core/schema';
import { classNames, formatBytes, formatDateTime, shortHash, splitList, timeAgo } from '@/core/format';
import type { Asset, AssetVersion } from '@/types/api';

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
  for (const k of Object.keys(d) as (keyof Draft)[]) if (d[k] !== base[k]) p[k] = d[k];
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

const ACT_LABEL: Record<Act, string> = { 'submit-review': 'Submit for review', approve: 'Approve', reject: 'Reject…', publish: 'Publish', unpublish: 'Unpublish', deprecate: 'Deprecate', archive: 'Archive' };

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
  const q = useQuery({ queryKey: ['asset', id], queryFn: () => adminApi.getAsset(id) });
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

  const editable = !!a && (can('asset.edit.all') || (can('asset.edit.own') && a.created_by === me?.id));
  const tierEditable = can('access.manage') || me?.role === 'content_editor';
  const cats = useMemo(() => (categories.data ?? []).filter((c) => c.type === a?.type), [categories.data, a?.type]);

  if (q.isPending) return <Loading />;
  if (q.isError || !a || !draft) return <Alert tone="error" title="Couldn’t load this asset">{q.error ? errorMessage(q.error) : 'Not found.'}</Alert>;

  const current: AssetVersion | undefined = a.versions.find((v) => v.version === (a.pending_version ?? a.current_version)) ?? a.versions.at(-1);
  const actions = availableActions(a, can, editable);
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
    if (!Object.keys(patch).length) return notify('Nothing to save');
    setSaving(true);
    setFieldErrors({});
    try {
      refresh(await adminApi.updateAsset(a!.id, patch));
      notify('Saved');
    } catch (e) {
      if (e instanceof ApiError) setFieldErrors(e.fieldErrors);
      fail('Couldn’t save', errorMessage(e));
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
      fail('That didn’t work', errorMessage(e));
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
    const done: Record<Act, string> = { 'submit-review': 'Submitted for review', approve: 'Approved', reject: 'Rejected', publish: 'Published to the FrameFlow feed', unpublish: 'Unpublished', deprecate: 'Deprecated', archive: 'Archived' };
    void run(fns[act], done[act]);
  };

  async function replaceThumbnail(file: File | undefined) {
    if (!file) return;
    setWorking(true);
    try {
      const up = await adminApi.upload(file);
      refresh(await adminApi.updateAsset(a!.id, { thumbnail_upload_id: up.id }));
      notify('Thumbnail replaced', 'It ships with the next publish.');
    } catch (e) {
      fail('Couldn’t replace the thumbnail', errorMessage(e));
    } finally {
      setWorking(false);
    }
  }

  const tabs: { key: TabKey; name: string; count?: number }[] = [
    { key: 'details', name: 'Details' },
    { key: 'versions', name: 'Files & Versions', count: a.versions.length },
    { key: 'licence', name: 'Licence & Access' },
    { key: 'dependencies', name: 'Dependencies', count: a.dependencies?.length ?? 0 },
    ...(can('analytics.view') ? [{ key: 'activity' as const, name: 'Activity' }] : []),
  ];

  const saveBar = editable && (
    <div className="flex items-center gap-3 border-t border-gray-900/10 pt-6 dark:border-white/10">
      <Button onClick={() => void save()} loading={saving}>Save changes</Button>
      <Button variant="secondary" onClick={() => { setDraft(toDraft(a)); setFieldErrors({}); }}>Discard</Button>
    </div>
  );

  const confirmTitle = !confirm ? '' : 'act' in confirm ? `${ACT_LABEL[confirm.act].replace('…', '')} “${a.title}”?` : 'rollback' in confirm ? `Roll back to ${confirm.rollback}?` : `Publish version ${confirm.publishVersion}?`;
  const confirmText: ReactNode = !confirm
    ? null
    : 'rollback' in confirm
      ? `${confirm.rollback} becomes the live version in the FrameFlow feed again.`
      : 'publishVersion' in confirm
        ? 'This version is packaged, signed and added to the FrameFlow feed.'
        : confirm.act === 'publish'
          ? `Version ${a.pending_version ?? a.current_version} is packaged, signed and added to the ${a.visibility === 'internal' ? 'beta' : 'stable'} FrameFlow feed.`
          : confirm.act === 'archive'
            ? 'Archived assets leave the feed and the library. They can be restored to draft later.'
            : confirm.act === 'unpublish'
              ? 'The asset leaves the FrameFlow feed and returns to draft.'
              : confirm.act === 'deprecate'
                ? 'Installed copies keep working; FrameFlow stops offering it to new users.'
                : confirm.act === 'reject'
                  ? 'The asset goes back to draft with your reason.'
                  : null;

  return (
    <div className="space-y-6">
      <PageHeading
        breadcrumbs={[{ name: 'Asset Library', to: '/admin/assets' }, { name: typeName(a.type), to: `/admin/assets?type=${a.type}` }, { name: a.title }]}
        title={<span className="flex flex-wrap items-center gap-3"><TypeTile color={typeColor(a.type)} label={typeName(a.type)} className="size-9" />{a.title}<StatusBadge status={a.status} /></span>}
        meta={
          <>
            <span className="font-mono">v{a.current_version ?? '—'}</span>
            {a.published_version && <span>live {a.published_version}</span>}
            {a.pending_version && <Badge tone="yellow">pending {a.pending_version}</Badge>}
            <span>{ASSET_TYPES[a.type]?.name ?? a.type}</span>
            <span>updated {timeAgo(a.updated_at)}</span>
          </>
        }
      />
      {a.review && !a.review.approved && a.status === 'draft' && <Alert tone="error" title="Rejected in review">{a.review.reason}</Alert>}
      {blockers.length > 0 && <Alert tone="error" title="Publishing is blocked" items={blockers} />}
      {!editable && <Alert tone="info">You can view this asset but not edit it with your role.</Alert>}

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Tabs label="Editor sections" tabs={tabs} current={tab} onChange={setTab} />

          {tab === 'details' && (
            <fieldset disabled={!editable} className="space-y-6">
              <legend className="sr-only">Details</legend>
              <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-6">
                <TextField className="sm:col-span-6" label="Title" value={draft.title} error={fieldErrors.title} onChange={(e) => set('title', e.target.value)} />
                <TextField className="sm:col-span-3" label="Slug" value={draft.slug} readOnly={!!a.published_at} hint={a.published_at ? 'Immutable after first publish' : undefined} error={fieldErrors.slug} onChange={(e) => set('slug', e.target.value)} />
                <SelectField className="sm:col-span-3" label="Category" value={draft.category_id} error={fieldErrors.category_id} onChange={(e) => set('category_id', e.target.value)} options={[['', 'None'], ...cats.map((c): [string, string] => [c.id, c.name])]} />
                <TextArea className="sm:col-span-6" label="Description" value={draft.description} error={fieldErrors.description} onChange={(e) => set('description', e.target.value)} />
                <TextField className="sm:col-span-6" label="Tags" hint="Comma separated, up to 20" value={draft.tags} error={fieldErrors.tags} onChange={(e) => set('tags', e.target.value)} />
                <TextField className="sm:col-span-6" label="Search keywords" hint="Incl. Sinhala / Tamil terms" value={draft.keywords} error={fieldErrors.keywords} onChange={(e) => set('keywords', e.target.value)} />
                <TextField className="sm:col-span-3" label="Min FrameFlow version" value={draft.min_app_version} error={fieldErrors.min_app_version} onChange={(e) => set('min_app_version', e.target.value)} />
                <TextField className="sm:col-span-3" label="Author / source" value={draft.author} onChange={(e) => set('author', e.target.value)} />
                <Checkbox className="sm:col-span-6" label="Featured" description="Shown in the Featured rail in FrameFlow and on the public site." checked={draft.featured} onChange={(e) => set('featured', e.target.checked)} />
                <div className="sm:col-span-6">
                  <p className="text-sm/6 font-medium text-gray-900 dark:text-white">Detected metadata</p>
                  <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-gray-50 p-3 text-xs text-gray-800 outline-1 outline-gray-200 dark:bg-white/5 dark:text-gray-200 dark:outline-white/10">{JSON.stringify(a.meta, null, 2)}</pre>
                </div>
              </div>
              {saveBar}
            </fieldset>
          )}

          {tab === 'licence' && (
            <fieldset disabled={!editable} className="space-y-6">
              <legend className="sr-only">Licence and access</legend>
              <div className="grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-6">
                <SelectField className="sm:col-span-3" label="Licence tier" value={draft.licence_tier} disabled={!tierEditable} hint={tierEditable ? 'Which FrameFlow plans can download it' : 'Needs the access.manage permission'} error={fieldErrors.licence_tier} onChange={(e) => set('licence_tier', e.target.value)} options={TIERS.map((t) => [t, t])} />
                <SelectField className="sm:col-span-3" label="Licence terms" value={draft.licence_terms} onChange={(e) => set('licence_terms', e.target.value)} options={LICENCE_TERMS.map((t) => [t, humanize(t)])} />
                <TextArea className="sm:col-span-6" label="Licence text" value={draft.licence_text} onChange={(e) => set('licence_text', e.target.value)} />
                <Checkbox className="sm:col-span-6" label="Attribution required" checked={draft.attribution_required} onChange={(e) => set('attribution_required', e.target.checked)} />
                <TextField className="sm:col-span-6" label="Attribution text" value={draft.attribution_text} error={fieldErrors.attribution_text} onChange={(e) => set('attribution_text', e.target.value)} />
                <SelectField className="sm:col-span-3" label="Visibility" value={draft.visibility} hint="public → stable feed · internal → beta feed" error={fieldErrors.visibility} onChange={(e) => set('visibility', e.target.value)} options={VISIBILITIES.map((t) => [t, t])} />
                <TextField className="sm:col-span-3" type="datetime-local" label="Scheduled unpublish" value={draft.unpublish_at} onChange={(e) => set('unpublish_at', e.target.value)} hint="Leave empty for none" />
                <div className="sm:col-span-6">
                  <p className="text-sm/6 font-medium text-gray-900 dark:text-white">Audience rules</p>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{a.audience_rules?.length ? <code className="text-xs">{JSON.stringify(a.audience_rules)}</code> : 'None — everyone on a covering plan.'} Editing audience rules (A10) needs an API for plan → tier mapping and device limits; not available yet.</p>
                </div>
              </div>
              {saveBar}
            </fieldset>
          )}

          {tab === 'versions' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">Versions never overwrite. Publish or roll back any packaged version.</p>
                {editable && <Button variant="soft" onClick={() => setVersionOpen(true)}>Upload new version</Button>}
              </div>
              <TableCard caption="Versions">
                <thead>
                  <tr>
                    <th scope="col" className={thFirst}>Version</th>
                    <th scope="col" className={th}>Status</th>
                    <th scope="col" className={classNames(th, 'hidden md:table-cell')}>Changelog</th>
                    <th scope="col" className={classNames(th, 'hidden sm:table-cell')}>Package</th>
                    <th scope="col" className={classNames(th, 'hidden lg:table-cell')}>Created</th>
                    <th scope="col" className={th}><span className="sr-only">Actions</span></th>
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
                          {v.is_breaking && <Badge tone="red" className="ml-2">breaking</Badge>}
                          {v.version === a.published_version && <Badge tone="green" className="ml-2">live</Badge>}
                          {diff.length > 0 && (
                            <details className="mt-1 text-xs font-normal text-gray-500 dark:text-gray-400">
                              <summary className="cursor-pointer">Metadata changes ({diff.length})</summary>
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
                              <Button variant="link" onClick={() => setConfirm({ publishVersion: v.version })}>Publish<span className="sr-only"> {v.version}</span></Button>
                            )}
                            {can('version.rollback') && v.package && v.version !== a.published_version && (
                              <Button variant="link" onClick={() => setConfirm({ rollback: v.version })}>Roll back<span className="sr-only"> to {v.version}</span></Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!a.versions.length && <EmptyRow colSpan={6}>No versions.</EmptyRow>}
                </TBody>
              </TableCard>

              <Card title="Files">
                <ul role="list" className="divide-y divide-gray-100 text-sm dark:divide-white/5">
                  {(current?.files ?? []).map((f) => (
                    <li key={f.sha256 + f.role} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="min-w-0 truncate"><Badge tone="gray" className="mr-2">{f.role}</Badge>{f.filename}</span>
                      <span className="text-gray-500 dark:text-gray-400">{formatBytes(f.size)} · <span className="font-mono text-xs" title={f.sha256}>{shortHash(f.sha256)}</span></span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-gray-100 pt-4 dark:border-white/5">
                  {preview.data?.thumbnail_url ? (
                    <img src={preview.data.thumbnail_url} alt={`Thumbnail of ${a.title}`} className="h-20 w-36 rounded-md object-cover outline-1 outline-black/5" />
                  ) : (
                    <TypeTile color={typeColor(a.type)} label={typeName(a.type)} className="h-20 w-36" />
                  )}
                  <div className="text-sm">
                    <p className="font-medium text-gray-900 dark:text-white">Thumbnail</p>
                    <p className="text-gray-500 dark:text-gray-400">{a.thumbnail_file ? a.thumbnail_file.filename : 'Missing'}{!preview.data?.thumbnail_url && a.thumbnail_file ? ' · preview appears once published' : ''}</p>
                    {editable && (
                      <div className="mt-2">
                        <Label htmlFor="thumb">Replace thumbnail (PNG or WebP, 640×360)</Label>
                        <input id="thumb" type="file" accept="image/png,image/webp" disabled={working} onChange={(e) => void replaceThumbnail(e.target.files?.[0])} className="mt-1 block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-indigo-600 dark:text-gray-300 dark:file:bg-indigo-500/20 dark:file:text-indigo-300" />
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          )}

          {tab === 'dependencies' && <Dependencies asset={a} editable={editable} onSaved={refresh} />}

          {tab === 'activity' && (
            <Card title="Activity">
              {activity.isPending ? <Loading /> : activity.isError ? <p className="text-sm text-red-600">{errorMessage(activity.error)}</p> : (
                <ul role="list" className="space-y-3 text-sm">
                  {activity.data.map((e, i) => (
                    <li key={e.id ?? i} className="flex flex-wrap justify-between gap-2">
                      <span><span className="font-mono text-xs text-gray-900 dark:text-white">{e.action}</span> <span className="text-gray-500 dark:text-gray-400">by {e.actor_role ?? 'system'}</span></span>
                      <time dateTime={e.at} className="text-gray-500 dark:text-gray-400" title={formatDateTime(e.at)}>{timeAgo(e.at)}</time>
                    </li>
                  ))}
                  {!activity.data.length && <li className="text-gray-500">No activity.</li>}
                </ul>
              )}
            </Card>
          )}
        </div>

        <aside className="space-y-6" aria-label="Publishing">
          <Card title="Publishing">
            <dl className="mb-4 grid grid-cols-2 gap-2 text-sm">
              <dt className="text-gray-500 dark:text-gray-400">Status</dt><dd><StatusBadge status={a.status} /></dd>
              <dt className="text-gray-500 dark:text-gray-400">Tier</dt><dd><TierBadge tier={a.licence_tier} /></dd>
              <dt className="text-gray-500 dark:text-gray-400">Visibility</dt><dd className="text-gray-900 dark:text-white">{a.visibility}</dd>
              <dt className="text-gray-500 dark:text-gray-400">Published</dt><dd className="text-gray-900 dark:text-white">{a.published_at ? timeAgo(a.published_at) : '—'}</dd>
            </dl>
            <div className="flex flex-col gap-2">
              {actions.map((act) => (
                <Button
                  key={act}
                  variant={act === 'publish' ? 'primary' : act === 'approve' ? 'success' : act === 'archive' || act === 'reject' ? 'danger' : 'secondary'}
                  disabled={working}
                  onClick={() => (act === 'submit-review' || act === 'approve' ? doAct(act) : setConfirm({ act }))}
                >
                  {act === 'publish' && a.pending_version ? `Publish ${a.pending_version}` : ACT_LABEL[act]}
                </Button>
              ))}
              {!actions.length && <p className="text-sm text-gray-500 dark:text-gray-400">No publishing actions for your role in this state.</p>}
            </div>
            {can('asset.publish') && a.status !== 'archived' && (
              <form className="mt-5 border-t border-gray-100 pt-4 dark:border-white/5" onSubmit={(e) => { e.preventDefault(); if (schedule) void run(() => adminApi.publish(a.id, { publish_at: new Date(schedule).toISOString() }), 'Publish scheduled'); }}>
                <Label htmlFor="sched">Schedule publish</Label>
                <input id="sched" type="datetime-local" value={schedule} onChange={(e) => setSchedule(e.target.value)} className={classNames(inputClass, 'mt-2')} />
                <Button type="submit" variant="soft" size="sm" className="mt-2" disabled={!schedule || working}>Schedule</Button>
                {a.publish_at && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Scheduled for {formatDateTime(a.publish_at)}</p>}
              </form>
            )}
          </Card>
          <Card title={`Checks · v${current?.version ?? '—'}`}>
            <ChecksList
              checks={current?.checks ?? []}
              extra={[
                { label: 'Thumbnail', ok: !!a.thumbnail_file, text: a.thumbnail_file ? 'Present' : 'Missing' },
                { label: 'Reviewer approval', ok: ['approved', 'published'].includes(a.status), text: ['approved', 'published'].includes(a.status) ? 'Done' : 'Pending' },
              ]}
            />
          </Card>
          <Card title="Stats">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {(['downloads', 'installs', 'applies', 'favorites'] as const).map((k) => (
                <div key={k}><dt className="text-gray-500 capitalize dark:text-gray-400">{k}</dt><dd className="text-lg font-semibold text-gray-900 tabular-nums dark:text-white">{a.stats[k]}</dd></div>
              ))}
            </dl>
            {a.status === 'published' && <p className="mt-3 text-xs"><Link to={`/library/${a.slug}`} className="font-semibold text-indigo-600 dark:text-indigo-400">View on the public site →</Link></p>}
          </Card>
        </aside>
      </div>

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirmTitle}
        description={confirmText}
        tone={confirm && 'act' in confirm && ['archive', 'unpublish', 'reject', 'deprecate'].includes(confirm.act) ? 'danger' : 'primary'}
        confirmLabel={!confirm ? '' : 'act' in confirm ? ACT_LABEL[confirm.act].replace('…', '') : 'rollback' in confirm ? 'Roll back' : 'Publish'}
        busy={working}
        confirmDisabled={!!confirm && 'act' in confirm && confirm.act === 'reject' && !reason.trim()}
        onConfirm={() => {
          if (!confirm) return;
          if ('act' in confirm) doAct(confirm.act);
          else if ('rollback' in confirm) void run(() => adminApi.rollback(a.id, confirm.rollback), `Rolled back to ${confirm.rollback}`);
          else void run(() => adminApi.publishVersion(a.id, confirm.publishVersion), `Published ${confirm.publishVersion}`);
        }}
      >
        {confirm && 'act' in confirm && ['reject', 'unpublish', 'deprecate'].includes(confirm.act) && (
          <TextArea label={confirm.act === 'reject' ? 'Reason (sent to the editor)' : 'Reason (optional)'} value={reason} onChange={(e) => setReason(e.target.value)} required={confirm.act === 'reject'} autoFocus />
        )}
      </Modal>

      <NewVersionDrawer open={versionOpen} onClose={() => setVersionOpen(false)} asset={a} onDone={(next) => { refresh(next); setVersionOpen(false); notify('New version uploaded', `v${next.current_version}`); }} />
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
    if (!file) return setError('Choose a file.');
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
    <Drawer open={open} onClose={onClose} title="Upload new version" description={`Checked as ${typeName(asset.type)}. Live assets keep the current version until the new one is published.`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => void submit()} loading={busy}>Upload version</Button></>}>
      <div className="space-y-6">
        <div>
          <Label htmlFor="nv-file">File</Label>
          <input id="nv-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-2 block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-indigo-600 dark:text-gray-300" />
        </div>
        <TextField label="Version" placeholder="Auto (next minor, or major if breaking)" value={version} onChange={(e) => setVersion(e.target.value)} />
        <TextArea label="Changelog" value={changelog} onChange={(e) => setChangelog(e.target.value)} />
        <Checkbox label="Breaking change" description="FrameFlow warns users before updating." checked={breaking} onChange={(e) => setBreaking(e.target.checked)} />
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
      notify('Dependencies saved');
      setRef('');
    } catch (e) {
      fail('Couldn’t save dependencies', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const add = async () => {
    try {
      const target = await adminApi.getAsset(ref.trim());
      if (target.id === asset.id || deps.some((d) => d.asset_id === target.id)) return fail('Already listed');
      await save([...deps, { asset_id: target.id }]);
    } catch (e) {
      fail('No such asset', errorMessage(e));
    }
  };
  return (
    <Card title="Dependencies">
      <p className="text-sm text-gray-500 dark:text-gray-400">Assets that must be published for this one to publish (e.g. a font a text template uses).</p>
      <ul role="list" className="mt-4 divide-y divide-gray-100 text-sm dark:divide-white/5">
        {deps.map((d) => (
          <li key={d.asset_id} className="flex items-center justify-between gap-3 py-2">
            <Link to={`/admin/assets/${d.asset_id}`} className="font-mono text-xs text-indigo-600 dark:text-indigo-400">{d.asset_id}</Link>
            {editable && <Button variant="link" disabled={busy} onClick={() => void save(deps.filter((x) => x.asset_id !== d.asset_id))}>Remove</Button>}
          </li>
        ))}
        {!deps.length && <li className="py-2 text-gray-500 dark:text-gray-400">No dependencies.</li>}
      </ul>
      {editable && (
        <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (ref.trim()) void add(); }}>
          <TextField className="min-w-60 flex-1" label="Add by asset id or slug" value={ref} onChange={(e) => setRef(e.target.value)} />
          <Button type="submit" variant="secondary" loading={busy}>Add</Button>
        </form>
      )}
    </Card>
  );
}
