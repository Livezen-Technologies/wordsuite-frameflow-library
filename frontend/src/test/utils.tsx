import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { vi } from 'vitest';
import { Providers } from '@/app/Providers';
import { createQueryClient } from '@/app/queryClient';
import { setToken } from '@/services/auth';
import type { Asset, Upload } from '@/types/api';

export interface Call {
  method: string;
  url: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}
type Handler = (call: Call) => { status?: number; body: unknown } | unknown;

/** Stubs global fetch with `"METHOD /path"` → handler (path without query; `:x` segments match anything). */
export function mockFetch(routes: Record<string, Handler>) {
  const calls: Call[] = [];
  const compiled = Object.entries(routes).map(([k, h]) => {
    const [method, pattern] = k.split(' ');
    return { method, re: new RegExp(`^${pattern.replace(/:[a-z_]+/g, '[^/]+')}$`), h };
  });
  const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const path = new URL(url, 'http://localhost').pathname;
    const method = init.method ?? 'GET';
    let body: unknown = init.body;
    if (typeof init.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        /* raw */
      }
    }
    const call: Call = { method, url, path, headers: (init.headers ?? {}) as Record<string, string>, body };
    calls.push(call);
    const hit = compiled.find((r) => r.method === method && r.re.test(path));
    if (!hit) return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: `No mock for ${method} ${path}`, details: [] } }), { status: 404 });
    const out = hit.h(call) as { status?: number; body: unknown } | undefined;
    const res = out && typeof out === 'object' && 'body' in out ? out : { status: 200, body: out };
    if (res.status === 204) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(res.body), { status: res.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn);
  return { calls, fn };
}

export function renderAt(path: string, routes: ReactElement, { signedIn = true } = {}) {
  if (signedIn) setToken('dev-admin');
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false, staleTime: 0 } });
  return render(
    <Providers client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>{routes}</Routes>
      </MemoryRouter>
    </Providers>,
  );
}

export { Route };

export const ME = { id: 'admin', role: 'super_admin', plan: 'enterprise' };

export function makeUpload(p: Partial<Upload> = {}): Upload {
  return {
    id: 'up_1',
    filename: 'teal-orange.cube',
    sha256: 'a'.repeat(64),
    size: 1234,
    type: 'lut',
    checks: [
      { check: 'extension', passed: true },
      { check: 'magic_bytes', passed: true },
      { check: 'lut.size', passed: true, detail: { size: 17 } },
      { check: 'malware_scan', passed: true },
    ],
    meta: { size: 17 },
    duplicate_of: null,
    created_by: 'admin',
    created_at: '2026-10-01T00:00:00.000Z',
    ...p,
  };
}

export function makeAsset(p: Partial<Asset> = {}): Asset {
  return {
    id: 'as_1',
    type: 'lut',
    slug: 'teal-orange',
    title: 'Teal Orange',
    description: '',
    tags: ['cinematic'],
    keywords: [],
    min_app_version: '1.0.0',
    licence_tier: 'free',
    licence_terms: 'royalty_free',
    licence_text: '',
    visibility: 'public',
    category_id: 'cat_lut',
    category: null,
    attribution_required: false,
    attribution_text: '',
    author: '',
    aspect_ratios: ['any'],
    platforms: ['windows', 'macos', 'linux'],
    audience_rules: [],
    dependencies: [],
    featured: false,
    publish_at: null,
    unpublish_at: null,
    meta: { size: 17 },
    thumbnail_file: null,
    status: 'approved',
    current_version: '1.0.0',
    published_version: null,
    pending_version: null,
    versions: [{ id: 'v1', version: '1.0.0', changelog: '', is_breaking: false, min_app_version: '1.0.0', files: [{ role: 'main', filename: 'teal-orange.cube', sha256: 'a'.repeat(64), size: 1234 }], checks: makeUpload().checks, meta: { size: 17 }, status: 'ready', package: null, created_by: 'admin', created_at: '2026-10-01T00:00:00.000Z' }],
    stats: { downloads: 0, installs: 0, favorites: 0, applies: 0 },
    review: null,
    created_by: 'admin',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_by: 'admin',
    updated_at: '2026-10-01T00:00:00.000Z',
    published_by: null,
    published_at: null,
    ...p,
  };
}
