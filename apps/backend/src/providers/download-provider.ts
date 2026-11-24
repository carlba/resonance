/** DI token for the active {@link DownloadProvider}; inject it with `@Inject(DOWNLOAD_PROVIDER)`. */
export const DOWNLOAD_PROVIDER = Symbol('DOWNLOAD_PROVIDER');

/**
 * Where a file is in its download. `queued` covers every state before the bytes start to flow,
 * whether the provider or the remote user is the one holding it back.
 */
export type DownloadState = 'queued' | 'downloading' | 'succeeded' | 'failed';

/** A file to download, as the search returned it. */
export interface DownloadFileRequest {
  /** The full path on the user's share, with the provider's own separators. */
  path: string;
  /** Size in bytes. */
  size: number;
}

/** The files to download from one user. */
export interface DownloadRequest {
  username: string;
  files: DownloadFileRequest[];
}

/** One file the provider has a download for, whatever its state. */
export interface ProviderDownloadFile {
  username: string;
  /** The full path on the user's share, the same one the search returned. */
  path: string;
  /** Size in bytes. */
  size: number;
  state: DownloadState;
  bytesTransferred: number;
  /** Speed in bytes per second; `0` while nothing is transferred. */
  averageSpeed: number;
  /** The last time something happened to the download, as an ISO 8601 timestamp when known. */
  lastActivityAt?: string;
}

/** A source that can download files from other users, such as slskd. */
export interface DownloadProvider {
  /**
   * Asks the provider to download every file of the request. Resolves once the provider has
   * accepted all of them. Throws an `ApiError` when it is unreachable, fails, or rejects any file.
   */
  enqueue(request: DownloadRequest): Promise<void>;

  /**
   * Every download the provider knows about, including the ones it didn't get from this app.
   * Throws an `ApiError` when the provider fails.
   */
  list(): Promise<ProviderDownloadFile[]>;
}
