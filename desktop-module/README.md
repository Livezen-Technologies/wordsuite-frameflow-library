# Desktop module

The FrameFlow side of the library (download manager, installer, local index,
hot registration) lives in the FrameFlow app itself, in
[`Livezen-Technologies/worksuite-frameflow`](https://github.com/Livezen-Technologies/worksuite-frameflow):

| Blueprint §9 step | FrameFlow file |
|---|---|
| Signed catalog, ETag refresh, offline cache | `electron/asset-store.js` (`refreshCatalog`) |
| Resumable download (HTTP Range), SHA-256 verify | `electron/asset-store.js` (`download`) |
| Safe unpack, staging → atomic move | `electron/asset-pack-io.js` (`extractZip`), `asset-store.js` (`installZip`) |
| Hot registration with editor panels | `apps/web/src/asset-library/registry.ts` |
| Library UI | `apps/web/src/asset-library/components/` |

This repository publishes the feed those files read (`backend/`, `/feed/*`)
and the typed client in `packages/sdk-js` for the richer client API
(search, entitlements, sync and the `/sync/stream` push channel, usage,
device registration, favorites, download history and the installs mirror).
