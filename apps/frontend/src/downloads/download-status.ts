import type { DownloadFileState, DownloadGroup } from '@/api/download-schemas.ts';

/** What a result card or a download group shows; queued and in-progress files are both active. */
export type DownloadStatus = 'downloading' | 'succeeded' | 'failed';

/** The state of every file slskd knows about, by user and path. */
export type DownloadIndex = ReadonlyMap<string, DownloadFileState>;

// A user shares a path once, so the pair identifies a file.
function getFileKey(username: string, path: string): string {
  return `${username}\n${path}`;
}

/**
 * The status of a set of files, or `undefined` when there are none. Anything still queued or in
 * progress makes it `downloading`; once nothing is, one failed file makes it `failed` and only
 * all-succeeded makes it `succeeded`.
 */
export function getOverallStatus(states: readonly DownloadFileState[]): DownloadStatus | undefined {
  if (states.length === 0) {
    return undefined;
  }
  if (states.some(state => state === 'queued' || state === 'downloading')) {
    return 'downloading';
  }
  return states.some(state => state === 'failed') ? 'failed' : 'succeeded';
}

export function buildDownloadIndex(groups: readonly DownloadGroup[]): DownloadIndex {
  return new Map(
    groups.flatMap(group =>
      group.files.map(file => [getFileKey(group.username, file.path), file.state] as const)
    )
  );
}

/**
 * The download status of a search result, from the slskd transfers of its files matched by user
 * and path. Files slskd has no transfer for don't count, so a result with none is `undefined`.
 */
export function getResultDownloadStatus(
  index: DownloadIndex,
  username: string,
  paths: readonly string[]
): DownloadStatus | undefined {
  const states = paths
    .map(path => index.get(getFileKey(username, path)))
    .filter((state): state is DownloadFileState => state !== undefined);
  return getOverallStatus(states);
}

/** A result can be downloaded unless its files are downloading or have downloaded already. */
export function canStartDownload(status: DownloadStatus | undefined): boolean {
  return status === undefined || status === 'failed';
}
