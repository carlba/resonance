import type { DownloadState } from '../download-provider.js';
import {
  slskdDownloadsSchema,
  toDownloadState,
  toProviderDownloadFiles,
} from './slskd-download-api.js';

describe('toDownloadState', () => {
  it.each<[string, DownloadState]>([
    ['Requested', 'queued'],
    ['Queued, Locally', 'queued'],
    ['Queued, Remotely', 'queued'],
    ['Initializing', 'queued'],
    ['InProgress', 'downloading'],
    ['Completed, Succeeded', 'succeeded'],
    ['Completed, Errored', 'failed'],
    ['Completed, Rejected', 'failed'],
    ['Completed, TimedOut', 'failed'],
    ['Completed, Cancelled', 'failed'],
  ])('maps %s to %s', (slskdState, expected) => {
    expect(toDownloadState(slskdState)).toBe(expected);
  });

  it('ignores case and spacing', () => {
    expect(toDownloadState('completed,succeeded')).toBe('succeeded');
    expect(toDownloadState('  inprogress ')).toBe('downloading');
  });

  it('treats a bare Completed as failed, since it did not report success', () => {
    expect(toDownloadState('Completed')).toBe('failed');
  });

  it('treats an unknown state as queued, since nothing says it ended', () => {
    expect(toDownloadState('Something, New')).toBe('queued');
  });
});

describe('toProviderDownloadFiles', () => {
  const transfers = slskdDownloadsSchema.parse([
    {
      username: 'alice',
      directories: [
        {
          directory: 'Music\\Album',
          files: [
            {
              id: 'a',
              filename: 'Music\\Album\\01.flac',
              size: 1000,
              state: 'InProgress',
              bytesTransferred: 400,
              averageSpeed: 50,
              enqueuedAt: '2026-01-01T10:00:00Z',
              startedAt: '2026-01-01T10:05:00Z',
              endedAt: null,
            },
            {
              id: 'b',
              filename: 'Music\\Album\\02.flac',
              size: 2000,
              state: 'Completed, Succeeded',
              bytesTransferred: 1990,
              averageSpeed: 75,
              endedAt: '2026-01-01T09:00:00Z',
            },
          ],
        },
      ],
    },
    {
      username: 'bob',
      directories: [{ files: [{ id: 'c', filename: 'x.mp3', size: 5, state: 'Queued' }] }],
    },
  ]);

  it('flattens users and directories into one list of files', () => {
    expect(toProviderDownloadFiles(transfers).map(file => [file.username, file.path])).toEqual([
      ['alice', 'Music\\Album\\01.flac'],
      ['alice', 'Music\\Album\\02.flac'],
      ['bob', 'x.mp3'],
    ]);
  });

  it('keeps the id of each transfer, which slskd needs to cancel or remove it', () => {
    expect(toProviderDownloadFiles(transfers).map(file => file.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the speed only while a file is being transferred', () => {
    const [downloading, succeeded] = toProviderDownloadFiles(transfers);

    expect(downloading).toMatchObject({ state: 'downloading', averageSpeed: 50 });
    expect(succeeded).toMatchObject({ state: 'succeeded', averageSpeed: 0 });
  });

  it('counts a succeeded file as fully transferred', () => {
    expect(toProviderDownloadFiles(transfers)[1].bytesTransferred).toBe(2000);
  });

  it('defaults missing counters and uses the latest timestamp as the last activity', () => {
    const [downloading, , queued] = toProviderDownloadFiles(transfers);

    expect(downloading.lastActivityAt).toBe('2026-01-01T10:05:00.000Z');
    expect(queued).toMatchObject({ bytesTransferred: 0, averageSpeed: 0 });
    expect(queued.lastActivityAt).toBeUndefined();
  });
});
