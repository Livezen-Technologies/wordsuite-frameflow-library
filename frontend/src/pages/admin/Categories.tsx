// A8 Categories & Tags. Tailwind Plus: lists/grid-lists (cards per type), forms/input-groups (inline add form), feedback/alerts.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/services/admin';
import { ApiError, errorMessage } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { PageHeading } from '@/components/ui/Layout';
import { Button, Loading } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { NativeSelect, inputClass } from '@/components/ui/Form';
import { useNotify } from '@/components/ui/Notifications';
import { ASSET_TYPES, TYPE_KEYS, type AssetType } from '@/core/schema';

export function Categories() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const { notify, fail } = useNotify();
  const q = useQuery({ queryKey: ['categories'], queryFn: () => adminApi.categories() });
  const [type, setType] = useState<AssetType>('graphic');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminApi.createCategory({ type, name: name.trim() });
      notify('Category added', `${ASSET_TYPES[type].name} · ${name.trim()}`);
      setName('');
      void qc.invalidateQueries({ queryKey: ['categories'] });
    } catch (e) {
      setError(e instanceof ApiError ? errorMessage(e) : String(e));
      fail('Couldn’t add the category', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeading title="Categories & Tags" meta="Categories are per asset type and drive the panels in FrameFlow." />
      {can('taxonomy.manage') && (
        <form className="flex flex-wrap items-end gap-3 rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800/50" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <div>
            <label htmlFor="cat-type" className="block text-sm/6 font-medium text-gray-900 dark:text-white">Type</label>
            <NativeSelect id="cat-type" className="mt-2 w-56" value={type} onChange={(e) => setType(e.target.value as AssetType)}>
              {TYPE_KEYS.map((t) => <option key={t} value={t}>{ASSET_TYPES[t].name}</option>)}
            </NativeSelect>
          </div>
          <div className="min-w-48 flex-1">
            <label htmlFor="cat-name" className="block text-sm/6 font-medium text-gray-900 dark:text-white">New category</label>
            <input id="cat-name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={error ? true : undefined} className={`${inputClass} mt-2`} />
          </div>
          <Button type="submit" loading={busy} disabled={name.trim().length < 2}>Add</Button>
          {error && <p className="w-full text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}
        </form>
      )}
      <Alert tone="info">Reordering, renaming, hiding, icons and merging tags (blueprint A8) need category update/delete and tag endpoints the API doesn’t have yet.</Alert>
      {q.isPending ? <Loading /> : q.isError ? <Alert tone="error">{errorMessage(q.error)}</Alert> : (
        <ul role="list" className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {TYPE_KEYS.map((t) => {
            const list = q.data.filter((c) => c.type === t);
            return (
              <li key={t} className="col-span-1 rounded-lg bg-white shadow-sm dark:bg-gray-800/50 dark:outline dark:-outline-offset-1 dark:outline-white/10">
                <div className="flex items-start gap-3 p-5">
                  <span aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: ASSET_TYPES[t].color }} />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{ASSET_TYPES[t].name}</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Installs to <code>{ASSET_TYPES[t].dir}/</code> · {ASSET_TYPES[t].target}</p>
                    <ul role="list" className="mt-3 flex flex-wrap gap-1.5">
                      {list.map((c) => <li key={c.id}><Badge tone={c.visible ? 'indigo' : 'gray'}>{c.name}</Badge></li>)}
                      {!list.length && <li className="text-xs text-gray-500">No categories.</li>}
                    </ul>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
