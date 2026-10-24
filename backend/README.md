# FrameFlow Library API — CodeIgniter 4 backend

The Library API on PHP 8.3 / CodeIgniter 4.7 (it started as a port of the
retired Node service and keeps its HTTP surface): the `/api/v1` client, admin and worker endpoints
plus everything in [`docs/api-v1-additions.md`](../docs/api-v1-additions.md)
(devices, my library, `/sync/stream`, Meilisearch, collections, settings, webhooks),
the signed FrameFlow feed (`/feed/<stable|beta>/catalog.json`, `.sig`,
`/feed/<channel>/packs/<file>` with Range, ETag and Pro gating,
`/feed/public-key.pem`), worker previews (`/previews/…`) and `/healthz`.
The admin web is the separate React app in `../frontend`; this serves no HTML.

Layout follows the house CodeIgniter apps (`worksite-download/backend`):

| Path | What |
| --- | --- |
| `app/Config/Routes/{feed,client,admin,worker}.php` | Routes |
| `app/Controllers/` | `BaseApiController` (transactions, errors, ETags), `ClientController`, `Admin/*`, `WorkerController`, `FeedController` |
| `app/Filters/` | `AuthFilter` (`libauth`, `libauth:admin`), `PermissionFilter` (`perm:…`), `ResponseHeadersFilter` |
| `app/Services/` | `LibraryService`, `LibraryStore` (tables ↔ API shapes), `AuthContext`; `Concerns/` holds the v1-additions traits (client library, curation, settings, analytics, webhooks, their tables) |
| `app/Libraries/AssetSchema.php` | The 12 types, validators, publish gate (port of `packages/asset-schema`) |
| `app/Libraries/Rbac.php` | Roles → permissions |
| `app/Libraries/Pack/` | Deterministic ZIP writer/inspector, pack + catalog builder |
| `app/Libraries/Signing/Ed25519Key.php` | PKCS#8 PEM ↔ libsodium, SPKI public key |
| `app/Libraries/Storage/` | Local folder and S3/R2 (SigV4) blob stores |
| `app/Libraries/Auth/` | Static tokens, OIDC JWT verification (RS256/ES256/EdDSA via JWKS) |
| `app/Libraries/Search/MeiliSearch.php` | Optional Meilisearch index |
| `app/Libraries/Webhooks/` | `WebhookSender` (signed POST, no redirects, 10 s), `UrlGuard` (SSRF) |
| `app/Libraries/Http/SseResponse.php` | `/sync/stream` |
| `app/Database/Migrations/` | Tables: `assets`, `asset_versions`, `categories`, `uploads`, `sync_events`, `audit_log`, `user_downloads`, `usage_events`, `jobs`, `library_meta` (signing key, settings), `devices`, `user_favorites`, `user_installs`, `collections`, `search_terms`, `search_misses`, `webhooks`, `webhook_deliveries` |
| `app/Commands/` | `library:schedule`, `library:webhooks`, `library:reindex`, `library:keygen`, `library:reset` |

## Setup

```sh
composer install
cp env .env                      # optional
php spark migrate --all          # creates tables and default categories
php spark serve                  # development only; http://localhost:8080
```

Default dev database: `writable/library.sqlite`; blobs: `writable/library/`.
Without `LIBRARY_ADMIN_TOKENS` (and outside production) the token `dev-admin`
is a super admin. Point FrameFlow at it with
`WSC_ASSET_URL=http://localhost:8080/feed WSC_ASSET_PUBLIC_KEY="$(curl -s localhost:8080/feed/public-key.pem)"`.

## Environment

| Variable | Meaning |
| --- | --- |
| `database.default.DBDriver`, `.hostname`, `.port`, `.database`, `.username`, `.password` (`.DSN` for libpq options such as `sslmode`) | CodeIgniter's own database settings; production uses `Postgre` (what `deploy/cloudflare` sets) |
| `DATABASE_URL` | Alternative: `postgres://user:pass@host:5432/db[?sslmode=require]` or `sqlite:/abs/path.sqlite`; overrides `database.default.*` when set |
| `LIBRARY_ADMIN_TOKENS` | `token:role:userId,…`; roles `super_admin`, `library_manager`, `content_editor`, `reviewer`, `analyst`, `worker` |
| `LIBRARY_OIDC_ISSUER` | Worksuite Cloud issuer; enables OIDC access tokens (plan from `plan`, roles from the role claim). With it set, `X-Plan` is ignored |
| `LIBRARY_OIDC_AUDIENCE` | Expected `aud` (default `frameflow-library`) |
| `LIBRARY_OIDC_ROLE_CLAIM` | Claim with library roles (default `library_roles`) |
| `LIBRARY_SIGNING_KEY` | Ed25519 private key, PEM PKCS#8 — the same format the Node service used, so an existing key keeps working. Literal `\n` escapes are accepted. Unset: a dev key stored in `library_meta` |
| `LIBRARY_DATA_DIR` | Local blob folder (default `writable/library`) |
| `LIBRARY_S3_ENDPOINT`, `LIBRARY_S3_BUCKET`, `LIBRARY_S3_ACCESS_KEY_ID`, `LIBRARY_S3_SECRET_ACCESS_KEY`, `LIBRARY_S3_REGION` (`auto`), `LIBRARY_S3_PREFIX` | Blobs in R2/S3/MinIO instead of the folder |
| `LIBRARY_CORS_ORIGINS` | Comma-separated admin-web origins (default of the `cors_origins` setting) |
| `LIBRARY_REQUIRE_PROCESSING` | `1`: publishing waits for the version's worker job (`processing.done`); default of the `require_processing` setting |
| `MEILI_URL`, `MEILI_KEY`, `MEILI_INDEX` (`library_assets`) | Optional Meilisearch: live assets are indexed on publish/update/unpublish and `GET /assets?q=` queries it (falls back to SQL search when it's unreachable). `php spark library:reindex` rebuilds the index |
| `LIBRARY_WEBHOOKS_ALLOW_PRIVATE` | `1`: allow webhook targets on private/loopback addresses (development only) |
| `LIBRARY_WEBHOOKS_BACKOFF` | Seconds before the 2nd and 3rd attempt, default `10,60` |
| `LIBRARY_SSE_MAX_SECONDS`, `LIBRARY_SSE_POLL_MS`, `LIBRARY_SSE_PING_SECONDS` | `/sync/stream` lifetime (300), table poll (2000) and ping interval (25) |
| `CLAMAV_HOST` | Reported in the `malware_scan` check (scanning runs in the workers) |
| `CI_ENVIRONMENT` | `production` in deployments |

## Commands

```sh
php spark library:schedule            # run due scheduled publishes/unpublishes once
php spark library:schedule --loop     # …every 60 s (scheduler container / sidecar)
php spark library:webhooks            # send due webhook deliveries once
php spark library:webhooks --loop     # …keep sending (the image runs this)
php spark library:reindex             # rebuild the Meilisearch index (MEILI_URL)
php spark library:keygen              # new LIBRARY_SIGNING_KEY (+ its public key)
php spark library:keygen --public     # the running library's public key
php spark library:reset --force       # drop and recreate all tables (tests)
php spark migrate --all
```

The API also runs due schedules before each request, like the Node service.

## Tests

```sh
vendor/bin/phpunit                    # validators, zip, Ed25519, SigV4 vectors, service on SQLite (incl. devices, favorites, webhooks, tag merge, collections)
```

Acceptance: the repository's JS suite (`../tests`) runs against this backend
through `tests/harness.js`: every `start()` spawns `php spark serve` on a free
port with a fresh SQLite database and blob folder
(`LIBRARY_PHP_DATABASE_URL=postgres://…` to use PostgreSQL instead; the
database is reset with `library:reset` per test). `LIBRARY_API_URL=http(s)://…`
targets an already running server without resetting it.

```sh
cd .. && npm test
LIBRARY_PHP_DATABASE_URL=postgres://postgres@127.0.0.1:5432/library_ci npm test
```

## Production image

`Dockerfile` builds nginx + php-fpm in one image on port 8080; the entrypoint
runs migrations, starts php-fpm, a once-a-minute `library:schedule` loop
(`LIBRARY_SCHEDULER=0` to disable), the `library:webhooks --loop` queue
(`LIBRARY_WEBHOOKS=0` to disable) and nginx. Uploads up to 2 GiB
(`client_max_body_size`, `post_max_size`).

```sh
docker build -t frameflow-library-api backend
docker run -p 8080:8080 -e DATABASE_URL=postgres://… -e LIBRARY_SIGNING_KEY="$(cat key.pem)" frameflow-library-api
```

## Notes on the v1 additions

- Devices: with `LIBRARY_OIDC_ISSUER` set, `POST /assets/:id/download` needs `X-Device-Id` of one of the caller's active devices (`403 DEVICE_REQUIRED`); `POST /me/installs` checks the device the same way. A device the user removed can register again with the same fingerprint (it comes back as the same record, if the plan has room).
- Webhooks: events are queued in the request's transaction and sent by `library:webhooks`; `POST /admin/webhooks/:id/test` sends its `ping` immediately (one attempt). A first publish sends `asset.published` and `version.published`; later version releases and rollbacks send `version.published`. Refused (private/reserved) targets fail at once without retries. Deliveries also report `status` and `finished_at`.
- `/sync/stream` holds one php-fpm worker per client for up to 5 minutes (`pm.max_children = 32`).
- Settings are saved whole: once saved, `require_processing` and `cors_origins` no longer follow `LIBRARY_REQUIRE_PROCESSING` / `LIBRARY_CORS_ORIGINS`.
- Category edits, deletes and reorders write a `category_change` sync event.

## Differences from the Node service

- State lives in real tables instead of one JSON document; times are stored as ISO-8601 text (exactly what the API returns).
- API JSON responses carry CodeIgniter's default `Cache-Control: no-store, max-age=0, no-cache` (Node sent none).
- Without `LIBRARY_ADMIN_TOKENS`, the `dev-admin` token exists only outside `CI_ENVIRONMENT=production` (Node's entry point always added it).
- Every mutating request is one database transaction; a failed request leaves no partial change (Node could keep in-memory edits from a failed call, e.g. an upload re-checked for a new type).
- `review` / `pending_version` keys are omitted until set, like Node; `pending_version` is dropped rather than set to `null` on publish.
- PHP's request size limits apply before the app sees an upload; set `post_max_size` above the largest asset (the image does).
