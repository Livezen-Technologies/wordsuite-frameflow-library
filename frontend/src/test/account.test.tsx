import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FavoritesPage } from '@/pages/account/FavoritesPage';
import { DevicesPage } from '@/pages/account/DevicesPage';
import { DownloadsPage } from '@/pages/account/DownloadsPage';
import { Browse as BrowsePage } from '@/pages/site/Library';
import { setToken } from '@/services/auth';
import type { PublicAsset } from '@/types/api';
import { mockFetch, renderAt, Route } from './utils';

afterEach(() => vi.unstubAllGlobals());

const asset = (i: number): PublicAsset => ({
  id: `as_${i}`, slug: `asset-${i}`, type: 'lut', title: `Asset ${i}`, description: '', category: null, tags: [], keywords: [], aspect_ratios: ['any'],
  licence_tier: 'free', licence_terms: 'royalty_free', attribution_required: false, attribution_text: '', author: '', min_app_version: '1.0.0', current_version: '1.0.0', file_size_bytes: 10,
  checksum_sha256: null, featured: false, meta: {}, pack_id: `lut-asset-${i}`, pack_type: 'luts', thumbnail_url: null, published_at: null, stats: { downloads: 0, installs: 0, favorites: 0, applies: 0 },
});
const USER = { status: 403, body: { error: { code: 'FORBIDDEN', message: 'no role' } } };

describe('Favorites', () => {
  it('toggles the heart optimistically and rolls back when the API refuses', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch({
      'GET /api/v1/admin/me': () => USER,
      'GET /api/v1/me/favorites': () => ({ data: [] }),
      'GET /api/v1/assets': () => ({ data: [asset(1), asset(2)], next_cursor: null, total: 2 }),
      'PUT /api/v1/me/favorites/:id': (c) => (c.path.endsWith('as_2') ? { status: 500, body: { error: { code: 'SERVER_ERROR', message: 'Database down' } } } : { status: 204, body: null }),
    });
    setToken('user-token');
    renderAt('/library', <Route path="/library" element={<BrowsePage />} />, { signedIn: false });
    const heart1 = await screen.findByRole('button', { name: 'Add Asset 1 to favorites' });
    await user.click(heart1);
    expect(await screen.findByRole('button', { name: 'Remove Asset 1 from favorites' })).toHaveAttribute('aria-pressed', 'true');
    expect(calls.some((c) => c.method === 'PUT' && c.path === '/api/v1/me/favorites/as_1')).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Add Asset 2 to favorites' }));
    expect(await screen.findByText('Couldn’t add it to your favorites')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Asset 2 to favorites' })).toHaveAttribute('aria-pressed', 'false'));
    expect(screen.getByRole('button', { name: 'Remove Asset 1 from favorites' })).toBeInTheDocument();
  });

  it('sends signed-out visitors to sign in', async () => {
    const user = userEvent.setup();
    mockFetch({ 'GET /api/v1/assets': () => ({ data: [asset(1)], next_cursor: null, total: 1 }) });
    setToken(null);
    renderAt('/library', <><Route path="/library" element={<BrowsePage />} /><Route path="/login" element={<p>login page</p>} /></>, { signedIn: false });
    await user.click(await screen.findByRole('button', { name: 'Add Asset 1 to favorites' }));
    expect(await screen.findByText('login page')).toBeInTheDocument();
  });

  it('lists favorites, and shows the error state when /me/favorites isn’t live', async () => {
    mockFetch({ 'GET /api/v1/admin/me': () => USER });
    setToken('user-token');
    renderAt('/account/favorites', <Route path="/account/favorites" element={<FavoritesPage />} />, { signedIn: false });
    expect(await screen.findByText('Couldn’t load your favorites')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('Devices', () => {
  it('shows the limit, explains DEVICE_LIMIT and revokes a device', async () => {
    const user = userEvent.setup();
    let devices = [
      { id: 'd1', name: 'Studio PC', os: 'windows', app_version: '2.4.0', created_at: '2026-09-01T00:00:00Z', last_seen_at: new Date().toISOString() },
      { id: 'd2', name: 'MacBook', os: 'macos', app_version: '2.4.0', created_at: '2026-09-02T00:00:00Z', last_seen_at: new Date().toISOString() },
    ];
    const { calls } = mockFetch({
      'GET /api/v1/admin/me': () => USER,
      'GET /api/v1/me/devices': () => ({ data: devices, limit: 2 }),
      'DELETE /api/v1/me/devices/:id': (c) => {
        devices = devices.filter((d) => !c.path.endsWith(d.id));
        return { status: 204, body: null };
      },
    });
    setToken('user-token');
    renderAt('/account/devices', <Route path="/account/devices" element={<DevicesPage />} />, { signedIn: false });
    expect(await screen.findByText('2 of 2 devices used')).toBeInTheDocument();
    expect(screen.getByText(/FrameFlow shows DEVICE_LIMIT/)).toBeInTheDocument();
    expect(screen.getByText('You’re at your limit: revoke a device before adding another.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Revoke MacBook' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Revoke device' }));
    expect(await screen.findByText('1 of 2 devices used')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'DELETE')!.path).toBe('/api/v1/me/devices/d2');
  });
});

describe('Downloads', () => {
  it('lists the download history with load more', async () => {
    const user = userEvent.setup();
    mockFetch({
      'GET /api/v1/admin/me': () => USER,
      'GET /api/v1/me/downloads': (c) =>
        new URL(c.url, 'http://x').searchParams.get('cursor') === 'p2'
          ? { data: [{ id: 'dl2', asset: null, version: '0.9.0', device_id: 'd1', status: 'completed', bytes: 100, started_at: '2026-10-01T00:00:00Z', finished_at: null }], next_cursor: null }
          : { data: [{ id: 'dl1', asset: asset(1), version: '1.0.0', device_id: 'd1', status: 'completed', bytes: 2048, started_at: '2026-10-02T00:00:00Z', finished_at: null }], next_cursor: 'p2' },
    });
    setToken('user-token');
    renderAt('/account/downloads', <Route path="/account/downloads" element={<DownloadsPage />} />, { signedIn: false });
    expect(await screen.findByRole('link', { name: 'Asset 1' })).toHaveAttribute('href', '/library/asset-1');
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('An asset that’s no longer available')).toBeInTheDocument();
  });

  it('redirects signed-out visitors to sign in', async () => {
    mockFetch({});
    setToken(null);
    renderAt('/account/downloads', <><Route path="/account/downloads" element={<DownloadsPage />} /><Route path="/login" element={<p>login page</p>} /></>, { signedIn: false });
    expect(await screen.findByText('login page')).toBeInTheDocument();
  });
});
