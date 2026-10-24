# FrameFlow Asset Library & Download Center

Admins upload, validate, version and publish creative assets; FrameFlow users
browse, download and use them in the editor without restarting.
Full spec: [`docs/blueprint.md`](docs/blueprint.md); API additions:
[`docs/api-v1-additions.md`](docs/api-v1-additions.md).

```
backend/               Library API, FrameFlow feed, previews (CodeIgniter 4.7, PHP 8.3) — see backend/README.md
frontend/              Download Center admin (/admin) and public site (React + Tailwind v4)
apps/workers/          Processing workers: previews and deep checks (Node 22, FFmpeg, Chromium)
packages/sdk-js/       Typed client for the client API (§7.2), incl. devices, my library and live sync
packages/asset-schema/ The 12 asset types and validators in JS (reference; the backend has its own port)
desktop-module/        Where the desktop side lives in worksuite-frameflow
deploy/cloudflare/     The production Worker (assets + API container + worker container)
tests/                 node:test acceptance suite run against the backend, incl. an end-to-end install through FrameFlow's asset store
docs/                  Blueprint and API contract
```

## Run it

```bash
cd backend && composer install && php spark migrate --all && php spark serve   # http://localhost:8080
# token: dev-admin (super admin, outside production)
# feed:  http://localhost:8080/feed/stable/catalog.json
npm --prefix frontend ci && npm --prefix frontend run dev                       # the admin + public site
```

Configuration (database, signing key, R2/S3, sign-in, Meilisearch, webhooks)
is in [`backend/README.md`](backend/README.md#environment).

## Tests

```bash
npm ci
npm run test:backend                         # PHPUnit (backend/tests)
npm test                                     # acceptance suite: a fresh backend per test on SQLite
LIBRARY_PHP_DATABASE_URL=postgres://postgres@127.0.0.1:5432/library_ci npm test   # …on PostgreSQL (an empty database it may reset)
LIBRARY_API_URL=https://staging.example.com npm test                            # against a running server (tests that need their own server settings skip)
```

`tests/harness.js` starts `php spark serve` on a free port with a new database
and blob folder for each test. The worker tests need `ffmpeg`, `fc-scan` and
Chromium (`npm ci --prefix apps/workers && npx --prefix apps/workers playwright install chromium`)
and skip without them; the FrameFlow install test needs a `worksuite-frameflow`
checkout next to this repository (or `FRAMEFLOW_DIR`).

## Processing workers

`apps/workers` renders previews and runs the deep checks (blueprint §4.2, §5).
Each new version queues a job; a worker claims it from the API with a token
that has the `worker` role (`LIBRARY_ADMIN_TOKENS="…,wtok:worker:worker-1"`).

| Type | Previews | Checks |
|---|---|---|
| graphic, gif_sticker | 640×360 WebP thumbnail; animated → hover MP4 | decodes; SVG rendered in Chromium |
| sfx | 30 s MP3, waveform peaks JSON, waveform image | sample rate 44.1/48 kHz, ≤ 10 min, loudness (LUFS) and clipping reported |
| lut | before/after on 3 reference stills | the LUT applies |
| font | specimen (Latin, Sinhala, Tamil, shaped by Chromium) | family name, declared-script coverage ≥ 95 % |
| lottie, motion | poster, thumbnail, hover MP4 | first/mid/last frames render |
| transition | A/B demo MP4 (closest FFmpeg xfade) | renders |
| filter | before/after (approximate grade) | renders |
| text / video template, brand kit | title, storyboard or swatch card | — |

All types: ClamAV scan when `CLAMAV_HOST` is set. Generated thumbnails
satisfy the publish gate. With `require_processing` on (admin settings, or
`LIBRARY_REQUIRE_PROCESSING=1`) a version can't be published until its job is
done; a failed check blocks it.

```bash
npm ci --prefix apps/workers
LIBRARY_API_URL=http://localhost:8080 LIBRARY_WORKER_TOKEN=wtok node apps/workers/src/worker.js
docker build -f apps/workers/Dockerfile -t frameflow-library-worker .   # FFmpeg + Chromium image
```

Jobs are leased for 10 minutes and retried up to 3 times; the admin API lists
them (`GET /api/v1/admin/jobs`) and re-queues (`POST /api/v1/admin/assets/:id/reprocess`).

## Hosting

`frameflow.worksuitecloud.com/library` is one Cloudflare Worker (the FrameFlow web editor serves the rest of the host; the Worker takes `/library` off before routing)
([`deploy/cloudflare/`](deploy/cloudflare)):

| Path | Served by |
|---|---|
| `/api/*`, `/feed/*`, `/previews/*`, `/healthz` | the Library API container, built from `backend/Dockerfile` (nginx + php-fpm; runs migrations, the scheduler and the webhook queue) |
| everything else | `frontend/dist` as Workers static assets; unknown paths get `index.html` (`not_found_handling: "single-page-application"`, the frontend is built with `VITE_BASE_PATH=/library` and `VITE_API_BASE=/library`) |

State is in PostgreSQL (CodeIgniter's `database.default.*` settings), files in R2.

**Processing worker hosting: a Cloudflare cron trigger.** The same Worker
declares a second container class (`ProcessorContainer`, built from
`apps/workers/Dockerfile`, max one instance). A cron trigger
(`*/5 * * * *`) calls it every five minutes: it starts the container if it
isn't running and pushes its 15-minute sleep timer out, so exactly one
processing worker is always up and polling the API for jobs with
`LIBRARY_WORKER_TOKEN`. The same cron pings the API container's `/healthz`,
so its scheduler (`publish_at` / `unpublish_at`) and webhook queue keep
running when there is no traffic. Without `LIBRARY_WORKER_TOKEN` no worker is
started. (Any always-on host works too: run the worker image anywhere with
`LIBRARY_API_URL` and `LIBRARY_WORKER_TOKEN`, and leave the secret unset here.)

Add the secrets listed at the top of
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), then run
**Actions → Deploy**: it runs the tests, builds the frontend, deploys the
Worker, its assets and both containers, sets the runtime secrets and
smoke-tests the API, the feed and the SPA fallback.

## Wiring with FrameFlow

FrameFlow's desktop asset store (`worksuite-frameflow/electron/asset-store.js`)
reads `<WSC_ASSET_URL>/<channel>/catalog.json` and its Ed25519 signature,
downloads packs with HTTP Range resume, checks their SHA-256, unpacks them
and registers them with the editor's panels. This server publishes exactly
that feed, so pointing the app at it is all that's needed:

```bash
WSC_ASSET_URL=http://localhost:8080/feed \
WSC_ASSET_PUBLIC_KEY="$(curl -s http://localhost:8080/feed/public-key.pem)" \
  npm --prefix ../worksuite-frameflow/electron start
```

In production, sign with the release key (`LIBRARY_SIGNING_KEY`) and serve
`/feed/` at FrameFlow's default `https://download.worksuitecloud.com/assets`;
no app setting changes.

How library assets land in FrameFlow (each panel lists them under **Downloaded**):

| Library type | Upload | FrameFlow pack type | Panel |
|---|---|---|---|
| `lottie`, `motion` | Bodymovin `.json` | `motion` | Animations library |
| `sfx` | WAV, MP3, … | `sounds` | Audio → Packs |
| `font` | TTF, OTF, WOFF2 | `fonts` | font list |
| `lut` | `.cube` | `luts` | Colour → LUTs (Add imports it into your LUTs) |
| `transition` | `.ffx` JSON `{ name, value: { type, duration?, easing?, direction?, alignment? } }` | `transitions` | Transitions (click to load, double-click to apply to the cut) |
| `filter` | `.ffx` JSON `{ name, grade: { …colour-grade params }, extras? }` | `filters` | Filters (with the strength slider) |
| `text_template` | `.json`/`.fftext` `{ name, params: { content, …text params } }` | `text-templates` | Text |
| `video_template` | `.fftemplate` JSON: a FrameFlow project template (`aspect`, `layers`, `palette`, `category`) | `video-templates` | Templates |
| `graphic`, `gif_sticker` | PNG, WebP, SVG, GIF, WebM, MOV | `graphics`, `stickers` | Elements (added at the playhead on its own layer) |
| `brand_kit` | `.ffbrand`/`.json` `{ name, colors: [{ hex }], headingFont?, bodyFont? }` | `brand-kits` | Brand kit (Use, with undo) |

FrameFlow has no custom-shader engine, so transitions and filters are presets
over its built-in renderers; the upload checks reject a transition `type` or
filter without a `grade` that FrameFlow can't apply.

Each published asset is one pack (id = slug); licence tier `free` maps to
plan `free`, everything else to `pro`. Every pack zip carries `pack.json`,
an `index.json` in the shape FrameFlow's registry reads, the blueprint's
`manifest.json` (`frameflow.asset/1`) and `licence.txt`.

`stable` lists public assets; `beta` adds `internal` ones.

## Workflow

```
upload (gate: extension ↔ magic bytes, size, archive safety; type checks)
  → draft → submit for review → approve / reject (reason)
  → publish (gate: approved, thumbnail, category, licence, min version, checks, dependencies)
  → feed + sync event → FrameFlow refresh → install → panels
```

New versions never overwrite. A new version of a live asset is released by a
publisher and shows as an update in FrameFlow; older versions can be rolled
back to. Unpublish/deprecate removes the asset from the feed and records a
sync event.

## What v1 doesn't do yet

- tus chunked uploads (uploads are single requests up to 2 GB). Workers don't compile shaders (FrameFlow applies transitions and filters as presets) or convert fonts to WOFF2, and transition/filter previews are FFmpeg approximations of FrameFlow's renderers.
- Rate limits (§7.4), `/admin/jobs/stream`, audience-rule CRUD and a `delete` (legal takedown) sync op.
