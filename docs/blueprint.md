# FrameFlow Asset Library & Download Center — Full Blueprint (v1.0)

**Repository:** `Livezen-Technologies/wordsuite-frameflow-library`
**Owner:** Livezen Technologies · WorkSuite product family
**Date:** 2026-10-24
**UI kit:** Tailwind Plus Application UI v4.3 (sidebar shell, tables, stacked lists, slide-overs, drop zones)

---

## 1. Purpose & Scope

A centralized system where administrators upload, process, version and publish creative assets, and authenticated FrameFlow users browse, download, install and use them inside the FrameFlow editor (timeline, canvas, effects, text, audio) — online or offline, without restarting the app.

**End-to-end pipeline**

```
Admin Upload → Validation → Asset Processing → Preview Generation → Review → Publish
   → Sync Feed (delta) → FrameFlow Library → User Download (resumable, verified)
   → Local Installation (typed directory + local index) → Hot-register in editor
   → Add to Project / Drag to Timeline / Apply to Clip
```

**In scope:** Admin Download Center (web), Asset Library API, processing workers, CDN delivery, FrameFlow desktop library panel, local cache/installer, sync engine.
**Out of scope (v1):** user-submitted marketplace, paid per-asset checkout (handled by licence tiers via WorkSuite Cloud/OneAuth), collaborative asset editing.

---

## 2. Asset Types (12)

| # | Type key | Name | Accepted source files | Installs to (local) | Editor target |
|---|---|---|---|---|---|
| 1 | `graphic` | Graphic Elements & Overlays | PNG, SVG, WebP, PSD (flattened), MOV (ProRes 4444 alpha), WebM (VP9 alpha) | `assets/graphics/` | Canvas / overlay track |
| 2 | `sfx` | Sound Effects & Audio | WAV, FLAC, MP3, AAC, OGG | `assets/audio/` | Audio track |
| 3 | `text_template` | Text Templates & Animations | `.fftext` package (JSON + fonts refs) | `assets/text/` | Text track / title editor |
| 4 | `video_template` | Video Templates | `.fftemplate` package (project JSON + media) | `assets/templates/` | New project / insert sequence |
| 5 | `motion` | Motion Graphics & Animated Elements | `.ffmotion` package, MOV alpha, WebM alpha | `assets/motion/` | Overlay track |
| 6 | `transition` | Video Effects & Transitions | `.ffx` package (shader + params JSON) | `assets/effects/` | Clip / between-clip |
| 7 | `lut` | LUTs & Color Presets | `.cube` (17/33/65), `.3dl`, `.ffcolor` preset | `assets/luts/` | Clip color panel |
| 8 | `font` | Fonts & Font Packs | TTF, OTF, WOFF2 (zip for packs) | `assets/fonts/` (app-scoped, not OS) | Text engine |
| 9 | `filter` | Video & Image Filters | `.ffx` filter package | `assets/filters/` | Clip effects panel |
| 10 | `brand_kit` | Brand Kits | `.ffbrand` (colors, logos, fonts refs, intro/outro) | `assets/brandkits/` | Brand panel / project defaults |
| 11 | `gif_sticker` | GIFs & Animated Stickers | GIF, APNG, animated WebP | `assets/stickers/` | Canvas / overlay track |
| 12 | `lottie` | Lottie Animations | `.json`, `.lottie` (dotLottie) | `assets/lottie/` | Canvas / overlay track (rendered by built-in Lottie engine) |

Local root: Windows `%LOCALAPPDATA%\FrameFlow\Library\`, macOS `~/Library/Application Support/FrameFlow/Library/`, Linux `~/.local/share/frameflow/library/`. Each installed asset lives in `<type-dir>/<asset_slug>/<version>/`.

---

## 3. Asset Metadata Model

### 3.1 Common fields (all types)

| Field | Type | Rules |
|---|---|---|
| `id` | UUID v7 | system |
| `slug` | string | unique, `^[a-z0-9-]{3,80}$`, immutable after first publish |
| `type` | enum (12 keys above) | required |
| `title` | string | 3–120 chars, required |
| `description` | text (Markdown) | ≤ 2,000 chars |
| `category_id` | FK | required; category must belong to same type |
| `subcategory_id` | FK | optional |
| `tags` | string[] | 0–20 tags, each 2–32 chars, lowercase, deduped |
| `keywords` | string[] | search-only synonyms, ≤ 30 (supports Sinhala/Tamil terms) |
| `thumbnail_url` | asset | required to publish; 640×360 WebP generated |
| `preview` | object | type-specific (video MP4 6–15 s, audio waveform + 30 s MP3, Lottie JSON, font specimen) |
| `aspect_ratios` | enum[] | `16:9, 9:16, 1:1, 4:5, any` |
| `resolution` | `{w,h}` | for visual assets |
| `duration_ms` | int | for timed assets |
| `fps` | number | for video/motion |
| `has_alpha` | bool | detected |
| `file_size_bytes` | int | of current version package |
| `checksum_sha256` | string | of current version package |
| `min_app_version` | semver | required; FrameFlow will hide incompatible assets |
| `platforms` | enum[] | `windows, macos, linux` (default all) |
| `licence_tier` | enum | `free, pro, business, enterprise` |
| `licence_terms` | enum | `royalty_free, editorial_only, personal_only, custom` + text |
| `attribution_required` | bool | + `attribution_text` |
| `author` / `source` | string | creator or vendor; `source_licence_ref` for 3rd-party packs |
| `visibility` | enum | `draft, private, internal, public, unlisted` |
| `status` | enum | `draft → processing → ready_for_review → approved → published → deprecated → archived`; `failed` |
| `audience_rules` | object | org IDs, plan tiers, roles, regions allowed / denied |
| `publish_at` / `unpublish_at` | datetime | scheduling |
| `featured` | bool + `featured_rank` | home rails |
| `current_version` | semver | |
| `dependencies` | `{asset_id, min_version}`[] | e.g. text template → font; template → LUT |
| `created_by/at`, `updated_by/at`, `published_by/at` | audit | |
| `stats` | object | downloads, installs, favorites, apply-count (read-only) |

### 3.2 Type-specific metadata

| Type | Extra fields |
|---|---|
| graphic | `format`, `vector` (bool), `blend_mode_default`, `layers` count |
| sfx | `sample_rate`, `bit_depth`, `channels`, `loudness_lufs`, `bpm`, `mood`, `loopable`, `waveform_peaks` (generated) |
| text_template | `placeholders[]` (key, default text, max chars), `font_refs[]`, `animation_in/out`, `editable_colors[]`, `supports_rtl`, `scripts[]` (latin, sinhala, tamil) |
| video_template | `scenes` count, `media_slots[]` (type, duration, aspect), `text_slots[]`, `music_slot`, `total_duration_ms`, `required_assets[]` |
| motion | `loop_points`, `editable_params[]`, `render_engine` (`native`, `lottie`, `video`) |
| transition / filter | `category` (`transition`, `effect`, `filter`), `shader_lang` (`glsl`,`wgsl`), `params[]` (name, type, min, max, default), `gpu_required`, `default_duration_ms` (transitions), `apply_scope` (`clip`, `between`, `adjustment_layer`) |
| lut | `lut_size` (17/33/65), `input_space` (`rec709`, `slog3`, `logc`, `vlog`, …), `output_space`, `intensity_default` (0–100), `before_after_preview` |
| font | `family`, `styles[]` (weight, italic), `scripts[]`, `variable_axes[]`, `licence_embedding` (`installable`, `editable`, `preview_print`), `specimen_text` |
| brand_kit | `colors[]` (name, hex), `logos[]` (variant, asset), `font_refs[]`, `intro_ref`, `outro_ref`, `watermark_ref`, `lower_third_ref`, `org_id` (brand kits are usually org-private) |
| gif_sticker | `frame_count`, `loop`, `transparent` |
| lottie | `lottie_version`, `frame_rate`, `in_point/out_point`, `uses_expressions` (blocked), `uses_images` (embedded only), `editable_colors[]`, `text_layers[]` |

### 3.3 Versions

`asset_versions`: `id, asset_id, version (semver), changelog, package_url, size, sha256, signature, min_app_version, status (processing|ready|published|retired), is_breaking (bool), created_by/at`.
Rules: new versions never overwrite; publish of v1.2.0 keeps v1.1.0 downloadable for 90 days; `is_breaking=true` forces users to re-insert (existing projects keep pinned version); rollback = re-publish previous version as current.

### 3.4 Supporting entities

`categories` (type, name, slug, icon, parent_id, sort, visible), `tags`, `collections` (curated sets/rails), `asset_files` (raw uploads), `processing_jobs`, `previews`, `user_favorites`, `user_downloads` (history), `user_installs` (device_id, asset_id, version, installed_at, last_used_at), `devices` (per user licence), `audit_log`, `api_clients`, `webhooks`.

---

## 4. Validation Rules

### 4.1 Upload gate (synchronous, on upload)

| Check | Rule |
|---|---|
| Extension ↔ MIME ↔ magic bytes | all three must agree with type's accepted list |
| Max size | graphic 200 MB · sfx 100 MB · font 50 MB · lut 10 MB · lottie 5 MB · gif 30 MB · motion/transition/filter 500 MB · video_template 2 GB (chunked) |
| Chunked upload | ≥ 25 MB uses tus/resumable 8 MB chunks; per-chunk SHA-256 |
| Duplicate detection | identical SHA-256 already in library → warn and link to existing |
| Malware scan | ClamAV on every file; archives scanned after extraction; zip-bomb guard (ratio > 100:1 or > 10k entries rejected) |
| Path safety | no absolute paths, `..`, symlinks inside packages |

### 4.2 Type validation (async worker)

| Type | Validates |
|---|---|
| graphic | decodable; ≥ 512 px shortest side; SVG sanitized (no scripts, external refs, `foreignObject`) |
| sfx | decodable via FFmpeg; 44.1/48 kHz; ≤ 10 min; clipping report; loudness measured (warn outside −23…−9 LUFS) |
| text_template / video_template / motion | package manifest schema valid (JSON Schema); all referenced files present; all `font_refs`/`required_assets` resolve to published assets or are bundled; min_app_version set |
| transition / filter | shader compiles in sandboxed headless compiler for GLSL ES 3.0 and WGSL; params within declared ranges; render test frame within 50 ms on reference GPU |
| lut | `.cube` header parse; size ∈ {17, 33, 65}; values in 0–1 (or DOMAIN_MIN/MAX declared); no NaN |
| font | parses via fontTools; embedding bits allow `installable` or `editable`; family/style names present; glyph coverage computed for declared scripts (Sinhala requires U+0D80–U+0DFF coverage ≥ 95%) |
| brand_kit | colors are valid hex; at least 1 logo; referenced fonts resolvable |
| gif_sticker | ≤ 1,000 frames; ≤ 1080 px; loop flag read |
| lottie | Bodymovin schema; expressions rejected; external image refs rejected (embedded base64 only); ≤ 600 frames; renders first/mid/last frame without error |

### 4.3 Publish gate

Cannot publish unless: status = `approved` (or admin has `asset.publish.direct`), thumbnail + preview exist, licence fields complete, category set, min_app_version set, all dependencies published, no failed checks, and at least one visible audience rule for non-public visibility.

### 4.4 Error format

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "LUT size must be 17, 33 or 65.",
  "details": [{ "field": "file", "rule": "lut.size", "value": 32 }], "request_id": "req_01J..." } }
```

---

## 5. Processing & Preview Pipeline

Queue: Redis/BullMQ (or Laravel Horizon if hosted on the WorkSuite Laravel stack). Storage: S3-compatible (originals bucket private, packages bucket private + signed CDN, previews bucket public CDN).

| Stage | Output |
|---|---|
| 1. Ingest | raw file stored in `originals/`, `asset_files` row |
| 2. Scan & validate | §4.1–4.2 results stored per check |
| 3. Normalize | audio → 48 kHz master; graphics → WebP + original; fonts → WOFF2 for preview, original for install |
| 4. Preview generation | thumbnail 640×360 WebP; hover preview MP4 H.264 480p ≤ 3 MB (veryfast preset); audio waveform JSON + 30 s MP3 128 kbps; LUT before/after on 3 reference stills; font specimen PNG + live WOFF2; Lottie poster + JSON; transition demo on reference clips A/B |
| 5. Package | `.ffpkg` = zip with `manifest.json`, payload, licence.txt; SHA-256 + Ed25519 signature |
| 6. Ready for review | notify reviewers (WorkSuite notification + email) |
| 7. Publish | write `sync_events` row, invalidate CDN, fire webhook `asset.published` |

Failed stage → status `failed`, error shown per check, "Retry stage" action.

### 5.1 Package manifest (`manifest.json`)

```json
{
  "schema": "frameflow.asset/1",
  "id": "0192f0c4-...",
  "slug": "neon-glitch-transition",
  "type": "transition",
  "version": "1.2.0",
  "min_app_version": "3.4.0",
  "entry": "effect.ffx",
  "files": [{ "path": "effect.ffx", "sha256": "…", "size": 18233 }],
  "dependencies": [],
  "params": [{ "name": "intensity", "type": "float", "min": 0, "max": 1, "default": 0.6 }],
  "licence": { "tier": "pro", "terms": "royalty_free" }
}
```

---

## 6. Roles & Permissions (Admin)

| Permission | Super Admin | Library Manager | Content Editor | Reviewer | Analyst |
|---|---|---|---|---|---|
| asset.create / upload | ✔ | ✔ | ✔ | – | – |
| asset.edit (own / all) | all | all | own | – | – |
| asset.review / approve | ✔ | ✔ | – | ✔ | – |
| asset.publish / unpublish | ✔ | ✔ | – | – | – |
| asset.publish.direct (skip review) | ✔ | – | – | – | – |
| asset.delete / archive | ✔ | archive | – | – | – |
| version.rollback | ✔ | ✔ | – | – | – |
| category / tag manage | ✔ | ✔ | – | – | – |
| audience rules / licence tiers | ✔ | ✔ | – | – | – |
| analytics view | ✔ | ✔ | own | ✔ | ✔ |
| settings / API clients / webhooks | ✔ | – | – | – | – |

Auth: WorkSuite OneAuth (OIDC) for admins with MFA required; RBAC enforced server-side; every mutation written to `audit_log` (actor, action, before/after diff, IP).

---

## 7. API Specification

Base: `https://library.frameflow.worksuite.lk/api/v1` (example host). JSON, UTF-8, ISO-8601 UTC timestamps, cursor pagination (`?cursor=&limit=` ≤ 100), `ETag`/`If-None-Match` on all GETs, `Idempotency-Key` header on POST mutations, `X-Request-Id` echoed.

### 7.1 Authentication

| Client | Method |
|---|---|
| FrameFlow desktop | OAuth 2.1 Authorization Code + PKCE via OneAuth (system browser + loopback redirect). Access token (JWT, 15 min) + refresh token (30 days, rotating, stored in OS keychain). Token carries `sub`, `org_id`, `plan`, `device_id`, scopes `library.read library.download`. |
| Admin web | OneAuth session cookie (HttpOnly, SameSite=Lax) + CSRF token; scopes by role. |
| Server-to-server | Client credentials, scoped API keys, IP allowlist. |

Device binding: `POST /devices/register` on first sign-in (device fingerprint hash, OS, app version); plan limits devices (e.g., Pro = 3). Downloads require a registered device.

### 7.2 Client (FrameFlow) endpoints

| Method & path | Purpose |
|---|---|
| `GET /catalog/types` | 12 types with counts and icons |
| `GET /catalog/categories?type=` | category tree |
| `GET /assets?q=&type=&category=&tags=&aspect=&duration_lt=&has_alpha=&tier=&sort=popular\|new\|trending\|az&cursor=` | browse/search (only assets visible to caller and compatible with `X-App-Version`) |
| `GET /assets/{id}` | full metadata + versions + dependency tree + entitlement (`can_download`, `reason`) |
| `GET /assets/{id}/preview` | preview URLs (public CDN) |
| `GET /search/suggest?q=` | typeahead (titles, tags, categories) |
| `GET /collections` / `GET /collections/{slug}` | curated rails (Featured, New this week, Trending) |
| `POST /assets/{id}/download` | body `{version?, device_id}` → `{url, expires_at (5 min), sha256, size, signature, manifest}` signed CDN URL, supports HTTP Range |
| `POST /downloads/{download_id}/complete` | report `installed|failed`, duration, bytes |
| `GET /me/favorites` · `PUT/DELETE /me/favorites/{asset_id}` | favorites |
| `GET /me/downloads` | download history |
| `GET /me/installs?device_id=` · `POST /me/installs` · `DELETE /me/installs/{asset_id}` | server mirror of installed set |
| `POST /me/usage` | batched events: `apply`, `insert`, `preview` (for "recently used" and analytics) |
| `GET /sync?since={cursor}&device_id=` | delta feed (see §8) |
| `GET /sync/stream` | Server-Sent Events push channel (optional, when online) |
| `GET /entitlements` | plan tier, device count, licence expiry |

### 7.3 Admin endpoints

| Method & path | Purpose |
|---|---|
| `POST /admin/uploads` (tus) · `PATCH /admin/uploads/{id}` | resumable upload |
| `POST /admin/assets` | create draft from upload(s) — bulk accepts up to 200 |
| `GET /admin/assets?status=&type=&owner=&q=` | admin table |
| `PATCH /admin/assets/{id}` | edit metadata |
| `POST /admin/assets/bulk` | `{ids[], action: publish|unpublish|archive|tag_add|tag_remove|move_category|set_tier|set_visibility, payload}` → job id |
| `POST /admin/assets/{id}/versions` | upload new version |
| `POST /admin/assets/{id}/versions/{v}/publish` · `/rollback` | |
| `POST /admin/assets/{id}/submit-review` · `/approve` · `/reject` (reason) | workflow |
| `POST /admin/assets/{id}/publish` (`publish_at?`) · `/unpublish` | |
| `GET /admin/jobs/{id}` | processing/bulk job status (also via SSE `/admin/jobs/stream`) |
| `POST /admin/assets/{id}/reprocess?stage=` | retry |
| CRUD `/admin/categories`, `/admin/tags`, `/admin/collections`, `/admin/audience-rules` | taxonomy |
| `GET /admin/analytics/overview?from=&to=` · `/admin/analytics/assets/{id}` | stats |
| `GET /admin/audit-log` | |
| CRUD `/admin/webhooks` | events: `asset.published`, `asset.updated`, `asset.unpublished`, `version.published`, `asset.deprecated` |

### 7.4 Rate limits

Client: 600 req/min/user for catalog; 60 download grants/min/user; 2,000 downloads/day/device (abuse guard). Admin: 1,200 req/min. `429` with `Retry-After`.

---

## 8. Synchronization Behaviour

### 8.1 Delta feed

`GET /sync?since=<cursor>` returns monotonically ordered events from `sync_events`:

```json
{
  "events": [
    { "seq": 918231, "op": "upsert", "asset_id": "…", "version": "1.2.0", "type": "lut",
      "changed": ["version", "thumbnail"], "update_available": true, "breaking": false },
    { "seq": 918232, "op": "unpublish", "asset_id": "…", "reason": "licence_expired" },
    { "seq": 918233, "op": "entitlement", "plan": "pro" }
  ],
  "next_cursor": "918233",
  "has_more": false,
  "full_resync_required": false
}
```

Ops: `upsert`, `unpublish`, `deprecate`, `delete` (hard remove for legal takedown), `category_change`, `entitlement`.
Cursor older than 30 days → `full_resync_required: true` → client fetches `GET /assets?sync_snapshot=1` (paged) and rebuilds catalog index.

### 8.2 When sync runs

| Trigger | Action |
|---|---|
| App start / sign-in | delta sync (blocking only the Library panel, not the editor) |
| Every 15 min while online | delta sync |
| SSE `asset.published` push | immediate delta |
| Library panel opened | delta if last sync > 2 min |
| Network regained | delta |
| Manual "Check for updates" | delta + installed-version check |

### 8.3 Local state (SQLite `library.db`)

Tables: `catalog_assets` (metadata cache, FTS5 index for offline search), `installed` (asset_id, version, path, sha256, installed_at, pinned, auto_update), `downloads` (queue state, bytes, retries), `favorites` (with `dirty` flag), `recent` (asset_id, last_used_at, count), `sync_state` (cursor, last_sync_at), `projects_refs` (project_id ↔ asset_id@version).

### 8.4 Update policy

- Default **auto-update minor/patch** for installed assets in background (Wi-Fi/unmetered only, configurable); **breaking** versions require user action.
- Projects store `asset_id@version`; an update never silently changes an open project. The project shows "Update available" badge on the clip/asset; user chooses Update in project / Keep.
- Old version folders kept while any local project references them; garbage-collected otherwise after 30 days.

### 8.5 Unpublish / revocation

- `unpublish` / `deprecate`: asset disappears from browse; installed copies remain usable in existing projects; cannot be newly added (greyed with reason).
- `delete` (legal takedown) or entitlement downgrade: asset marked `revoked`; existing projects show a missing-asset placeholder with "Replace" suggestions; files purged on next start.
- Licence check is offline-tolerant: signed entitlement token cached for 14 days; after expiry, Pro assets stay in existing projects but new inserts need online re-validation.

### 8.6 Conflict rules

Favorites and installs mirror: last-write-wins by `updated_at`, union for favorites on first device merge. Server is source of truth for catalog; client is source of truth for local paths.

---

## 9. Download & Installation Workflow (client)

1. User clicks **Download** or **Download & Add** (or drags an un-installed card onto the timeline).
2. Resolve dependency tree (`GET /assets/{id}`); queue missing dependencies first (e.g., font before text template).
3. `POST /assets/{id}/download` → signed URL.
4. Download manager: 3 parallel jobs, HTTP Range resume, 8 MB chunks, exponential backoff (1, 2, 4, 8, 16 s; max 5 retries), progress events (bytes, speed, ETA) to UI.
5. Verify SHA-256 and Ed25519 signature against embedded public key. Fail → delete, mark `failed`, show "Retry".
6. Extract to temp `…/Library/.staging/<id>/`, validate manifest, then atomic move to `<type-dir>/<slug>/<version>/`.
7. Write `installed` row; emit in-process event `library.asset.installed {id, type, path}`.
8. **Hot registration (no restart):** each editor subsystem subscribes:
   - Effects/Filters/Transitions registry → compiles shader, adds to panel.
   - LUT manager → loads cube into GPU texture cache.
   - Font manager → registers font with text engine (app-scoped, `AddFontMemResourceEx` / CoreText `CTFontManagerRegisterFontsForURL` process scope / fontconfig app config) and invalidates glyph cache.
   - Audio, Graphics, Stickers, Lottie, Motion → media pool index.
   - Templates → template gallery; Brand kits → brand panel.
9. If "Download & Add": perform the add action (§10) on the active project/selection.
10. `POST /downloads/{id}/complete`; update history.

Disk management: Settings → Library storage shows usage per type, cache limit (default 20 GB), "Remove unused assets", change location (moves folders and rewrites `installed.path`).

---

## 10. Editor Integration Behaviours

| Asset type | Click "Add" | Drag & drop | With clip selected |
|---|---|---|---|
| Graphic / GIF / Lottie / Motion | inserts on new overlay track at playhead, default 5 s (or native duration) | drop on track at position; drop on canvas = position at drop point | — |
| Audio / SFX | inserts on first free audio track at playhead | drop on audio track | — |
| Transition | applies to nearest cut at playhead | drop on cut point between clips | "Apply to selected cut(s)" |
| Effect / Filter | adds to selected clip(s); none selected → creates adjustment layer | drop on clip | applies to all selected clips |
| LUT | applies to selected clip(s) at default intensity | drop on clip | multi-apply; intensity slider in Color panel |
| Text template | inserts title at playhead with placeholders focused | drop on canvas/track | — |
| Font | sets font on selected text layer(s); otherwise becomes available in font picker | drop on text layer | — |
| Video template | dialog: "New project from template" or "Insert as sequence" | drop on timeline = insert sequence | — |
| Brand kit | "Apply to project" (colors, fonts, logo watermark, intro/outro) | — | — |

Undo/redo: every add/apply is one undoable command. Non-installed asset dropped → placeholder clip with progress ring, replaced on install completion (cancel = remove placeholder).

---

## 11. Admin Panel — Screens

| ID | Screen | Key elements |
|---|---|---|
| A1 | Dashboard | KPIs (published, downloads 30 d, active users, processing queue, failed), downloads chart, top assets, review queue, recent activity |
| A2 | Asset Library (table/grid) | type tabs, filters (status, category, tier, visibility, owner, date), search, bulk bar (publish, unpublish, tag, move, tier, archive), status pills, version, downloads |
| A3 | Upload Center | multi-file drag-drop zone, auto type detection, per-file progress & validation result, bulk metadata defaults (category, tags, tier), "Create drafts" |
| A4 | Asset Editor | tabs: Details · Files & Versions · Preview · Licence & Access · Dependencies · Activity; right rail: status, publish controls, schedule, checks list |
| A5 | Version History | versions table, changelog, breaking flag, publish/rollback, diff of metadata |
| A6 | Review Queue | list of `ready_for_review` with preview, checklist, Approve / Reject with reason |
| A7 | Processing Jobs | live job list (stage, progress, errors), retry |
| A8 | Categories & Tags | tree per type, drag reorder, icons, merge tags |
| A9 | Collections | curated rails, drag ordering, schedule |
| A10 | Access & Licence Tiers | audience rules, plan→tier mapping, device limits |
| A11 | Analytics | per type / per asset downloads, installs, applies, search terms with zero results |
| A12 | Settings | storage, CDN, processing limits, API clients, webhooks, admin roles, audit log |

## 12. FrameFlow Desktop — Screens

| ID | Screen | Key elements |
|---|---|---|
| F1 | Library Home (docked panel / full window) | type rail (12 icons), search with suggestions, rails: Recently used, Featured, New, Updates available |
| F2 | Browse / Search Results | filter chips (category, aspect, duration, alpha, tier, installed), sort, grid of cards with hover preview, status badge (Installed / Update / Download / Pro lock) |
| F3 | Asset Detail drawer | large preview (play / before-after / specimen / waveform), metadata, dependencies, version, licence, buttons **Download & Add**, Download, Favorite |
| F4 | Downloads & Installs | queue with progress, speed, ETA, pause/resume/cancel; history; failed with retry |
| F5 | Installed / My Library (offline) | installed assets by type, storage usage, update all, remove, pin version |
| F6 | Favorites & Recent | |
| F7 | Editor integration | library panel docked beside timeline; drag ghost; placeholder with progress on timeline |
| F8 | Settings → Library | storage location, cache limit, auto-update rules, metered network, sign-in/device |

Shared design standards: same type icons, colors, status pills, card component and terminology in web and desktop; dark theme default in desktop, light/dark in web; keyboard: `/` search, `Enter` add, `F` favorite, `Space` preview.

---

## 13. Search

Server: Meilisearch (or OpenSearch) index on title, tags, keywords, category, author with typo tolerance, synonyms (incl. Sinhala/Tamil), facet filters; ranking = text relevance → popularity (30 d downloads) → recency. Client offline: SQLite FTS5 over cached catalog; installed assets ranked first.

## 14. Non-Functional Requirements

| Area | Target |
|---|---|
| Catalog API p95 | < 250 ms (cached), search p95 < 300 ms |
| Library panel first paint | < 500 ms from local cache |
| Install hot-register | < 2 s after download for assets < 50 MB |
| Availability | 99.9% API; CDN 99.95% |
| Scale | 100k assets, 500k users, 20k concurrent downloads |
| Security | TLS 1.2+, signed URLs (5 min), signed packages, OWASP ASVS L2, SVG/Lottie sanitization, no executable code in packages (shaders compiled in sandbox only) |
| Privacy | usage events pseudonymous, 13-month retention |
| Accessibility | WCAG 2.2 AA in web admin; full keyboard support in desktop panel |
| Localization | English, Sinhala, Tamil UI strings |
| Observability | OpenTelemetry traces, job metrics, download failure rate alert > 2% |

## 15. Technical Architecture

```
[Admin Web (Next.js/React + Tailwind UI v4)] ──┐
                                               ├─► [Library API (Laravel 11 / or NestJS)] ─► [PostgreSQL 16]
[FrameFlow Desktop (Electron/Tauri + SQLite)] ─┘          │          │              └─► [Meilisearch]
                                                          │          └─► [Redis: cache, queues, SSE fan-out]
                                                          ▼
                                            [Workers: FFmpeg, fontTools, ClamAV, shader compiler, Lottie renderer]
                                                          ▼
                                     [S3 storage: originals | packages | previews] ─► [CDN (signed URLs)]
                                     [OneAuth (OIDC)]   [WorkSuite Notifications / Webhooks]
```

Repository layout (`wordsuite-frameflow-library`):

```
apps/admin-web/        # Download Center admin
apps/api/              # Library API
apps/workers/          # processing pipeline
packages/sdk-js/       # typed client used by FrameFlow desktop
packages/asset-schema/ # JSON Schemas for manifests + metadata (shared validation)
packages/ui/           # shared card, pill, type icons (web + desktop)
desktop-module/        # FrameFlow library panel, download manager, installer, sync engine
infra/                 # docker-compose, terraform, CDN config
docs/                  # this blueprint, API OpenAPI 3.1 spec
```

## 16. Database (core tables, PostgreSQL)

```sql
assets(id uuid pk, slug text unique, type asset_type, title text, description text,
  category_id uuid fk, status asset_status, visibility asset_visibility, licence_tier tier,
  licence_terms text, attribution_text text, current_version text, min_app_version text,
  meta jsonb, -- type-specific fields
  featured bool, publish_at timestamptz, unpublish_at timestamptz,
  created_by uuid, created_at timestamptz, updated_at timestamptz, published_at timestamptz);
asset_versions(id uuid pk, asset_id fk, version text, changelog text, package_key text,
  size_bytes bigint, sha256 char(64), signature text, min_app_version text,
  is_breaking bool, status text, created_at timestamptz, unique(asset_id, version));
asset_dependencies(asset_id fk, depends_on fk, min_version text);
asset_tags(asset_id fk, tag_id fk);  categories(id, type, parent_id, name, slug, sort, icon);
previews(asset_id fk, kind text, url text, meta jsonb);
processing_jobs(id, asset_id, version_id, stage text, status text, progress int, error jsonb, attempts int);
validation_results(job_id fk, check text, passed bool, detail jsonb);
audience_rules(asset_id fk, effect allow|deny, org_id, plan, role, region);
sync_events(seq bigserial pk, asset_id, op text, payload jsonb, created_at);
user_favorites(user_id, asset_id, created_at); user_downloads(id, user_id, device_id, asset_id, version, status, bytes, started_at, finished_at);
user_installs(user_id, device_id, asset_id, version, installed_at, last_used_at);
usage_events(id, user_id, device_id, asset_id, event text, at);
devices(id, user_id, fingerprint_hash, os, app_version, last_seen_at, revoked bool);
audit_log(id, actor_id, action, entity, entity_id, diff jsonb, ip inet, at);
```

## 17. Delivery Plan

| Phase | Weeks | Deliverables |
|---|---|---|
| 0 Foundations | 1–2 | repo scaffold, schema package, DB, OneAuth integration, storage/CDN |
| 1 Admin core | 3–6 | Upload Center, Asset Library table, Asset Editor, categories/tags, RBAC, audit |
| 2 Processing | 5–8 | workers for all 12 types, previews, packaging & signing, review queue |
| 3 Client API & sync | 7–10 | catalog/search/download APIs, delta sync + SSE, entitlements, devices |
| 4 FrameFlow integration | 9–13 | library panel, download manager, installer, hot registration per editor, drag/drop & apply |
| 5 Polish | 13–15 | analytics, collections, offline search, storage management, localisation (EN/SI/TA) |
| 6 Hardening | 15–16 | load tests, security review, beta with internal creators, launch |

## 18. Acceptance Criteria (key)

1. Admin uploads 50 mixed files by drag-drop; types auto-detected; each shows validation result within 60 s (< 100 MB files).
2. A failed check blocks publishing and shows the exact rule and value.
3. Publishing an asset makes it appear in an online FrameFlow client within 60 s (SSE) or 15 min (poll), with no restart.
4. "Download & Add" on a text template that needs an uninstalled font installs the font first, then inserts the title at the playhead.
5. Dropping an un-installed LUT onto a clip shows progress on the clip and applies the LUT when done; one undo removes it.
6. Pulling the network mid-download and restoring it resumes from the last chunk.
7. Offline, installed assets are searchable and usable; non-installed assets are shown greyed "Available online".
8. Publishing v1.1 of an installed asset auto-updates the library copy but open projects keep v1.0 until the user chooses Update.
9. Unpublishing an asset hides it from browse within one sync cycle; existing projects still render.
10. Every admin mutation appears in the audit log with before/after values.
