// Asset detail (mockup "ASSET DETAIL"): gallery from the generated previews, about, adjustable settings from
// meta.params, version history, sticky side card (type + plan badges, Open in FrameFlow & add, Download, Favorite,
// details), tags, More like this. All from GET /assets/:slug.
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { publicApi } from '@/services/public';
import { ApiError, errorMessage } from '@/services/api';
import { mediaUrl } from '@/core/config';
import { formatBytes, formatNumber } from '@/core/format';
import { label } from '@/core/schema';
import { PreviewGallery, orderedKinds } from '@/components/Previews';
import { FavoriteButton } from '@/components/radiant/favorite-button';
import { Thumb, TileGrid, typeLabel } from '@/components/site/AssetTile';
import { t, tr, tx } from '@/i18n';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { PublicAssetDetail } from '@/types/api';
import NotFoundSite from './NotFound';

export interface Param { name: string; range: string; default: string }

/** meta.params → rows. Accepts [{ name|label, min, max, options[], default, unit }] or { key: { … } }. */
export function paramsTable(meta: Record<string, unknown> | undefined): Param[] {
  const p = meta?.params;
  const entries: [string, Record<string, unknown>][] = Array.isArray(p)
    ? (p as Record<string, unknown>[]).map((x) => [String(x.label ?? x.name ?? ''), x])
    : p && typeof p === 'object'
      ? Object.entries(p as Record<string, Record<string, unknown>>)
      : [];
  return entries
    .filter(([n]) => n)
    .map(([name, x]) => {
      const unit = x.unit ? ` ${x.unit}` : '';
      const range = Array.isArray(x.options) ? (x.options as unknown[]).join(', ') : typeof x.type === 'string' && x.type === 'bool' ? t('On / off') : x.min != null || x.max != null ? `${x.min ?? ''}–${x.max ?? ''}${unit}` : String(x.range ?? '—');
      const def = typeof x.default === 'boolean' ? (x.default ? t('On') : t('Off')) : x.default != null ? `${x.default}${unit}` : '—';
      return { name: name.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()), range, default: def };
    });
}

function OpenPanel({ a }: { a: PublicAssetDetail }) {
  const [copied, setCopied] = useState(false);
  return (
    <div id="open-steps" className="mt-3 rounded-2xl bg-gray-50 p-4 text-sm ring-1 ring-black/5">
      <ol className="list-decimal space-y-1 pl-5 text-gray-700">
        <li>{tr('Open FrameFlow and go to {library}.', { library: <b>{t('Library')}</b> })}</li>
        <li>{t('Search for “{title}”, or paste its pack id.', { title: a.title })}</li>
        <li>{t('Click Add; it lands in the right panel.')}</li>
      </ol>
      <div className="mt-3 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-2 py-1 text-xs ring-1 ring-black/5">{a.pack_id}</code>
        <button type="button" className="btn btn-o" onClick={() => void navigator.clipboard?.writeText(a.pack_id).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>{copied ? t('Copied') : t('Copy id')}</button>
      </div>
      <p className="mt-2 text-xs text-gray-500">{t('Don’t have FrameFlow yet?')} <Link to="/download" className="underline">{t('Download FrameFlow')}</Link></p>
    </div>
  );
}

export function AssetDetail() {
  const { slug = '' } = useParams();
  const q = useQuery({ queryKey: ['public', 'asset', slug], queryFn: () => publicApi.asset(slug), retry: false });
  const [open, setOpen] = useState(false);
  const [shot, setShot] = useState(0);
  useDocumentTitle(q.data ? `${q.data.title} · FrameFlow` : `${t('Asset')} · FrameFlow`);
  const more = useQuery({ queryKey: ['public', 'search', { type: q.data?.type, more: slug }], queryFn: () => publicApi.search({ type: q.data!.type, limit: 5 }), enabled: !!q.data });

  if (q.isPending) return <div className="gut"><p role="status" className="mx-auto max-w-7xl py-16 text-sm text-gray-600">{t('Loading…')}</p></div>;
  if (q.isError) {
    if (q.error instanceof ApiError && q.error.status === 404) return <NotFoundSite />;
    return <div className="gut"><div className="mx-auto max-w-7xl py-16"><h1 className="text-4xl font-medium">{t('Something went wrong.')}</h1><p role="alert" className="mt-4 text-gray-600">{errorMessage(q.error)}</p><Link to="/library" className="btn btn-p mt-8">{t('Back to the library')}</Link></div></div>;
  }
  const a = q.data;
  const images = Object.entries(a.preview ?? {}).filter(([k, u]) => /\.(webp|png|jpe?g|gif)$/i.test(u) && k !== 'waveform');
  const media = a.preview ? Object.fromEntries(Object.entries(a.preview).filter(([k]) => k !== 'thumbnail')) : {};
  const params = paramsTable(a.meta);
  const ms = Number(a.meta?.duration_ms ?? NaN);
  const w = Number(a.meta?.width ?? NaN);
  const h = Number(a.meta?.height ?? NaN);
  const big = images[shot]?.[1];

  return (
    <div className="gut">
      <div className="mx-auto max-w-7xl py-10">
        <nav aria-label={t('Breadcrumb')} className="text-sm text-gray-500">
          <Link to="/library">{t('Library')}</Link> / <Link to={`/library/category/${a.type}`}>{typeLabel(a.type)}</Link> / <span aria-current="page">{a.title}</span>
        </nav>
        <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0">
            <div className="card p-2">
              {big ? (
                <img src={mediaUrl(big)!} alt={`${a.title}`} className="aspect-video w-full rounded-[1.6rem] object-cover" />
              ) : (
                <Thumb asset={a} className="aspect-video rounded-[1.6rem]" />
              )}
            </div>
            {images.length > 1 && (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {images.slice(0, 8).map(([k, u], i) => (
                  <button key={k} type="button" onClick={() => setShot(i)} aria-label={t('Show image {n}', { n: i + 1 })} aria-pressed={i === shot} className={clsx('aspect-video overflow-hidden rounded-xl', i === shot && 'ring-2 ring-gray-950')}>
                    <img src={mediaUrl(u)!} alt="" className="size-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            {orderedKinds(media).some((k) => !/\.(webp|png|jpe?g|gif)$/i.test(media[k])) && (
              <div className="mt-6"><PreviewGallery previews={Object.fromEntries(Object.entries(media).filter(([, u]) => !/\.(webp|png|jpe?g|gif)$/i.test(u)))} title={a.title} tileClassName="rounded-2xl ring-1 ring-black/10" captionClassName="mt-2 eyebrow" /></div>
            )}
            {a.description && (<><h2 className="mt-10 text-xl font-medium">{t('About this asset')}</h2><p className="mt-2 max-w-2xl text-gray-700">{a.description}</p></>)}
            {params.length > 0 && (
              <>
                <h2 className="mt-8 text-xl font-medium">{t('Adjustable settings')}</h2>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-gray-500"><tr><th scope="col" className="py-2">{t('Setting')}</th><th scope="col">{t('Range')}</th><th scope="col">{t('Default')}</th></tr></thead>
                    <tbody className="divide-y divide-black/10">{params.map((p) => <tr key={p.name}><td className="py-2">{p.name}</td><td>{p.range}</td><td>{p.default}</td></tr>)}</tbody>
                  </table>
                </div>
              </>
            )}
            <h2 className="mt-8 text-xl font-medium">{t('Version history')}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {a.versions.slice().reverse().map((v) => (
                <li key={v.version}><b className="font-mono">{v.version}</b>{v.version === a.current_version && <> · {t('current')}</>}{v.is_breaking && <> · {t('breaking')}</>}{v.changelog && <> · {v.changelog}</>}</li>
              ))}
            </ul>
          </div>
          <aside aria-label={t('Get this asset')} className="space-y-4 self-start lg:sticky lg:top-24">
            <div className="card p-6">
              <div className="flex gap-2 text-xs"><span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-fuchsia-800">{typeLabel(a.type)}</span><span className={clsx('rounded-full px-2 py-0.5 capitalize', a.licence_tier === 'free' ? 'bg-gray-100 text-gray-700' : 'bg-gray-950 text-white')}>{a.licence_tier === 'free' ? t('Free') : tx(a.licence_tier)}</span></div>
              <h1 className="mt-3 text-2xl font-medium">{a.title}</h1>
              <p className="text-sm text-gray-500">{a.author ? `${t('by {who}', { who: a.author })} · ` : ''}{t('{n} downloads', { n: formatNumber(a.stats.downloads) })}</p>
              <button type="button" className="btn btn-p mt-5 w-full !py-3" aria-expanded={open} aria-controls="open-steps" onClick={() => setOpen((o) => !o)}>{t('Open in FrameFlow & add')}</button>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" className="btn btn-o justify-center" aria-expanded={open} aria-controls="open-steps" onClick={() => setOpen(true)}>{t('Download')}</button>
                <FavoriteButton asset={a} withLabel className="!rounded-[.6rem] !px-2 !py-1 !text-sm !shadow-none !ring-black/10" />
              </div>
              {open ? <OpenPanel a={a} /> : <p className="mt-3 text-xs text-gray-500">{a.entitlement.can_download ? t('Included with your plan.') : a.licence_tier === 'free' ? t('Free for everyone with FrameFlow.') : t('Needs FrameFlow {plan} or above.', { plan: tx(a.licence_tier) })}</p>}
              <dl className="mt-5 grid grid-cols-2 gap-y-2 border-t border-black/10 pt-4 text-sm">
                <dt className="text-gray-500">{t('Version')}</dt><dd className="font-mono">{a.current_version ?? '—'}</dd>
                <dt className="text-gray-500">{t('Size')}</dt><dd>{formatBytes(a.file_size_bytes)}</dd>
                {Number.isFinite(ms) && <><dt className="text-gray-500">{t('Duration')}</dt><dd>{(ms / 1000).toFixed(1)} s</dd></>}
                {Number.isFinite(w) && Number.isFinite(h) && <><dt className="text-gray-500">{t('Resolution')}</dt><dd>{w}×{h}</dd></>}
                {a.aspect_ratios?.length > 0 && <><dt className="text-gray-500">{t('Aspect ratios')}</dt><dd>{a.aspect_ratios.join(', ')}</dd></>}
                <dt className="text-gray-500">{t('Requires')}</dt><dd>FrameFlow {a.min_app_version}+</dd>
                <dt className="text-gray-500">{t('Licence')}</dt><dd>{label(a.licence_terms)}</dd>
              </dl>
              {a.attribution_required && <p className="mt-3 text-xs text-gray-500">{t('attribution required: “{text}”', { text: a.attribution_text })}</p>}
            </div>
            {a.tags.length > 0 && (
              <div className="card p-6 text-sm"><p className="eyebrow">{t('Tags')}</p><ul role="list" className="mt-2 flex flex-wrap gap-1">{a.tags.map((tag) => <li key={tag}><Link to={`/library?q=${encodeURIComponent(tag)}`} className="rounded-full px-2 py-0.5 ring-1 ring-black/10 hover:bg-gray-50">{tag}</Link></li>)}</ul></div>
            )}
            {a.dependencies.length > 0 && (
              <div className="card p-6 text-sm"><p className="eyebrow">{t('Needs')}</p><ul className="mt-2 space-y-1">{a.dependencies.map((d) => <li key={d.asset_id}>{d.asset ? <Link to={`/library/${d.asset.slug}`} className="underline">{d.asset.title}</Link> : t('An asset that isn’t published')}</li>)}</ul></div>
            )}
          </aside>
        </div>
        <h2 className="mt-16 text-2xl font-medium">{t('More like this')}</h2>
        <TileGrid assets={more.data?.data.filter((x) => x.id !== a.id)} loading={more.isPending} count={4} />
      </div>
    </div>
  );
}
