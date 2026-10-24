// A2 Asset Library. Tailwind Plus: navigation/tabs (01 underline), lists/tables (17 with checkboxes + bulk bar),
// headings/page-headings (01), elements/badges, overlays/modal-dialogs (bulk prompts), overlays/notifications.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpTrayIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid';
import { adminApi } from '@/services/admin';
import { errorMessage } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { PageHeading, Tabs, TypeTile } from '@/components/ui/Layout';
import { Button, ButtonLink, Loading } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { StatusBadge, TierBadge } from '@/components/ui/Badge';
import { CheckMark, NativeSelect, inputClass, TextField, SelectField } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { useNotify } from '@/components/ui/Notifications';
import { TBody, EmptyRow, th, td } from '@/components/ui/Table';
import { STATUSES, TIERS, TYPE_KEYS, VISIBILITIES, humanize, label, tierLabel, typeColor, typeName, type AssetType } from '@/core/schema';
import { t, tn, tx } from '@/i18n';
import { classNames, timeAgo } from '@/core/format';
import type { BulkAction } from '@/types/api';

const checkboxClass =
  'col-start-1 row-start-1 appearance-none rounded-sm border border-gray-300 bg-white checked:border-indigo-600 checked:bg-indigo-600 indeterminate:border-indigo-600 indeterminate:bg-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-white/20 dark:bg-gray-800/50 dark:checked:border-indigo-500 dark:checked:bg-indigo-500 forced-colors:appearance-auto';

type Prompt = { action: BulkAction; title: string } | null;

export function AssetLibrary() {
  const { can, me } = useAuth();
  const qc = useQueryClient();
  const { notify, fail } = useNotify();
  const [params, setParams] = useSearchParams();
  const type = (params.get('type') ?? '') as AssetType | '';
  const status = params.get('status') ?? '';
  const q = params.get('q') ?? '';
  const mine = params.get('mine') === '1';
  const [tier, setTier] = useState('');
  const [visibility, setVisibility] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [promptValue, setPromptValue] = useState('');
  const [busy, setBusy] = useState(false);

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
    setSelected(new Set());
  };

  const list = useInfiniteQuery({
    queryKey: ['assets', { type, status, q, mine }],
    queryFn: ({ pageParam }) => adminApi.listAssets({ type, status, q, owner: mine ? me?.id : undefined, cursor: pageParam || undefined }),
    initialPageParam: '',
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => adminApi.categories() });

  // Category, tier and visibility aren't API filters on /admin/assets yet: applied to the loaded rows.
  const rows = useMemo(() => {
    const all = list.data?.pages.flatMap((p) => p.data) ?? [];
    return all.filter((a) => (!tier || a.licence_tier === tier) && (!visibility || a.visibility === visibility) && (!categoryId || a.category_id === categoryId));
  }, [list.data, tier, visibility, categoryId]);
  const total = list.data?.pages[0]?.total ?? 0;

  const headerBox = useRef<HTMLInputElement>(null);
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someChecked = rows.some((r) => selected.has(r.id)) && !allChecked;
  useLayoutEffect(() => {
    if (headerBox.current) headerBox.current.indeterminate = someChecked;
  }, [someChecked]);
  const toggleAll = () => setSelected(allChecked || someChecked ? new Set() : new Set(rows.map((r) => r.id)));
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  async function runBulk(action: BulkAction, payload: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      const { results } = await adminApi.bulk([...selected], action, payload);
      const bad = results.filter((r) => !r.ok);
      if (bad.length) fail(t('{done} done, {failed} failed', { done: results.length - bad.length, failed: bad.length }), bad[0].error?.message);
      else notify(tn('{n} asset updated', '{n} assets updated', results.length), tx(humanize(action)));
      setSelected(new Set());
      setPrompt(null);
      await qc.invalidateQueries({ queryKey: ['assets'] });
      void qc.invalidateQueries({ queryKey: ['audit'] });
      void qc.invalidateQueries({ queryKey: ['overview'] });
    } catch (e) {
      fail(t('Bulk action failed'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const openPrompt = (action: BulkAction, title: string, initial = '') => {
    setPromptValue(initial);
    setPrompt({ action, title });
  };
  const confirmPrompt = () => {
    if (!prompt) return;
    const a = prompt.action;
    const payload = a === 'tag_add' || a === 'tag_remove' ? { tags: promptValue } : a === 'set_tier' ? { licence_tier: promptValue } : a === 'set_visibility' ? { visibility: promptValue } : a === 'move_category' ? { category_id: promptValue } : {};
    void runBulk(a, payload);
  };

  const bulkButtons: { label: string; onClick: () => void; show: boolean; danger?: boolean }[] = [
    { label: t('Publish'), onClick: () => openPrompt('publish', t('Publish {n} assets?', { n: selected.size })), show: can('asset.publish') },
    { label: t('Unpublish'), onClick: () => openPrompt('unpublish', t('Unpublish {n} assets?', { n: selected.size })), show: can('asset.publish') },
    { label: t('Add tags'), onClick: () => openPrompt('tag_add', t('Add tags')), show: true },
    { label: t('Remove tags'), onClick: () => openPrompt('tag_remove', t('Remove tags')), show: true },
    { label: t('Move category'), onClick: () => openPrompt('move_category', t('Move to category')), show: true },
    { label: t('Set tier'), onClick: () => openPrompt('set_tier', t('Set licence tier'), 'free'), show: can('access.manage') },
    { label: t('Set visibility'), onClick: () => openPrompt('set_visibility', t('Set visibility'), 'public'), show: true },
    { label: t('Archive'), onClick: () => openPrompt('archive', t('Archive {n} assets?', { n: selected.size })), show: can('asset.archive'), danger: true },
  ];
  const selectedTypes = new Set(rows.filter((r) => selected.has(r.id)).map((r) => r.type));
  const moveOptions = (categories.data ?? []).filter((c) => selectedTypes.size === 1 && selectedTypes.has(c.type));

  return (
    <div className="space-y-6">
      <PageHeading title={t('Asset Library')} meta={`${tn('{n} asset', '{n} assets', total)}${type ? ` · ${typeName(type)}` : ''}`} actions={can('asset.create') && <ButtonLink to="/admin/upload"><ArrowUpTrayIcon aria-hidden="true" className="-ml-0.5 size-5" />{t('Upload')}</ButtonLink>} />

      <Tabs label={t('Asset type')} current={type || 'all'} onChange={(k) => setParam('type', k === 'all' ? '' : k)} tabs={[{ key: 'all', name: t('All') }, ...TYPE_KEYS.map((k) => ({ key: k, name: typeName(k) }))]} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <form role="search" className="relative sm:col-span-2" onSubmit={(e) => { e.preventDefault(); setParam('q', String(new FormData(e.currentTarget).get('q') ?? '').trim()); }}>
          <label htmlFor="lib-q" className="sr-only">{t('Search assets')}</label>
          <input id="lib-q" key={q} name="q" type="search" defaultValue={q} placeholder={t('Search title, tag, slug…')} className={classNames(inputClass, 'pl-9')} />
          <MagnifyingGlassIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" />
        </form>
        <NativeSelect aria-label={t('Status')} value={status} onChange={(e) => setParam('status', e.target.value)}>
          <option value="">{t('Status: all')}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </NativeSelect>
        <NativeSelect aria-label={t('Category')} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">{t('Category: all')}</option>
          {(categories.data ?? []).filter((c) => !type || c.type === type).map((c) => <option key={c.id} value={c.id}>{type ? c.name : `${typeName(c.type)} · ${c.name}`}</option>)}
        </NativeSelect>
        <NativeSelect aria-label={t('Licence tier')} value={tier} onChange={(e) => setTier(e.target.value)}>
          <option value="">{t('Tier: all')}</option>
          {TIERS.map((x) => <option key={x} value={x}>{tierLabel(x)}</option>)}
        </NativeSelect>
        <NativeSelect aria-label={t('Visibility')} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
          <option value="">{t('Visibility: all')}</option>
          {VISIBILITIES.map((x) => <option key={x} value={x}>{label(x)}</option>)}
        </NativeSelect>
      </div>
      <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input id="mine" type="checkbox" checked={mine} onChange={(e) => setParam('mine', e.target.checked ? '1' : '')} className="size-4 rounded border-gray-300 text-indigo-600 focus-visible:outline-indigo-600" />
        <label htmlFor="mine">{t('Only assets I created')}</label>
      </div>

      {selected.size > 0 && (
        <div role="region" aria-label={t('Bulk actions')} className="flex flex-wrap items-center gap-2 rounded-md bg-indigo-50 px-4 py-2 text-sm text-indigo-900 dark:bg-indigo-500/10 dark:text-indigo-200">
          <b className="mr-2">{t('{n} selected', { n: selected.size })}</b>
          {bulkButtons.filter((b) => b.show).map((b) => (
            <Button key={b.label} size="sm" variant={b.danger ? 'danger' : 'secondary'} onClick={b.onClick} disabled={busy}>{b.label}</Button>
          ))}
          <Button size="sm" variant="link" onClick={() => setSelected(new Set())}>{t('Clear')}</Button>
        </div>
      )}

      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <Alert tone="error" title={t('Couldn’t load assets')}>{errorMessage(list.error)}</Alert>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow-sm outline-1 outline-black/5 dark:bg-gray-800/50 dark:-outline-offset-1 dark:outline-white/10">
          <div className="overflow-x-auto">
            <table className="relative min-w-full table-fixed divide-y divide-gray-300 dark:divide-white/15">
              <caption className="sr-only">{t('Assets')}</caption>
              <thead>
                <tr>
                  <th scope="col" className="relative w-12 px-6">
                    <div className="group absolute top-1/2 left-4 -mt-2 grid size-4 grid-cols-1">
                      <input ref={headerBox} type="checkbox" aria-label={t('Select all shown assets')} className={checkboxClass} checked={allChecked} onChange={toggleAll} />
                      <CheckMark />
                    </div>
                  </th>
                  <th scope="col" className="min-w-56 py-3.5 pr-3 text-left text-sm font-semibold text-gray-900 dark:text-white">{t('Asset')}</th>
                  <th scope="col" className={classNames(th, 'hidden md:table-cell')}>{t('Type')}</th>
                  <th scope="col" className={classNames(th, 'hidden lg:table-cell')}>{t('Category')}</th>
                  <th scope="col" className={th}>{t('Status')}</th>
                  <th scope="col" className={classNames(th, 'hidden sm:table-cell')}>{t('Tier')}</th>
                  <th scope="col" className={classNames(th, 'hidden md:table-cell')}>{t('Version')}</th>
                  <th scope="col" className={classNames(th, 'hidden lg:table-cell')}>{t('Downloads')}</th>
                  <th scope="col" className={classNames(th, 'hidden xl:table-cell')}>{t('Updated')}</th>
                </tr>
              </thead>
              <TBody>
                {rows.map((a) => (
                  <tr key={a.id} className="group has-checked:bg-gray-50 dark:has-checked:bg-gray-800/50">
                    <td className="relative px-7 sm:w-12 sm:px-6">
                      <div className="absolute inset-y-0 left-0 hidden w-0.5 bg-indigo-600 group-has-checked:block dark:bg-indigo-500" />
                      <div className="group absolute top-1/2 left-4 -mt-2 grid size-4 grid-cols-1">
                        <input type="checkbox" aria-label={t('Select {title}', { title: a.title })} className={checkboxClass} checked={selected.has(a.id)} onChange={(e) => toggle(a.id, e.target.checked)} />
                        <CheckMark />
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-sm font-medium text-gray-900 group-has-checked:text-indigo-600 dark:text-white">
                      <Link to={`/admin/assets/${a.id}`} className="flex items-center gap-3 hover:text-indigo-600 focus-visible:outline-2 focus-visible:outline-indigo-600">
                        <TypeTile color={typeColor(a.type)} label={typeName(a.type)} className="size-9" />
                        <span className="min-w-0">
                          <span className="block truncate">{a.title}</span>
                          <span className="block truncate font-mono text-xs font-normal text-gray-500 dark:text-gray-400">{a.slug}</span>
                        </span>
                      </Link>
                    </td>
                    <td className={classNames(td, 'hidden md:table-cell')}>{typeName(a.type)}</td>
                    <td className={classNames(td, 'hidden lg:table-cell')}>{a.category?.name ?? '—'}</td>
                    <td className={td}><StatusBadge status={a.status} /></td>
                    <td className={classNames(td, 'hidden sm:table-cell')}><TierBadge tier={a.licence_tier} /></td>
                    <td className={classNames(td, 'hidden font-mono text-xs md:table-cell')}>{a.current_version ?? '—'}{a.pending_version ? ` → ${a.pending_version}` : ''}</td>
                    <td className={classNames(td, 'hidden tabular-nums lg:table-cell')}>{a.stats.downloads}</td>
                    <td className={classNames(td, 'hidden xl:table-cell')}><time dateTime={a.updated_at}>{timeAgo(a.updated_at)}</time></td>
                  </tr>
                ))}
                {!rows.length && <EmptyRow colSpan={9}>{t('No assets match these filters.')}</EmptyRow>}
              </TBody>
            </table>
          </div>
          {list.hasNextPage && (
            <div className="border-t border-gray-200 px-4 py-3 text-center dark:border-white/10">
              <Button variant="secondary" size="sm" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{t('Load more')}</Button>
            </div>
          )}
        </div>
      )}

      <Modal
        open={!!prompt}
        onClose={() => setPrompt(null)}
        title={prompt?.title ?? ''}
        tone={prompt?.action === 'archive' || prompt?.action === 'unpublish' ? 'danger' : 'primary'}
        confirmLabel={t('Apply')}
        busy={busy}
        confirmDisabled={['tag_add', 'tag_remove', 'move_category'].includes(prompt?.action ?? '') && !promptValue.trim()}
        onConfirm={confirmPrompt}
        description={prompt && ['publish', 'unpublish', 'archive'].includes(prompt.action) ? t('Each asset is processed on its own; any that fail their gate are reported and left unchanged.') : undefined}
      >
        {(prompt?.action === 'tag_add' || prompt?.action === 'tag_remove') && <TextField label={t('Tags (comma separated)')} value={promptValue} onChange={(e) => setPromptValue(e.target.value)} placeholder="wedding, cinematic" autoFocus />}
        {prompt?.action === 'set_tier' && <SelectField label={t('Licence tier')} value={promptValue} onChange={(e) => setPromptValue(e.target.value)} options={TIERS.map((x) => [x, tierLabel(x)])} />}
        {prompt?.action === 'set_visibility' && <SelectField label={t('Visibility')} value={promptValue} onChange={(e) => setPromptValue(e.target.value)} options={VISIBILITIES.map((x) => [x, label(x)])} />}
        {prompt?.action === 'move_category' &&
          (moveOptions.length ? (
            <SelectField label={t('Category')} value={promptValue} onChange={(e) => setPromptValue(e.target.value)} options={[['', t('Choose…')], ...moveOptions.map((c): [string, string] => [c.id, c.name])]} />
          ) : (
            <Alert tone="warn">{t('Categories belong to one asset type. Select assets of a single type to move them.')}</Alert>
          ))}
      </Modal>
    </div>
  );
}
