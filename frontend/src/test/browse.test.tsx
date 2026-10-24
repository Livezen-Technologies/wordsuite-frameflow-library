import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Browse as BrowsePage } from '@/pages/site/Library';
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
  it('maps search, type, plan and sort to GET /assets, pages with the cursor, and links cards to detail', async () => {
    setToken(null);
    const user = userEvent.setup();
    const { calls } = mockFetch({
      'GET /api/v1/catalog/types': () => ({ data: [{ key: 'lut', name: 'LUTs', pack_type: 'luts', editor_target: '', count: 25 }] }),
      'GET /api/v1/assets': (c) => {
        const u = new URL(c.url, 'http://x');
        if (u.searchParams.get('cursor') === '16') return { data: [asset(25)], next_cursor: null, total: 25 };
        if (u.searchParams.get('type') === 'lut') return { data: [asset(1), asset(2)], next_cursor: '16', total: 25 };
        return { data: [asset(1)], next_cursor: null, total: 1 };
      },
    });
    renderAt('/library', <Route path="/library" element={<BrowsePage />} />, { signedIn: false });

    expect(await screen.findByText('1 result')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Browse 25 assets' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'LUTs & colour presets' }));
    expect(await screen.findByText('25 results')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Asset 1/ })).toHaveAttribute('href', '/library/asset-1');

    await user.click(screen.getAllByRole('checkbox', { name: 'pro' })[0]);
    await user.selectOptions(screen.getByLabelText('Sort'), 'new');
    await waitFor(() => {
      const last = new URL(calls.filter((c) => c.path === '/api/v1/assets').at(-1)!.url, 'http://x');
      expect(Object.fromEntries(last.searchParams)).toMatchObject({ type: 'lut', tier: 'pro', sort: 'new', limit: '16' });
    });
    await user.click(await screen.findByRole('button', { name: 'Next →' }));
    expect(await screen.findByText('Asset 25')).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('cursor=16'))).toBe(true);
    expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-current', 'page');
    expect(calls.every((c) => !c.headers.Authorization)).toBe(true);

    await user.type(screen.getByLabelText('Search the library'), 'glitch{enter}');
    await waitFor(() => expect(calls.some((c) => c.url.includes('q=glitch'))).toBe(true));
  });

  it('applies aspect and feature filters to the loaded page and says so', async () => {
    setToken(null);
    const user = userEvent.setup();
    mockFetch({ 'GET /api/v1/assets': () => ({ data: [asset(1, { aspect_ratios: ['9:16'] }), asset(2, { aspect_ratios: ['16:9'], meta: { loop: true } })], next_cursor: null, total: 2 }) });
    renderAt('/library', <Route path="/library" element={<BrowsePage />} />, { signedIn: false });
    await screen.findByText('Asset 1');
    await user.click(screen.getAllByRole('checkbox', { name: '9:16 Reels' })[0]);
    expect(await screen.findByText('1 of 2 results on this page match the extra filters')).toBeInTheDocument();
    expect(screen.queryByText('Asset 2')).not.toBeInTheDocument();
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
