// Content pages from the mockup: Collections, Pricing, Download, What's new, Blog, Blog post, Help, Creators,
// About, Contact, Licence. Live data where the API has it (collections); the rest from src/content.
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { publicApi } from '@/services/public';
import { errorMessage } from '@/services/api';
import { formatDate, formatNumber } from '@/core/format';
import { APP_RELEASE, CHANGELOG, COMPARE, CONTACT, CONTACT_TOPICS, CREATOR_STATS, CREATOR_STEPS, HELP_CATEGORIES, HELP_FAQ, LICENCE_CAN, LICENCE_CANT, LICENCE_UPDATED, PLANS, PRICING_FAQ, SYSTEM_REQUIREMENTS, YEARLY_MONTHS } from '@/content/site';
import { allPosts, renderMarkdown } from '@/content/blog';
import { t, tx } from '@/i18n';
import { Faq, Thumb, gradient } from '@/components/site/AssetTile';
import { DownloadButtons, useCounts } from './Home';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import NotFoundSite from './NotFound';

const H1 = 'mt-2 text-5xl font-medium tracking-tight';

export function Collections() {
  useDocumentTitle(`${t('Collections')} · FrameFlow`);
  const q = useQuery({ queryKey: ['public', 'collections'], queryFn: publicApi.collections });
  return (
    <div className="gut"><div className="mx-auto max-w-7xl py-14">
      <p className="eyebrow">{t('Curated')}</p><h1 className="mt-2 text-4xl font-medium tracking-tight sm:text-5xl">{t('Collections')}</h1>
      <p className="mt-3 max-w-xl text-gray-600">{t('Hand-picked sets for a style or a job. Install a whole collection in one go.')}</p>
      {q.isError && <p role="alert" className="mt-10 rounded-3xl bg-red-50 p-6 text-sm text-red-800">{t('Collections are unavailable right now.')} {errorMessage(q.error)}</p>}
      {q.isPending && <p role="status" className="mt-10 text-sm text-gray-500">{t('Loading…')}</p>}
      <ul role="list" className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {(q.data ?? []).map((c) => {
          const [x, y, z] = c.assets;
          const fallback = { type: c.assets[0]?.type ?? 'lut', thumbnail_url: null } as const;
          return (
            <li key={c.slug}>
              <Link to={`/library?collection=${encodeURIComponent(c.slug)}`} className="card lift block">
                <div className="grid grid-cols-3 gap-1 p-2">
                  <Thumb asset={x ?? fallback} className="col-span-2 row-span-2 h-40 rounded-[1.4rem]" />
                  <Thumb asset={y ?? fallback} className="h-[78px] rounded-xl" />
                  <Thumb asset={z ?? fallback} className="h-[78px] rounded-xl" />
                </div>
                <div className="px-6 pt-2 pb-6"><h2 className="text-lg font-medium">{c.title}</h2><p className="text-sm text-gray-500">{t('{n} assets', { n: formatNumber(c.assets.length) })}</p></div>
              </Link>
            </li>
          );
        })}
      </ul>
      {q.data && !q.data.length && <p className="mt-10 text-sm text-gray-500">{t('No collections yet')}</p>}
    </div></div>
  );
}

const rs = (n: number) => `Rs ${n.toLocaleString('en-LK')}`;

export function Pricing() {
  useDocumentTitle(`${t('Pricing')} · FrameFlow`);
  const [yearly, setYearly] = useState(false);
  return (
    <>
      <div className="relative">
        <div className="grad absolute inset-x-2 top-0 h-[520px] rounded-4xl ring-1 ring-black/5" />
        <div className="gut relative"><div className="mx-auto max-w-7xl pt-16">
          <p className="eyebrow !text-gray-800">{t('Pricing')}</p>
          <h1 className="mt-2 text-5xl font-medium tracking-tight sm:text-6xl">{t('Plans for every kind of editor.')}</h1>
          <p className="mt-4 max-w-xl text-lg text-gray-950/75">{t('Every plan includes the FrameFlow editor. Plans differ in how much of the library you can use and on how many computers.')}</p>
          <div className="mt-6 inline-flex rounded-full bg-white/50 p-1 text-sm" role="group" aria-label={t('Billing period')}>
            <button type="button" aria-pressed={!yearly} onClick={() => setYearly(false)} className={clsx('rounded-full px-4 py-1.5', !yearly && 'bg-gray-950 text-white')}>{t('Monthly')}</button>
            <button type="button" aria-pressed={yearly} onClick={() => setYearly(true)} className={clsx('rounded-full px-4 py-1.5', yearly && 'bg-gray-950 text-white')}>{t('Yearly · 2 months free')}</button>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((p) => (
              <div key={p.slug} className={clsx('card p-2', p.popular && 'ring-2 ring-gray-950')}>
                <div className={clsx('flex h-full flex-col rounded-[1.6rem] p-6', p.popular ? 'bg-gray-950 text-white' : 'bg-white')}>
                  <div className="flex justify-between"><h2 className="font-medium">{p.name}</h2>{p.popular && <span className="rounded-full bg-white/15 px-2 text-xs">{t('Most popular')}</span>}</div>
                  <p className={clsx('mt-1 text-sm', p.popular ? 'text-gray-400' : 'text-gray-500')}>{tx(p.tagline)}</p>
                  <p className="mt-6 text-4xl font-medium">
                    {p.monthly == null ? t('Custom') : rs(yearly ? p.monthly * YEARLY_MONTHS : p.monthly)}
                    {!!p.monthly && <span className="text-sm font-normal opacity-60"> {yearly ? t('/year') : t('/month')}</span>}
                  </p>
                  <Link to={p.slug === 'enterprise' ? '/contact' : '/signup'} className={clsx('btn mt-6', p.popular ? 'bg-white text-gray-950' : 'btn-p')}>{p.slug === 'enterprise' ? t('Contact sales') : t('Start {plan}', { plan: p.name })}</Link>
                  <ul className="mt-6 space-y-2 text-sm">{p.features.map((f) => <li key={f} className="flex gap-2"><span aria-hidden="true">✓</span>{tx(f)}</li>)}</ul>
                </div>
              </div>
            ))}
          </div>
        </div></div>
      </div>
      <div className="gut"><div className="mx-auto max-w-7xl overflow-x-auto py-20">
        <h2 className="text-2xl font-medium">{t('Compare plans')}</h2>
        <table className="mt-6 w-full min-w-[640px] text-sm">
          <thead className="text-left"><tr className="border-b border-black/10"><th className="w-1/3 py-3"><span className="sr-only">{t('Feature')}</span></th>{PLANS.map((p) => <th key={p.slug} scope="col">{p.name}</th>)}</tr></thead>
          <tbody className="divide-y divide-black/10">{COMPARE.map((r) => <tr key={r.row}><th scope="row" className="py-3 text-left font-normal text-gray-600">{tx(r.row)}</th>{r.values.map((v, i) => <td key={i}>{tx(v)}</td>)}</tr>)}</tbody>
        </table>
      </div></div>
      <div className="gut border-t border-black/10 bg-gray-50"><div className="mx-auto max-w-3xl py-20"><h2 className="text-3xl font-medium">{t('Pricing questions')}</h2><Faq items={PRICING_FAQ.map(([q, a]) => [tx(q), tx(a)])} /></div></div>
    </>
  );
}

export function Download() {
  useDocumentTitle(`${t('Download FrameFlow')} · FrameFlow`);
  const { total } = useCounts();
  return (
    <>
      <div className="gut"><div className="mx-auto grid max-w-7xl items-center gap-12 py-16 lg:grid-cols-2">
        <div>
          <p className="eyebrow">{t('FrameFlow {version} · released {date}', { version: APP_RELEASE.version, date: formatDate(APP_RELEASE.date) })}</p>
          <h1 className={H1}>{t('Download FrameFlow')}</h1>
          <p className="mt-4 max-w-lg text-lg text-gray-600">{t('The library is built into the editor. Sign in once and everything you install here shows up there.')}</p>
          <div className="mt-8 space-y-3"><DownloadButtons /></div>
          <p className="mt-4 text-sm text-gray-500">{t('Looking for an older version?')} <Link to="/whats-new" className="underline">{t('See release notes')}</Link></p>
        </div>
        <div className="card p-2 shadow-xl" aria-hidden="true"><div className="grad rounded-[1.6rem] p-8"><div className="rounded-xl bg-[#111318] p-4 text-xs text-gray-300 shadow-2xl">
          <div className="flex gap-1.5"><i className="size-2.5 rounded-full bg-red-400" /><i className="size-2.5 rounded-full bg-amber-400" /><i className="size-2.5 rounded-full bg-emerald-400" /></div>
          <div className="mt-4 grid grid-cols-3 gap-2"><div className="thumb h-16 rounded" style={gradient('transition')} /><div className="thumb h-16 rounded" style={gradient('lut')} /><div className="thumb h-16 rounded" style={gradient('filter')} /></div>
          <p className="mt-3">{total != null ? t('Library · {n} assets · synced', { n: formatNumber(total) }) : t('Library · synced')}</p>
        </div></div></div>
      </div></div>
      <div className="gut border-y border-black/10 bg-gray-50" id="requirements"><div className="mx-auto grid max-w-7xl gap-8 py-16 text-sm md:grid-cols-3">
        {SYSTEM_REQUIREMENTS.map((r) => <div key={r.name}><h2 className="text-base font-medium">{r.name}</h2><p className="mt-2 text-gray-600">{tx(r.text)}</p></div>)}
      </div></div>
    </>
  );
}

export function WhatsNew() {
  useDocumentTitle(`${t('What’s new')} · FrameFlow`);
  return (
    <div className="gut"><div className="mx-auto max-w-3xl py-16">
      <p className="eyebrow">{t('Changelog')}</p><h1 className={H1}>{t('What’s new')}</h1><p className="mt-3 text-gray-600">{t('New assets every week, plus FrameFlow app releases.')}</p>
      <ol className="mt-12 space-y-12 border-l border-black/10">
        {CHANGELOG.map((c) => (
          <li key={c.date + c.title} className="relative pl-8"><span className="grad absolute top-1.5 -left-1.5 size-3 rounded-full ring-4 ring-white" /><p className="eyebrow"><time dateTime={c.date}>{formatDate(c.date)}</time> · {tx(c.kind)}</p><h2 className="mt-1 text-2xl font-medium">{tx(c.title)}</h2><p className="mt-2 text-gray-600">{tx(c.text)}</p></li>
        ))}
      </ol>
    </div></div>
  );
}

const postMeta = (date: string, minutes: number) => `${formatDate(date)} · ${t('{n} min read', { n: minutes })}`;

export function Blog() {
  useDocumentTitle(`${t('Blog')} · FrameFlow`);
  const posts = allPosts();
  const featured = posts.find((p) => p.featured) ?? posts[0];
  return (
    <div className="gut"><div className="mx-auto max-w-7xl py-16">
      <p className="eyebrow">{t('Blog')}</p><h1 className={H1}>{t('Tutorials & stories')}</h1>
      {featured && (
        <Link to={`/blog/${featured.slug}`} className="card lift mt-10 grid md:grid-cols-2">
          <div className="thumb min-h-64" style={{ '--a': featured.a, '--b': featured.b } as React.CSSProperties} />
          <div className="p-10"><p className="eyebrow">{t('Featured')} · {featured.category}</p><h2 className="mt-2 text-3xl font-medium">{featured.title}</h2><p className="mt-3 text-gray-600">{featured.excerpt}</p><p className="mt-6 text-sm text-gray-500">{featured.author} · {postMeta(featured.date, featured.minutes)}</p></div>
        </Link>
      )}
      <ul role="list" className="mt-8 grid gap-6 md:grid-cols-3">
        {posts.filter((p) => p !== featured).map((p) => (
          <li key={p.slug}><Link to={`/blog/${p.slug}`} className="card lift block"><div className="thumb h-44" style={{ '--a': p.a, '--b': p.b } as React.CSSProperties} /><div className="p-6"><p className="eyebrow">{p.category}</p><h2 className="mt-1 text-lg font-medium">{p.title}</h2><p className="mt-3 text-xs text-gray-500">{postMeta(p.date, p.minutes)}</p></div></Link></li>
        ))}
      </ul>
    </div></div>
  );
}

export function BlogPost() {
  const { slug } = useParams();
  const post = allPosts().find((p) => p.slug === slug);
  useDocumentTitle(post ? `${post.title} · FrameFlow` : 'FrameFlow');
  if (!post) return <NotFoundSite />;
  return (
    <div className="gut"><article className="mx-auto max-w-3xl py-16">
      <Link to="/blog" className="text-sm text-gray-500">← {t('Blog')}</Link>
      <p className="eyebrow mt-6">{post.category} · {postMeta(post.date, post.minutes)}</p>
      <h1 className="mt-2 text-4xl font-medium tracking-tight sm:text-5xl">{post.title}</h1>
      <div className="mt-6 flex items-center gap-3 text-sm"><span className="grad size-10 rounded-full" /><div><p className="font-medium">{post.author}</p><p className="text-gray-500">{post.role}</p></div></div>
      <div className="thumb mt-10 aspect-video rounded-4xl" style={{ '--a': post.a, '--b': post.b } as React.CSSProperties} />
      <div className="mt-10 space-y-5 text-lg leading-relaxed text-gray-800">{renderMarkdown(post.body)}</div>
    </article></div>
  );
}

export function Help() {
  useDocumentTitle(`${t('Help center')} · FrameFlow`);
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const faq = useMemo(() => HELP_FAQ.map(([a, b]) => [tx(a), tx(b)] as [string, string]).filter(([a, b]) => !needle || `${a} ${b}`.toLowerCase().includes(needle)), [needle]);
  const cats = HELP_CATEGORIES.filter(([a, b]) => !needle || `${tx(a)} ${tx(b)}`.toLowerCase().includes(needle));
  return (
    <>
      <div className="gut"><div className="mx-auto max-w-7xl pt-6"><div className="grad rounded-4xl p-10 text-center sm:p-16">
        <h1 className="text-4xl font-medium tracking-tight sm:text-5xl">{t('How can we help?')}</h1>
        <label htmlFor="help-q" className="sr-only">{t('Search help articles')}</label>
        <input id="help-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} className="mt-8 w-full max-w-xl rounded-full px-6 py-4 shadow-lg" placeholder={t('Search help articles')} />
      </div></div></div>
      <div className="gut"><ul role="list" className="mx-auto grid max-w-7xl gap-4 py-14 md:grid-cols-3">
        {cats.map(([a, b]) => <li key={a} className="card p-8"><h2 className="text-lg font-medium">{tx(a)}</h2><p className="mt-2 text-sm text-gray-500">{tx(b)}</p><Link to="/contact" className="mt-4 inline-block text-sm font-medium">{t('Ask us about this')} →</Link></li>)}
      </ul></div>
      <div className="gut border-t border-black/10 bg-gray-50"><div className="mx-auto max-w-3xl py-16"><h2 className="text-3xl font-medium">{t('Frequently asked')}</h2>{faq.length ? <Faq items={faq} /> : <p className="mt-6 text-gray-600">{t('No answers match. Try other words or contact us.')}</p>}</div></div>
    </>
  );
}

export function Creators() {
  useDocumentTitle(`${t('For creators')} · FrameFlow`);
  return (
    <>
      <div className="gut"><div className="mx-auto grid max-w-7xl items-center gap-12 py-16 lg:grid-cols-2">
        <div><p className="eyebrow">{t('For creators')}</p><h1 className={H1}>{t('Get your work into thousands of edits.')}</h1><p className="mt-4 text-lg text-gray-600">{t('We work with motion designers, sound designers, colourists and type designers. Accepted assets are published to every FrameFlow editor and you earn from each download on paid plans.')}</p><Link to="/contact?topic=creator" className="btn btn-p mt-8">{t('Apply as a creator')}</Link></div>
        <dl className="grid grid-cols-2 gap-4">{CREATOR_STATS.map((s) => <div key={s.label} className="card p-6"><dd className="text-4xl font-medium">{tx(s.value)}</dd><dt className="text-sm text-gray-500">{tx(s.label)}</dt></div>)}</dl>
      </div></div>
      <div className="gut border-y border-black/10 bg-gray-50"><div className="mx-auto max-w-7xl py-16"><h2 className="text-3xl font-medium">{t('How submission works')}</h2>
        <ol className="mt-8 grid gap-4 text-sm md:grid-cols-4">{CREATOR_STEPS.map(([a, b], i) => <li key={a} className="card p-6"><p className="eyebrow">{t('Step {n}', { n: i + 1 })}</p><h3 className="mt-1 text-base font-medium">{tx(a)}</h3><p className="mt-2 text-gray-600">{tx(b)}</p></li>)}</ol>
      </div></div>
    </>
  );
}

export function About() {
  useDocumentTitle(`${t('About')} · FrameFlow`);
  return (
    <div className="gut"><div className="mx-auto max-w-7xl py-16">
      <p className="eyebrow">{t('About')}</p><h1 className={clsx(H1, 'max-w-3xl')}>{t('Built in Sri Lanka for editors everywhere.')}</h1>
      <p className="mt-6 max-w-2xl text-lg text-gray-600">{t('FrameFlow is part of WorkSuite by Livezen Technologies. We started the library because finding, licensing and installing assets took longer than the edit itself. Now it takes one click.')}</p>
      <div className="mt-12 grid gap-4 sm:grid-cols-3" aria-hidden="true"><div className="thumb h-64 rounded-4xl" style={{ '--a': '#fbbf24', '--b': '#ee87cb' } as React.CSSProperties} /><div className="thumb h-64 rounded-4xl" style={{ '--a': '#b060ff', '--b': '#0ea5e9' } as React.CSSProperties} /><div className="thumb h-64 rounded-4xl" style={{ '--a': '#111827', '--b': '#ee87cb' } as React.CSSProperties} /></div>
      <div className="mt-16 grid gap-8 md:grid-cols-3">
        <div><h2 className="font-medium">{t('Made for local scripts')}</h2><p className="mt-2 text-sm text-gray-600">{t('Every text template is tested with Sinhala and Tamil, not just Latin type.')}</p></div>
        <div><h2 className="font-medium">{t('Clear licences')}</h2><p className="mt-2 text-sm text-gray-600">{t('Each asset shows exactly how you can use it, before you download.')}</p></div>
        <div><h2 className="font-medium">{t('No restarts, no hunting')}</h2><p className="mt-2 text-sm text-gray-600">{t('Assets install to the right place and appear in the right panel.')}</p></div>
      </div>
    </div></div>
  );
}

/** mailto: link for the contact form (there is no contact endpoint). */
export function contactMailto(f: { name: string; email: string; topic: string; message: string }, to: string): string {
  const body = `${f.message}\n\n— ${f.name} <${f.email}>`;
  return `mailto:${to}?subject=${encodeURIComponent(`[FrameFlow] ${f.topic}`)}&body=${encodeURIComponent(body)}`;
}

export function Contact() {
  useDocumentTitle(`${t('Contact')} · FrameFlow`);
  const initialTopic = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('topic') === 'creator' ? CONTACT_TOPICS[1] : CONTACT_TOPICS[0];
  const [f, setF] = useState({ name: '', email: '', topic: initialTopic as string, message: '' });
  const [opened, setOpened] = useState(false);
  const to = f.topic === CONTACT_TOPICS[0] ? CONTACT.sales : CONTACT.support;
  return (
    <div className="gut"><div className="mx-auto grid max-w-7xl gap-12 py-16 lg:grid-cols-2">
      <div>
        <p className="eyebrow">{t('Contact')}</p><h1 className={H1}>{t('Talk to us')}</h1><p className="mt-4 text-gray-600">{t('Sales, creator applications, licensing questions or support for teams.')}</p>
        <dl className="mt-8 space-y-4 text-sm">
          <div><dt className="eyebrow">{t('Support')}</dt><dd className="mt-1 select-all"><a href={`mailto:${CONTACT.support}`}>{CONTACT.support}</a></dd></div>
          <div><dt className="eyebrow">{t('Sales & teams')}</dt><dd className="mt-1 select-all"><a href={`mailto:${CONTACT.sales}`}>{CONTACT.sales}</a></dd></div>
          <div><dt className="eyebrow">{t('Office')}</dt><dd className="mt-1">{tx(CONTACT.office)}</dd></div>
        </dl>
      </div>
      <form className="card grid gap-4 p-8 text-sm sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); window.location.href = contactMailto({ ...f, topic: tx(f.topic) }, to); setOpened(true); }}>
        <label className="grid gap-1">{t('Name')}<input className="field" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></label>
        <label className="grid gap-1">{t('Email')}<input className="field" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></label>
        <label className="grid gap-1 sm:col-span-2">{t('Topic')}<select className="field" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })}>{CONTACT_TOPICS.map((x) => <option key={x} value={x}>{tx(x)}</option>)}</select></label>
        <label className="grid gap-1 sm:col-span-2">{t('Message')}<textarea className="field" rows={5} required value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></label>
        <button type="submit" className="btn btn-p sm:col-span-2">{t('Write the email')}</button>
        <p className="text-xs text-gray-500 sm:col-span-2">{t('This opens your email app with the message filled in, addressed to {to}. Nothing is sent from this site.', { to })}</p>
        {opened && <p role="status" className="text-emerald-700 sm:col-span-2">{t('Your email app should have opened. If it didn’t, write to {to}.', { to })}</p>}
      </form>
    </div></div>
  );
}

export function Licence() {
  useDocumentTitle(`${t('Asset licence')} · FrameFlow`);
  return (
    <div className="gut"><div className="mx-auto max-w-3xl py-16 text-gray-800">
      <p className="eyebrow">{t('Legal · updated {date}', { date: formatDate(LICENCE_UPDATED) })}</p><h1 className={clsx(H1, 'text-gray-950')}>{t('Asset licence')}</h1>
      <p className="mt-6">{t('This summary explains how you may use assets from the FrameFlow Library. The full agreement applies.')}</p>
      <div className="mt-8 grid gap-4 text-sm sm:grid-cols-2">
        <div className="card p-6"><h2 className="font-medium text-emerald-700">{t('You can')}</h2><ul className="mt-2 list-disc space-y-1 pl-5">{LICENCE_CAN.map((x) => <li key={x}>{tx(x)}</li>)}</ul></div>
        <div className="card p-6"><h2 className="font-medium text-red-700">{t('You can’t')}</h2><ul className="mt-2 list-disc space-y-1 pl-5">{LICENCE_CANT.map((x) => <li key={x}>{tx(x)}</li>)}</ul></div>
      </div>
    </div></div>
  );
}
