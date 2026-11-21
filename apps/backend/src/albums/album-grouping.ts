import type { UserAvailability } from '../providers/search-provider.js';
import type { TrackResult } from '../tracks/track-mapping.js';
import { guessAlbumTitle } from './album-title.js';

// The last `\` or `/` of a share path, whichever separator the share uses.
const LAST_PATH_SEPARATOR = /[\\/](?=[^\\/]*$)/;

// Sub-folders that hold one disc of a multi-disc album: `CD1`, `CD 2`, `Disc 2`, `Disk 1 - Title`.
const DISC_FOLDER = /^(?:cd|dis[ck])[\s._-]*\d+(?:\b.*)?$/i;

// Numeric so `2 - Song` sorts before `10 - Song`; a fixed locale keeps the order the same on
// every machine.
const PATH_COLLATOR = new Intl.Collator('en', { numeric: true });

/** The audio files one user shares in one album directory. */
export interface AlbumResult {
  username: string;
  /** The album directory's full path on the user's share; disc sub-folders are folded into it. */
  directory: string;
  /** Guessed from the directory name. */
  artist?: string;
  /** Guessed from the directory name; the name itself when no pattern fits. */
  album: string;
  year?: number;
  trackCount: number;
  /** Size of all tracks in bytes. */
  totalSize: number;
  /** Only set when every track's duration is known, since a partial sum would understate it. */
  totalDurationSeconds?: number;
  /** The most common track extension, e.g. `flac`. */
  dominantExtension: string;
  /** The most common known bitrate in kbps; unset when no track's bitrate is known. */
  dominantBitRate?: number;
  availability: UserAvailability;
  /** Sorted by path, so tracks follow the order of their file names and disc folders. */
  tracks: TrackResult[];
}

/** Splits a path into its directory and its last segment; the directory is `''` when there is none. */
function splitLastSegment(path: string): { directory: string; name: string } {
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

function toAlbumResult(directory: string, unsortedTracks: readonly TrackResult[]): AlbumResult {
  const tracks = unsortedTracks.toSorted((first, second) =>
    PATH_COLLATOR.compare(first.path, second.path)
  );
  // Every track of a group comes from the same user, so they share one availability.
  const [{ username, availability }] = tracks;

  return {
    username,
    directory,
    ...guessAlbumTitle(directory),
    trackCount: tracks.length,
    totalSize: tracks.reduce((total, track) => total + track.size, 0),
    totalDurationSeconds: sumDurations(tracks),
    dominantExtension: getMostCommon(tracks.map(track => track.extension)) ?? '',
    dominantBitRate: getMostCommon(tracks.map(track => track.bitRate)),
    availability,
    tracks,
  };
}

/**
 * Groups tracks into albums by user and album directory, folding disc sub-folders into their
 * parent so a multi-disc album is one result. Albums keep the order in which their first track
 * appears.
 */
export function groupTracksIntoAlbums(tracks: readonly TrackResult[]): AlbumResult[] {
  // A JSON pair can't collide the way a plain concatenation of the two strings could. Map.groupBy
  // keeps the groups in the order their first track appears.
  const groups = Map.groupBy(tracks, track =>
    JSON.stringify([track.username, getAlbumDirectory(track.path)])
  );

  // Every track of a group has the same album directory, so the first one stands for all.
  return [...groups.values()].map(group => toAlbumResult(getAlbumDirectory(group[0].path), group));
}
