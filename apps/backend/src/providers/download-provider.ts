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
  /** The provider's id for this transfer, needed to cancel or remove it. */
  id: string;
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

/** Identifies one transfer of one user. */
export interface TransferReference {
  username: string;
  id: string;
}

/** The two folders the provider keeps files in: finished downloads and partial ones. */
export type StorageLocation = 'downloads' | 'incomplete';

export type DeleteFileOutcome = 'deleted' | 'missing';

export interface DirectoryContents {
  fileCount: number;
  directoryCount: number;
}

export interface DownloadStorageOptions {
  /** Whether the provider lets this app delete its files at all. */
  isFileManagementEnabled: boolean;
  /**
   * The pattern that decides the sub-folder of the downloads folder a file ends up in, e.g.
   * slskd's `${SOURCE_DIRECTORY}`.
   */
  destinationPattern: string;
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

  /** The provider's settings that decide whether and where downloaded files can be deleted. */
  getStorageOptions(): Promise<DownloadStorageOptions>;

  /**
   * Cancels a queued or in-progress transfer and keeps it in the list. A transfer that is already
   * over or gone is not an error.
   */
  cancelTransfer(transfer: TransferReference): Promise<void>;

  /** Removes a transfer from the provider's list, cancelling it first. Gone already is fine. */
  removeTransfer(transfer: TransferReference): Promise<void>;

  /**
   * Deletes one file. Resolves with `missing` when there is no such file, which is not an error;
   * every other failure throws an `ApiError`.
   */
  deleteFile(location: StorageLocation, relativePath: string): Promise<DeleteFileOutcome>;

  /** What a folder holds; `undefined` when there is no such folder. */
  listDirectory(
    location: StorageLocation,
    relativePath: string
  ): Promise<DirectoryContents | undefined>;

  /** Deletes a folder with everything in it. Resolves quietly when there is no such folder. */
  deleteDirectory(location: StorageLocation, relativePath: string): Promise<void>;
}
