// A8 Categories & Tags. Tailwind Plus Application UI: lists/grid-lists (a card per type), lists/stacked-lists (13 narrow
// with actions: reorder / edit / delete rows), forms/input-groups (inline add form), forms/toggles, overlays/modal-dialogs
// (edit, delete), feedback/alerts. API: GET/POST /admin/categories, PATCH/DELETE /admin/categories/:id,
// POST /admin/categories/reorder { ids }, POST /admin/tags/merge { from, into }.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownIcon, ArrowUpIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/20/solid';
import { adminApi } from '@/services/admin';
import { ApiError, errorMessage } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { Card, PageHeading } from '@/components/ui/Layout';
import { Button, Loading } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { NativeSelect, SelectField, TextField, Toggle, inputClass } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { useNotify } from '@/components/ui/Notifications';
import { ASSET_TYPES, TYPE_KEYS, typeLongName, typeTarget, type AssetType } from '@/core/schema';
import { splitList } from '@/core/format';
import { t, tn } from '@/i18n';
import type { Category } from '@/types/api';

/** Moves item `i` by `delta` (−1 up, +1 down) and returns the new id order. */
export function moveId(ids: string[], i: number, delta: number): string[] {
  const j = i + delta;
  if (j < 0 || j >= ids.length) return ids;
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

const iconButton = 'rounded-md p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-600 focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-30 dark:hover:bg-white/5 dark:hover:text-gray-200';

export function Categories() {
  const { can } = useAuth();
  const manage = can('taxonomy.manage');
  const qc = useQueryClient();
  const { notify, fail } = useNotify();
  const q = useQuery({ queryKey: ['categories'], queryFn: () => adminApi.categories() });
  const [type, setType] = useState<AssetType>('graphic');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [edit, setEdit] = useState({ name: '', icon: '', visible: true, parent_id: '' });
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');

  const refresh = () => qc.invalidateQueries({ queryKey: ['categories'] });

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminApi.createCategory({ type, name: name.trim() });
      notify(t('Category added'), `${typeLongName(type)} · ${name.trim()}`);
      setName('');
      void refresh();
    } catch (e) {
      setError(e instanceof ApiError ? errorMessage(e) : String(e));
      fail(t('Couldn’t add the category'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (c: Category) => {
    setModalError(null);
    setEdit({ name: c.name, icon: c.icon ?? '', visible: c.visible, parent_id: c.parent_id ?? '' });
    setEditing(c);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusy(true);
    setModalError(null);
    try {
      await adminApi.updateCategory(editing.id, { name: edit.name.trim(), icon: edit.icon.trim() || null, visible: edit.visible, parent_id: edit.parent_id || null });
      notify(t('Category saved'), edit.name.trim());
      setEditing(null);
      void refresh();
    } catch (e) {
      setModalError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    setModalError(null);
    try {
      await adminApi.deleteCategory(deleting.id);
      notify(t('Category deleted'), deleting.name);
      setDeleting(null);
      void refresh();
    } catch (e) {
      setModalError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const reorder = async (list: Category[], i: number, delta: number) => {
    const orig = list.map((c) => c.id);
    const ids = moveId(orig, i, delta);
    if (ids === orig) return;
    const prev = qc.getQueryData<Category[]>(['categories']);
    // Optimistic: rewrite `sort` for this type in the cache.
    qc.setQueryData<Category[]>(['categories'], (old = []) => old.map((c) => (ids.includes(c.id) ? { ...c, sort: ids.indexOf(c.id) } : c)));
    const moved = list[i];
    setAnnounce(t('{name} moved to position {n} of {total}', { name: moved.name, n: i + delta + 1, total: list.length }));
    try {
      await adminApi.reorderCategories(ids);
      void refresh();
    } catch (e) {
      qc.setQueryData(['categories'], prev);
      fail(t('Couldn’t reorder the categories'), errorMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeading title={t('Categories & Tags')} meta={t('Categories are per asset type and drive the panels in FrameFlow.')} />
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
      {manage && (
        <form className="flex flex-wrap items-end gap-3 rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800/50" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <div>
            <label htmlFor="cat-type" className="block text-sm/6 font-medium text-gray-900 dark:text-white">{t('Type')}</label>
            <NativeSelect id="cat-type" className="mt-2 w-56" value={type} onChange={(e) => setType(e.target.value as AssetType)}>
              {TYPE_KEYS.map((k) => <option key={k} value={k}>{typeLongName(k)}</option>)}
            </NativeSelect>
          </div>
          <div className="min-w-48 flex-1">
            <label htmlFor="cat-name" className="block text-sm/6 font-medium text-gray-900 dark:text-white">{t('New category')}</label>
            <input id="cat-name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={error ? true : undefined} className={`${inputClass} mt-2`} />
          </div>
          <Button type="submit" loading={busy && !editing && !deleting} disabled={name.trim().length < 2}>{t('Add')}</Button>
          {error && <p className="w-full text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}
        </form>
      )}
      {q.isPending ? <Loading /> : q.isError ? <Alert tone="error">{errorMessage(q.error)}</Alert> : (
        <ul role="list" className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {TYPE_KEYS.map((k) => {
            const list = q.data.filter((c) => c.type === k).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
            return (
              <li key={k} className="col-span-1 rounded-lg bg-white shadow-sm dark:bg-gray-800/50 dark:outline dark:-outline-offset-1 dark:outline-white/10">
                <div className="flex items-start gap-3 p-5">
                  <span aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: ASSET_TYPES[k].color }} />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{typeLongName(k)}</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('Installs to {dir}', { dir: `${ASSET_TYPES[k].dir}/` })} · {typeTarget(k)}</p>
                    <ul role="list" aria-label={typeLongName(k)} className="mt-3 divide-y divide-gray-100 dark:divide-white/5">
                      {list.map((c, i) => (
                        <li key={c.id} className="flex items-center gap-2 py-1.5">
                          {c.icon && <span aria-hidden="true" className="w-5 text-center text-sm">{c.icon.length <= 2 ? c.icon : '•'}</span>}
                          <span className="min-w-0 flex-1 truncate text-sm text-gray-900 dark:text-white">{c.name}</span>
                          {!c.visible && <Badge tone="gray">{t('Hidden')}</Badge>}
                          {manage && (
                            <span className="flex shrink-0 items-center">
                              <button type="button" className={iconButton} disabled={i === 0} onClick={() => void reorder(list, i, -1)} aria-label={t('Move {name} up', { name: c.name })}>
                                <ArrowUpIcon aria-hidden="true" className="size-4" />
                              </button>
                              <button type="button" className={iconButton} disabled={i === list.length - 1} onClick={() => void reorder(list, i, 1)} aria-label={t('Move {name} down', { name: c.name })}>
                                <ArrowDownIcon aria-hidden="true" className="size-4" />
                              </button>
                              <button type="button" className={iconButton} onClick={() => openEdit(c)} aria-label={t('Edit {name}', { name: c.name })}>
                                <PencilSquareIcon aria-hidden="true" className="size-4" />
                              </button>
                              <button type="button" className={iconButton} onClick={() => { setModalError(null); setDeleting(c); }} aria-label={t('Delete {name}', { name: c.name })}>
                                <TrashIcon aria-hidden="true" className="size-4" />
                              </button>
                            </span>
                          )}
                        </li>
                      ))}
                      {!list.length && <li className="py-1.5 text-xs text-gray-500">{t('No categories.')}</li>}
                    </ul>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {manage && <MergeTags />}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={t('Edit category')} description={editing ? typeLongName(editing.type) : undefined} confirmLabel={t('Save')} busy={busy} confirmDisabled={edit.name.trim().length < 2} onConfirm={() => void saveEdit()}>
        <div className="space-y-4">
          <TextField label={t('Name')} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required minLength={2} autoFocus />
          <TextField label={t('Icon')} hint={t('An emoji, or the icon name FrameFlow shows in its panel (e.g. sparkles).')} value={edit.icon} onChange={(e) => setEdit({ ...edit, icon: e.target.value })} />
          <SelectField label={t('Parent category')} value={edit.parent_id} onChange={(e) => setEdit({ ...edit, parent_id: e.target.value })} options={[['', t('None (top level)')], ...(q.data ?? []).filter((c) => editing && c.type === editing.type && c.id !== editing.id).map((c): [string, string] => [c.id, c.name])]} />
          <Toggle label={t('Visible')} description={t('Hidden categories keep their assets but don’t show in FrameFlow or the public site.')} checked={edit.visible} onChange={(e) => setEdit({ ...edit, visible: e.target.checked })} />
          {modalError && <Alert tone="error">{modalError}</Alert>}
        </div>
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} tone="danger" title={t('Delete “{name}”?', { name: deleting?.name ?? '' })} description={t('Only empty categories can be deleted.')} confirmLabel={t('Delete')} busy={busy} onConfirm={() => void remove()}>
        {modalError && <Alert tone="error">{modalError}</Alert>}
      </Modal>
    </div>
  );
}

function MergeTags() {
  const qc = useQueryClient();
  const { notify, fail } = useNotify();
  const [from, setFrom] = useState('');
  const [into, setInto] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const sources = splitList(from).filter((x) => x !== into.trim());
  const ok = sources.length > 0 && into.trim().length > 0;

  const merge = async () => {
    setBusy(true);
    try {
      const r = await adminApi.mergeTags(sources, into.trim());
      notify(t('Tags merged'), r?.updated != null ? tn('{n} asset updated', '{n} assets updated', r.updated) : `${sources.join(', ')} → ${into.trim()}`);
      setFrom('');
      setInto('');
      setConfirming(false);
      void qc.invalidateQueries({ queryKey: ['assets'] });
      void qc.invalidateQueries({ queryKey: ['audit'] });
    } catch (e) {
      fail(t('Couldn’t merge the tags'), errorMessage(e));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={t('Merge tags')}>
      <p className="text-sm text-gray-500 dark:text-gray-400">{t('Rewrites the tags on every asset: each “from” tag is replaced by the “into” tag. Use it to fold spelling variants together (e.g. colour, color → color).')}</p>
      <form className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-5 sm:items-end" onSubmit={(e) => { e.preventDefault(); if (ok) setConfirming(true); }}>
        <TextField className="sm:col-span-2" label={t('From tags')} hint={t('Comma separated')} value={from} onChange={(e) => setFrom(e.target.value)} placeholder="colour, colours" />
        <TextField className="sm:col-span-2" label={t('Into tag')} value={into} onChange={(e) => setInto(e.target.value)} placeholder="color" />
        <Button type="submit" variant="secondary" disabled={!ok} className="sm:mb-7">{t('Merge')}</Button>
      </form>
      <Modal open={confirming} onClose={() => setConfirming(false)} title={t('Merge {n} tags into “{into}”?', { n: sources.length, into: into.trim() })} description={sources.join(', ')} confirmLabel={t('Merge')} busy={busy} onConfirm={() => void merge()} />
    </Card>
  );
}
