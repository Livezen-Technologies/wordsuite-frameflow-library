# FrameFlow Asset Library — web frontend

React 19 + TypeScript (strict) + Vite 7 + Tailwind CSS v4, React Router 7, TanStack Query. One app, two surfaces:

| Surface | Routes | Built from |
|---|---|---|
| Public site | `/`, `/library`, `/library/category/:type`, `/library/:slug`, `/collections`, `/pricing`, `/download`, `/whats-new`, `/blog`, `/help`, `/creators`, `/about`, `/contact`, `/licence`, `/login`, `/signup`, `/account/*`, `/auth/callback` | FrameFlow Library design (Radiant look; `src/components/site/`, `src/pages/site/`). Editable copy with no API source: `src/content/site.ts`, `src/content/blog/*.md` |
| Download Center admin (blueprint §11) | `/admin/*` (lazy chunk) | Tailwind Plus **Application UI v4.3** (`src/components/ui/`, `src/layouts/AdminLayout.tsx`), admin API `/api/v1/admin/*` |

It talks to the Library API (`apps/api/src/server.js`, being ported to CodeIgniter in `backend/` with the same routes):
bearer-token auth, errors as `{ error: { code, message, details[] } }`.

## Admin screens

| Route | Screen |
|---|---|
| `/admin/sign-in` | Token sign-in (OIDC redirect slot: `services/auth.ts`) |
| `/admin` | A1 Dashboard: KPIs, downloads chart, review queue, top assets, recent activity |
| `/admin/assets` | A2 Asset Library: type tabs, search, status/category/tier/visibility/owner filters, bulk publish / unpublish / tags / category / tier / visibility / archive, load more |
| `/admin/upload` | A3 Upload Center: drag and drop, per-file checks, type override (re-check), batch defaults, Create drafts |
| `/admin/assets/:id` | A4 Asset Editor + A5 versions: details, licence & access, files & versions (publish a version, roll back, metadata diff, new version drawer, thumbnail), dependencies, activity; publish / schedule / unpublish / deprecate / archive / submit / approve / reject |
| `/admin/processing` | A7 Processing Jobs: `GET /admin/jobs` with status tabs, auto-refresh while queued/running, Retry/Reprocess (`POST /admin/assets/:id/reprocess`); plus upload checks in this tab and assets processing/failed |
| `/admin/review` | A6 Review Queue |
| `/admin/categories` | A8 Categories (list + add) |
| `/admin/audit` | Audit log |
| `/admin/settings` | A12: API base, feed URLs, signing public key, roles |

Navigation and actions follow `packages/asset-schema` roles, ported to `src/core/schema.ts` (`can(role, perm)`); the API enforces them again.

## Scripts

```bash
npm ci                # .npmrc sets legacy-peer-deps (same as worksite-download/frontend)
npm run dev           # :5173, proxies /api and /feed to VITE_DEV_PROXY_TARGET (default http://localhost:8787)
npm run build         # tsc -b + vite build → dist/
npm run preview       # serve dist/ on :4173 with the same proxy
npm run typecheck
npm run lint
npm test              # Vitest + Testing Library (jsdom), fetch mocked
```

Local API: `cd .. && PORT=8787 node apps/api/src/server.js` (dev token `dev-admin`). With previews: start the API with
`LIBRARY_ADMIN_TOKENS="dev-admin:super_admin:admin,wtok:worker:w1"` and run
`LIBRARY_API_URL=http://localhost:8787 LIBRARY_WORKER_TOKEN=wtok node apps/workers/src/worker.js`.
The dev/preview proxy and nginx forward `/api`, `/feed` and `/previews`.

## Environment (build time)

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE` | `''` (same origin) | Origin of the Library API; requests go to `${VITE_API_BASE}/api/v1/…` |
| `VITE_FEED_BASE` | `${VITE_API_BASE}/feed` | FrameFlow feed root shown in Settings |
| `VITE_BASE_PATH` | `/` | Router basename and Vite `base` |
| `VITE_OIDC_ISSUER` | — | OIDC issuer (Authorization Code + PKCE). Unset = development token sign-in |
| `VITE_OIDC_CLIENT_ID` | — | Public client id; redirect URI `<origin><base>/auth/callback` |
| `VITE_FRAMEFLOW_DOWNLOAD_URL` | `https://updates.worksuitecloud.com/apps/frameflow` | Target of every "Get FrameFlow" button |
| `VITE_DEV_PROXY_TARGET` | `http://localhost:8787` | dev/preview proxy target |

## Docker

`docker build -t frameflow-web . && docker run -p 8080:8080 -e LIBRARY_API_UPSTREAM=http://host.docker.internal:8787 frameflow-web`
— nginx serves `dist/` and proxies `/api` and `/feed` to `LIBRARY_API_UPSTREAM`.

## Languages

English, Sinhala and Tamil in `src/i18n/{en,si,ta}.json`, keyed by the English text (`t('Save changes')`, typed). After adding copy run
`npm run i18n` (rebuilds en.json, lists keys missing in si/ta); `src/test/i18n.test.ts` fails on any missing key or placeholder.
Fonts are self-hosted in `public/fonts` (Inter Tight, Noto Sans Sinhala, Noto Sans Tamil from @fontsource, SIL OFL).

## Contract endpoints (docs/api-v1-additions.md)

Collections, category update/delete/reorder, tag merge, settings, analytics, webhooks, admin previews and `/me/*`. Screens show an
error state while an endpoint isn't live. Browse filters for aspect, duration and features apply to the loaded page (no API parameter).
