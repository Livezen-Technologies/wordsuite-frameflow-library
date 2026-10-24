# Changelog

All notable changes to the FrameFlow Asset Library are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- A filter may now carry one of FrameFlow's own clip effects (`effect: { type, params }`) instead of a colour grade. Blur, glow, VHS, mirror, wave, RGB split and the rest are filters too, and none of them has a grade to carry; the gate that demanded one kept them out of the library. A filter still has to be one or the other, and `render_engine` records which effect it is.

- The Library is now hosted at https://frameflow.worksuitecloud.com/library (admin at `/library/admin/`, feed at `/library/feed/`), next to the FrameFlow web editor, instead of library.frameflow.worksuitecloud.com.

### Added

- Public website rebuilt to the new FrameFlow Library design: home, library browse with filters and paging, category pages, asset pages with settings and version history, collections, pricing with monthly/yearly prices, download, what's new, blog, help, creators, about, contact, licence and a new 404 page. Counts, assets and collections are live from the library.
- "My library" for signed-in users: an overview, favorites (heart on every asset), download history and devices, with the device limit explained.
- Sign in and create an account with WorkSuite OneAuth (secure redirect sign-in); the access-token form remains only in development builds.
- The FrameFlow feed now lists each pack's dependencies, so FrameFlow installs required packs (fonts, base presets) before the pack that needs them.
- The website and Download Center are available in English, Sinhala (සිංහල) and Tamil (தமிழ்), with a language switcher and correctly shaped Sinhala and Tamil text.
- Download Center: collections with drag-and-drop (or button) ordering and a schedule, category rename, icon, hide, reorder and delete, tag merging, Access & tiers settings (device limits, publish gate, feed channels, allowed origins), per-asset audience rules, analytics with charts and searches that found nothing, webhooks with a one-time secret, test button and delivery log, and previews of unpublished versions.
- Device sign-in: FrameFlow registers each computer (`POST /api/v1/devices/register`), users see and remove their devices (`/api/v1/me/devices`), and each plan has a device limit (Free 2, Pro 3, Business 10, Enterprise 50, changeable in settings). With Worksuite Cloud sign-in, downloads need a registered device.
- My library: favorites that sync across devices (`/api/v1/me/favorites`, offline favorites merge on sign-in), download history (`/api/v1/me/downloads`) and a server copy of what each device has installed (`/api/v1/me/installs`).
- Live updates: `GET /api/v1/sync/stream` pushes catalog changes to FrameFlow as Server-Sent Events, resuming from the last event after a reconnect.
- Optional Meilisearch search (`MEILI_URL`, `MEILI_KEY`): typo-tolerant results with Sinhala and Tamil keywords matched to English tags; without it the built-in search is used. Searches with no results are counted for admins.
- Curated collections: admins create collections of assets with an optional show/hide window; visible ones appear before Featured, New and Trending.
- Categories can be renamed, given an icon, hidden, moved under a parent, reordered and deleted when empty; tags can be merged across every asset.
- Library settings in the admin API: device limits, whether publishing waits for processing, allowed admin origins (CORS) and which visibilities each FrameFlow feed channel lists.
- Analytics: downloads by type, installs and applies on the overview (with a date range), per-asset stats with downloads by day and by version, and top searches and searches with no results.
- Webhooks: notify other services when assets are published, updated, unpublished or deprecated, or a version is published. Requests are signed (`X-Library-Signature`), retried up to 3 times and can be tested from the admin API.
- Admins can view a version's generated previews before it is published.
- The JS SDK covers devices, favorites, download history, installs and the live update stream.
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

### Changed

- The CodeIgniter backend is now the Library API: the test suite runs against it by default (`npm test`), and production at library.frameflow.worksuitecloud.com serves the API from the `backend/` image and the new web frontend from the same address.
- Hosting runs one processing worker on Cloudflare, kept running by a scheduled trigger, so previews and checks happen without a separate server.
- Production database settings use CodeIgniter's `database.default.*` names.

### Removed

- The Node Library API (`apps/api`), the old admin web (`apps/admin-web`) and the root Docker image they shipped in.

### Security

- Webhook calls refuse private, loopback and other internal addresses, don't follow redirects and time out after 10 seconds.
- Pro, Business and Enterprise packs are only served to a signed-in plan that covers them, or through a download grant's signed URL. With sign-in configured, the `X-Plan` header is ignored.
