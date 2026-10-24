// Home (mockup "HOME"): gradient hero with live asset counts, editor preview, download card, type cards,
// how-it-works bento, trending rail, quotes. Counts, trending assets and the editor preview come from the API.
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { publicApi } from '@/services/public';
import { errorMessage } from '@/services/api';
import { TYPE_KEYS } from '@/core/schema';
import { formatDate, formatNumber } from '@/core/format';
import { APP_RELEASE, DOWNLOADS, QUOTES, TYPE_DISPLAY } from '@/content/site';
import { t, tx } from '@/i18n';
import { TileGrid } from '@/components/site/AssetTile';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export function DownloadButtons({ variant = 'stack' }: { variant?: 'stack' | 'home' }) {
  return (
    <>
      {DOWNLOADS.map((d, i) => (
        <a key={d.os} href={d.href} className={`${i ? 'btn btn-o' : 'btn btn-p'} w-full !justify-between !rounded-2xl !px-5 ${variant === 'home' ? '!py-3' : '!py-4'}`}>
          {variant === 'home' ? (
            <span className="text-left"><span className="block text-xs opacity-70">{t('Download for')}</span><span className="font-medium">{d.name}</span></span>
          ) : (
            <span className="font-medium">{t('Download for {os}', { os: d.name })}</span>
          )}
          <span className="text-right text-[11px] opacity-70">{tx(d.detail)}</span>
        </a>
      ))}
    </>
  );
}

function useCounts() {
  const q = useQuery({ queryKey: ['public', 'types'], queryFn: publicApi.types });
  const counts = q.data ? Object.fromEntries(q.data.map((x) => [x.key, x.count])) : null;
  const total = q.data ? q.data.reduce((n, x) => n + x.count, 0) : null;
  return { counts, total, q };
}
export { useCounts };

export function Home() {
  useDocumentTitle(t('FrameFlow Asset Library'));
  const { counts, total } = useCounts();
  const collections = useQuery({ queryKey: ['public', 'collections'], queryFn: publicApi.collections });
  const trending = collections.data?.find((c) => c.slug === 'trending') ?? collections.data?.[0];
  const preview = (collections.data ?? []).flatMap((c) => c.assets).filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i).slice(0, 8);

  return (
    <>
      <div className="relative overflow-hidden">
        <div className="grad absolute inset-2 bottom-0 rounded-4xl ring-1 ring-black/5 ring-inset" />
        <div className="gut relative">
          <div className="mx-auto max-w-7xl pt-16 pb-20 sm:pt-24 sm:pb-28">
            <p className="eyebrow !text-gray-800" data-testid="hero-counts">
              {total != null ? t('{types} asset types · {n} assets · updated daily', { types: TYPE_KEYS.length, n: formatNumber(total) }) : t('{types} asset types · updated daily', { types: TYPE_KEYS.length })}
            </p>
            <h1 className="mt-4 max-w-4xl text-5xl font-medium tracking-tight text-gray-950 sm:text-7xl">{t('Drop it on the timeline. It’s already installed.')}</h1>
            <p className="mt-6 max-w-xl text-lg text-gray-950/75 sm:text-xl">{t('Transitions, LUTs, Lottie, sound effects, text animations and templates, made for FrameFlow. Browse here, then add any asset to your project in one click.')}</p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link to="/download" className="btn btn-p">↓ {t('Download FrameFlow')}</Link>
              <Link to="/library" className="btn btn-s">{t('Browse the library')}</Link>
            </div>
            <p className="mt-4 text-sm text-gray-950/70">
              {t('Free for macOS, Windows & Linux · v{version}', { version: APP_RELEASE.version })} · <Link to="/whats-new" className="underline">{t('What’s new')}</Link>
            </p>
          </div>
        </div>
      </div>

      <div className="gut">
        <div className="relative mx-auto -mt-10 max-w-7xl">
          <div className="card p-2 shadow-xl" aria-hidden="true">
            <div className="rounded-[1.6rem] bg-[#111318] p-4 text-xs text-gray-200">
              <div className="grid grid-cols-[180px_1fr] gap-4 max-md:grid-cols-1">
                <div className="space-y-1 max-md:hidden">
                  {TYPE_KEYS.map((k, i) => (
                    <div key={k} className={`flex items-center gap-2 rounded px-2 py-1 ${i === 5 ? 'bg-white/10 text-white' : ''}`}>
                      <i className="size-2 rounded-sm" style={{ background: TYPE_DISPLAY[k].a }} />
                      {tx(TYPE_DISPLAY[k].label)}
                    </div>
                  ))}
                </div>
                <div>
                  <div className="grid grid-cols-4 gap-3 max-sm:grid-cols-2">
                    {(preview.length ? preview.map((a) => [a.title, a.type] as const) : TYPE_KEYS.slice(0, 8).map((k) => [tx(TYPE_DISPLAY[k].label), k] as const)).map(([name, type], i) => (
                      <div key={`${name}-${i}`}>
                        <div className="thumb relative aspect-video rounded" style={{ '--a': TYPE_DISPLAY[type].a, '--b': '#0b0d11' } as React.CSSProperties}>
                          <span className={`absolute top-1 right-1 rounded px-1 text-[9px] ${i === 0 ? 'bg-amber-300 text-black' : i % 3 === 0 ? 'bg-emerald-500' : 'bg-white text-black'}`}>{i === 0 ? t('Update') : i % 3 === 0 ? t('Installed') : t('Get')}</span>
                        </div>
                        <p className="mt-1 truncate">{name}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 rounded-lg bg-black/40 p-3">
                    <div className="flex h-8 gap-1">
                      <div className="w-1/3 rounded bg-sky-700 px-2 py-1">clip_014</div>
                      <div className="w-3 rounded bg-fuchsia-400" />
                      <div className="w-1/3 rounded bg-sky-700 px-2 py-1 ring-2 ring-amber-300">clip_015 · LUT</div>
                      <div className="flex-1 truncate rounded border border-dashed border-pink-300 px-2 py-1 text-pink-200">{t('Installing {name}… {pct}%', { name: preview[0]?.title ?? 'Like Burst', pct: 64 })}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="gut">
        <div className="mx-auto max-w-7xl pt-20" id="get">
          <div className="card grid items-center gap-8 p-8 sm:p-10 lg:grid-cols-[1fr_auto]">
            <div>
              <p className="eyebrow">{t('Download · FrameFlow {version} · released {date}', { version: APP_RELEASE.version, date: formatDate(APP_RELEASE.date) })}</p>
              <h2 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">{t('Get FrameFlow for your computer')}</h2>
              <p className="mt-3 max-w-xl text-gray-600">{t('The library is built into the editor. Install, sign in with your WorkSuite account, and your assets sync automatically.')}</p>
              <p className="mt-4 text-sm text-gray-500">
                <Link to="/download#requirements" className="underline">{t('System requirements')}</Link> · <Link to="/whats-new" className="underline">{t('Release notes')}</Link> · <Link to="/whats-new" className="underline">{t('Older versions')}</Link>
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:w-80 lg:grid-cols-1"><DownloadButtons variant="home" /></div>
          </div>
        </div>
      </div>

      <div className="gut">
        <div className="mx-auto max-w-7xl py-24" id="types">
          <p className="eyebrow">{t('Library')}</p>
          <h2 className="mt-2 max-w-3xl text-4xl font-medium tracking-tight sm:text-5xl">{t('Everything an edit needs, in one place.')}</h2>
          <ul role="list" className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {TYPE_KEYS.map((k) => (
              <li key={k}>
                <Link to={`/library/category/${k}`} className="card lift block !rounded-3xl p-5">
                  <div className="thumb h-24 rounded-2xl" style={{ '--a': TYPE_DISPLAY[k].a, '--b': TYPE_DISPLAY[k].b } as React.CSSProperties} />
                  <p className="mt-4 font-medium">{tx(TYPE_DISPLAY[k].label)}</p>
                  <p className="text-sm text-gray-500" data-testid={`count-${k}`}>{counts ? t('{n} assets', { n: formatNumber(counts[k] ?? 0) }) : '—'}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="gut border-y border-black/5 bg-gray-50">
        <div className="mx-auto max-w-7xl py-24">
          <p className="eyebrow">{t('How it works')}</p>
          <h2 className="mt-2 max-w-3xl text-4xl font-medium tracking-tight sm:text-5xl">{t('From library to timeline without leaving the editor.')}</h2>
          <div className="mt-10 grid gap-4 lg:grid-cols-6">
            <Feature span="lg:col-span-4" eyebrow={t('Download')} title={t('Resumes where it stopped')} text={t('Lost Wi-Fi halfway through a 900 MB template? It picks up from the last chunk and checks every file before installing.')}>
              <div className="grad-soft flex h-64 items-end p-6"><div className="w-full rounded-xl bg-white/80 p-3 text-xs shadow"><div className="flex justify-between"><b>Wedding Story 60s</b><span>612 / 860 MB · 20 s</span></div><div className="mt-2 h-1.5 rounded-full bg-black/10"><div className="h-full w-[71%] rounded-full bg-gray-950" /></div></div></div>
            </Feature>
            <Feature eyebrow={t('Install')} title={t('Ready the moment it lands')} text={t('New fonts, LUTs and effects appear in their panels straight away.')}>
              <div className="grid h-64 place-items-center bg-gray-950 p-6 text-white"><div className="text-center"><div className="text-5xl font-medium">0</div><div className="mt-1 text-xs text-gray-400">{t('restarts needed')}</div></div></div>
            </Feature>
            <Feature eyebrow={t('Apply')} title={t('Drag onto a clip')} text={t('Drop a LUT, filter or transition on a clip or cut. One undo takes it off.')}>
              <div className="grid h-64 place-items-center bg-white p-6"><div className="flex gap-2"><span className="thumb size-16 rounded-xl" style={{ '--a': '#7c2d12', '--b': '#fbbf24' } as React.CSSProperties} /><span className="self-center text-3xl">→</span><span className="thumb size-16 rounded-xl ring-4 ring-amber-300" style={{ '--a': '#0369a1', '--b': '#38bdf8' } as React.CSSProperties} /></div></div>
            </Feature>
            <Feature eyebrow={t('Sync')} title={t('Updates arrive on their own')} text={t('Open projects keep the version they were built with until you choose to update.')}>
              <div className="flex h-64 flex-col justify-center gap-2 bg-white p-6 text-sm">
                <div className="flex justify-between rounded-lg px-3 py-2 ring-1 ring-black/10"><span>Neon Glitch</span><span className="text-amber-600">1.1 → 1.2</span></div>
                <div className="flex justify-between rounded-lg px-3 py-2 ring-1 ring-black/10"><span>Kandy Golden Hour</span><span className="text-emerald-600">{t('up to date')}</span></div>
                <div className="flex justify-between rounded-lg px-3 py-2 ring-1 ring-black/10"><span>Whoosh Pack</span><span className="text-emerald-600">{t('up to date')}</span></div>
              </div>
            </Feature>
            <Feature eyebrow={t('Offline')} title={t('Works on the plane')} text={t('Installed assets stay searchable and usable without a connection.')}>
              <div className="grid h-64 place-items-center bg-white p-6 text-center"><div><div className="text-6xl" aria-hidden="true">✈︎</div><p className="mt-2 text-xs text-gray-500">{t('Offline · installed assets')}</p></div></div>
            </Feature>
          </div>
        </div>
      </div>

      <div className="gut">
        <div className="mx-auto max-w-7xl py-24">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0"><p className="eyebrow">{t('Trending this week')}</p><h2 className="mt-2 text-4xl font-medium tracking-tight">{t('Editors are reaching for these')}</h2></div>
            <Link to="/library?sort=trending" className="btn btn-o">{t('View all')} →</Link>
          </div>
          <TileGrid assets={trending?.assets} loading={collections.isPending} error={collections.isError ? t('Collections are unavailable right now.') + ' ' + errorMessage(collections.error) : null} />
        </div>
      </div>

      <div className="gut">
        <div className="mx-auto grid max-w-7xl gap-4 pb-24 md:grid-cols-3">
          {QUOTES.map((q) => (
            <figure key={q.name} className="card p-8">
              <blockquote className="text-lg">“{tx(q.quote)}”</blockquote>
              <figcaption className="mt-6 flex items-center gap-3 text-sm"><span className="grad size-10 rounded-full" /><span><b className="block font-medium">{q.name}</b><span className="text-gray-500">{tx(q.role)}</span></span></figcaption>
            </figure>
          ))}
        </div>
      </div>
    </>
  );
}

function Feature({ span = 'lg:col-span-2', eyebrow, title, text, children }: { span?: string; eyebrow: string; title: string; text: string; children: React.ReactNode }) {
  return (
    <div className={`card lift ${span}`}>
      {children}
      <div className="p-8"><p className="eyebrow">{eyebrow}</p><h3 className="mt-1 text-xl font-medium">{title}</h3><p className="mt-2 text-sm text-gray-600">{text}</p></div>
    </div>
  );
}
