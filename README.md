# FrameFlow Asset Library & Download Center

Admins upload, validate, version and publish creative assets; FrameFlow users
browse, download and use them in the editor without restarting.
Full spec: [`docs/blueprint.md`](docs/blueprint.md).

```
apps/api/              Library API, FrameFlow feed, serves the admin web (Node 22, no dependencies)
apps/admin-web/        Download Center admin (A1–A8 screens), plain ES modules + Tailwind
packages/asset-schema/ 12 asset types, metadata + validation rules, FrameFlow pack mapping
packages/sdk-js/       Typed client for the client API (§7.2)
desktop-module/        Where the desktop side lives in worksuite-frameflow
tests/                 node:test suite, including an end-to-end install through FrameFlow's asset store
docs/                  Blueprint
```

## Run it

```bash
npm start                                   # http://localhost:8787
# admin:  http://localhost:8787/admin/      token: dev-admin (super admin)
# feed:   http://localhost:8787/feed/stable/catalog.json
npm test
```

Environment:

| Variable | Meaning |
|---|---|
| `PORT` | default 8787 |
| `LIBRARY_DATA_DIR` | state + files, default `./data` |
| `LIBRARY_ADMIN_TOKENS` | `token:role:userId,…` with roles `super_admin`, `library_manager`, `content_editor`, `reviewer`, `analyst`. Default (dev only): `dev-admin:super_admin:admin` |
| `LIBRARY_SIGNING_KEY` | PEM Ed25519 private key that signs the catalog. Production: the same key as FrameFlow's `ASSET_SIGNING_KEY`, so the app's built-in public key verifies it. Unset: a dev key is created in the data dir |
| `LIBRARY_OIDC_ISSUER` | Worksuite Cloud / OneAuth issuer. Enables sign-in: access tokens are verified against its keys; plan from the token, Download Center roles from `library_roles` (`LIBRARY_OIDC_AUDIENCE`, default `frameflow-library`; `LIBRARY_OIDC_ROLE_CLAIM`) |
| `DATABASE_URL` | PostgreSQL for the library state (one row per record, single writer via an advisory lock). Unset: `library.json` in the data dir |
| `LIBRARY_S3_ENDPOINT`, `LIBRARY_S3_BUCKET`, `LIBRARY_S3_ACCESS_KEY_ID`, `LIBRARY_S3_SECRET_ACCESS_KEY` | R2 or S3 for originals and packages (`LIBRARY_S3_REGION`, default `auto`; `LIBRARY_S3_PREFIX`). Unset: files in the data dir |

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
satisfy the publish gate. With `LIBRARY_REQUIRE_PROCESSING=1` a version can't be
published until its job is done; a failed check blocks it.

```bash
npm ci --prefix apps/workers
LIBRARY_API_URL=http://localhost:8787 LIBRARY_WORKER_TOKEN=wtok node apps/workers/src/worker.js
docker build -f apps/workers/Dockerfile -t frameflow-library-worker .   # FFmpeg + Chromium image
```

Needs `ffmpeg`, `ffprobe`, `fc-scan` and Chromium (Playwright). Jobs are leased
for 10 minutes and retried up to 3 times; the admin API lists them
(`GET /api/v1/admin/jobs`) and re-queues (`POST /api/v1/admin/assets/:id/reprocess`).

## Hosting

`frameflow.worksuitecloud.com/library` runs on Cloudflare: a Worker in front
of one Container built from the `Dockerfile` (`deploy/cloudflare/`), with
PostgreSQL for state and R2 for files. Add the secrets listed at the top of
`.github/workflows/deploy.yml`, then run **Actions → Deploy**. One container
instance on purpose: it holds the database's writer lock.

## Wiring with FrameFlow

FrameFlow's desktop asset store (`worksuite-frameflow/electron/asset-store.js`)
reads `<WSC_ASSET_URL>/<channel>/catalog.json` and its Ed25519 signature,
downloads packs with HTTP Range resume, checks their SHA-256, unpacks them
and registers them with the editor's panels. This server publishes exactly
that feed, so pointing the app at it is all that's needed:

```bash
WSC_ASSET_URL=http://localhost:8787/feed \
WSC_ASSET_PUBLIC_KEY="$(curl -s http://localhost:8787/feed/public-key.pem)" \
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

- Device registration and device limits per plan.
- tus chunked uploads (uploads are single requests up to 2 GB). Workers don't compile shaders (FrameFlow applies transitions and filters as presets) or convert fonts to WOFF2, and transition/filter previews are FFmpeg approximations of FrameFlow's renderers.
- Favorites, download history and installs mirror (`/me/*` beyond usage), SSE push, Meilisearch. One API instance at a time (the PostgreSQL writer lock); scaling out needs per-request transactions instead of the in-memory state.
