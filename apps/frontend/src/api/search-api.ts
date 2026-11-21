import ky, { isHTTPError, isNetworkError, isTimeoutError, SchemaValidationError } from 'ky';
import type { HTTPError, StandardSchemaV1, StandardSchemaV1InferOutput } from 'ky';
import { SearchApiError } from './search-api-error.ts';
import {
  albumResultsSchema,
  errorResponseSchema,
  trackResultsSchema,
  type AlbumResult,
  type TrackResult,
} from './search-schemas.ts';

// The Vite dev server proxies /api to the backend; see vite.config.ts. Resolved here rather than
// by ky, which hands a relative base URL to `new Request()`, and that throws outside a browser.
const API_BASE_URL = new URL('/api/', document.baseURI);

// The backend caps a search at SEARCH_TIMEOUT_MS (30 s by default) and then answers itself, so
// this only catches a backend that stops responding.
const REQUEST_TIMEOUT_MS = 120_000;

const searchClient = ky.create({
  baseUrl: API_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  // A search can take as long as the backend's timeout, so a silent retry would multiply the
  // wait. The error state has a retry button instead.
  retry: 0,
});

export interface SearchRequestOptions {
  /** Aborts the request, e.g. when a newer search replaces it. */
  signal?: AbortSignal;
}

function getErrorResponseMessage(error: HTTPError): string {
  const parsed = errorResponseSchema.safeParse(error.data);
  if (!parsed.success) {
    return `Search failed: status=${error.response.status}`;
  }
  const { message } = parsed.data;
  return Array.isArray(message) ? message.join(', ') : message;
}

/** Turns what ky or zod threw into a {@link SearchApiError}; anything else is rethrown as-is. */
export function toSearchApiError(error: unknown, path: string): unknown {
  if (isHTTPError(error)) {
    return new SearchApiError(getErrorResponseMessage(error), {
      kind: 'http',
      statusCode: error.response.status,
      cause: error,
    });
  }
  if (isTimeoutError(error)) {
    return new SearchApiError(`The search took too long to answer: path=${path}`, {
      kind: 'timeout',
      cause: error,
    });
  }
  if (isNetworkError(error)) {
    return new SearchApiError(`Could not reach the backend: path=${path}`, {
      kind: 'network',
      cause: error,
    });
  }
  if (error instanceof SchemaValidationError) {
    return new SearchApiError(`The backend sent an unexpected response: path=${path}`, {
      kind: 'invalid-response',
      cause: error,
    });
  }
  // An abort, which the caller started and expects, or a bug that should surface unchanged.
  return error;
}

async function search<Schema extends StandardSchemaV1>(
  path: string,
  options: { searchText: string; schema: Schema; signal?: AbortSignal }
): Promise<StandardSchemaV1InferOutput<Schema>> {
  try {
    return await searchClient
      .get(path, { searchParams: { q: options.searchText }, signal: options.signal })
      .json(options.schema);
  } catch (error) {
    throw toSearchApiError(error, path);
  }
}

/** Searches single tracks: `GET /tracks?q=...`. Throws a {@link SearchApiError} on failure. */
export function searchTracks(
  searchText: string,
  options: SearchRequestOptions = {}
): Promise<TrackResult[]> {
  return search('tracks', { searchText, schema: trackResultsSchema, signal: options.signal });
}

/** Searches albums: `GET /albums?q=...`. Throws a {@link SearchApiError} on failure. */
export function searchAlbums(
  searchText: string,
  options: SearchRequestOptions = {}
): Promise<AlbumResult[]> {
  return search('albums', { searchText, schema: albumResultsSchema, signal: options.signal });
}
