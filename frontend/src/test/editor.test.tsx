import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssetEditor } from '@/pages/admin/AssetEditor';
import { makeAsset, ME, mockFetch, renderAt, Route } from './utils';
import type { Asset } from '@/types/api';

afterEach(() => vi.unstubAllGlobals());

function setup(initial: Asset, me = ME, publishResult?: () => unknown) {
  let asset = initial;
  const m = mockFetch({
    'GET /api/v1/admin/me': () => me,
    'GET /api/v1/admin/categories': () => ({ data: [{ id: 'cat_lut', type: 'lut', name: 'Cinematic', slug: 'cinematic', parent_id: null, sort: 0, icon: null, visible: true }] }),
    'GET /api/v1/admin/audit-log': () => ({ data: [{ id: 'e1', at: new Date().toISOString(), actor_role: 'super_admin', action: 'asset.create', entity: 'asset', entity_id: 'as_1', diff: { before: null, after: {} } }] }),
    'GET /api/v1/admin/assets/:id': () => asset,
    'GET /api/v1/assets/:id/preview': () => ({ thumbnail_url: null }),
    'POST /api/v1/admin/assets/:id/publish': publishResult ?? (() => {
      asset = { ...asset, status: 'published', published_version: '1.0.0', published_at: new Date().toISOString(), versions: asset.versions.map((v) => ({ ...v, status: 'published', package: { sha256: 'b'.repeat(64), size: 900, signature: 's', thumbnail: null, built_at: '' } })) };
      return asset;
    }),
    'PATCH /api/v1/admin/assets/:id': (c) => {
      asset = { ...asset, ...(c.body as object) };
      return asset;
    },
  });
  renderAt('/admin/assets/as_1', <Route path="/admin/assets/:id" element={<AssetEditor />} />);
  return m;
}

describe('Asset Editor publish flow', () => {
  it('publishes an approved asset after confirming, then shows it live', async () => {
    const user = userEvent.setup();
    const { calls } = setup(makeAsset({ status: 'approved' }));
    const publish = await screen.findByRole('button', { name: 'Publish' });
    await user.click(publish);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Publish “Teal Orange”?');
    expect(dialog).toHaveTextContent('stable FrameFlow feed');
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    await screen.findByText('Published to the FrameFlow feed');
    const post = calls.find((c) => c.method === 'POST' && c.path === '/api/v1/admin/assets/as_1/publish')!;
    expect(post.body).toEqual({});
    await waitFor(() => expect(screen.getByRole('button', { name: 'Unpublish' })).toBeInTheDocument());
    expect(screen.getAllByText('published').length).toBeGreaterThan(0);
  });

  it('lists the gate problems when the API blocks publishing', async () => {
    const user = userEvent.setup();
    setup(makeAsset({ status: 'approved' }), ME, () => ({ status: 422, body: { error: { code: 'PUBLISH_BLOCKED', message: 'A thumbnail is required.', details: [{ rule: 'thumbnail.required', message: 'A thumbnail is required.' }, { rule: 'review.approved', message: 'Needs reviewer approval.' }] } } }));
    await user.click(await screen.findByRole('button', { name: 'Publish' }));
    await user.click(await screen.findByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('Publishing is blocked')).toBeInTheDocument();
    expect(screen.getByText('Needs reviewer approval.')).toBeInTheDocument();
  });

  it('schedules a publish', async () => {
    const user = userEvent.setup();
    const { calls } = setup(makeAsset({ status: 'approved' }), ME, () => makeAsset({ status: 'approved', publish_at: '2030-01-01T09:00:00.000Z' }));
    const when = await screen.findByLabelText('Schedule publish');
    await user.type(when, '2030-01-01T09:00');
    await user.click(screen.getByRole('button', { name: 'Schedule' }));
    await screen.findByText('Publish scheduled');
    const body = calls.find((c) => c.path.endsWith('/publish'))!.body as { publish_at: string };
    expect(new Date(body.publish_at).getTime()).toBe(new Date('2030-01-01T09:00').getTime());
  });

  it('hides publishing for an analyst and makes the form read-only', async () => {
    setup(makeAsset({ status: 'approved' }), { id: 'ana', role: 'analyst', plan: 'free' });
    expect(await screen.findByText('No publishing actions for your role in this state.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toBeDisabled();
  });

  it('saves only changed details', async () => {
    const user = userEvent.setup();
    const { calls } = setup(makeAsset({ status: 'draft' }));
    const title = await screen.findByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'Teal & Orange');
    await user.click(screen.getAllByRole('button', { name: 'Save changes' })[0]);
    await screen.findByText('Saved');
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({ title: 'Teal & Orange' });
  });
});

describe('Asset Editor processing + previews', () => {
  it('shows processing status, retry for a failed job, and the generated previews of a live asset', async () => {
    const user = userEvent.setup();
    const base = makeAsset();
    const v = { ...base.versions[0], status: 'published', processing: { status: 'failed' as const, job_id: 'j1', error: 'decode failed' }, previews: { thumbnail: { key: 'k', ext: 'webp', size: 10 }, before_after_1: { key: 'k2', ext: 'webp', size: 10 } }, package: { sha256: 'b', size: 1, signature: '', thumbnail: null, built_at: '' } };
    setup({ ...base, status: 'published', published_version: '1.0.0', versions: [v] });
    expect(await screen.findByText('decode failed')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Files & Versions/ }));
    expect(screen.getByAltText('Teal Orange: Before / after 1')).toHaveAttribute('src', '/previews/as_1/1.0.0/before_after_1.webp');
    expect(screen.getByRole('button', { name: 'Retry processing' })).toBeInTheDocument();
  });
});

