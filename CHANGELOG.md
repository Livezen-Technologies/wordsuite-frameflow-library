# Changelog

All notable changes to the FrameFlow Asset Library are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- PHP backend (`backend/`, CodeIgniter 4.7 on PHP 8.3): the Library API, FrameFlow feed and processing-worker endpoints with the same behaviour as the Node API, storing the library in PostgreSQL (or SQLite for development) tables and files in a local folder or R2/S3. Existing signing keys keep working, packs install in FrameFlow unchanged, and it ships as an nginx + php-fpm image on port 8080. The test suites can run against it with `LIBRARY_API_URL=php`.
- New web frontend (`frontend/`, React 19 + TypeScript + Vite + Tailwind CSS v4): the Download Center admin at `/admin` built on Tailwind Plus Application UI (dashboard, asset library with bulk actions, upload center, asset editor with versions and rollback, processing, review queue, categories, audit log, settings), and a public site at `/` built on the Radiant template (home with asset types and collections, library browse and search, asset pages, pricing, sign-in).
- New web frontend (`frontend/`): the Download Center admin rebuilt on React with every feature of the old admin plus version history with metadata diffs, publishing a specific version, dependencies, a processing view and a Settings page with feed URLs and the signing key; and a public site with the home page, library browsing with search and filters, asset pages and plans.
- Processing workers (`apps/workers`): each new version is queued for a worker that renders previews (thumbnails, hover MP4s, 30 s audio previews and waveforms, LUT and filter before/after, font specimens with correctly shaped Sinhala and Tamil, Lottie posters, transition demos, template and brand-kit cards) and runs deep checks (decoding, sample rate, duration, loudness, clipping, font script coverage, Lottie rendering, ClamAV). Generated thumbnails count for the publish gate, previews are served at `/previews/…`, and `LIBRARY_REQUIRE_PROCESSING=1` holds publishing until a version is processed.
- Production storage: library state in PostgreSQL (`DATABASE_URL`), one row per record with only changed rows written and a writer lock so two servers can't overwrite each other; originals and packages in Cloudflare R2 or any S3-compatible bucket (`LIBRARY_S3_*`), served with resumable ranges. Without them it keeps using a local folder.
- Hosting on Cloudflare at library.frameflow.worksuitecloud.com: a Docker image run as a Cloudflare Container behind a Worker, and a **Deploy** workflow.
- Sign-in with Worksuite Cloud (OneAuth): the API verifies OIDC access tokens against the issuer's keys (RS256, ES256, EdDSA; issuer, audience and expiry checked, key rotation handled). The plan comes from the token, and Download Center roles from the `library_roles` claim. Set `LIBRARY_OIDC_ISSUER` (and optionally `LIBRARY_OIDC_AUDIENCE`, `LIBRARY_OIDC_ROLE_CLAIM`); static tokens remain for development and server-to-server use.

- Library API (`apps/api`): uploads with the upload gate (extension, magic bytes, size, archive path and zip-bomb checks), type validation for LUTs, Lottie, SVG/PNG/WebP/GIF, WAV, fonts, brand kits and text templates, drafts, versions that never overwrite, review (approve / reject with reason), publish gate, scheduled publish and unpublish, deprecate, archive, rollback, bulk actions, categories, analytics overview and an audit log of every change with before/after values. Roles follow the blueprint (Super Admin, Library Manager, Content Editor, Reviewer, Analyst).
- Client API for FrameFlow: asset types, categories, search with filters and sorting, asset detail with entitlement, signed 5-minute download grants, download completion, usage events, collections (Featured, New, Trending) and the delta sync feed.
- FrameFlow feed: published assets become signed packs in the catalog format the FrameFlow desktop app already installs from (`/feed/<channel>/catalog.json`, `.sig`, pack zips with HTTP Range resume). Lottie and motion assets show up in FrameFlow's Animations library, sounds in Sounds, fonts in the font list, and LUTs, transitions, filters, templates, graphics, stickers and brand kits in their panels.
- Download Center admin web (`/admin/`): Dashboard, Asset Library with type tabs, filters and bulk actions, Upload Center with drag and drop, per-file validation results and batch defaults, Asset Editor with checks, versions, rollback and publishing controls, Review Queue, Categories and Audit log.
- `packages/asset-schema`: the 12 asset types, metadata rules, validators and FrameFlow pack mapping shared by every part of the library.
- `packages/sdk-js`: a typed JavaScript client for the client API.
- Transitions, filters, text templates and video templates are uploaded as JSON presets in the shapes FrameFlow's panels apply, and are checked against what FrameFlow can render. Choosing a type for an upload re-runs its checks for that type.

### Security

- Pro, Business and Enterprise packs are only served to a signed-in plan that covers them, or through a download grant's signed URL. With sign-in configured, the `X-Plan` header is ignored.
