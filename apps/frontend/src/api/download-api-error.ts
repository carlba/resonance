import type { SearchApiErrorKind } from './search-api-error.ts';

export interface DownloadApiErrorOptions {
  kind: SearchApiErrorKind;
  /** The HTTP status of the backend's response; only set when `kind` is `http`. */
  statusCode?: number;
  cause?: unknown;
}

/** A failed download request or downloads poll, in a form the UI can show. */
export class DownloadApiError extends Error {
  readonly kind: SearchApiErrorKind;
  readonly statusCode?: number;

  constructor(message: string, options: DownloadApiErrorOptions) {
    super(message, { cause: options.cause });
    this.name = 'DownloadApiError';
    this.kind = options.kind;
    this.statusCode = options.statusCode;
  }
}
