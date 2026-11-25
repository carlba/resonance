import ky, { isHTTPError, isNetworkError, isTimeoutError, SchemaValidationError } from 'ky';
import { DownloadApiError } from './download-api-error.ts';
import {
  deletedDownloadSchema,
  downloadCapabilitiesSchema,
  downloadGroupsSchema,
  startedDownloadSchema,
  type DeletedDownload,
  type DownloadCapabilities,
  type DownloadGroup,
  type DownloadRequest,
  type StartedDownload,
} from './download-schemas.ts';
import { errorResponseSchema } from './search-schemas.ts';

// The Vite dev server proxies /api to the backend; see vite.config.ts and search-api.ts.
const API_BASE_URL = new URL('/api/', document.baseURI);

// Both calls are quick: slskd only answers from its own state. The downloads list is polled, so
// the next poll is the retry, and a download request must not be sent twice.
const REQUEST_TIMEOUT_MS = 15_000;

const downloadClient = ky.create({
  baseUrl: API_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  retry: 0,
});

// Deleting goes through the files one by one, so a big album takes longer than the other calls.
const DELETE_TIMEOUT_MS = 120_000;

const DOWNLOADS_PATH = 'downloads';
const CAPABILITIES_PATH = `${DOWNLOADS_PATH}/capabilities`;
const SERVER_ERROR_STATUS = 500;

export interface DownloadsRequestOptions {
  /** Aborts the request, e.g. when the page that polls leaves the screen. */
  signal?: AbortSignal;
}

/**
 * The backend hides the details of 5xx errors, which is what a slskd failure looks like, so a
 * server error gets a message that says where to look instead of "Internal server error".
 */
function getHttpErrorMessage(statusCode: number, body: unknown): string {
  if (statusCode >= SERVER_ERROR_STATUS) {
    return `slskd could not be reached or refused the request: status=${statusCode}`;
  }
  const parsed = errorResponseSchema.safeParse(body);
  if (!parsed.success) {
    return `The download request failed: status=${statusCode}`;
  }
  const { message } = parsed.data;
  return Array.isArray(message) ? message.join(', ') : message;
}

/** Turns what ky or zod threw into a {@link DownloadApiError}; anything else is rethrown as-is. */
export function toDownloadApiError(error: unknown, path: string): unknown {
  if (isHTTPError(error)) {
    const statusCode = error.response.status;
    return new DownloadApiError(getHttpErrorMessage(statusCode, error.data), {
      kind: 'http',
      statusCode,
      cause: error,
    });
  }
  if (isTimeoutError(error)) {
    return new DownloadApiError(`The backend took too long to answer: path=${path}`, {
      kind: 'timeout',
      cause: error,
    });
  }
  if (isNetworkError(error)) {
    return new DownloadApiError(`Could not reach the backend: path=${path}`, {
      kind: 'network',
      cause: error,
    });
  }
  if (error instanceof SchemaValidationError) {
    return new DownloadApiError(`The backend sent an unexpected response: path=${path}`, {
      kind: 'invalid-response',
      cause: error,
    });
  }
  // An abort, which the caller started and expects, or a bug that should surface unchanged.
  return error;
}

/** Asks slskd to download the files: `POST /downloads`. Throws a {@link DownloadApiError}. */
export async function startDownload(request: DownloadRequest): Promise<StartedDownload> {
  try {
    return await downloadClient.post(DOWNLOADS_PATH, { json: request }).json(startedDownloadSchema);
  } catch (error) {
    throw toDownloadApiError(error, DOWNLOADS_PATH);
  }
}

/** Reads every download slskd knows about: `GET /downloads`. Throws a {@link DownloadApiError}. */
export async function fetchDownloads(
  options: DownloadsRequestOptions = {}
): Promise<DownloadGroup[]> {
  try {
    return await downloadClient
      .get(DOWNLOADS_PATH, { signal: options.signal })
      .json(downloadGroupsSchema);
  } catch (error) {
    throw toDownloadApiError(error, DOWNLOADS_PATH);
  }
}

/**
 * The URL-safe base64 of a folder path, without padding, which is how the backend expects the
 * `directory` of `DELETE /downloads/:username/:directory`. Paths hold separators and non-ASCII
 * characters, so the UTF-8 bytes are encoded rather than the string.
 */
export function encodeDirectory(directory: string): string {
  const bytes = new TextEncoder().encode(directory);
  const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

/**
 * Asks whether downloads can be deleted with slskd's current settings: `GET
 * /downloads/capabilities`. Throws a {@link DownloadApiError}.
 */
export async function fetchDownloadCapabilities(
  options: DownloadsRequestOptions = {}
): Promise<DownloadCapabilities> {
  try {
    return await downloadClient
      .get(CAPABILITIES_PATH, { signal: options.signal })
      .json(downloadCapabilitiesSchema);
  } catch (error) {
    throw toDownloadApiError(error, CAPABILITIES_PATH);
  }
}

/**
 * Cancels a group of downloads, deletes its files from disk for good and removes it from slskd:
 * `DELETE /downloads/:username/:directory`. Throws a {@link DownloadApiError}.
 */
export async function deleteDownload(
  username: string,
  directory: string
): Promise<DeletedDownload> {
  const path = `${DOWNLOADS_PATH}/${encodeURIComponent(username)}/${encodeDirectory(directory)}`;
  try {
    return await downloadClient
      .delete(path, { timeout: DELETE_TIMEOUT_MS })
      .json(deletedDownloadSchema);
  } catch (error) {
    throw toDownloadApiError(error, path);
  }
}
