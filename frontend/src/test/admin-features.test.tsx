import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CollectionEditor, moveTo } from '@/pages/admin/CollectionEditor';
import { Collections, windowState } from '@/pages/admin/Collections';
import { Categories } from '@/pages/admin/Categories';
import { AccessTiers, badOrigins } from '@/pages/admin/AccessTiers';
import { Webhooks } from '@/pages/admin/Webhooks';
import { Analytics } from '@/pages/admin/Analytics';
import { AssetEditor } from '@/pages/admin/AssetEditor';
import { normalizeRules } from '@/components/AudienceRules';
import { makeAsset, ME, mockFetch, renderAt, Route } from './utils';

afterEach(() => vi.unstubAllGlobals());

const assets = [makeAsset({ id: 'a1', title: 'Alpha LUT' }), makeAsset({ id: 'a2', title: 'Beta LUT', slug: 'beta' }), makeAsset({ id: 'a3', title: 'Gamma LUT', slug: 'gamma' })];
const page = (data: unknown[]) => ({ data, next_cursor: null, total: data.length });

describe('A9 Collections', () => {
  it('reorders with the keyboard-friendly buttons and saves the order', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch({
      'GET /api/v1/admin/me': () => ME,
      'GET /api/v1/admin/assets': () => page(assets),
      'GET /api/v1/admin/collections/:slug': () => ({ slug: 'vesak', title: 'Vesak', description: '', asset_ids: ['a1', 'a2', 'a3'], publish_at: null, unpublish_at: null, visible: true }),
      'PATCH /api/v1/admin/collections/:slug': (c) => c.body,
    });
    renderAt('/admin/collections/vesak', <Route path="/admin/collections/:slug" element={<CollectionEditor />} />);
    await user.click(await screen.findByRole('button', { name: 'Move Gamma LUT up' }));
    expect(screen.getAllByTestId('collection-item').map((li) => within(li).getByRole('link').textContent)).toEqual(['Alpha LUT', 'Gamma LUT', 'Beta LUT']);
    expect(screen.getByRole('status', { name: '' })).toBeDefined();
    expect(screen.getByText('Gamma LUT moved to position 2 of 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove Alpha LUT' }));
    await user.click(screen.getAllByRole('button', { name: 'Save changes' })[0]);
    await screen.findByText('Collection saved');
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.path).toBe('/api/v1/admin/collections/vesak');
    expect(patch.body).toMatchObject({ slug: 'vesak', asset_ids: ['a3', 'a2'], visible: true });
  });

  it('creates a collection with a slug from the title and a schedule window', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch({
      'GET /api/v1/admin/me': () => ME,
      'GET /api/v1/admin/assets': () => page(assets),
      'POST /api/v1/admin/collections': (c) => ({ status: 201, body: c.body }),
      'GET /api/v1/admin/collections/:slug': () => ({ slug: 'wedding-season', title: 'Wedding season', description: '', asset_ids: ['a2'], visible: false }),
    });
    renderAt('/admin/collections/new', <Route path="/admin/collections/:slug" element={<CollectionEditor />} />);
    await user.type(await screen.findByLabelText('Title'), 'Wedding season');
    expect(screen.getByLabelText('Slug')).toHaveValue('wedding-season');
    await user.type(screen.getByLabelText('Show from'), '2030-01-01T09:00');
    await user.click(screen.getByRole('switch', { name: 'Visible' }));
    await user.type(screen.getByLabelText('Search assets'), 'beta');
    await user.click(screen.getByRole('button', { name: 'Add Beta LUT' }));
    await user.click(screen.getByRole('button', { name: 'Create collection' }));
    await screen.findByText('Collection created');
    const post = calls.find((c) => c.method === 'POST')!.body as Record<string, unknown>;
    expect(post).toMatchObject({ slug: 'wedding-season', title: 'Wedding season', asset_ids: ['a2'], visible: false, unpublish_at: null });
    expect(new Date(post.publish_at as string).getTime()).toBe(new Date('2030-01-01T09:00').getTime());
  });

  it('shows the error state when the collections endpoint isn’t live', async () => {
    mockFetch({ 'GET /api/v1/admin/me': () => ME });
    renderAt('/admin/collections', <Route path="/admin/collections" element={<Collections />} />);
    expect(await screen.findByText('Couldn’t load collections')).toBeInTheDocument();
    expect(screen.getByText(/No mock for GET \/api\/v1\/admin\/collections/)).toBeInTheDocument();
  });

  it('helpers: drag move and window state', () => {
    expect(moveTo(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(windowState({ visible: true, publish_at: '2999-01-01T00:00:00Z' })).toBe('scheduled');
    expect(windowState({ visible: true, unpublish_at: '2000-01-01T00:00:00Z' })).toBe('ended');
    expect(windowState({ visible: false })).toBe('hidden');
    expect(windowState({ visible: true })).toBe('live');
  });
});

describe('A8 Categories', () => {
  const cats = [
    { id: 'c1', type: 'lut', name: 'Cinematic', slug: 'cinematic', parent_id: null, sort: 0, icon: null, visible: true },
    { id: 'c2', type: 'lut', name: 'Vintage', slug: 'vintage', parent_id: null, sort: 1, icon: null, visible: false },
  ];
  it('reorders, edits and explains why a category can’t be deleted', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch({
      'GET /api/v1/admin/me': () => ME,
      'GET /api/v1/admin/categories': () => ({ data: cats }),
      'POST /api/v1/admin/categories/reorder': () => ({ status: 204, body: null }),
      'PATCH /api/v1/admin/categories/:id': (c) => ({ ...cats[0], ...(c.body as object) }),
      'DELETE /api/v1/admin/categories/:id': () => ({ status: 409, body: { error: { code: 'CATEGORY_IN_USE', message: 'in use', details: [] } } }),
    });
    renderAt('/admin/categories', <Route path="/admin/categories" element={<Categories />} />);
    expect(await screen.findByText('Hidden')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Move Vintage up' }));
    await waitFor(() => expect(calls.find((c) => c.path.endsWith('/reorder'))?.body).toEqual({ ids: ['c2', 'c1'] }));

    await user.click(screen.getByRole('button', { name: 'Edit Cinematic' }));
    const name = await screen.findByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Film');
    await user.type(screen.getByLabelText('Icon'), '🎬');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Category saved');
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ name: 'Film', icon: '🎬', visible: true, parent_id: null });

    await user.click(screen.getByRole('button', { name: 'Delete Cinematic' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('This category still has assets. Move them to another category before deleting it.')).toBeInTheDocument();
  });

  it('merges tags', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch({ 'GET /api/v1/admin/me': () => ME, 'GET /api/v1/admin/categories': () => ({ data: [] }), 'POST /api/v1/admin/tags/merge': () => ({ updated: 4 }) });
    renderAt('/admin/categories', <Route path="/admin/categories" element={<Categories />} />);
    await user.type(await screen.findByLabelText('From tags'), 'colour, colours');
    await user.type(screen.getByLabelText('Into tag'), 'color');
    await user.click(screen.getByRole('button', { name: 'Merge' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Merge' }));
    expect(await screen.findByText('4 assets updated')).toBeInTheDocument();
    expect(calls.find((c) => c.path.endsWith('/tags/merge'))!.body).toEqual({ from: ['colour', 'colours'], into: 'color' });
  });
});

describe('A10 Access & tiers', () => {
  const settings = { device_limits: { free: 2, pro: 3, business: 10, enterprise: 50 }, require_processing: false, cors_origins: ['https://a.example'], feed: { stable: ['public'], beta: ['public', 'internal'] } };
  it('loads and saves the settings form', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch({ 'GET /api/v1/admin/me': () => ME, 'GET /api/v1/admin/settings': () => settings, 'PUT /api/v1/admin/settings': (c) => c.body });
    renderAt('/admin/access', <Route path="/admin/access" element={<AccessTiers />} />);
    const pro = await screen.findByLabelText('pro');
    await user.clear(pro);
    await user.type(pro, '5');
    await user.click(screen.getByRole('switch', { name: 'Require processing before publishing' }));
    const stable = screen.getByRole('group', { name: 'Stable catalog' });
    await user.click(within(stable).getByLabelText('unlisted'));
    const origins = screen.getByLabelText('Origins');
    await user.type(origins, '{enter}https://b.example');
    await user.click(screen.getAllByRole('button', { name: 'Save changes' })[0]);
    await screen.findByText('Access settings saved');
    expect(calls.find((c) => c.method === 'PUT')!.body).toEqual({ ...settings, device_limits: { ...settings.device_limits, pro: 5 }, require_processing: true, cors_origins: ['https://a.example', 'https://b.example'], feed: { stable: ['public', 'unlisted'], beta: ['public', 'internal'] } });
  });

  it('refuses origins with a path', async () => {
    expect(badOrigins(['https://ok.example', '*', 'https://bad.example/x', 'ftp://x.example', 'nope'])).toEqual(['https://bad.example/x', 'ftp://x.example', 'nope']);
  });

  it('degrades to an error state while GET /admin/settings isn’t live', async () => {
    mockFetch({ 'GET /api/v1/admin/me': () => ME });
    renderAt('/admin/access', <Route path="/admin/access" element={<AccessTiers />} />);
    expect(await screen.findByText('Couldn’t load the access settings')).toBeInTheDocument();
  });
});

describe('A12 Webhooks', () => {
  it('shows the secret once after creating, sends a test and lists deliveries', async () => {
    const user = userEvent.setup();
    const hooks: unknown[] = [];
    const { calls } = mockFetch({
      'GET /api/v1/admin/me': () => ME,
      'GET /api/v1/admin/webhooks': () => ({ data: hooks }),
      'POST /api/v1/admin/webhooks': (c) => {
        const w = { id: 'wh1', ...(c.body as object), secret: 'whsec_once' };
        hooks.push({ ...w, secret: undefined });
        return { status: 201, body: w };
      },
      'POST /api/v1/admin/webhooks/:id/test': () => ({ status: 202, body: {} }),
      'GET /api/v1/admin/webhooks/:id/deliveries': () => ({ data: [{ id: 'd1', event: 'ping', status_code: 200, ok: true, attempt: 1, error: null, created_at: new Date().toISOString() }] }),
    });
    renderAt('/admin/settings', <Route path="/admin/settings" element={<Webhooks />} />);
    await user.click(await screen.findByRole('button', { name: 'Add webhook' }));
    await user.type(await screen.findByLabelText('Payload URL'), 'http://example.com/hook');
    await user.click(screen.getAllByRole('button', { name: 'Add webhook' }).at(-1)!);
    expect(await screen.findByText('Use an https:// URL.')).toBeInTheDocument();
    const url = screen.getByLabelText('Payload URL');
    await user.clear(url);
    await user.type(url, 'https://example.com/hook');
    await user.click(screen.getAllByRole('button', { name: 'Add webhook' }).at(-1)!);
    expect(await screen.findByLabelText('Signing secret')).toHaveTextContent('whsec_once');
    expect((calls.find((c) => c.method === 'POST')!.body as { events: string[] }).events).toHaveLength(5);
    await user.click(screen.getByRole('button', { name: 'I’ve saved it' }));
    await waitFor(() => expect(screen.queryByLabelText('Signing secret')).not.toBeInTheDocument());
    expect(screen.queryByText('whsec_once')).not.toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Test https://example.com/hook' }));
    await screen.findByText('Test event sent');
    await user.click(screen.getByRole('button', { name: 'Deliveries https://example.com/hook' }));
    expect(await screen.findByText('ping')).toBeInTheDocument();
    expect(screen.getByText('attempt 1', { exact: false })).toBeInTheDocument();
  });
});

describe('A11 Analytics', () => {
  it('draws the overview charts and lists zero-result searches', async () => {
    const today = new Date().toISOString().slice(0, 10);
    mockFetch({
      'GET /api/v1/admin/me': () => ME,
      'GET /api/v1/admin/analytics/overview': () => ({ published: 1, drafts: 0, in_review: 0, approved: 0, failed: 0, processing: 0, downloads_30d: 12, active_devices_30d: 3, installs_30d: 9, applies_30d: 30, downloads_by_day: { [today]: 12 }, downloads_by_type: { lut: 10, font: 2 }, top_assets: [], review_queue: [] }),
      'GET /api/v1/admin/analytics/search': () => ({ top: [{ term: 'wedding', count: 40 }], misses: [{ term: 'පෝය', count: 7, last_at: new Date().toISOString() }] }),
    });
    renderAt('/admin/analytics', <Route path="/admin/analytics" element={<Analytics />} />);
    expect(await screen.findByText('Installs (30d)')).toBeInTheDocument();
    expect(screen.getByText(/Downloads: 12 in 30 days, peak 12/)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Downloads by type' })).toHaveTextContent('LUTs10');
    expect(await screen.findByText('පෝය')).toBeInTheDocument();
  });

  it('shows per-asset analytics on the editor’s Activity tab, or the error state', async () => {
    const user = userEvent.setup();
    mockFetch({
      'GET /api/v1/admin/me': () => ME,
      'GET /api/v1/admin/assets/:id': () => makeAsset(),
      'GET /api/v1/admin/categories': () => ({ data: [] }),
      'GET /api/v1/admin/audit-log': () => ({ data: [] }),
      'GET /api/v1/admin/analytics/assets/:id': () => ({ downloads_by_day: {}, installs: 4, applies: 11, favorites: 2, versions: [{ version: '1.0.0', downloads: 7 }] }),
    });
    renderAt('/admin/assets/as_1', <Route path="/admin/assets/:id" element={<AssetEditor />} />);
    await user.click(await screen.findByRole('tab', { name: 'Activity' }));
    expect(await screen.findByRole('list', { name: 'Downloads by version' })).toHaveTextContent('v1.0.07');
    expect(screen.getByText('11')).toBeInTheDocument();
  });
});

describe('A10 audience rules and admin previews in the editor', () => {
  it('edits audience rules and saves them with PATCH audience_rules', async () => {
    const user = userEvent.setup();
    let asset = makeAsset({ status: 'draft' });
    const { calls } = mockFetch({
      'GET /api/v1/admin/me': () => ME,
      'GET /api/v1/admin/assets/:id': () => asset,
      'GET /api/v1/admin/categories': () => ({ data: [] }),
      'GET /api/v1/admin/audit-log': () => ({ data: [] }),
      'PATCH /api/v1/admin/assets/:id': (c) => (asset = { ...asset, ...(c.body as object) }),
    });
    renderAt('/admin/assets/as_1', <Route path="/admin/assets/:id" element={<AssetEditor />} />);
    await user.click(await screen.findByRole('tab', { name: 'Licence & Access' }));
    await user.click(screen.getByRole('button', { name: 'Add rule' }));
    await user.selectOptions(screen.getByLabelText('Effect, rule 1'), 'deny');
    await user.type(screen.getByLabelText('Region'), 'lk');
    await user.click(screen.getByRole('button', { name: 'Add rule' }));
    await user.selectOptions(screen.getAllByLabelText('Plan')[1], 'business');
    await user.type(screen.getAllByLabelText('Organisation id')[1], 'org_42');
    await user.click(screen.getAllByRole('button', { name: 'Save changes' })[0]);
    await screen.findByText('Saved');
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ audience_rules: [{ effect: 'deny', region: 'LK' }, { effect: 'allow', org_id: 'org_42', plan: 'business' }] });
    expect(normalizeRules([{ effect: 'allow', role: '  ' }])).toEqual([{ effect: 'allow' }]);
  });

  it('fetches draft previews with the bearer token into object URLs', async () => {
    const user = userEvent.setup();
    const created: string[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      created.push(`blob:preview-${created.length}`);
      return created.at(-1)!;
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const base = makeAsset({ status: 'draft' });
    const v = { ...base.versions[0], previews: { thumbnail: { key: 'k', ext: 'webp', size: 10 }, before_after_1: { key: 'k2', ext: 'webp', size: 10 } } };
    const { calls } = mockFetch({
      'GET /api/v1/admin/me': () => ME,
      'GET /api/v1/admin/assets/:id': () => ({ ...base, versions: [v] }),
      'GET /api/v1/admin/categories': () => ({ data: [] }),
      'GET /api/v1/admin/audit-log': () => ({ data: [] }),
      'GET /api/v1/admin/assets/:id/versions/:v/previews/:file': () => 'bytes',
    });
    renderAt('/admin/assets/as_1', <Route path="/admin/assets/:id" element={<AssetEditor />} />);
    await user.click(await screen.findByRole('tab', { name: /Files & Versions/ }));
    expect(await screen.findByAltText('Teal Orange: Before / after 1')).toHaveAttribute('src', expect.stringMatching(/^blob:preview-/));
    const req = calls.find((c) => c.path === '/api/v1/admin/assets/as_1/versions/1.0.0/previews/before_after_1.webp')!;
    expect(req.headers.Authorization).toBe('Bearer dev-admin');
    expect(screen.getByAltText('Thumbnail of Teal Orange')).toHaveAttribute('src', expect.stringMatching(/^blob:/));
    vi.restoreAllMocks();
  });

  it('shows an error instead of the previews when the admin preview route fails', async () => {
    const user = userEvent.setup();
    const base = makeAsset({ status: 'draft' });
    const v = { ...base.versions[0], previews: { poster: { key: 'k', ext: 'webp', size: 10 } } };
    mockFetch({
      'GET /api/v1/admin/me': () => ME,
      'GET /api/v1/admin/assets/:id': () => ({ ...base, versions: [v] }),
      'GET /api/v1/admin/categories': () => ({ data: [] }),
      'GET /api/v1/admin/audit-log': () => ({ data: [] }),
    });
    renderAt('/admin/assets/as_1', <Route path="/admin/assets/:id" element={<AssetEditor />} />);
    await user.click(await screen.findByRole('tab', { name: /Files & Versions/ }));
    expect(await screen.findByText('Couldn’t load the previews')).toBeInTheDocument();
    expect(screen.getByText(/Generated: poster\.webp/)).toBeInTheDocument();
  });
});
