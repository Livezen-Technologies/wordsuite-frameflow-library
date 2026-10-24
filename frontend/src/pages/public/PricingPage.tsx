// Pricing. Tailwind Plus Radiant: app/pricing/page.tsx (Header, PricingCards, PricingTable with phone Menu, FeatureItem,
// FrequentlyAskedQuestions). Prices removed: plans are sold in FrameFlow; this maps them to licence tiers. Logo cloud and
// testimonial removed (demo content).
import { useSearchParams } from 'react-router';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { CheckIcon, ChevronUpDownIcon, MinusIcon } from '@heroicons/react/16/solid';
import { config } from '@/core/config';
import { Button } from '@/components/radiant/button';
import { Container } from '@/components/radiant/container';
import { Gradient, GradientBackground } from '@/components/radiant/gradient';
import { Link } from '@/components/radiant/link';
import { Navbar } from '@/components/radiant/navbar';
import { Heading, Lead, Subheading } from '@/components/radiant/text';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

type Value = boolean | string;
interface Tier {
  name: string;
  slug: 'free' | 'pro' | 'business' | 'enterprise';
  description: string;
  headline: string;
  href: string;
  cta: string;
  highlights: { description: string; disabled?: boolean }[];
  features: { section: string; name: string; value: Value }[];
}

const ROWS: { section: string; name: string; values: [Value, Value, Value, Value] }[] = [
  { section: 'Library', name: 'Free assets', values: [true, true, true, true] },
  { section: 'Library', name: 'Pro assets', values: [false, true, true, true] },
  { section: 'Library', name: 'Business assets', values: [false, false, true, true] },
  { section: 'Library', name: 'Enterprise assets', values: [false, false, false, true] },
  { section: 'Library', name: 'All 12 asset types', values: [true, true, true, true] },
  { section: 'Delivery', name: 'One-click install into FrameFlow', values: [true, true, true, true] },
  { section: 'Delivery', name: 'Signed, checksummed packs', values: [true, true, true, true] },
  { section: 'Delivery', name: 'Resumable downloads', values: [true, true, true, true] },
  { section: 'Delivery', name: 'Version updates and rollback-safe installs', values: [true, true, true, true] },
  { section: 'Licensing', name: 'Licence terms', values: ['Per asset', 'Per asset', 'Per asset', 'Per asset + custom'] },
  { section: 'Licensing', name: 'Brand kits for your team', values: ['Free kits', 'Pro kits', 'Business kits', 'All kits'] },
];

const tiers: Tier[] = (
  [
    { name: 'Free', slug: 'free', description: 'Everything you need to start editing.', headline: 'Included', cta: 'Get FrameFlow', href: config.frameflowDownloadUrl, highlights: [{ description: 'Every free LUT, sound, font and title' }, { description: 'Installs straight into FrameFlow' }, { description: 'Pro assets', disabled: true }, { description: 'Business assets', disabled: true }] },
    { name: 'Pro', slug: 'pro', description: 'For creators who publish every week.', headline: 'With FrameFlow Pro', cta: 'Upgrade in FrameFlow', href: config.frameflowDownloadUrl, highlights: [{ description: 'Everything in Free' }, { description: 'Pro transitions, motion and templates' }, { description: 'Pro brand kits' }, { description: 'Business assets', disabled: true }] },
    { name: 'Business', slug: 'business', description: 'For studios and agencies.', headline: 'With FrameFlow Business', cta: 'Upgrade in FrameFlow', href: config.frameflowDownloadUrl, highlights: [{ description: 'Everything in Pro' }, { description: 'Business-tier packs and templates' }, { description: 'Brand kits for client work' }, { description: 'Enterprise assets', disabled: true }] },
    { name: 'Enterprise', slug: 'enterprise', description: 'For broadcasters and large teams.', headline: 'Talk to Livezen', cta: 'Ask about Enterprise', href: config.frameflowDownloadUrl, highlights: [{ description: 'Everything in Business' }, { description: 'Enterprise-only assets' }, { description: 'Custom licence terms' }, { description: 'Private (internal) assets via the beta feed' }] },
  ] as Omit<Tier, 'features'>[]
).map((t, i) => ({ ...t, features: ROWS.map((r) => ({ section: r.section, name: r.name, value: r.values[i] })) }));

function Header() {
  return (
    <Container className="mt-16">
      <Heading as="h1">One library. A plan for every kind of creator.</Heading>
      <Lead className="mt-6 max-w-3xl">Every asset carries a licence tier. Your FrameFlow plan decides which tiers you can download — free assets are free for everyone.</Lead>
    </Container>
  );
}

function FeatureItem({ description, disabled = false }: { description: string; disabled?: boolean }) {
  return (
    <li data-disabled={disabled ? true : undefined} className="flex items-start gap-4 text-sm/6 text-gray-950/75 data-disabled:text-gray-950/25">
      <span className="inline-flex h-6 items-center">
        <PlusIcon className="size-3.75 shrink-0 fill-gray-950/25" />
      </span>
      {disabled && <span className="sr-only">Not included:</span>}
      {description}
    </li>
  );
}

function PlusIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 15 15" aria-hidden="true" {...props}>
      <path clipRule="evenodd" d="M8 0H7v7H0v1h7v7h1V8h7V7H8V0z" />
    </svg>
  );
}

function PricingCard({ tier }: { tier: Tier }) {
  return (
    <div className="-m-2 grid grid-cols-1 rounded-4xl shadow-[inset_0_0_2px_1px_#ffffff4d] ring-1 ring-black/5 max-lg:mx-auto max-lg:w-full max-lg:max-w-md">
      <div className="grid grid-cols-1 rounded-4xl p-2 shadow-md shadow-black/5">
        <div className="rounded-3xl bg-white p-8 pb-9 shadow-2xl ring-1 ring-black/5">
          <Subheading as="h2">{tier.name}</Subheading>
          <p className="mt-2 text-sm/6 text-gray-950/75">{tier.description}</p>
          <div className="mt-8 text-3xl font-medium tracking-tight text-gray-950">{tier.headline}</div>
          <div className="mt-8">
            <Button href={tier.href}>{tier.cta}</Button>
          </div>
          <div className="mt-8">
            <h3 className="text-sm/6 font-medium text-gray-950">Download with {tier.name}:</h3>
            <ul className="mt-3 space-y-3">
              {tier.highlights.map((props, i) => (
                <FeatureItem key={i} {...props} />
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function PricingCards() {
  return (
    <div className="relative py-24">
      <Gradient className="absolute inset-x-2 top-48 bottom-0 rounded-4xl ring-1 ring-black/5 ring-inset" />
      <Container className="relative">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-4">
          {tiers.map((tier) => (
            <PricingCard key={tier.slug} tier={tier} />
          ))}
        </div>
      </Container>
    </div>
  );
}

function PricingTable({ selectedTier }: { selectedTier: Tier }) {
  return (
    <Container className="py-24">
      <table className="w-full text-left">
        <caption className="sr-only">Plan comparison</caption>
        <colgroup>
          <col className="w-3/5 sm:w-2/6" />
          {tiers.map((t) => (
            <col key={t.slug} data-selected={selectedTier === t ? true : undefined} className="w-2/5 data-selected:table-column max-sm:hidden sm:w-1/6" />
          ))}
        </colgroup>
        <thead>
          <tr className="max-sm:hidden">
            <td className="p-0" />
            {tiers.map((tier) => (
              <th key={tier.slug} scope="col" data-selected={selectedTier === tier ? true : undefined} className="p-0 data-selected:table-cell max-sm:hidden">
                <Subheading as="div">{tier.name}</Subheading>
              </th>
            ))}
          </tr>
          <tr className="sm:hidden">
            <td className="p-0">
              <div className="relative inline-block">
                <Menu>
                  <MenuButton className="flex items-center justify-between gap-2 font-medium">
                    {selectedTier.name}
                    <ChevronUpDownIcon className="size-4 fill-gray-900" />
                  </MenuButton>
                  <MenuItems anchor="bottom start" className="min-w-(--button-width) rounded-lg bg-white p-1 shadow-lg ring-1 ring-gray-200 [--anchor-gap:6px] [--anchor-offset:-4px] [--anchor-padding:10px]">
                    {tiers.map((tier) => (
                      <MenuItem key={tier.slug}>
                        <Link href={`/pricing?tier=${tier.slug}`} data-selected={tier === selectedTier ? true : undefined} className="group flex items-center gap-2 rounded-md px-2 py-1 data-focus:bg-gray-200">
                          {tier.name}
                          <CheckIcon className="hidden size-4 group-data-selected:block" />
                        </Link>
                      </MenuItem>
                    ))}
                  </MenuItems>
                </Menu>
              </div>
            </td>
            <td colSpan={4} className="p-0 text-right">
              <Button variant="outline" href={selectedTier.href}>{selectedTier.cta}</Button>
            </td>
          </tr>
        </thead>
        {[...new Set(ROWS.map((r) => r.section))].map((section) => (
          <tbody key={section} className="group">
            <tr>
              <th scope="colgroup" colSpan={5} className="px-0 pt-10 pb-0 group-first-of-type:pt-5">
                <div className="-mx-4 rounded-lg bg-gray-50 px-4 py-3 text-sm/6 font-semibold">{section}</div>
              </th>
            </tr>
            {ROWS.filter((r) => r.section === section).map(({ name }) => (
              <tr key={name} className="border-b border-gray-100 last:border-none">
                <th scope="row" className="px-0 py-4 text-sm/6 font-normal text-gray-600">{name}</th>
                {tiers.map((tier) => {
                  const value = tier.features.find((f) => f.section === section && f.name === name)?.value;
                  return (
                    <td key={tier.slug} data-selected={selectedTier === tier ? true : undefined} className="p-4 data-selected:table-cell max-sm:hidden">
                      {value === true ? (
                        <>
                          <CheckIcon className="size-4 fill-green-600" />
                          <span className="sr-only">Included in {tier.name}</span>
                        </>
                      ) : value === false || value === undefined ? (
                        <>
                          <MinusIcon className="size-4 fill-gray-400" />
                          <span className="sr-only">Not included in {tier.name}</span>
                        </>
                      ) : (
                        <div className="text-sm/6">{value}</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </Container>
  );
}

const FAQS: [string, string][] = [
  ['Do I need an account to use free assets?', 'No. Free assets download into FrameFlow for everyone. Sign in with your Worksuite Cloud account to unlock the tiers your plan covers.'],
  ['What do the licence terms mean?', 'Each asset shows its terms: royalty free (use anywhere, including client work), editorial only (news and commentary, not ads), personal only (non-commercial projects) or custom (terms shown on the asset). Some assets ask for an attribution line.'],
  ['What happens when an asset is updated?', 'Versions never overwrite. FrameFlow tells you when a newer version is out and warns before a breaking update; projects keep using the version they were made with.'],
  ['Can I use assets offline?', 'Yes. Once a pack is installed it lives on your machine. Downloads resume if your connection drops.'],
  ['How do I upgrade?', 'Plans are managed in FrameFlow and your Worksuite Cloud account. There is no checkout on this site.'],
];

function FrequentlyAskedQuestions() {
  return (
    <Container>
      <section id="faqs" className="scroll-mt-8">
        <Subheading className="text-center">Frequently asked questions</Subheading>
        <Heading as="div" className="mt-2 text-center">Your questions answered.</Heading>
        <div className="mx-auto mt-16 mb-32 max-w-xl space-y-12">
          {FAQS.map(([qq, a]) => (
            <dl key={qq}>
              <dt className="text-sm font-semibold">{qq}</dt>
              <dd className="mt-4 text-sm/6 text-gray-600">{a}</dd>
            </dl>
          ))}
        </div>
      </section>
    </Container>
  );
}

export function PricingPage() {
  useDocumentTitle('Plans · FrameFlow Asset Library');
  const [params] = useSearchParams();
  const tier = tiers.find((t) => t.slug === params.get('tier')) ?? tiers[1];
  return (
    <main>
      <GradientBackground />
      <Container>
        <Navbar />
      </Container>
      <Header />
      <PricingCards />
      <PricingTable selectedTier={tier} />
      <FrequentlyAskedQuestions />
    </main>
  );
}
