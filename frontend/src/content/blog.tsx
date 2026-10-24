// Blog posts from src/content/blog/*.md (front matter + a small Markdown subset: ## headings, paragraphs, **bold**).
// Posts are in English; translated posts can be added later as <slug>.<lang>.md.
import { Fragment, type ReactNode } from 'react';
import { getLocale } from '@/i18n';

export interface Post {
  slug: string;
  title: string;
  category: string;
  date: string;
  minutes: number;
  author: string;
  role: string;
  excerpt: string;
  featured: boolean;
  a: string;
  b: string;
  body: string;
}

const files = import.meta.glob('./blog/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export function parsePost(slug: string, raw: string): Post {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  const meta: Record<string, string> = {};
  for (const line of (m?.[1] ?? '').split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"(.*)"$/, '$1');
  }
  return {
    slug,
    title: meta.title ?? slug,
    category: meta.category ?? '',
    date: meta.date ?? '',
    minutes: Number(meta.minutes ?? 5),
    author: meta.author ?? '',
    role: meta.role ?? '',
    excerpt: meta.excerpt ?? '',
    featured: meta.featured === 'true',
    a: meta.a ?? '#7c2d12',
    b: meta.b ?? '#fbbf24',
    body: (m?.[2] ?? raw).trim(),
  };
}

export function allPosts(): Post[] {
  const lang = getLocale();
  const bySlug = new Map<string, Post>();
  for (const [path, raw] of Object.entries(files)) {
    const name = path.split('/').pop()!.replace(/\.md$/, '');
    const [slug, l] = name.split('.');
    if (l && l !== lang) continue;
    if (!l && bySlug.has(slug)) continue;
    bySlug.set(slug, parsePost(slug, raw));
  }
  return [...bySlug.values()].sort((x, y) => y.date.localeCompare(x.date));
}

function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : <Fragment key={i}>{p}</Fragment>));
}

export function renderMarkdown(body: string): ReactNode {
  return body.split(/\n{2,}/).map((block, i) =>
    block.startsWith('## ') ? (
      <h2 key={i} className="pt-4 text-2xl font-medium text-gray-950">{inline(block.slice(3))}</h2>
    ) : (
      <p key={i}>{inline(block.replace(/\n/g, ' '))}</p>
    ),
  );
}
