# Changelog

All notable changes to the FrameFlow Asset Library are recorded here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

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
