import type { UserAvailability } from '../providers/search-provider.js';
import { isAudioFile, type TrackResult } from '../tracks/track-mapping.js';
import { guessAlbumTitle } from './album-title.js';

// The last `\` or `/` of a share path, whichever separator the share uses.
const LAST_PATH_SEPARATOR = /[\\/](?=[^\\/]*$)/;

// Sub-folders that hold one disc of a multi-disc album: `CD1`, `CD 2`, `Disc 2`, `Disk 1 - Title`.
const DISC_FOLDER = /^(?:cd|dis[ck])[\s._-]*\d+(?:\b.*)?$/i;

// Numeric so `2 - Song` sorts before `10 - Song`; a fixed locale keeps the order the same on
// every machine.
const PATH_COLLATOR = new Intl.Collator('en', { numeric: true });

/** Orders paths the way a file manager does, so `2 - Song` comes before `10 - Song`. */
export function comparePaths(first: string, second: string): number {
  return PATH_COLLATOR.compare(first, second);
}

/**
 * The files one user shares in one album directory. The quality and length come from the audio
 * files only, so cover art, cue sheets and logs are listed without skewing them.
 */
export interface AlbumResult {
  username: string;
  /** The album directory's full path on the user's share; disc sub-folders are folded into it. */
  directory: string;
  /** Guessed from the directory name. */
  artist?: string;
  /** Guessed from the directory name; the name itself when no pattern fits. */
  album: string;
  year?: number;
  /** The number of audio files. */
  trackCount: number;
  /** Size of every file in bytes, audio or not, since all of them are downloaded with the album. */
  totalSize: number;
  /**
   * Only set when every audio file's duration is known, since a partial sum would understate it.
   */
  totalDurationSeconds?: number;
  /** The most common audio extension, e.g. `flac`. */
  dominantExtension: string;
  /** The most common known bitrate in kbps; unset when no audio file's bitrate is known. */
  dominantBitRate?: number;
  availability: UserAvailability;
  /**
   * Every file of the album, audio or not, sorted by path so tracks follow the order of their file
   * names and disc folders.
   */
  tracks: TrackResult[];
}

/** Splits a path into its directory and its last segment; the directory is `''` when there is none. */
export function splitLastSegment(path: string): { directory: string; name: string } {
  const [directory, name] = path.split(LAST_PATH_SEPARATOR);
  return name === undefined ? { directory: '', name: path } : { directory, name };
}

/** The album directory of a track: its parent directory, or the one above a disc sub-folder. */
export function getAlbumDirectory(trackPath: string): string {
  const { directory } = splitLastSegment(trackPath);
  const { directory: parent, name } = splitLastSegment(directory);
  const isDiscFolder = parent !== '' && DISC_FOLDER.test(name);
  return isDiscFolder ? parent : directory;
}

/**
 * The value that occurs most often, ignoring `undefined`. On a tie the value seen first wins, so
 * the result follows the order of the input. `undefined` when there are no values.
 */
export function getMostCommon<T>(values: readonly (T | undefined)[]): T | undefined {
  const knownValues = values.filter((value): value is T => value !== undefined);
  const occurrences = [...Map.groupBy(knownValues, value => value).values()];
  // Groups follow the order each value first appears, and only a strictly larger group replaces
  // the leader, so ties keep the value seen first.
  const largest = occurrences.reduce<T[]>(
    (leader, group) => (group.length > leader.length ? group : leader),
    []
  );
  return largest.at(0);
}

function sumDurations(tracks: readonly TrackResult[]): number | undefined {
  const isEveryDurationKnown = tracks.every(track => track.durationSeconds !== undefined);
  return isEveryDurationKnown
    ? tracks.reduce((total, track) => total + (track.durationSeconds ?? 0), 0)
    : undefined;
}

function toAlbumResult(directory: string, unsortedFiles: readonly TrackResult[]): AlbumResult {
  const files = unsortedFiles.toSorted((first, second) => comparePaths(first.path, second.path));
  const audioFiles = files.filter(isAudioFile);
  // Every file of a group comes from the same user, so they share one availability.
  const [{ username, availability }] = files;

  return {
    username,
    directory,
    ...guessAlbumTitle(directory),
    trackCount: audioFiles.length,
    totalSize: files.reduce((total, file) => total + file.size, 0),
    totalDurationSeconds: sumDurations(audioFiles),
    dominantExtension: getMostCommon(audioFiles.map(file => file.extension)) ?? '',
    dominantBitRate: getMostCommon(audioFiles.map(file => file.bitRate)),
    availability,
    tracks: files,
  };
}

/**
 * Groups files into albums by user and album directory, folding disc sub-folders into their
 * parent so a multi-disc album is one result. A directory without audio files, such as a `Scans`
 * folder, is not an album and is left out. Albums keep the order in which their first file appears.
 */
export function groupTracksIntoAlbums(tracks: readonly TrackResult[]): AlbumResult[] {
  // A JSON pair can't collide the way a plain concatenation of the two strings could. Map.groupBy
  // keeps the groups in the order their first track appears.
  const groups = Map.groupBy(tracks, track =>
    JSON.stringify([track.username, getAlbumDirectory(track.path)])
  );

  // Every track of a group has the same album directory, so the first one stands for all.
  return [...groups.values()]
    .filter(group => group.some(isAudioFile))
    .map(group => toAlbumResult(getAlbumDirectory(group[0].path), group));
}
