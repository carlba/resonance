/** What went wrong, so the UI can pick a title without parsing the message. */
export type SearchApiErrorKind = 'http' | 'network' | 'timeout' | 'invalid-response';

export interface SearchApiErrorOptions {
  kind: SearchApiErrorKind;
  /** The HTTP status of the backend's response; only set when `kind` is `http`. */
  statusCode?: number;
  cause?: unknown;
}

/** A failed search, in a form the UI can show. The message is the backend's when it sent one. */
export class SearchApiError extends Error {
  readonly kind: SearchApiErrorKind;
  readonly statusCode?: number;

  constructor(message: string, options: SearchApiErrorOptions) {
    super(message, { cause: options.cause });
    this.name = 'SearchApiError';
    this.kind = options.kind;
    this.statusCode = options.statusCode;
  }
}
