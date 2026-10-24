import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, buildUrl, describeDetail, errorMessage, setTransport, setUnauthorizedHandler, type TransportRequest } from '@/services/api';
import { adminApi } from '@/services/admin';
import { setToken } from '@/services/auth';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('api client', () => {
  afterEach(() => {
    setTransport(null);
    setUnauthorizedHandler(null);
    setToken(null);
  });

  it('builds URLs under /api/v1 and drops empty query values', () => {
    expect(buildUrl('/admin/assets', { type: 'lut', status: '', q: undefined, limit: 200 })).toBe('/api/v1/admin/assets?type=lut&limit=200');
    expect(buildUrl('/admin/assets', undefined, 'https://lib.example.com/api/v1')).toBe('https://lib.example.com/api/v1/admin/assets');
  });

  it('sends the bearer token, JSON bodies and an idempotency key on mutations only', async () => {
    const calls: TransportRequest[] = [];
    setTransport(async (r) => (calls.push(r), json(200, { ok: true })));
    setToken('dev-admin');
    await api.get('/admin/me');
    await api.post('/admin/assets/as_1/publish', { publish_at: 'x' });
    expect(calls[0].headers.Authorization).toBe('Bearer dev-admin');
    expect(calls[0].headers['Idempotency-Key']).toBeUndefined();
    expect(calls[1].headers['Content-Type']).toBe('application/json');
    expect(calls[1].headers['Idempotency-Key']).toBeTruthy();
    expect(calls[1].body).toBe(JSON.stringify({ publish_at: 'x' }));
  });

  it('uploads the raw file with X-Filename and the type query', async () => {
    const calls: TransportRequest[] = [];
    setTransport(async (r) => (calls.push(r), json(201, { id: 'up_1' })));
    const file = new File(['LUT_3D_SIZE 2'], 'My LUT ü.cube');
    await adminApi.upload(file, 'lut');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('/api/v1/admin/uploads?type=lut');
    expect(calls[0].headers['X-Filename']).toBe(encodeURIComponent('My LUT ü.cube'));
    expect(calls[0].body).toBe(file);
  });

  it('turns { error: { code, message, details[] } } into ApiError with field errors', async () => {
    setTransport(async () => json(422, { error: { code: 'PUBLISH_BLOCKED', message: 'Thumbnail missing.', details: [{ field: 'thumbnail', rule: 'thumbnail.required', value: null }], request_id: 'req_1' } }));
    const err = (await api.post('/admin/assets/as_1/publish').catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 422, code: 'PUBLISH_BLOCKED', requestId: 'req_1' });
    expect(err.fieldErrors).toEqual({ thumbnail: 'thumbnail.required' });
    expect(errorMessage(err)).toBe('Thumbnail missing. (thumbnail.required)');
    expect(describeDetail({ rule: 'semver', value: '1.0' })).toBe('semver (1.0)');
  });

  it('calls the unauthorized handler on 401 and falls back to a code when the body is not JSON', async () => {
    const onUnauth = vi.fn();
    setUnauthorizedHandler(onUnauth);
    setTransport(async () => new Response('nope', { status: 401 }));
    await expect(api.get('/admin/me')).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect(onUnauth).toHaveBeenCalledTimes(1);
  });

  it('reads text responses (PEM key)', async () => {
    setTransport(async () => new Response('-----BEGIN PUBLIC KEY-----', { status: 200 }));
    await expect(api.get('/feed/public-key.pem', undefined, { text: true, absolute: true })).resolves.toBe('-----BEGIN PUBLIC KEY-----');
  });
});
