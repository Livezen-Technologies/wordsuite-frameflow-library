/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_FEED_BASE?: string;
  readonly VITE_BASE_PATH?: string;
  readonly VITE_OIDC_ISSUER?: string;
  readonly VITE_OIDC_CLIENT_ID?: string;
  readonly VITE_FRAMEFLOW_DOWNLOAD_URL?: string;
}
