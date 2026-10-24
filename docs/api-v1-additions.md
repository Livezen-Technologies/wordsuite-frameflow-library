# API v1 additions (contract for the remaining blueprint pieces)

Everything here extends the existing `/api/v1` surface in `backend/` (same auth, error
shape `{ error: { code, message, details[], request_id } }`, ETags on GET, 201 on create).
"User" = a verified OIDC principal (`sub`), or a static token in development.

## Devices (§7.1 device binding)

| Method & path | Body / query | Result |
|---|---|---|
| `POST /devices/register` | `{ fingerprint_hash, os: windows\|macos\|linux, app_version, name? }` | `201 { id, name, os, app_version, created_at, last_seen_at }`; same user + fingerprint → the existing device (200), `last_seen_at` updated |
| `GET /me/devices` | | `{ data: [device], limit }` |
| `DELETE /me/devices/:id` | | `204`; revoked devices can't download |

Limits per plan (settings, defaults): free 2, pro 3, business 10, enterprise 50. Over the
limit → `409 DEVICE_LIMIT` with `details: [{ field: "device", rule: "device.limit", value: <limit> }]`.
`POST /assets/:id/download` needs `X-Device-Id` of a non-revoked device of the caller when
OIDC is configured (`403 DEVICE_REQUIRED` otherwise); dev mode keeps working without it.

## My library

| Method & path | Result |
|---|---|
| `GET /me/favorites` | `{ data: [public asset] }` newest first |
| `PUT /me/favorites/:asset_id` / `DELETE …` | `204`; increments/decrements `stats.favorites` |
| `GET /me/downloads?cursor=&limit=` | `{ data: [{ id, asset: public asset \| null, version, device_id, status, bytes, started_at, finished_at }], next_cursor }` |
| `GET /me/installs?device_id=` | `{ data: [{ device_id, asset_id, version, installed_at, last_used_at }] }` |
| `POST /me/installs` | `{ device_id, asset_id, version }` → upsert, `201` |
| `DELETE /me/installs/:asset_id?device_id=` | `204` |

Favorites merge (§8.6): PUT is idempotent; the client unions its offline favorites by PUT on sign-in.

## Live sync (§8.2)

`GET /sync/stream?since=<seq>` → `text/event-stream`. Sends every sync event after `since`
as `event: sync` / `data: <the sync event JSON>`, then new ones as they happen (poll the
table each 2 s server-side is fine), `: ping` every 25 s, and closes after 5 minutes
(`event: bye`) so PHP workers aren't held; clients reconnect with the last `seq`.
`Last-Event-ID` header = `since`. Public (no auth), CORS like the feed.

## Search (§13)

`GET /assets?q=` keeps its shape. If `MEILI_URL` (+ `MEILI_KEY`) is set, the backend indexes
live assets (title, slug, tags, keywords, category, author, type, tier) on publish/update/
unpublish and queries Meilisearch (typo tolerance, Sinhala/Tamil keywords as synonyms);
otherwise the current SQL search. Every query with zero results is counted
(`search_misses`: term, count, last_at).

## Admin

| Method & path | Notes |
|---|---|
| `GET/POST /admin/collections`, `GET/PATCH/DELETE /admin/collections/:slug` | `{ slug, title, description, asset_ids: [ordered], publish_at?, unpublish_at?, visible }`; `taxonomy.manage`. Public `GET /collections` returns visible, in-window admin collections first, then the built-in Featured/New/Trending |
| `PATCH /admin/categories/:id`, `DELETE /admin/categories/:id`, `POST /admin/categories/reorder` `{ ids: [] }` | rename, icon, visible, parent; delete only when empty (`409 CATEGORY_IN_USE`) |
| `POST /admin/tags/merge` `{ from: [tags], into: tag }` | rewrites tags on all assets; `taxonomy.manage` |
| `GET/PUT /admin/settings` | `{ device_limits: { free, pro, business, enterprise }, require_processing: bool, cors_origins: [], feed: { stable: [visibilities], beta: [...] } }`; `settings.manage`; audited |
| `GET /admin/analytics/overview?from=&to=` | existing + `downloads_by_type`, `installs_30d`, `applies_30d` |
| `GET /admin/analytics/assets/:id?from=&to=` | `{ downloads_by_day, installs, applies, favorites, versions: [{ version, downloads }] }` |
| `GET /admin/analytics/search` | `{ top: [{ term, count }], misses: [{ term, count, last_at }] }` |
| `GET/POST /admin/webhooks`, `PATCH/DELETE /admin/webhooks/:id` | `{ id, url, events: [asset.published, asset.updated, asset.unpublished, asset.deprecated, version.published], active, secret (write-only; shown once on create) }`; `settings.manage` |
| `GET /admin/webhooks/:id/deliveries` | last 50: `{ id, event, status_code, ok, attempt, error, created_at }` |
| `POST /admin/webhooks/:id/test` | sends a `ping` event |
| `GET /admin/assets/:id/versions/:v/previews/:file` | the version's generated preview bytes for signed-in admins (drafts too), Range + ETag |

Webhook delivery: `POST url`, JSON `{ id, event, created_at, data: { asset (public shape), version } }`,
headers `X-Library-Event`, `X-Library-Delivery`, `X-Library-Signature: sha256=<hex HMAC-SHA256(secret, raw body)>`.
Sent from a queue (`php spark library:webhooks [--loop]`), 3 attempts with backoff, 10 s timeout,
no redirects, refuse private/loopback IPs unless `LIBRARY_WEBHOOKS_ALLOW_PRIVATE=1`.
