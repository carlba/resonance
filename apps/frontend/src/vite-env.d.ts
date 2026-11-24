/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** How often the download statuses are read, in milliseconds; see `parsePollInterval`. */
  readonly VITE_DOWNLOADS_POLL_INTERVAL_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
