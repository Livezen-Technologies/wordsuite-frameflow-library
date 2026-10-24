// Asset detail. Tailwind Plus Radiant: GradientBackground + Navbar, Heading/Subheading/Lead, Screenshot-style framed
// preview, pricing-card frame (rounded-4xl double ring) for the "get it" panel, Button.
import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CheckIcon } from '@heroicons/react/16/solid';
import { publicApi } from '@/services/public';
import { ApiError, errorMessage } from '@/services/api';
import { config } from '@/core/config';
import { ASSET_TYPES, humanize, typeName } from '@/core/schema';
import { formatBytes, formatDateTime, shortHash } from '@/core/format';
import { AssetThumb, TierPill } from '@/components/radiant/asset-card';
import { Button } from '@/components/radiant/button';
import { Container } from '@/components/radiant/container';
import { GradientBackground } from '@/components/radiant/gradient';
import { Link } from '@/components/radiant/link';
import { Navbar } from '@/components/radiant/navbar';
import { Heading, Lead, Subheading } from '@/components/radiant/text';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-dotted border-gray-200 py-3 sm:grid sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm/6 text-gray-600">{label}</dt>
      <dd className="text-sm/6 font-medium break-words text-gray-950 sm:col-span-2">{children}</dd>
    </div>
  );
}

export function AssetPage() {
  const { slug = '' } = useParams();
  const q = useQuery({ queryKey: ['public', 'asset', slug], queryFn: () => publicApi.asset(slug), retry: false });
  const [copied, setCopied] = useState(false);
  useDocumentTitle(q.data ? `${q.data.title} · FrameFlow` : 'Asset · FrameFlow');

  return (
    <main>
      <GradientBackground />
      <Container>
        <Navbar />
      </Container>
      <Container className="mt-16 pb-24">
        <nav aria-label="Breadcrumb" className="text-sm/6 text-gray-600">
          <Link href="/library" className="data-hover:text-gray-950">Library</Link>
          {q.data && (
            <>
              <span aria-hidden="true"> / </span>
              <Link href={`/library?type=${q.data.type}`} className="data-hover:text-gray-950">{typeName(q.data.type)}</Link>
            </>
          )}
        </nav>
        {q.isPending ? (
          <p className="mt-10 text-sm/6 text-gray-600" role="status">Loading…</p>
        ) : q.isError ? (
          <div className="mt-10">
            <Heading as="h1">{q.error instanceof ApiError && q.error.status === 404 ? 'Asset not found.' : 'Something went wrong.'}</Heading>
            <Lead className="mt-6">{q.error instanceof ApiError && q.error.status === 404 ? 'It may have been unpublished or moved.' : errorMessage(q.error)}</Lead>
            <div className="mt-8"><Button href="/library">Back to the library</Button></div>
          </div>
        ) : (
          (() => {
            const a = q.data;
            const t = ASSET_TYPES[a.type];
            return (
              <div className="mt-6 grid grid-cols-1 gap-12 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <Subheading>{t?.name ?? a.type}{a.category ? ` · ${a.category.name}` : ''}</Subheading>
                  <Heading as="h1" className="mt-2">{a.title}</Heading>
                  {a.description && <Lead className="mt-6 max-w-3xl text-xl">{a.description}</Lead>}
                  <div className="relative mt-10 [--radius:var(--radius-xl)]">
                    <div className="absolute -inset-2 rounded-[calc(var(--radius)+8px)] shadow-xs ring-1 ring-black/5" />
                    <AssetThumb asset={a} className="relative aspect-video w-full rounded-(--radius) shadow-2xl ring-1 ring-black/10" />
                  </div>
                  {a.tags.length > 0 && (
                    <ul role="list" aria-label="Tags" className="mt-8 flex flex-wrap gap-2">
                      {a.tags.map((tag) => (
                        <li key={tag}><Link href={`/library?q=${encodeURIComponent(tag)}`} className="rounded-full border border-dotted border-gray-300 bg-gray-50 px-2.5 py-0.5 text-sm/6 font-medium text-gray-700 data-hover:bg-gray-100">{tag}</Link></li>
                      ))}
                    </ul>
                  )}
                  <h2 className="mt-12 text-2xl/8 font-medium tracking-tight text-gray-950">Details</h2>
                  <dl className="mt-4">
                    <Meta label="Version">{a.current_version ?? '—'}</Meta>
                    <Meta label="Requires">FrameFlow {a.min_app_version} or later</Meta>
                    <Meta label="Installs to">{t?.target ?? a.pack_type}</Meta>
                    <Meta label="Pack size">{formatBytes(a.file_size_bytes)}</Meta>
                    <Meta label="SHA-256"><span className="font-mono text-xs" title={a.checksum_sha256 ?? ''}>{shortHash(a.checksum_sha256)}</span></Meta>
                    {a.aspect_ratios?.length > 0 && <Meta label="Aspect ratios">{a.aspect_ratios.join(', ')}</Meta>}
                    {a.author && <Meta label="Author">{a.author}</Meta>}
                    <Meta label="Licence">{humanize(a.licence_terms)}{a.attribution_required ? ` · attribution required: “${a.attribution_text}”` : ''}</Meta>
                    <Meta label="Published">{formatDateTime(a.published_at)}</Meta>
                  </dl>

                  <h2 className="mt-12 text-2xl/8 font-medium tracking-tight text-gray-950">Versions</h2>
                  <ul role="list" className="mt-4 space-y-4">
                    {a.versions.slice().reverse().map((v) => (
                      <li key={v.version} className="rounded-2xl bg-gray-50 p-4 ring-1 ring-black/5">
                        <p className="flex flex-wrap items-center gap-2 text-sm/6 font-medium text-gray-950">
                          <span className="font-mono">{v.version}</span>
                          {v.version === a.current_version && <span className="rounded-full bg-gray-950 px-2 text-xs/5 text-white">current</span>}
                          {v.is_breaking && <span className="rounded-full bg-fuchsia-950/80 px-2 text-xs/5 text-white">breaking</span>}
                          <span className="text-gray-500">{formatBytes(v.size)}</span>
                        </p>
                        {v.changelog && <p className="mt-1 text-sm/6 text-gray-600">{v.changelog}</p>}
                      </li>
                    ))}
                  </ul>

                  {a.dependencies.length > 0 && (
                    <>
                      <h2 className="mt-12 text-2xl/8 font-medium tracking-tight text-gray-950">Needs</h2>
                      <ul role="list" className="mt-4 space-y-2 text-sm/6">
                        {a.dependencies.map((d) => (
                          <li key={d.asset_id}>{d.asset ? <Link href={`/library/${d.asset.slug}`} className="font-medium text-gray-950 underline decoration-dotted underline-offset-4">{d.asset.title}</Link> : <span className="text-gray-500">An asset that isn’t published</span>}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>

                <aside aria-label="Get this asset" className="lg:pt-24">
                  <div className="-m-2 grid grid-cols-1 rounded-4xl shadow-[inset_0_0_2px_1px_#ffffff4d] ring-1 ring-black/5">
                    <div className="grid grid-cols-1 rounded-4xl p-2 shadow-md shadow-black/5">
                      <div className="rounded-3xl bg-white p-8 shadow-2xl ring-1 ring-black/5">
                        <div className="flex items-center justify-between"><Subheading as="div">Plan</Subheading><TierPill tier={a.licence_tier} /></div>
                        <p className="mt-4 text-sm/6 text-gray-950/75">
                          {a.entitlement.can_download ? (
                            <span className="inline-flex items-center gap-2"><CheckIcon className="size-4 fill-green-600" />Included with your plan.</span>
                          ) : a.licence_tier === 'free' ? 'Free for everyone with FrameFlow.' : `Needs FrameFlow ${a.licence_tier[0].toUpperCase()}${a.licence_tier.slice(1)} or above.`}
                        </p>
                        <h3 className="mt-6 text-sm/6 font-medium text-gray-950">Open in FrameFlow</h3>
                        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm/6 text-gray-600">
                          <li>Open FrameFlow and go to <b>Library</b>.</li>
                          <li>Search for “{a.title}”, or paste its pack id.</li>
                          <li>Click <b>Download</b>; it appears in {t?.target ?? 'its panel'}.</li>
                        </ol>
                        <div className="mt-4 flex items-center gap-2">
                          <code className="min-w-0 flex-1 truncate rounded-lg bg-gray-50 px-2 py-1 text-xs ring-1 ring-black/5">{a.pack_id}</code>
                          <Button variant="outline" onClick={() => void navigator.clipboard?.writeText(a.pack_id).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>{copied ? 'Copied' : 'Copy id'}</Button>
                        </div>
                        <div className="mt-6 flex flex-col gap-3">
                          <Button href={config.frameflowDownloadUrl}>Get FrameFlow</Button>
                          {!a.entitlement.can_download && a.licence_tier !== 'free' && <Button variant="outline" href="/pricing">Compare plans</Button>}
                        </div>
                      </div>
                    </div>
                  </div>
                </aside>
              </div>
            );
          })()
        )}
      </Container>
    </main>
  );
}
