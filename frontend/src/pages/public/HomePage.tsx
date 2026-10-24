// Public home. Tailwind Plus Radiant: app/page.tsx (Hero with Gradient + Navbar banner, BentoSection, DarkBentoSection),
// components/bento-card, animated-number, container, text, button. Logo cloud and testimonials removed (demo content).
import { useQuery } from '@tanstack/react-query';
import { ChevronRightIcon } from '@heroicons/react/16/solid';
import { clsx } from 'clsx';
import { publicApi } from '@/services/public';
import { config } from '@/core/config';
import { ASSET_TYPES, TYPE_KEYS, type AssetType } from '@/core/schema';
import { AssetCard } from '@/components/radiant/asset-card';
import { BentoCard } from '@/components/radiant/bento-card';
import { Button } from '@/components/radiant/button';
import { Container } from '@/components/radiant/container';
import { Gradient } from '@/components/radiant/gradient';
import { Link } from '@/components/radiant/link';
import { Navbar } from '@/components/radiant/navbar';
import { Heading, Subheading } from '@/components/radiant/text';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { Collection } from '@/types/api';

function Hero({ total }: { total: number | null }) {
  return (
    <div className="relative">
      <Gradient className="absolute inset-2 bottom-0 rounded-4xl ring-1 ring-black/5 ring-inset" />
      <Container className="relative">
        <Navbar
          banner={
            <Link href="/library?sort=new" className="flex items-center gap-1 rounded-full bg-fuchsia-950/35 px-3 py-0.5 text-sm/6 font-medium text-white data-hover:bg-fuchsia-950/30">
              {total != null ? `${total.toLocaleString()} asset${total === 1 ? "" : "s"} ready to install` : 'See what’s new in the library'}
              <ChevronRightIcon className="size-4" />
            </Link>
          }
        />
        <div className="pt-16 pb-24 sm:pt-24 sm:pb-32 md:pt-32 md:pb-48">
          <h1 className="font-display text-6xl/[0.9] font-medium tracking-tight text-balance text-gray-950 sm:text-8xl/[0.8] md:text-9xl/[0.8]">Every look, one click away.</h1>
          <p className="mt-8 max-w-lg text-xl/7 font-medium text-gray-950/75 sm:text-2xl/8">
            The FrameFlow Asset Library: LUTs, transitions, titles, sounds, fonts and templates that install straight into the editor.
          </p>
          <div className="mt-12 flex flex-col gap-x-6 gap-y-4 sm:flex-row">
            <Button href="/library">Browse the library</Button>
            <Button variant="secondary" href="/pricing">
              See plans
            </Button>
          </div>
        </div>
      </Container>
    </div>
  );
}

const SHAPE = ['max-lg:rounded-t-4xl lg:rounded-tl-4xl', '', 'lg:rounded-tr-4xl', '', '', '', '', '', '', 'lg:rounded-bl-4xl', '', 'max-lg:rounded-b-4xl lg:rounded-br-4xl'];

function TypesBento({ counts }: { counts: Partial<Record<AssetType, number>> | null }) {
  return (
    <Container>
      <Subheading>Asset Library</Subheading>
      <Heading as="h2" className="mt-2 max-w-3xl">
        Twelve kinds of assets. Each lands in the right panel.
      </Heading>
      <div className="mt-10 grid grid-cols-1 gap-4 sm:mt-16 sm:grid-cols-2 lg:grid-cols-6">
        {TYPE_KEYS.map((t, i) => (
          <Link key={t} href={`/library?type=${t}`} className={clsx('lg:col-span-2 flex rounded-lg', SHAPE[i])} aria-label={`${ASSET_TYPES[t].name}: ${counts ? (counts[t] ?? 0) : 'loading'} published`}>
            <BentoCard
              eyebrow={ASSET_TYPES[t].short}
              title={ASSET_TYPES[t].name}
              description={`Installs to ${ASSET_TYPES[t].target}. Formats: ${ASSET_TYPES[t].ext.map((e) => `.${e}`).join(', ')}.`}
              graphicClassName="h-40"
              graphic={
                <div className="flex size-full items-end p-8" style={{ background: `linear-gradient(135deg, ${ASSET_TYPES[t].color}33, ${ASSET_TYPES[t].color}0d)` }}>
                  <div data-testid={`count-${t}`} className="text-6xl font-medium tracking-tight text-gray-950 tabular-nums">
                    {counts ? (counts[t] ?? 0).toLocaleString() : '—'}
                  </div>
                  <span className="ml-3 pb-2 text-sm/6 text-gray-600">published</span>
                </div>
              }
              className={clsx('w-full', SHAPE[i])}
            />
          </Link>
        ))}
      </div>
    </Container>
  );
}

function Rail({ collection, dark = false }: { collection: Collection; dark?: boolean }) {
  return (
    <section aria-labelledby={`rail-${collection.slug}`} className="mt-16 first:mt-0">
      <div className="flex items-end justify-between gap-4">
        <h3 id={`rail-${collection.slug}`} className={clsx('text-2xl/8 font-medium tracking-tight', dark ? 'text-white' : 'text-gray-950')}>{collection.title}</h3>
        <Link href={`/library?sort=${collection.slug === 'new' ? 'new' : collection.slug === 'trending' ? 'trending' : 'popular'}`} className={clsx('text-sm/6 font-medium', dark ? 'text-white/75 data-hover:text-white' : 'text-gray-600 data-hover:text-gray-950')}>
          See all <span aria-hidden="true">→</span>
        </Link>
      </div>
      {collection.assets.length ? (
        <ul role="list" className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {collection.assets.slice(0, 4).map((a) => (
            <li key={a.id} className="flex">
              <AssetCard asset={a} dark={dark} />
            </li>
          ))}
        </ul>
      ) : (
        <p className={clsx('mt-6 text-sm/6', dark ? 'text-gray-400' : 'text-gray-500')}>Nothing here yet — check back soon.</p>
      )}
    </section>
  );
}

export function HomePage() {
  useDocumentTitle('FrameFlow Asset Library');
  const types = useQuery({ queryKey: ['public', 'types'], queryFn: publicApi.types });
  const collections = useQuery({ queryKey: ['public', 'collections'], queryFn: publicApi.collections });
  const counts = types.data ? Object.fromEntries(types.data.map((t) => [t.key, t.count])) : null;
  const total = types.data ? types.data.reduce((n, t) => n + t.count, 0) : null;
  const rails = collections.data ?? [];
  const featured = rails.find((c) => c.slug === 'featured');
  const others = rails.filter((c) => c.slug !== 'featured');

  return (
    <>
      <Hero total={total} />
      <main>
        <div className="bg-linear-to-b from-white from-50% to-gray-100 py-32">
          <TypesBento counts={counts} />
          <Container className="mt-32">
            <Subheading>Collections</Subheading>
            <Heading as="h2" className="mt-2 max-w-3xl">Fresh from the Download Center.</Heading>
            <div className="mt-12">
              {collections.isError && <p className="text-sm/6 text-gray-500">Collections are unavailable right now.</p>}
              {others.map((c) => <Rail key={c.slug} collection={c} />)}
            </div>
          </Container>
        </div>
        <div className="mx-2 mt-2 rounded-4xl bg-gray-900 py-32">
          <Container>
            <Subheading dark>Featured</Subheading>
            <Heading as="h2" dark className="mt-2 max-w-3xl">Hand-picked by the FrameFlow team.</Heading>
            <div className="mt-12">{featured ? <Rail collection={featured} dark /> : <p className="text-sm/6 text-gray-400">{collections.isPending ? 'Loading…' : 'No featured assets yet.'}</p>}</div>
            <div className="mt-16">
              <Button variant="secondary" href={config.frameflowDownloadUrl} className="bg-white! text-gray-950!">Get FrameFlow</Button>
            </div>
          </Container>
        </div>
      </main>
    </>
  );
}
