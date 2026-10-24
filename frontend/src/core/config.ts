/** Build-time configuration (Vite env). */
const env = (import.meta.env ?? {}) as Record<string, string | boolean | undefined>;
const str = (k: string) => (typeof env[k] === 'string' ? (env[k] as string).trim() : '');

/** Origin of the Library API ('' = same origin, which the dev/preview proxy serves). */
const apiOrigin = str('VITE_API_BASE').replace(/\/+$/, '');

export const config = {
  apiOrigin,
  /** JSON API root: routes are `${apiBase}/admin/…`. */
  apiBase: `${apiOrigin}/api/v1`,
  /** FrameFlow feed root (`/feed/<channel>/catalog.json`, `/feed/public-key.pem`). */
  feedBase: (str('VITE_FEED_BASE') || `${apiOrigin}/feed`).replace(/\/+$/, ''),
  /** Router basename, e.g. `/admin` when served under a sub-path. */
  basePath: (str('VITE_BASE_PATH') || '/').replace(/\/+$/, '') || '/',
  /** OneAuth issuer; when set the sign-in screen offers the OIDC redirect (not wired yet). */
  oidcIssuer: str('VITE_OIDC_ISSUER'),
  appName: 'FrameFlow Download Center',
  /** Where "Get FrameFlow" points (the WorkSuite Update Center app page by default). */
  frameflowDownloadUrl: str('VITE_FRAMEFLOW_DOWNLOAD_URL') || 'https://updates.worksuitecloud.com/apps/frameflow',
};

/** Absolute URL for display (Settings screen), resolving same-origin paths against the page. */
export function absoluteUrl(pathOrUrl: string): string {
  try {
    return new URL(pathOrUrl, typeof window !== 'undefined' ? window.location.origin : 'http://localhost').toString();
  } catch {
    return pathOrUrl;
  }
}

/** API-relative media paths (/previews/…, /feed/…) resolved against VITE_API_BASE. */
export function mediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith('/') ? `${apiOrigin}${url}` : url;
}
