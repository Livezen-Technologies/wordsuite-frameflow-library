import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Processing, jobsRefetchInterval } from '@/pages/admin/Processing';
import { makeAsset, ME, mockFetch, renderAt, Route } from './utils';
import type { Job } from '@/types/api';

afterEach(() => vi.unstubAllGlobals());

const job = (p: Partial<Job>): Job => ({ id: 'j1', asset_id: 'as_1', version: '1.0.0', type: 'lut', status: 'done', attempts: 1, lease_until: null, worker_id: 'w1', error: null, previews: { thumbnail: { key: 'k', ext: 'webp', size: 1 } }, created_at: '2026-10-01T00:00:00.000Z', started_at: null, finished_at: null, ...p });

describe('Processing jobs', () => {
  it('polls only while jobs are queued or running', () => {
    expect(jobsRefetchInterval([job({ status: 'running' })])).toBe(3000);
    expect(jobsRefetchInterval([job({ status: 'queued' })])).toBe(3000);
    expect(jobsRefetchInterval([job({ status: 'failed' }), job({ status: 'done' })])).toBe(false);
    expect(jobsRefetchInterval(undefined)).toBe(false);
  });

  it('lists jobs with status tabs and retries a failed one via POST /reprocess', async () => {
    const user = userEvent.setup();
    const jobs = [job({ id: 'j1', status: 'done' }), job({ id: 'j2', status: 'failed', error: 'ffmpeg exited 1', attempts: 3, created_at: '2026-10-02T00:00:00.000Z' })];
    const { calls } = mockFetch({
      'GET /api/v1/admin/me': () => ME,
      'GET /api/v1/admin/jobs': (c) => {
        const s = new URL(c.url, 'http://x').searchParams.get('status');
        return { data: s ? jobs.filter((j) => j.status === s) : jobs };
      },
      'GET /api/v1/admin/assets': () => ({ data: [makeAsset()], next_cursor: null, total: 1 }),
      'POST /api/v1/admin/assets/:id/reprocess': () => ({ status: 200, body: job({ id: 'j3', status: 'queued' }) }),
    });
    renderAt('/admin/processing', <Route path="/admin/processing" element={<Processing />} />);
    const table = await screen.findByRole('table', { name: 'Processing jobs' });
    await within(table).findAllByText('Teal Orange');
    expect(within(table).getByText('ffmpeg exited 1')).toBeInTheDocument();
    expect(screen.queryByText(/no jobs endpoint/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Failed/ }));
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Processing jobs' })).getAllByRole('row')).toHaveLength(2));
    expect(calls.some((c) => c.url.includes('/admin/jobs?status=failed'))).toBe(true);

    await user.click(screen.getByRole('button', { name: /Retry Teal Orange v1.0.0/ }));
    await screen.findByText('Reprocessing queued');
    const post = calls.find((c) => c.method === 'POST' && c.path === '/api/v1/admin/assets/as_1/reprocess')!;
    expect(post.body).toEqual({ version: '1.0.0' });
  });
});
