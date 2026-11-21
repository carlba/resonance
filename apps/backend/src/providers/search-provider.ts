/** DI token for the active {@link SearchProvider}; inject it with `@Inject(SEARCH_PROVIDER)`. */
export const SEARCH_PROVIDER = Symbol('SEARCH_PROVIDER');

/** A source that can search for files, such as slskd. */
export interface SearchProvider {
  /**
   * Runs one search and resolves once it has finished or timed out. Throws an `ApiError` when the
   * provider fails or times out without any results.
   */
  search(searchText: string): Promise<ProviderSearchResult[]>;
}

/** How quickly the user who shares the files can be expected to start an upload. */
export interface UserAvailability {
  hasFreeUploadSlot: boolean;
  queueLength: number;
  /** Average upload speed in bytes per second. */
  uploadSpeed: number;
}

/** The files one user returned for a search. */
export interface ProviderSearchResult {
  username: string;
  availability: UserAvailability;
  files: ProviderFile[];
}

/** One shared file. Optional fields are the ones the provider doesn't always know. */
export interface ProviderFile {
  /** The full path on the user's share, with the provider's own separators. */
  path: string;
  /** Size in bytes. */
  size: number;
  /** Bitrate in kbps. */
  bitRate?: number;
  bitDepth?: number;
  /** Sample rate in Hz. */
  sampleRate?: number;
  durationSeconds?: number;
  isVariableBitRate?: boolean;
}
