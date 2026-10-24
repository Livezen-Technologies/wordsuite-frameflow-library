# FrameFlow Library API — CodeIgniter 4 backend

A PHP 8.3 / CodeIgniter 4.7 port of the Node Library API (`apps/api`). Same
HTTP surface and behaviour: the `/api/v1` client, admin and worker endpoints,
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
| `app/Services/` | `LibraryService` (port of `service.js`), `LibraryStore` (tables ↔ API shapes), `AuthContext` |
| `app/Libraries/AssetSchema.php` | The 12 types, validators, publish gate (port of `packages/asset-schema`) |
| `app/Libraries/Rbac.php` | Roles → permissions |
| `app/Libraries/Pack/` | Deterministic ZIP writer/inspector, pack + catalog builder |
| `app/Libraries/Signing/Ed25519Key.php` | PKCS#8 PEM ↔ libsodium, SPKI public key |
| `app/Libraries/Storage/` | Local folder and S3/R2 (SigV4) blob stores |
| `app/Libraries/Auth/` | Static tokens, OIDC JWT verification (RS256/ES256/EdDSA via JWKS) |
| `app/Database/Migrations/` | Tables: `assets`, `asset_versions`, `categories`, `uploads`, `sync_events`, `audit_log`, `user_downloads`, `usage_events`, `jobs`, `library_meta` |
| `app/Commands/` | `library:schedule`, `library:keygen`, `library:reset` |

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
| `DATABASE_URL` | `postgres://user:pass@host:5432/db[?sslmode=require]` (production) or `sqlite:/abs/path.sqlite` |
| `LIBRARY_ADMIN_TOKENS` | `token:role:userId,…`; roles `super_admin`, `library_manager`, `content_editor`, `reviewer`, `analyst`, `worker` |
| `LIBRARY_OIDC_ISSUER` | Worksuite Cloud issuer; enables OIDC access tokens (plan from `plan`, roles from the role claim). With it set, `X-Plan` is ignored |
| `LIBRARY_OIDC_AUDIENCE` | Expected `aud` (default `frameflow-library`) |
| `LIBRARY_OIDC_ROLE_CLAIM` | Claim with library roles (default `library_roles`) |
| `LIBRARY_SIGNING_KEY` | Ed25519 private key, PEM PKCS#8 — the same format the Node service used, so an existing key keeps working. Literal `\n` escapes are accepted. Unset: a dev key stored in `library_meta` |
| `LIBRARY_DATA_DIR` | Local blob folder (default `writable/library`) |
| `LIBRARY_S3_ENDPOINT`, `LIBRARY_S3_BUCKET`, `LIBRARY_S3_ACCESS_KEY_ID`, `LIBRARY_S3_SECRET_ACCESS_KEY`, `LIBRARY_S3_REGION` (`auto`), `LIBRARY_S3_PREFIX` | Blobs in R2/S3/MinIO instead of the folder |
| `LIBRARY_CORS_ORIGINS` | Comma-separated admin-web origins |
| `LIBRARY_REQUIRE_PROCESSING` | `1`: publishing waits for the version's worker job (`processing.done`) |
| `CLAMAV_HOST` | Reported in the `malware_scan` check (scanning runs in the workers) |
| `CI_ENVIRONMENT` | `production` in deployments |

## Commands

```sh
php spark library:schedule            # run due scheduled publishes/unpublishes once
php spark library:schedule --loop     # …every 60 s (scheduler container / sidecar)
php spark library:keygen              # new LIBRARY_SIGNING_KEY (+ its public key)
php spark library:keygen --public     # the running library's public key
php spark library:reset --force       # drop and recreate all tables (tests)
php spark migrate --all
```

The API also runs due schedules before each request, like the Node service.

## Tests

```sh
vendor/bin/phpunit                    # validators, zip, Ed25519, SigV4 vectors, service on SQLite
```

Acceptance: the repository's JS suites run against this backend through
`tests/harness.js`. `LIBRARY_API_URL=php` makes every `start()` spawn
`php spark serve` on a free port with a fresh SQLite database and blob folder
(`LIBRARY_PHP_DATABASE_URL=postgres://…` to use PostgreSQL instead; the
database is reset with `library:reset` per test). An `http(s)://` value
targets an already running server without resetting it.

```sh
cd .. && LIBRARY_API_URL=php node --test --test-concurrency=1 tests/library.test.js tests/workers.test.js tests/storage.test.js
LIBRARY_API_URL=php LIBRARY_PHP_DATABASE_URL=postgres://postgres@127.0.0.1:5432/library_ci node --test --test-concurrency=1 tests/library.test.js tests/workers.test.js
```

## Production image

`Dockerfile` builds nginx + php-fpm in one image on port 8080; the entrypoint
runs migrations, starts php-fpm, a once-a-minute `library:schedule` loop
(`LIBRARY_SCHEDULER=0` to disable) and nginx. Uploads up to 2 GiB
(`client_max_body_size`, `post_max_size`).

```sh
docker build -t frameflow-library-api backend
docker run -p 8080:8080 -e DATABASE_URL=postgres://… -e LIBRARY_SIGNING_KEY="$(cat key.pem)" frameflow-library-api
```

## Differences from the Node service

- State lives in real tables instead of one JSON document; times are stored as ISO-8601 text (exactly what the API returns).
- API JSON responses carry CodeIgniter's default `Cache-Control: no-store, max-age=0, no-cache` (Node sent none).
- Without `LIBRARY_ADMIN_TOKENS`, the `dev-admin` token exists only outside `CI_ENVIRONMENT=production` (Node's entry point always added it).
- Every mutating request is one database transaction; a failed request leaves no partial change (Node could keep in-memory edits from a failed call, e.g. an upload re-checked for a new type).
- `review` / `pending_version` keys are omitted until set, like Node; `pending_version` is dropped rather than set to `null` on publish.
- PHP's request size limits apply before the app sees an upload; set `post_max_size` above the largest asset (the image does).
