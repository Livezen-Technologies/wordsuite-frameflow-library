import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UploadCenter } from '@/pages/admin/UploadCenter';
import { uploadSession } from '@/services/uploadSession';
import { ME, makeAsset, makeUpload, mockFetch, renderAt, Route } from './utils';

afterEach(() => {
  vi.unstubAllGlobals();
  uploadSession.clear();
});

const cube = () => new File(['LUT_3D_SIZE 17\n0 0 0\n'], 'teal-orange.cube', { type: '' });

describe('Upload Center flow', () => {
  it('uploads, shows validation per file, and creates drafts with the batch defaults', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch({
      'GET /api/v1/admin/me': () => ME,
      'GET /api/v1/admin/categories': () => ({ data: [{ id: 'cat_lut', type: 'lut', name: 'Cinematic', slug: 'cinematic', parent_id: null, sort: 0, icon: null, visible: true }] }),
      'POST /api/v1/admin/uploads': (c) =>
        decodeURIComponent(c.headers['X-Filename']) === 'broken.cube'
          ? { status: 201, body: makeUpload({ id: 'up_bad', filename: 'broken.cube', checks: [{ check: 'lut.size', passed: false, detail: { rule: 'lut.size', value: 1, message: 'LUT_3D_SIZE must be 2–256.' } }] }) }
          : { status: 201, body: makeUpload() },
      'POST /api/v1/admin/assets': () => ({ status: 201, body: { data: [{ ok: true, asset: makeAsset({ status: 'ready_for_review' }) }] } }),
    });
    renderAt('/admin/upload', <Route path="/admin/upload" element={<UploadCenter />} />);

    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    await user.upload(input, [cube(), new File(['x'], 'broken.cube')]);

    const files = await screen.findByRole('list', { name: 'Files' });
    await waitFor(() => expect(within(files).getByText(/^Valid/)).toBeInTheDocument());
    expect(within(files).getByText('Blocked · LUT_3D_SIZE must be 2–256.')).toBeInTheDocument();
    const uploads = calls.filter((c) => c.method === 'POST' && c.path === '/api/v1/admin/uploads');
    expect(uploads).toHaveLength(2);
    expect(uploads[0].headers.Authorization).toBe('Bearer dev-admin');
    expect(within(files).getByLabelText('Type for teal-orange.cube')).toHaveValue('lut');

    expect(screen.getByText(/1 file is uploading, blocked or needs a type/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Tags'), 'wedding, cinematic');
    await user.selectOptions(screen.getByLabelText('Category'), 'cat_lut');
    await user.click(screen.getByRole('button', { name: 'Create 1 draft' }));

    await screen.findByText('1 of 1 drafts created');
    const create = calls.find((c) => c.method === 'POST' && c.path === '/api/v1/admin/assets')!;
    expect(create.body).toEqual({
      defaults: { tags: 'wedding, cinematic', licence_tier: 'free', min_app_version: '1.0.0', visibility: 'public', submit_for_review: true, category_id: 'cat_lut' },
      items: [{ upload_id: 'up_1', type: 'lut' }],
    });
    expect(screen.getByRole('link', { name: 'Teal Orange' })).toHaveAttribute('href', '/admin/assets/as_1');
    // The created file leaves the list; the blocked one stays.
    expect(within(screen.getByRole('list', { name: 'Files' })).queryByText('teal-orange.cube')).not.toBeInTheDocument();
    expect(uploadSession.all()).toHaveLength(2);
  });

  it('re-checks a file as the chosen type', async () => {
    const user = userEvent.setup();
    const { calls } = mockFetch({
      'GET /api/v1/admin/me': () => ME,
      'GET /api/v1/admin/categories': () => ({ data: [] }),
      'POST /api/v1/admin/uploads': (c) => ({ status: 201, body: c.url.includes('type=lottie') ? makeUpload({ filename: 'a.json', type: 'lottie' }) : makeUpload({ filename: 'a.json', type: null, checks: [{ check: 'type', passed: false, detail: { message: 'Pick a type for this file.' } }] }) }),
    });
    renderAt('/admin/upload', <Route path="/admin/upload" element={<UploadCenter />} />);
    await user.upload(document.querySelector('input[type=file]') as HTMLInputElement, new File(['{}'], 'a.json'));
    expect(await screen.findByText('Pick a type for this file.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create 0 drafts' })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Type for a.json'), 'lottie');
    await screen.findByRole('button', { name: 'Create 1 draft' });
    expect(calls.filter((c) => c.path === '/api/v1/admin/uploads').at(-1)!.url).toContain('type=lottie');
  });
});
