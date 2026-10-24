// A3 Upload Center. Tailwind Plus: forms/form-layouts (01 stacked: file drop zone), lists/stacked-lists,
// navigation/progress-bars, layout/cards, forms/checkboxes, feedback/alerts (02 with list).
import { useId, useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CloudArrowUpIcon, DocumentIcon } from '@heroicons/react/24/outline';
import { adminApi, type BatchDefaults } from '@/services/admin';
import { errorMessage } from '@/services/api';
import { uploadSession } from '@/services/uploadSession';
import { PageHeading, Card } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Checkbox, NativeSelect, SelectField, TextField } from '@/components/ui/Form';
import { useNotify } from '@/components/ui/Notifications';
import { checkProblem, checksPassed } from '@/components/Checks';
import { ASSET_TYPES, SEMVER, TIERS, TYPE_KEYS, VISIBILITIES, typeName, type AssetType, type Tier, type Visibility } from '@/core/schema';
import { classNames, formatBytes } from '@/core/format';
import type { CreateItemResult, Upload } from '@/types/api';

interface Row {
  key: string;
  file: File;
  upload: Upload | null;
  type: AssetType | null;
  error: string | null;
  busy: boolean;
}

const ACCEPT = [...new Set(TYPE_KEYS.flatMap((t) => ASSET_TYPES[t].ext))].map((e) => `.${e}`).join(',');

export function rowState(r: Row): 'uploading' | 'error' | 'blocked' | 'needs-type' | 'valid' {
  if (r.busy) return 'uploading';
  if (r.error) return 'error';
  if (!r.upload) return 'uploading';
  if (!r.type) return 'needs-type';
  return checksPassed(r.upload.checks) ? 'valid' : 'blocked';
}

export function UploadCenter() {
  const qc = useQueryClient();
  const { notify, fail } = useNotify();
  const inputId = useId();
  const seq = useRef(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [dragging, setDragging] = useState(false);
  const [defaults, setDefaults] = useState<{ tags: string; licence_tier: Tier; min_app_version: string; visibility: Visibility; category_id: string; submit_for_review: boolean }>({ tags: '', licence_tier: 'free', min_app_version: '1.0.0', visibility: 'public', category_id: '', submit_for_review: true });
  const [creating, setCreating] = useState(false);
  const [results, setResults] = useState<CreateItemResult[] | null>(null);
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => adminApi.categories() });

  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  async function send(row: Row, type: AssetType | null = null) {
    patch(row.key, { busy: true, error: null, ...(type ? { type } : {}) });
    try {
      const up = await adminApi.upload(row.file, type);
      patch(row.key, { busy: false, upload: up, type: up.type });
      uploadSession.record({ key: row.key, name: row.file.name, size: row.file.size, upload: up, error: null, at: new Date().toISOString() });
    } catch (e) {
      const msg = errorMessage(e);
      patch(row.key, { busy: false, error: msg });
      uploadSession.record({ key: row.key, name: row.file.name, size: row.file.size, upload: null, error: msg, at: new Date().toISOString() });
    }
  }

  function add(files: FileList | File[] | null) {
    if (!files) return;
    const fresh: Row[] = [...files].map((file) => ({ key: `u${++seq.current}-${file.name}`, file, upload: null, type: null, error: null, busy: true }));
    setRows((rs) => [...rs, ...fresh]);
    setResults(null);
    for (const r of fresh) void send(r);
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    add(e.dataTransfer.files);
  };

  const ready = rows.filter((r) => rowState(r) === 'valid');
  const skipped = rows.length - ready.length;
  const readyTypes = new Set(ready.map((r) => r.type));
  const singleType = readyTypes.size === 1 ? [...readyTypes][0] : null;
  const catOptions = (categories.data ?? []).filter((c) => c.type === singleType);
  const versionOk = SEMVER.test(defaults.min_app_version);

  async function createDrafts() {
    setCreating(true);
    try {
      const d: BatchDefaults = { tags: defaults.tags, licence_tier: defaults.licence_tier, min_app_version: defaults.min_app_version, visibility: defaults.visibility, submit_for_review: defaults.submit_for_review };
      if (singleType && defaults.category_id) d.category_id = defaults.category_id;
      const { data } = await adminApi.createDrafts(d, ready.map((r) => ({ upload_id: r.upload!.id, type: r.type! })));
      setResults(data);
      const bad = data.filter((x) => !x.ok);
      if (bad.length) fail(`${data.length - bad.length} drafts created; ${bad.length} failed`, bad[0].error?.message);
      else notify(`${data.length} draft${data.length === 1 ? '' : 's'} created`);
      // Results come back in item order.
      const createdUploads = new Set(ready.filter((_r, i) => data[i]?.ok).map((r) => r.key));
      setRows((rs) => rs.filter((r) => !createdUploads.has(r.key)));
      void qc.invalidateQueries({ queryKey: ['assets'] });
      void qc.invalidateQueries({ queryKey: ['audit'] });
      void qc.invalidateQueries({ queryKey: ['overview'] });
    } catch (e) {
      fail('Couldn’t create drafts', errorMessage(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeading title="Upload Center" meta="Drop files, check them, then create drafts in one go." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            data-testid="dropzone"
            className={classNames('flex justify-center rounded-lg border border-dashed px-6 py-10 transition-colors', dragging ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10' : 'border-gray-900/25 bg-white dark:border-white/25 dark:bg-gray-800/40')}
          >
            <div className="text-center">
              <CloudArrowUpIcon aria-hidden="true" className="mx-auto size-12 text-gray-300 dark:text-gray-600" />
              <div className="mt-4 flex flex-wrap justify-center text-sm/6 text-gray-600 dark:text-gray-400">
                <label htmlFor={inputId} className="relative cursor-pointer rounded-md bg-transparent font-semibold text-indigo-600 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
                  <span>Choose files</span>
                  <input id={inputId} type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
                </label>
                <p className="pl-1">or drag and drop</p>
              </div>
              <p className="text-xs/5 text-gray-600 dark:text-gray-400">PNG, SVG, WebP, WAV, MP3, .cube, TTF/OTF/WOFF2, GIF, Lottie JSON, .fftext, .fftemplate, .ffx, .ffbrand</p>
            </div>
          </div>

          {rows.length > 0 && (
            <ul role="list" aria-label="Files" className="divide-y divide-gray-100 overflow-hidden rounded-lg bg-white shadow-sm outline-1 outline-black/5 dark:divide-white/5 dark:bg-gray-800/50 dark:outline-white/10">
              {rows.map((r) => {
                const st = rowState(r);
                const failed = r.upload?.checks.filter((c) => !c.passed) ?? [];
                return (
                  <li key={r.key} data-state={st} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                    <DocumentIcon aria-hidden="true" className="size-6 shrink-0 text-gray-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{r.file.name}</p>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-white/10" aria-hidden="true">
                        <div className={classNames('h-full rounded-full transition-all', st === 'uploading' ? 'w-1/3 animate-pulse bg-indigo-500' : st === 'valid' ? 'w-full bg-green-500' : st === 'needs-type' ? 'w-full bg-amber-400' : 'w-full bg-red-500')} />
                      </div>
                      <p className="mt-1 text-xs" role="status">
                        {st === 'uploading' && <span className="text-gray-500">Uploading and checking…</span>}
                        {st === 'error' && <span className="text-red-600 dark:text-red-400">{r.error}</span>}
                        {st === 'needs-type' && <span className="text-amber-700 dark:text-amber-400">Pick a type for this file.</span>}
                        {st === 'blocked' && <span className="text-red-600 dark:text-red-400">Blocked · {checkProblem(failed[0])}</span>}
                        {st === 'valid' && <span className="text-green-700 dark:text-green-400">Valid{r.upload?.duplicate_of ? ' · duplicate of an existing asset' : ''}</span>}
                      </p>
                    </div>
                    <span className="text-xs text-gray-500 tabular-nums dark:text-gray-400">{formatBytes(r.file.size)}</span>
                    <NativeSelect aria-label={`Type for ${r.file.name}`} value={r.type ?? ''} disabled={r.busy} onChange={(e) => void send(r, (e.target.value || null) as AssetType | null)} className="w-40">
                      <option value="">Type…</option>
                      {TYPE_KEYS.map((t) => <option key={t} value={t}>{typeName(t)}</option>)}
                    </NativeSelect>
                    <Button size="sm" variant="link" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>Remove<span className="sr-only"> {r.file.name}</span></Button>
                  </li>
                );
              })}
            </ul>
          )}

          {results && (
            <Alert tone={results.every((x) => x.ok) ? 'success' : 'warn'} title={`${results.filter((x) => x.ok).length} of ${results.length} drafts created`}
              items={results.map((x, i) => x.ok && x.asset ? <span key={i}><Link className="font-medium underline" to={`/admin/assets/${x.asset.id}`}>{x.asset.title}</Link> · {x.asset.status.replace(/_/g, ' ')}</span> : <span key={i}>Failed: {x.error?.message}</span>)}
            >
              <Link to="/admin/assets" className="font-medium underline">Go to the Asset Library</Link>
            </Alert>
          )}
        </div>

        <Card title="Defaults for this batch" className="self-start">
          <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); void createDrafts(); }}>
            <TextField label="Tags" hint="Comma separated" placeholder="wedding, cinematic" value={defaults.tags} onChange={(e) => setDefaults({ ...defaults, tags: e.target.value })} />
            <SelectField label="Category" value={defaults.category_id} disabled={!singleType} onChange={(e) => setDefaults({ ...defaults, category_id: e.target.value })} options={[['', singleType ? 'First category for the type' : 'Per type (mixed batch)'], ...catOptions.map((c): [string, string] => [c.id, c.name])]} hint={singleType ? undefined : 'Categories are per type; pick one when every file has the same type.'} />
            <SelectField label="Licence tier" value={defaults.licence_tier} onChange={(e) => setDefaults({ ...defaults, licence_tier: e.target.value as Tier })} options={TIERS.map((t) => [t, t])} />
            <SelectField label="Visibility" value={defaults.visibility} onChange={(e) => setDefaults({ ...defaults, visibility: e.target.value as Visibility })} options={VISIBILITIES.map((t) => [t, t])} />
            <TextField label="Min FrameFlow version" value={defaults.min_app_version} error={versionOk ? undefined : 'Use semver, e.g. 1.0.0'} onChange={(e) => setDefaults({ ...defaults, min_app_version: e.target.value })} />
            <Checkbox label="Submit for review" description="Drafts go straight to the Review Queue." checked={defaults.submit_for_review} onChange={(e) => setDefaults({ ...defaults, submit_for_review: e.target.checked })} />
            <Button type="submit" className="w-full" disabled={!ready.length || !versionOk} loading={creating}>
              Create {ready.length} draft{ready.length === 1 ? '' : 's'}
            </Button>
            {skipped > 0 && <p className="text-xs text-gray-500 dark:text-gray-400">{skipped} file{skipped === 1 ? ' is' : 's are'} uploading, blocked or need a type and will be skipped.</p>}
          </form>
        </Card>
      </div>
    </div>
  );
}
