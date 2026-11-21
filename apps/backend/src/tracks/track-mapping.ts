import type {
  ProviderFile,
  ProviderSearchResult,
  UserAvailability,
} from '../providers/search-provider.js';

/** Lowercase file extensions, without the dot, that count as audio tracks. */
export const AUDIO_EXTENSIONS: ReadonlySet<string> = new Set([
  'aif',
  'aiff',
  'alac',
  'flac',
  'm4a',
  'mp3',
  'ogg',
  'opus',
  'wav',
]);

// Soulseek paths come from Windows and Unix shares alike, so both separators occur.
const PATH_SEPARATOR = /[\\/]/;

/**
 * One file from a search, with the availability of the user sharing it. Usually an audio track, but
 * cover art, cue sheets, logs and other files are kept too, so the user sees everything a share has.
 */
export interface TrackResult {
  /** The file name without its directory. */
  filename: string;
  /** The full path on the user's share; together with `username` it identifies the file. */
  path: string;
  username: string;
  /** Lowercase, without the dot, e.g. `flac`. */
  extension: string;
  /** Size in bytes. */
  size: number;
  /** Bitrate in kbps. */
  bitRate?: number;
  bitDepth?: number;
  /** Sample rate in Hz. */
  sampleRate?: number;
  durationSeconds?: number;
  isVariableBitRate?: boolean;
  availability: UserAvailability;
}

/** The last segment of a share path, whichever separator it uses. */
export function getFileName(path: string): string {
  return path.split(PATH_SEPARATOR).at(-1) ?? path;
}

/** The lowercase extension of a path without the dot, or `''` when it has none. */
export function getFileExtension(path: string): string {
  const filename = getFileName(path);
  const dotIndex = filename.lastIndexOf('.');
  // A leading dot marks a hidden file such as `.flac`, not an extension.
  return dotIndex > 0 ? filename.slice(dotIndex + 1).toLowerCase() : '';
}

export function isAudioFile(file: Pick<ProviderFile, 'path'>): boolean {
  return AUDIO_EXTENSIONS.has(getFileExtension(file.path));
}

export function toTrackResult(file: ProviderFile, result: ProviderSearchResult): TrackResult {
  return {
    filename: getFileName(file.path),
    path: file.path,
    username: result.username,
    extension: getFileExtension(file.path),
    size: file.size,
    bitRate: file.bitRate,
    bitDepth: file.bitDepth,
    sampleRate: file.sampleRate,
    durationSeconds: file.durationSeconds,
    isVariableBitRate: file.isVariableBitRate,
    availability: result.availability,
  };
}

/** Flattens provider results into one track per file, whatever its kind. */
export function toTrackResults(results: readonly ProviderSearchResult[]): TrackResult[] {
  return results.flatMap(result => result.files.map(file => toTrackResult(file, result)));
}
