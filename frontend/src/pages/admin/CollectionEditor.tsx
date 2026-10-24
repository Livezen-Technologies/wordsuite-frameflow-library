// A9 Collection create / edit. Tailwind Plus Application UI: headings/page-headings (03 with breadcrumbs),
// forms/form-layouts (01 stacked), forms/toggles (04), lists/stacked-lists (13 narrow with actions: ordered assets with
// drag handle + move up / down / remove buttons), forms/comboboxes-style search results, overlays/modal-dialogs (delete).
// API: GET/POST /admin/collections, GET/PATCH/DELETE /admin/collections/:slug.
import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownIcon, ArrowUpIcon, Bars3Icon, MagnifyingGlassIcon, PlusIcon, XMarkIcon } from '@heroicons/react/20/solid';
import { adminApi } from '@/services/admin';
import { ApiError, errorMessage } from '@/services/api';
import { Card, PageHeading, TypeTile } from '@/components/ui/Layout';
import { Button, Loading } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { StatusBadge } from '@/components/ui/Badge';
import { TextArea, TextField, Toggle, inputClass } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { useNotify } from '@/components/ui/Notifications';
import { SLUG, typeColor, typeName } from '@/core/schema';
import { classNames } from '@/core/format';
import { t, tn } from '@/i18n';
import type { AdminCollection, Asset } from '@/types/api';
import { WindowBadge } from './Collections';

interface Form {
  title: string;
  slug: string;
  description: string;
  publish_at: string;
  unpublish_at: string;
  visible: boolean;
  asset_ids: string[];
}

const toLocal = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const toIso = (local: string): string | null => (local ? new Date(local).toISOString() : null);

export const slugify = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

/** Moves the item at `from` to `to` (drag and drop). */
export function moveTo<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

export function toBody(f: Form): AdminCollection {
  return { slug: f.slug.trim(), title: f.title.trim(), description: f.description.trim(), asset_ids: f.asset_ids, publish_at: toIso(f.publish_at), unpublish_at: toIso(f.unpublish_at), visible: f.visible };
}

export function CollectionEditor() {
  const { slug: param } = useParams();
  const isNew = !param || param === 'new';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { notify, fail } = useNotify();
  const existing = useQuery({ queryKey: ['collection', param], queryFn: () => adminApi.collection(param!), enabled: !isNew, retry: false });
  const assets = useQuery({ queryKey: ['assets', { forCollections: true }], queryFn: () => adminApi.listAssets({}) });
  const [form, setForm] = useState<Form>({ title: '', slug: '', description: '', publish_at: '', unpublish_at: '', visible: true, asset_ids: [] });
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [search, setSearch] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [announce, setAnnounce] = useState('');

  useEffect(() => {
    const c = existing.data;
    if (c) setForm({ title: c.title, slug: c.slug, description: c.description ?? '', publish_at: toLocal(c.publish_at), unpublish_at: toLocal(c.unpublish_at), visible: c.visible, asset_ids: c.asset_ids ?? [] });
  }, [existing.data]);

  const byId = useMemo(() => new Map((assets.data?.data ?? []).map((a) => [a.id, a])), [assets.data]);
  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return [];
    return (assets.data?.data ?? []).filter((a) => !form.asset_ids.includes(a.id) && `${a.title} ${a.slug} ${a.tags.join(' ')}`.toLowerCase().includes(needle)).slice(0, 8);
  }, [search, assets.data, form.asset_ids]);

  const setIds = (ids: string[], message?: string) => {
    setForm((f) => ({ ...f, asset_ids: ids }));
    if (message) setAnnounce(message);
  };
  const titleOf = (id: string) => byId.get(id)?.title ?? id;
  const move = (from: number, to: number) => {
    if (to < 0 || to >= form.asset_ids.length) return;
    setIds(moveTo(form.asset_ids, from, to), t('{name} moved to position {n} of {total}', { name: titleOf(form.asset_ids[from]), n: to + 1, total: form.asset_ids.length }));
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = t('Enter a title.');
    if (!SLUG.test(form.slug.trim())) e.slug = t('3–80 lower-case letters, digits or dashes.');
    if (form.publish_at && form.unpublish_at && new Date(form.unpublish_at) <= new Date(form.publish_at)) e.unpublish_at = t('The end must be after the start.');
    setErrors(e);
    return !Object.keys(e).length;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const body = toBody(form);
      const saved = isNew ? await adminApi.createCollection(body) : await adminApi.updateCollection(param!, body);
      notify(isNew ? t('Collection created') : t('Collection saved'), saved?.title ?? body.title);
      void qc.invalidateQueries({ queryKey: ['collections'] });
      void qc.invalidateQueries({ queryKey: ['collection'] });
      if (isNew) navigate(`/admin/collections/${encodeURIComponent(saved?.slug ?? body.slug)}`, { replace: true });
    } catch (e) {
      if (e instanceof ApiError) setErrors(e.fieldErrors);
      fail(t('Couldn’t save the collection'), errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await adminApi.deleteCollection(param!);
      notify(t('Collection deleted'), form.title);
      void qc.invalidateQueries({ queryKey: ['collections'] });
      navigate('/admin/collections', { replace: true });
    } catch (e) {
      fail(t('Couldn’t delete the collection'), errorMessage(e));
      setSaving(false);
      setDeleting(false);
    }
  };

  const onDragStart = (i: number) => (e: DragEvent) => {
    setDragFrom(i);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(i));
  };
  const onDrop = (i: number) => (e: DragEvent) => {
    e.preventDefault();
    const from = dragFrom ?? Number(e.dataTransfer.getData('text/plain'));
    setDragFrom(null);
    setDragOver(null);
    if (Number.isInteger(from)) move(from, i);
  };

  if (!isNew && existing.isPending) return <Loading />;
  if (!isNew && existing.isError) return <Alert tone="error" title={t('Couldn’t load this collection')}>{errorMessage(existing.error)}</Alert>;

  return (
    <div className="space-y-6">
      <PageHeading
        breadcrumbs={[{ name: t('Collections'), to: '/admin/collections' }, { name: isNew ? t('New collection') : form.title || param! }]}
        title={<span className="flex flex-wrap items-center gap-3">{isNew ? t('New collection') : form.title || param}{existing.data && <WindowBadge c={toBody(form)} />}</span>}
        actions={
          <>
            {!isNew && <Button variant="danger" onClick={() => setDeleting(true)}>{t('Delete')}</Button>}
            <Button onClick={() => void save()} loading={saving}>{isNew ? t('Create collection') : t('Save changes')}</Button>
          </>
        }
      />
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
      <div className="grid gap-8 lg:grid-cols-3">
        <form className="space-y-6 lg:col-span-1" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <Card title={t('Details')}>
            <div className="space-y-5">
              <TextField label={t('Title')} value={form.title} error={errors.title} required onChange={(e) => setForm((f) => ({ ...f, title: e.target.value, slug: slugTouched ? f.slug : slugify(e.target.value) }))} />
              <TextField label={t('Slug')} value={form.slug} error={errors.slug} readOnly={!isNew} hint={isNew ? t('Used in the API and feed; can’t change later.') : t('Immutable after creation')} onChange={(e) => { setSlugTouched(true); setForm({ ...form, slug: e.target.value }); }} />
              <TextArea label={t('Description')} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <TextField type="datetime-local" label={t('Show from')} hint={t('Leave empty to start now')} value={form.publish_at} error={errors.publish_at} onChange={(e) => setForm({ ...form, publish_at: e.target.value })} />
              <TextField type="datetime-local" label={t('Show until')} hint={t('Leave empty for no end')} value={form.unpublish_at} error={errors.unpublish_at} onChange={(e) => setForm({ ...form, unpublish_at: e.target.value })} />
              <Toggle label={t('Visible')} description={t('Off keeps it as a draft: not in the public site or FrameFlow.')} checked={form.visible} onChange={(e) => setForm({ ...form, visible: e.target.checked })} />
            </div>
          </Card>
          <button type="submit" className="sr-only">{t('Save changes')}</button>
        </form>

        <div className="space-y-6 lg:col-span-2">
          <Card title={<span>{t('Assets in order')} <span className="ml-1 text-sm font-normal text-gray-500 dark:text-gray-400">{tn('{n} asset', '{n} assets', form.asset_ids.length)}</span></span>}>
            <p id="order-help" className="mb-3 text-sm text-gray-500 dark:text-gray-400">{t('Drag rows by the handle, or use the up and down buttons. The first assets show first in the rail.')}</p>
            {form.asset_ids.length ? (
              <ol role="list" aria-describedby="order-help" className="divide-y divide-gray-100 rounded-md outline-1 outline-gray-200 dark:divide-white/5 dark:outline-white/10">
                {form.asset_ids.map((id, i) => {
                  const a: Asset | undefined = byId.get(id);
                  return (
                    <li
                      key={id}
                      draggable
                      onDragStart={onDragStart(i)}
                      onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
                      onDragLeave={() => setDragOver((o) => (o === i ? null : o))}
                      onDrop={onDrop(i)}
                      onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
                      data-testid="collection-item"
                      className={classNames('flex items-center gap-3 bg-white px-3 py-2 dark:bg-transparent', dragOver === i && dragFrom !== i && 'bg-indigo-50 outline-2 -outline-offset-2 outline-indigo-400 dark:bg-indigo-500/10', dragFrom === i && 'opacity-50')}
                    >
                      <Bars3Icon aria-hidden="true" className="size-5 shrink-0 cursor-grab text-gray-400" />
                      <span className="w-6 text-right text-xs text-gray-400 tabular-nums">{i + 1}</span>
                      <TypeTile color={typeColor(a?.type ?? '')} label={a ? typeName(a.type) : '?'} className="size-8" />
                      <span className="min-w-0 flex-1">
                        <Link to={`/admin/assets/${id}`} className="block truncate text-sm font-medium text-gray-900 hover:text-indigo-600 dark:text-white">{a?.title ?? id}</Link>
                        {a ? <span className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">{typeName(a.type)} <StatusBadge status={a.status} /></span> : <span className="text-xs text-amber-700 dark:text-amber-400">{t('Not in the loaded asset list')}</span>}
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <Button variant="secondary" size="sm" disabled={i === 0} onClick={() => move(i, i - 1)} icon={<ArrowUpIcon aria-hidden="true" className="size-4" />}>
                          <span className="sr-only">{t('Move {name} up', { name: a?.title ?? id })}</span>
                        </Button>
                        <Button variant="secondary" size="sm" disabled={i === form.asset_ids.length - 1} onClick={() => move(i, i + 1)} icon={<ArrowDownIcon aria-hidden="true" className="size-4" />}>
                          <span className="sr-only">{t('Move {name} down', { name: a?.title ?? id })}</span>
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => setIds(form.asset_ids.filter((x) => x !== id), t('{name} removed', { name: a?.title ?? id }))} icon={<XMarkIcon aria-hidden="true" className="size-4" />}>
                          <span className="sr-only">{t('Remove {name}', { name: a?.title ?? id })}</span>
                        </Button>
                      </span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="rounded-md border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-white/20 dark:text-gray-400">{t('No assets yet. Search below to add some.')}</p>
            )}
          </Card>

          <Card title={t('Add assets')}>
            <label htmlFor="col-search" className="sr-only">{t('Search assets')}</label>
            <div className="relative">
              <MagnifyingGlassIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" />
              <input id="col-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search title, tag, slug…')} className={classNames(inputClass, 'pl-9')} />
            </div>
            {assets.isError && <Alert tone="error" className="mt-3">{errorMessage(assets.error)}</Alert>}
            {search.trim() && (
              <ul role="list" aria-label={t('Search results')} className="mt-3 divide-y divide-gray-100 dark:divide-white/5">
                {matches.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-2">
                    <TypeTile color={typeColor(a.type)} label={typeName(a.type)} className="size-8" />
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-900 dark:text-white">{a.title}<span className="ml-2 font-mono text-xs text-gray-500">{a.slug}</span></span>
                    <StatusBadge status={a.status} />
                    <Button size="sm" variant="soft" icon={<PlusIcon aria-hidden="true" className="size-4" />} onClick={() => setIds([...form.asset_ids, a.id], t('{name} added', { name: a.title }))}>
                      {t('Add')}<span className="sr-only"> {a.title}</span>
                    </Button>
                  </li>
                ))}
                {!matches.length && <li className="py-2 text-sm text-gray-500 dark:text-gray-400">{t('No matching assets.')}</li>}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Modal open={deleting} onClose={() => setDeleting(false)} tone="danger" title={t('Delete “{name}”?', { name: form.title })} description={t('The rail disappears from FrameFlow and the public site. The assets stay.')} confirmLabel={t('Delete')} busy={saving} onConfirm={() => void remove()} />
    </div>
  );
}
