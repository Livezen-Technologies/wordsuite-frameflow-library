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

How library assets land in FrameFlow:

| Library type | FrameFlow pack type | Where it shows up |
|---|---|---|
| `lottie`, `motion` | `motion` | Animations library (`<slug>/<slug>.json` + thumbnail) |
| `sfx` | `sounds` | Sounds → Packs |
| `font` | `fonts` | Font list (registered as FontFace) |
| `lut` | `luts` | LUT panel items |
| `transition` / `filter` | `transitions` / `filters` | their panels |
| `text_template` / `video_template` | `text-templates` / `video-templates` | template galleries |
| `graphic` / `gif_sticker` / `brand_kit` | `graphics` / `stickers` / `brand-kits` | pack content for those panels |

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

- OneAuth/OIDC sign-in and device registration: admin access is by bearer token, and the client API takes the plan from `X-Plan` (dev). The feed itself is public (packs are signed and hashed), so Pro packs are gated by FrameFlow's plan check, not by the server.
- tus chunked uploads (uploads are single requests up to 2 GB), ClamAV (recorded as not configured unless `CLAMAV_HOST` is set), FFmpeg/fontTools/shader workers and generated previews: image assets are their own thumbnail, other types need an uploaded one.
- Favorites, download history and installs mirror (`/me/*` beyond usage), SSE push, Meilisearch, PostgreSQL. State is one JSON document shaped like the §16 tables.
