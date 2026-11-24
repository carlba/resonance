import type { DownloadFileState } from '@/api/download-schemas.ts';
import { buildDownloadFile, buildDownloadGroup } from '@/test/fixtures.ts';
import {
  buildDownloadIndex,
  canStartDownload,
  getOverallStatus,
  getResultDownloadStatus,
} from './download-status.ts';

function buildIndex(username: string, states: Record<string, DownloadFileState>) {
  return buildDownloadIndex([
    buildDownloadGroup({
      username,
      files: Object.entries(states).map(([path, state]) => buildDownloadFile({ path, state })),
    }),
  ]);
}

describe('getOverallStatus', () => {
  it.each<[string, DownloadFileState[], string | undefined]>([
    ['nothing in slskd', [], undefined],
    ['a queued file', ['queued'], 'downloading'],
    ['a file in progress', ['downloading'], 'downloading'],
    ['every file succeeded', ['succeeded', 'succeeded'], 'succeeded'],
    ['every file failed', ['failed', 'failed'], 'failed'],
    ['a failed file but another still queued', ['failed', 'queued'], 'downloading'],
    ['a failed file but another in progress', ['failed', 'downloading'], 'downloading'],
    ['a failed file and the others succeeded', ['succeeded', 'failed'], 'failed'],
  ])('is correct for %s', (_description, states, expected) => {
    expect(getOverallStatus(states)).toBe(expected);
  });
});

describe('getResultDownloadStatus', () => {
  it('matches the files by username and path', () => {
    const index = buildIndex('alice', { 'a.flac': 'succeeded', 'b.flac': 'downloading' });

    expect(getResultDownloadStatus(index, 'alice', ['a.flac'])).toBe('succeeded');
    expect(getResultDownloadStatus(index, 'alice', ['a.flac', 'b.flac'])).toBe('downloading');
    expect(getResultDownloadStatus(index, 'bob', ['a.flac'])).toBeUndefined();
  });

  it('ignores the files of the result slskd has no transfer for', () => {
    const index = buildIndex('alice', { 'a.flac': 'succeeded' });

    expect(getResultDownloadStatus(index, 'alice', ['a.flac', 'cover.jpg'])).toBe('succeeded');
  });

  it('has no status when none of the files are in slskd', () => {
    const index = buildIndex('alice', { 'a.flac': 'failed' });

    expect(getResultDownloadStatus(index, 'alice', ['other.flac'])).toBeUndefined();
  });
});

describe('canStartDownload', () => {
  it.each([
    [undefined, true],
    ['failed', true],
    ['downloading', false],
    ['succeeded', false],
  ] as const)('for status %s is %s', (status, expected) => {
    expect(canStartDownload(status)).toBe(expected);
  });
});
