// Browse (mockup "LIBRARY") and Category (mockup "CATEGORY"). Search, type, plan, sort and paging go to GET /assets
// (cursor pages, numbered as you move). Aspect, duration and feature filters have no API parameter yet, so they apply
// to the loaded page and say so.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { publicApi } from '@/services/public';
import { errorMessage } from '@/services/api';
import { TIERS, TYPE_KEYS, type AssetType, type Tier } from '@/core/schema';
import { formatNumber } from '@/core/format';
import { TYPE_DISPLAY } from '@/content/site';
import { msg, t, tn, tx, type MessageKey } from '@/i18n';
import { TileGrid } from '@/components/site/AssetTile';
import { useCounts } from './Home';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { PublicAsset, SortKey } from '@/types/api';
import NotFoundSite from './NotFound';

const SORTS: [SortKey, MessageKey][] = [['popular', msg('Most popular')], ['new', msg('Newest')], ['trending', msg('Trending')], ['az', msg('A–Z')]];
const ASPECTS: [string, MessageKey][] = [['16:9', msg('16:9')], ['9:16', msg('9:16 Reels')], ['1:1', msg('1:1')], ['4:5', msg('4:5')]];
const FEATURES: [string, MessageKey][] = [['transparent', msg('Transparent background')], ['loop', msg('Loopable')], ['scripts', msg('Sinhala / Tamil text')], ['editable_colors', msg('Editable colours')]];
const PAGE = 16;

/** Client-side filters for things the search API can't filter yet (on the loaded page). */
export function localFilter(items: PublicAsset[], f: { aspects: string[]; tiers: string[]; maxSeconds: number | null; features: string[] }): PublicAsset[] {
  return items.filter((a) => {
    if (f.aspects.length && !(a.aspect_ratios ?? []).some((r) => r === 'any' || f.aspects.includes(r))) return false;
    if (f.tiers.length && !f.tiers.includes(a.licence_tier)) return false;
    const ms = Number(a.meta?.duration_ms ?? NaN);
    if (f.maxSeconds != null && Number.isFinite(ms) && ms > f.maxSeconds * 1000) return false;
    for (const feat of f.features) {
      const m = a.meta ?? {};
      const ok = feat === 'transparent' ? !!(m.alpha ?? m.transparent) : feat === 'loop' ? !!(m.loop ?? m.loopable) : feat === 'scripts' ? (Array.isArray(m.scripts) ? (m.scripts as string[]).some((s) => /sinh|taml|si|ta/i.test(s)) : !!m.sinhala || !!m.tamil) : !!(m.editable_colors ?? m.colors_editable);
      if (!ok) return false;
    }
    return true;
  });
}

const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);

export function Browse() {
  useDocumentTitle(`${t('Browse the library')} · FrameFlow`);
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const type = (params.get('type') ?? '') as AssetType | '';
  const sort = (params.get('sort') ?? 'popular') as SortKey;
  const tiers = list(params.get('plan'));
  const aspects = list(params.get('aspect'));
  const features = list(params.get('features'));
  const maxSeconds = params.get('max') ? Number(params.get('max')) : null;
  const collection = params.get('collection');
  const [text, setText] = useState(q);
  const [cursors, setCursors] = useState<string[]>(['']);
  const [page, setPage] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const { total: libraryTotal } = useCounts();

  useEffect(() => setText(q), [q]);
  useEffect(() => {
    if (params.get('focus')) input.current?.focus();
  }, [params]);
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    next.delete('focus');
    for (const [k, v] of Object.entries(patch)) if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
    setCursors(['']);
    setPage(0);
  };
  const toggle = (key: string, values: string[], v: string) => set({ [key]: (values.includes(v) ? values.filter((x) => x !== v) : [...values, v]).join(',') || null });

  const apiTier = tiers.length === 1 ? (tiers[0] as Tier) : '';
  const results = useQuery({
    queryKey: ['public', 'search', { q, type, sort, apiTier, cursor: cursors[page] }],
    queryFn: () => publicApi.search({ q, type, sort, tier: apiTier, cursor: cursors[page] || undefined, limit: PAGE }),
    enabled: !collection,
  });
  const collections = useQuery({ queryKey: ['public', 'collections'], queryFn: publicApi.collections, enabled: !!collection });
  const coll = collections.data?.find((c) => c.slug === collection);
  const raw = useMemo(() => (collection ? coll?.assets ?? [] : results.data?.data ?? []), [collection, coll, results.data]);
  const items = useMemo(() => localFilter(raw, { aspects, tiers: tiers.length > 1 || collection ? tiers : [], maxSeconds, features }), [raw, aspects, tiers, maxSeconds, features, collection]);
  const total = collection ? raw.length : results.data?.total ?? 0;
  const localActive = aspects.length > 0 || features.length > 0 || maxSeconds != null || tiers.length > 1;
  const next = results.data?.next_cursor;
  const goPage = (p: number) => {
    if (p > page && next) setCursors((c) => [...c.slice(0, p), next]);
    setPage(p);
  };

  return (
    <>
      <div className="gut border-b border-black/5">
        <div className="mx-auto max-w-7xl py-12">
          <p className="eyebrow">{t('Library')}</p>
          <h1 className="mt-2 text-4xl font-medium tracking-tight sm:text-5xl">{coll ? coll.title : libraryTotal != null ? t('Browse {n} assets', { n: formatNumber(libraryTotal) }) : t('Browse the library')}</h1>
          <form role="search" className="mt-6 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); set({ q: text.trim() || null }); }}>
            <label htmlFor="q" className="sr-only">{t('Search the library')}</label>
            <input id="q" ref={input} type="search" value={text} onChange={(e) => setText(e.target.value)} className="min-w-[220px] flex-1 rounded-full px-5 py-3 shadow-sm ring-1 ring-black/10" placeholder={t('Search glitch, wedding, Sinhala title, whoosh…')} />
            <button type="submit" className="btn btn-p">{t('Search')}</button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2 text-sm" role="group" aria-label={t('Type')}>
            <button type="button" aria-pressed={!type} onClick={() => set({ type: null })} className={clsx('btn !py-1', !type ? 'btn-p' : 'btn-s')}>{t('All')}</button>
            {TYPE_KEYS.map((k) => (
              <button key={k} type="button" aria-pressed={type === k} onClick={() => set({ type: k })} className={clsx('btn !py-1', type === k ? 'btn-p' : 'btn-s')}>{tx(TYPE_DISPLAY[k].label)}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="gut">
        <div className="mx-auto grid max-w-7xl gap-8 py-8 lg:grid-cols-[230px_1fr]">
          <details className="text-sm lg:hidden"><summary className="btn btn-o">{t('Filters')}</summary><Filters {...{ aspects, tiers, features, maxSeconds, toggle, set }} /></details>
          <aside aria-label={t('Filters')} className="text-sm max-lg:hidden"><Filters {...{ aspects, tiers, features, maxSeconds, toggle, set }} /></aside>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-gray-500" role="status" aria-live="polite">
                {results.isPending && !collection ? t('Loading…') : localActive ? t('{shown} of {n} results on this page match the extra filters', { shown: items.length, n: formatNumber(total) }) : tn('{n} result', '{n} results', total)}
              </span>
              <label className="flex items-center gap-2"><span className="sr-only">{t('Sort')}</span>
                <select aria-label={t('Sort')} value={sort} onChange={(e) => set({ sort: e.target.value === 'popular' ? null : e.target.value })} className="rounded-full px-3 py-1.5 ring-1 ring-black/10">
                  {SORTS.map(([k, n]) => <option key={k} value={k}>{t(n)}</option>)}
                </select>
              </label>
            </div>
            <TileGrid assets={items} loading={collection ? collections.isPending : results.isPending} error={results.isError ? t('Couldn’t load the library: {error}', { error: errorMessage(results.error) }) : null} count={PAGE} className="grid-cols-2 md:grid-cols-3 xl:grid-cols-4" empty={t('No assets match. Try another search or clear the filters.')} />
            {!collection && (page > 0 || next) && (
              <nav aria-label={t('Pages')} className="mt-10 flex justify-center gap-1 text-sm">
                <button type="button" className="btn btn-o" disabled={page === 0} onClick={() => goPage(page - 1)}>← {t('Prev')}</button>
                {Array.from({ length: page + 1 }, (_, i) => (
                  <button key={i} type="button" aria-current={i === page ? 'page' : undefined} className={clsx('btn', i === page ? 'btn-p !py-1' : 'btn-o')} onClick={() => goPage(i)}>{i + 1}</button>
                ))}
                {next && <button type="button" className="btn btn-o" onClick={() => goPage(page + 1)}>{page + 2}</button>}
                <button type="button" className="btn btn-o" disabled={!next} onClick={() => goPage(page + 1)}>{t('Next')} →</button>
              </nav>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Filters({ aspects, tiers, features, maxSeconds, toggle, set }: { aspects: string[]; tiers: string[]; features: string[]; maxSeconds: number | null; toggle: (k: string, v: string[], x: string) => void; set: (p: Record<string, string | null>) => void }) {
  return (
    <div className="mt-3 space-y-6 lg:mt-0">
      <fieldset><legend className="eyebrow">{t('Aspect')}</legend><div className="mt-2 space-y-1">{ASPECTS.map(([v, n]) => <label key={v} className="flex gap-2"><input type="checkbox" checked={aspects.includes(v)} onChange={() => toggle('aspect', aspects, v)} />{t(n)}</label>)}</div></fieldset>
      <fieldset><legend className="eyebrow">{t('Plan')}</legend><div className="mt-2 space-y-1">{TIERS.map((v) => <label key={v} className="flex gap-2"><input type="checkbox" checked={tiers.includes(v)} onChange={() => toggle('plan', tiers, v)} />{v === 'free' ? t('Free') : tx(v)}</label>)}</div></fieldset>
      <div><label htmlFor="max-dur" className="eyebrow block">{t('Duration')}</label><input id="max-dur" type="range" min={1} max={60} value={maxSeconds ?? 60} onChange={(e) => set({ max: Number(e.target.value) >= 60 ? null : e.target.value })} className="mt-2 w-full" /><p className="text-xs text-gray-500">{maxSeconds == null ? t('Any length') : t('Up to {n} s', { n: maxSeconds })}</p></div>
      <fieldset><legend className="eyebrow">{t('Features')}</legend><div className="mt-2 space-y-1">{FEATURES.map(([v, n]) => <label key={v} className="flex gap-2"><input type="checkbox" checked={features.includes(v)} onChange={() => toggle('features', features, v)} />{t(n)}</label>)}</div></fieldset>
      <p className="text-xs text-gray-400">{t('Aspect, duration and feature filters apply to the results on this page.')}</p>
    </div>
  );
}

export function Category() {
  const { type = '' } = useParams();
  const known = (TYPE_KEYS as string[]).includes(type);
  const k = type as AssetType;
  const [cat, setCat] = useState('');
  const { counts } = useCounts();
  useDocumentTitle(known ? `${tx(TYPE_DISPLAY[k].label)} · FrameFlow` : 'FrameFlow');
  const cats = useQuery({ queryKey: ['public', 'categories', type], queryFn: () => publicApi.categories(k), enabled: known });
  const all = useQuery({ queryKey: ['public', 'search', { type, cat }], queryFn: () => publicApi.search({ type: k, category: cat || undefined, limit: 8 }), enabled: known });
  const collections = useQuery({ queryKey: ['public', 'collections'], queryFn: publicApi.collections, enabled: known });
  if (!known) return <NotFoundSite />;
  const rail = (collections.data ?? []).map((c) => ({ ...c, assets: c.assets.filter((a) => a.type === k) })).find((c) => c.assets.length > 0);
  return (
    <>
      <div className="gut">
        <div className="mx-auto max-w-7xl pt-6">
          <div className="grad-soft rounded-4xl p-10 ring-1 ring-black/5 sm:p-14">
            <p className="eyebrow">{counts ? t('Category · {n} assets', { n: formatNumber(counts[k] ?? 0) }) : t('Category')}</p>
            <h1 className="mt-2 text-4xl font-medium tracking-tight sm:text-6xl">{tx(TYPE_DISPLAY[k].label)}</h1>
            <p className="mt-4 max-w-xl text-gray-700">{tx(TYPE_DISPLAY[k].blurb)}</p>
            <div className="mt-6 flex flex-wrap gap-2 text-sm" role="group" aria-label={t('Category')}>
              <button type="button" aria-pressed={!cat} onClick={() => setCat('')} className={clsx('btn !py-1', !cat ? 'btn-p' : 'btn-s')}>{t('All')}</button>
              {(cats.data ?? []).filter((c) => c.visible !== false).map((c) => (
                <button key={c.id} type="button" aria-pressed={cat === c.slug} onClick={() => setCat(c.slug)} className={clsx('btn !py-1', cat === c.slug ? 'btn-p' : 'btn-s')}>{c.name}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="gut">
        <div className="mx-auto max-w-7xl py-12">
          {rail && (
            <section className="mb-14">
              <h2 className="text-2xl font-medium">{t('Collection: {name}', { name: rail.title })}</h2>
              <TileGrid assets={rail.assets} count={4} />
            </section>
          )}
          <h2 className="text-2xl font-medium">{t('All {type}', { type: tx(TYPE_DISPLAY[k].label) })}</h2>
          <TileGrid assets={all.data?.data} loading={all.isPending} error={all.isError ? errorMessage(all.error) : null} />
          <p className="mt-8 text-center"><Link to={`/library?type=${k}`} className="btn btn-o">{t('View all')} →</Link></p>
        </div>
      </div>
    </>
  );
}
