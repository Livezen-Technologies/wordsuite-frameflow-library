import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowsePage } from '@/pages/public/BrowsePage';
import { mockFetch, renderAt, Route } from './utils';
import { setToken } from '@/services/auth';
import type { PublicAsset } from '@/types/api';

afterEach(() => vi.unstubAllGlobals());

const asset = (i: number, p: Partial<PublicAsset> = {}): PublicAsset => ({
  id: `as_${i}`, slug: `asset-${i}`, type: 'lut', title: `Asset ${i}`, description: '', category: { id: 'c1', name: 'Cinematic', slug: 'cinematic' }, tags: [], keywords: [], aspect_ratios: ['any'],
  licence_tier: 'free', licence_terms: 'royalty_free', attribution_required: false, attribution_text: '', author: '', min_app_version: '1.0.0', current_version: '1.0.0', file_size_bytes: 10,
  checksum_sha256: null, featured: false, meta: {}, pack_id: `lut-asset-${i}`, pack_type: 'luts', thumbnail_url: null, published_at: null, stats: { downloads: 0, installs: 0, favorites: 0, applies: 0 }, ...p,
});

describe('Browse library data flow', () => {
  it('maps filters to GET /assets, pages with the cursor, and links cards to detail', async () => {
    setToken(null);
    const user = userEvent.setup();
    const { calls } = mockFetch({
      'GET /api/v1/assets': (c) => {
        const u = new URL(c.url, 'http://x');
        if (u.searchParams.get('cursor') === '24') return { data: [asset(25)], next_cursor: null, total: 25 };
        if (u.searchParams.get('type') === 'lut') return { data: [asset(1), asset(2)], next_cursor: '24', total: 25 };
        return { data: [asset(1)], next_cursor: null, total: 1 };
      },
      'GET /api/v1/catalog/categories': () => ({ data: [{ id: 'c1', type: 'lut', name: 'Cinematic', slug: 'cinematic', parent_id: null, sort: 0, icon: null, visible: true }] }),
      'GET /api/v1/search/suggest': () => ({ data: [{ id: 'as_9', title: 'Teal Orange', type: 'lut' }] }),
    });
    renderAt('/library', <Route path="/library" element={<BrowsePage />} />, { signedIn: false });

    expect(await screen.findByText('1 asset')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Type'), 'lut');
    expect(await screen.findByText('25 assets')).toBeInTheDocument();
    const list = screen.getAllByRole('list').find((l) => within(l).queryByText('Asset 2'))!;
    expect(within(list).getAllByRole('link')).toHaveLength(2);
    expect(within(list).getByRole('link', { name: /Asset 1/ })).toHaveAttribute('href', '/library/asset-1');

    await user.selectOptions(screen.getByLabelText('Category'), 'cinematic');
    await user.selectOptions(screen.getByLabelText('Plan'), 'pro');
    await user.selectOptions(screen.getByLabelText('Sort'), 'new');
    await waitFor(() => {
      const last = new URL(calls.filter((c) => c.path === '/api/v1/assets').at(-1)!.url, 'http://x');
      expect(Object.fromEntries(last.searchParams)).toMatchObject({ type: 'lut', category: 'cinematic', tier: 'pro', sort: 'new', limit: '24' });
    });

    await user.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Asset 25')).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('cursor=24'))).toBe(true);
    expect(calls.every((c) => !c.headers.Authorization)).toBe(true);

    await user.type(screen.getByLabelText('Search the library'), 'te');
    expect(await screen.findByRole('option', { name: /Teal Orange/ })).toBeInTheDocument();
    expect(calls.some((c) => c.path === '/api/v1/search/suggest' && c.url.includes('q=te'))).toBe(true);
  });
});

describe('Generated previews on cards', () => {
  it('adds the hover MP4 when preview.hover is present', async () => {
    setToken(null);
    mockFetch({ 'GET /api/v1/assets': () => ({ data: [asset(1, { thumbnail_url: '/previews/a/1.0.0/thumbnail.webp', preview: { hover: '/previews/a/1.0.0/hover.mp4', thumbnail: '/previews/a/1.0.0/thumbnail.webp' } }), asset(2)], next_cursor: null, total: 2 }) });
    const { container } = renderAt('/library', <Route path="/library" element={<BrowsePage />} />, { signedIn: false });
    await screen.findByText('Asset 1');
    const videos = container.querySelectorAll('video');
    expect(videos).toHaveLength(1);
    expect(videos[0]).toHaveAttribute('src', '/previews/a/1.0.0/hover.mp4');
    expect(container.querySelector('img[src="/previews/a/1.0.0/thumbnail.webp"]')).not.toBeNull();
  });
});
