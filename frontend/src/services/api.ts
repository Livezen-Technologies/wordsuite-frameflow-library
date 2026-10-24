/**
 * Fetch wrapper for the FrameFlow Library API (apps/api/src/server.js; the CodeIgniter port keeps the routes).
 *
 *  - `Authorization: Bearer <token>` from the registered token getter (services/auth.ts)
 *  - JSON bodies get `Content-Type` and an `Idempotency-Key`
 *  - raw uploads (`api.upload`) send the file as the body with `X-Filename`
 *  - errors become ApiError { status, code, message, details[] } from `{ error: { code, message, details } }`
 *  - a 401 calls the unauthorized handler (sign out) before rejecting
 */
import { config } from '@/core/config';
import type { ApiErrorBody, ErrorDetail } from '@/types/api';
import { msg, t, type MessageKey } from '@/i18n';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ErrorDetail[];
  readonly requestId: string | null;

  constructor(status: number, code: string, message: string, details: ErrorDetail[] = [], requestId: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  /** field → first problem, for highlighting form fields on 422. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const d of this.details) if (d.field && !out[d.field]) out[d.field] = describeDetail(d);
    return out;
  }
}

/** Human text for one `{ field, rule, value, message }` problem. */
export function describeDetail(d: ErrorDetail): string {
  if (d.message) return String(d.message);
  const value = d.value === undefined || d.value === null ? '' : ` (${typeof d.value === 'string' ? d.value : JSON.stringify(d.value)})`;
  return `${d.rule ?? 'invalid'}${value}`;
}

/** Error codes with a message of our own (shown instead of the API's English text). */
const CODE_MESSAGES: Record<string, MessageKey> = {
  DEVICE_LIMIT: msg('You’ve reached the device limit for your plan. Revoke a device you no longer use, then try again.'),
  DEVICE_REQUIRED: msg('Downloads need a registered FrameFlow device. Sign in from the FrameFlow app first.'),
  CATEGORY_IN_USE: msg('This category still has assets. Move them to another category before deleting it.'),
  UNAUTHENTICATED: msg('Your session has ended. Sign in again.'),
  NETWORK_ERROR: msg('Can’t reach the server. Check your connection and try again.'),
};

/** One-line message for toasts: message plus the failing rules. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const own = CODE_MESSAGES[e.code];
    if (own) return e.code === 'DEVICE_LIMIT' && e.details[0]?.value != null ? `${t(own)} (${t('Limit: {n}', { n: Number(e.details[0].value) })})` : t(own);
    const rules = e.details.map((d) => d.rule).filter(Boolean);
    return rules.length ? `${e.message} (${[...new Set(rules)].join(', ')})` : e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

// ---------------------------------------------------------------- auth hooks

let tokenGetter: () => string | null = () => null;
let onUnauthorized: (() => void) | null = null;

export function setTokenGetter(fn: () => string | null): void {
  tokenGetter = fn;
}
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

// ---------------------------------------------------------------- transport

export interface TransportRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: BodyInit | null;
  signal?: AbortSignal;
}
export type Transport = (req: TransportRequest) => Promise<Response>;

// Looks up the global fetch at call time so tests can stub it.
const fetchTransport: Transport = (req) => fetch(req.url, { method: req.method, headers: req.headers, body: req.body, signal: req.signal });
let transport: Transport = fetchTransport;

/** Replace the network layer (tests). */
export function setTransport(t: Transport | null): void {
  transport = t ?? fetchTransport;
}

// ---------------------------------------------------------------- request

export type Query = Record<string, string | number | boolean | null | undefined>;

export function buildUrl(path: string, query?: Query, base: string = config.apiBase): string {
  const url = /^https?:\/\//.test(path) ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  const qs = params.toString();
  return qs ? `${url}${url.includes('?') ? '&' : '?'}${qs}` : url;
}

const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

async function parseError(res: Response): Promise<ApiError> {
  let body: Partial<ApiErrorBody> | null = null;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    body = null;
  }
  const err = body?.error;
  const fallback = res.status === 401 ? 'UNAUTHENTICATED' : res.status === 403 ? 'FORBIDDEN' : res.status === 404 ? 'NOT_FOUND' : res.status >= 500 ? 'SERVER_ERROR' : 'HTTP_ERROR';
  return new ApiError(res.status, err?.code ?? fallback, err?.message ?? t('Request failed ({status})', { status: res.status }), Array.isArray(err?.details) ? err.details : [], err?.request_id ?? res.headers.get('X-Request-Id'));
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Sent as-is (file upload); `body` is ignored. */
  raw?: Blob | ArrayBuffer;
  query?: Query;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Return text instead of JSON (PEM key, feed). */
  text?: boolean;
  /** Full URL / path outside the API base (e.g. the feed). */
  absolute?: boolean;
  /** Return the body as a Blob (authenticated previews). */
  blob?: boolean;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = { Accept: opts.text ? 'text/plain, */*' : opts.blob ? '*/*' : 'application/json', ...opts.headers };
  const token = tokenGetter();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | null = null;
  if (opts.raw !== undefined) {
    body = opts.raw as BodyInit;
    headers['Content-Type'] ??= 'application/octet-stream';
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers['Content-Type'] = 'application/json';
  }
  if (method !== 'GET') headers['Idempotency-Key'] ??= newKey();
  const url = opts.absolute ? buildUrl(path, opts.query, '') : buildUrl(path, opts.query);
  let res: Response;
  try {
    res = await transport({ method, url, headers, body, signal: opts.signal });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK_ERROR', t('Can’t reach the server. Check your connection and try again.'));
  }
  if (!res.ok) {
    const err = await parseError(res);
    if (res.status === 401) onUnauthorized?.();
    throw err;
  }
  if (res.status === 204) return undefined as T;
  if (opts.text) return (await res.text()) as T;
  if (opts.blob) return (await res.blob()) as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string, query?: Query, o: Omit<RequestOptions, 'method' | 'query'> = {}) => request<T>(path, { ...o, query }),
  post: <T>(path: string, body: unknown = {}, o: Omit<RequestOptions, 'method' | 'body'> = {}) => request<T>(path, { ...o, method: 'POST', body }),
  patch: <T>(path: string, body: unknown, o: Omit<RequestOptions, 'method' | 'body'> = {}) => request<T>(path, { ...o, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, o: Omit<RequestOptions, 'method' | 'body'> = {}) => request<T>(path, { ...o, method: 'PUT', body }),
  del: <T = void>(path: string, o: Omit<RequestOptions, 'method'> = {}) => request<T>(path, { ...o, method: 'DELETE' }),
  /** Raw file body with `X-Filename` (POST /admin/uploads). */
  upload: <T>(path: string, file: File | Blob, filename: string, query?: Query) =>
    request<T>(path, { method: 'POST', raw: file, query, headers: { 'X-Filename': encodeURIComponent(filename), 'Content-Type': (file as File).type || 'application/octet-stream' } }),
};
