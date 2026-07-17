/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** External API Gateway base URL; defaults to same-origin "/api" when unset. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
