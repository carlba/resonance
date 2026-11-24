import { comparePaths, getAlbumDirectory, splitLastSegment } from '../albums/album-grouping.js';
import type { DownloadState, ProviderDownloadFile } from '../providers/download-provider.js';

/** A group's state: `queued` and `downloading` files both count as still downloading. */
export type DownloadGroupState = 'downloading' | 'succeeded' | 'failed';

const PERCENT = 100;

export interface DownloadFileResult {
  /** The full path on the user's share, the same one the search returned. */
  path: string;
  filename: string;
  /** Size in bytes. */
  size: number;
  state: DownloadState;
  bytesTransferred: number;
  /** 0 to 100. */
  percentComplete: number;
  /** Speed in bytes per second. */
  speed: number;
}

/** The files of one user in one folder, like an album result, with their combined progress. */
export interface DownloadGroup {
  username: string;
  /** The folder's full path on the user's share; disc sub-folders are folded into it. */
  directory: string;
  /** The folder's own name, for a title. */
  name: string;
  state: DownloadGroupState;
  /** Size of every file in bytes. */
  size: number;
  bytesTransferred: number;
  /** 0 to 100. */
  percentComplete: number;
  /** Combined speed of the files being transferred, in bytes per second. */
  speed: number;
  /** The latest sign of life of any file as an ISO 8601 timestamp; unset when none is known. */
  lastActivityAt?: string;
  /** Sorted by path, so tracks follow the order of their file names and disc folders. */
  files: DownloadFileResult[];
}

/**
 * The state of a set of files. Anything still queued or in progress makes it `downloading`;
 * once nothing is, one failed file makes it `failed` and only all-succeeded makes it `succeeded`.
 */
export function getOverallState(states: readonly DownloadState[]): DownloadGroupState {
  if (states.some(state => state === 'queued' || state === 'downloading')) {
    return 'downloading';
  }
  return states.some(state => state === 'failed') ? 'failed' : 'succeeded';
}

function getPercent(transferred: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.min(Math.round((transferred / total) * PERCENT), PERCENT);
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function toDownloadFileResult(file: ProviderDownloadFile): DownloadFileResult {
  return {
    path: file.path,
    filename: splitLastSegment(file.path).name,
    size: file.size,
    state: file.state,
    bytesTransferred: file.bytesTransferred,
    percentComplete: getPercent(file.bytesTransferred, file.size),
    speed: file.averageSpeed,
  };
}

function getLatestActivity(files: readonly ProviderDownloadFile[]): string | undefined {
  // ISO 8601 timestamps in the same format sort as text.
  return files
    .map(file => file.lastActivityAt)
    .filter((activity): activity is string => activity !== undefined)
    .toSorted()
    .at(-1);
}

function toDownloadGroup(
  directory: string,
  unsortedFiles: readonly ProviderDownloadFile[]
): DownloadGroup {
  const files = unsortedFiles.toSorted((first, second) => comparePaths(first.path, second.path));
  const size = sum(files.map(file => file.size));
  const bytesTransferred = sum(files.map(file => file.bytesTransferred));
  // Every file of a group comes from the same user.
  const [{ username }] = files;

  return {
    username,
    directory,
    name: splitLastSegment(directory).name,
    state: getOverallState(files.map(file => file.state)),
    size,
    bytesTransferred,
    percentComplete: getPercent(bytesTransferred, size),
    speed: sum(files.map(file => file.averageSpeed)),
    lastActivityAt: getLatestActivity(files),
    files: files.map(toDownloadFileResult),
  };
}

function isActive(group: DownloadGroup): boolean {
  return group.state === 'downloading';
}

/** Most recent first; a group without a known time comes last. */
function compareByRecency(first: DownloadGroup, second: DownloadGroup): number {
  return (second.lastActivityAt ?? '').localeCompare(first.lastActivityAt ?? '');
}

/**
 * Groups downloads by user and folder, folding disc sub-folders into their parent the way album
 * results do. Groups that are still downloading come first, then the rest; each part with the
 * most recent first.
 */
export function groupDownloads(files: readonly ProviderDownloadFile[]): DownloadGroup[] {
  // A JSON pair can't collide the way a plain concatenation of the two strings could.
  const groups = Map.groupBy(files, file =>
    JSON.stringify([file.username, getAlbumDirectory(file.path)])
  );

  return [...groups.values()]
    .map(group => toDownloadGroup(getAlbumDirectory(group[0].path), group))
    .toSorted((first, second) => {
      const activity = Number(isActive(second)) - Number(isActive(first));
      return activity === 0 ? compareByRecency(first, second) : activity;
    });
}
