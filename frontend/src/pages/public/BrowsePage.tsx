// Browse library. Tailwind Plus Radiant: GradientBackground + Navbar page top (pricing page pattern), Heading/Lead,
// Button (outline), login-page input styling for filters; Headless UI Combobox for typeahead (Radiant ships @headlessui).
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react';
import { MagnifyingGlassIcon } from '@heroicons/react/16/solid';
import { clsx } from 'clsx';
import { publicApi } from '@/services/public';
import { errorMessage } from '@/services/api';
import { TIERS, TYPE_KEYS, typeName, type AssetType, type Tier } from '@/core/schema';
import { AssetCard } from '@/components/radiant/asset-card';
import { Button } from '@/components/radiant/button';
import { Container } from '@/components/radiant/container';
import { GradientBackground } from '@/components/radiant/gradient';
import { Navbar } from '@/components/radiant/navbar';
import { Heading, Lead } from '@/components/radiant/text';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { SortKey } from '@/types/api';

export const fieldClass = clsx(
  'block w-full rounded-lg border border-transparent bg-white shadow-sm ring-1 ring-black/10',
  'px-[calc(--spacing(2)-1px)] py-[calc(--spacing(1.5)-1px)] text-base/6 sm:text-sm/6',
  'focus:outline-2 focus:-outline-offset-1 focus:outline-black',
);

const SORTS: [SortKey, string][] = [
  ['popular', 'Most popular'],
  ['new', 'Newest'],
  ['trending', 'Trending'],
  ['az', 'A–Z'],
];

function useDebounced<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function SearchBox({ initial, onSearch }: { initial: string; onSearch: (q: string) => void }) {
  const navigate = useNavigate();
  const [text, setText] = useState(initial);
  const debounced = useDebounced(text.trim());
  const suggest = useQuery({ queryKey: ['public', 'suggest', debounced], queryFn: () => publicApi.suggest(debounced), enabled: debounced.length >= 2, staleTime: 60_000 });
  useEffect(() => setText(initial), [initial]);
  return (
    <form role="search" onSubmit={(e) => { e.preventDefault(); onSearch(text.trim()); }} className="relative">
      <Combobox
        value={null}
        onChange={(item: { id: string; title: string } | null) => {
          if (item) navigate(`/library/${item.id}`);
        }}
      >
        <label htmlFor="library-search" className="sr-only">Search the library</label>
        <div className="relative">
          <MagnifyingGlassIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 fill-gray-500" />
          <ComboboxInput id="library-search" type="search" placeholder="Search titles, tags, Sinhala or Tamil keywords…" className={clsx(fieldClass, 'pl-9')} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        {debounced.length >= 2 && (suggest.data?.length ?? 0) > 0 && (
          <ComboboxOptions anchor="bottom start" className="z-20 w-(--input-width) rounded-xl bg-white p-1 shadow-lg ring-1 ring-black/10 [--anchor-gap:6px] empty:invisible">
            {suggest.data!.map((s) => (
              <ComboboxOption key={s.id} value={s} className="flex cursor-default items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm/6 data-focus:bg-gray-100">
                <span className="truncate font-medium text-gray-950">{s.title}</span>
                <span className="font-mono text-xs/5 tracking-widest text-gray-500 uppercase">{typeName(s.type)}</span>
              </ComboboxOption>
            ))}
          </ComboboxOptions>
        )}
      </Combobox>
    </form>
  );
}

export function BrowsePage() {
  useDocumentTitle('Browse the library · FrameFlow');
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const type = (params.get('type') ?? '') as AssetType | '';
  const category = params.get('category') ?? '';
  const tier = (params.get('tier') ?? '') as Tier | '';
  const sort = (params.get('sort') ?? 'popular') as SortKey;

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v && !(k === 'sort' && v === 'popular')) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  const categories = useQuery({ queryKey: ['public', 'categories', type], queryFn: () => publicApi.categories(type), enabled: !!type });
  const results = useInfiniteQuery({
    queryKey: ['public', 'search', { q, type, category, tier, sort }],
    queryFn: ({ pageParam }) => publicApi.search({ q, type, category, tier, sort, cursor: pageParam || undefined }),
    initialPageParam: '',
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
  const items = results.data?.pages.flatMap((p) => p.data) ?? [];
  const total = results.data?.pages[0]?.total ?? 0;

  return (
    <main>
      <GradientBackground />
      <Container>
        <Navbar />
      </Container>
      <Container className="mt-16">
        <Heading as="h1">Browse the library.</Heading>
        <Lead className="mt-6 max-w-3xl">Find a look, a sound or a title and add it to FrameFlow in one click.</Lead>
      </Container>
      <Container className="mt-12 pb-24">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="sm:col-span-2 lg:col-span-2">
            <SearchBox initial={q} onSearch={(v) => set({ q: v })} />
          </div>
          <select aria-label="Type" className={fieldClass} value={type} onChange={(e) => set({ type: e.target.value, category: '' })}>
            <option value="">All types</option>
            {TYPE_KEYS.map((t) => <option key={t} value={t}>{typeName(t)}</option>)}
          </select>
          <select aria-label="Category" className={fieldClass} value={category} disabled={!type} onChange={(e) => set({ category: e.target.value })}>
            <option value="">{type ? 'All categories' : 'Pick a type first'}</option>
            {(categories.data ?? []).map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
          </select>
          <select aria-label="Plan" className={fieldClass} value={tier} onChange={(e) => set({ tier: e.target.value })}>
            <option value="">Any plan</option>
            {TIERS.map((t) => <option key={t} value={t}>{t === 'free' ? 'Free' : t[0].toUpperCase() + t.slice(1)}</option>)}
          </select>
          <select aria-label="Sort" className={fieldClass} value={sort} onChange={(e) => set({ sort: e.target.value })}>
            {SORTS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </div>

        <p className="mt-8 text-sm/6 text-gray-600" role="status" aria-live="polite">
          {results.isPending ? 'Loading…' : results.isError ? `Couldn’t load the library: ${errorMessage(results.error)}` : `${total.toLocaleString()} asset${total === 1 ? '' : 's'}${q ? ` for “${q}”` : ''}`}
        </p>

        {items.length > 0 && (
          <ul role="list" className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((a) => (
              <li key={a.id} className="flex">
                <AssetCard asset={a} />
              </li>
            ))}
          </ul>
        )}
        {!results.isPending && !results.isError && !items.length && (
          <div className="mt-6 rounded-3xl bg-gray-50 p-10 text-center ring-1 ring-black/5">
            <p className="text-base/6 font-medium text-gray-950">No assets match.</p>
            <p className="mt-2 text-sm/6 text-gray-600">Try another search or clear the filters.</p>
            <div className="mt-6"><Button variant="outline" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Clear filters</Button></div>
          </div>
        )}
        {results.hasNextPage && (
          <div className="mt-10 text-center">
            <Button variant="outline" disabled={results.isFetchingNextPage} onClick={() => void results.fetchNextPage()}>
              {results.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        )}
      </Container>
    </main>
  );
}
