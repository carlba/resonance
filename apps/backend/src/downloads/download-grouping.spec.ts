import type { DownloadState, ProviderDownloadFile } from '../providers/download-provider.js';
import { getOverallState, groupDownloads } from './download-grouping.js';

function buildFile(overrides: Partial<ProviderDownloadFile> = {}): ProviderDownloadFile {
  return {
    username: 'alice',
    path: 'Music\\Artist\\Album\\01 - Song.flac',
    size: 1000,
    state: 'succeeded',
    bytesTransferred: 1000,
    averageSpeed: 0,
    ...overrides,
  };
}

describe('getOverallState', () => {
  it.each<[DownloadState[], string]>([
    [['succeeded', 'succeeded'], 'succeeded'],
    [['queued'], 'downloading'],
    [['downloading'], 'downloading'],
    [['succeeded', 'queued'], 'downloading'],
    [['failed', 'downloading'], 'downloading'],
    [['failed', 'queued'], 'downloading'],
    [['failed', 'failed'], 'failed'],
    [['succeeded', 'failed'], 'failed'],
  ])('is derived from %j as %s', (states, expected) => {
    expect(getOverallState(states)).toBe(expected);
  });
});

describe('groupDownloads', () => {
  it('groups the files of one user and folder, titled with the folder name', () => {
    const groups = groupDownloads([
      buildFile({ path: 'Music\\Artist\\Album\\10 - Last.flac' }),
      buildFile({ path: 'Music\\Artist\\Album\\2 - Second.flac' }),
      buildFile({ path: 'Music\\Artist\\Album\\cover.jpg' }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      username: 'alice',
      directory: 'Music\\Artist\\Album',
      name: 'Album',
    });
    expect(groups[0].files.map(file => file.filename)).toEqual([
      '2 - Second.flac',
      '10 - Last.flac',
      'cover.jpg',
    ]);
  });

  it('keeps users and folders apart', () => {
    const groups = groupDownloads([
      buildFile({ username: 'alice', path: 'Music\\A\\01.flac' }),
      buildFile({ username: 'bob', path: 'Music\\A\\01.flac' }),
      buildFile({ username: 'alice', path: 'Music\\B\\01.flac' }),
    ]);

    expect(
      groups
        .map(group => [group.username, group.name])
        .toSorted((first, second) => first.join().localeCompare(second.join()))
    ).toEqual([
      ['alice', 'A'],
      ['alice', 'B'],
      ['bob', 'A'],
    ]);
  });

  it('folds disc folders into the album folder', () => {
    const [group, ...rest] = groupDownloads([
      buildFile({ path: 'Music\\Album\\CD1\\01.flac' }),
      buildFile({ path: 'Music\\Album\\CD2\\01.flac' }),
    ]);

    expect(rest).toEqual([]);
    expect(group).toMatchObject({ directory: 'Music\\Album', name: 'Album' });
    expect(group.files).toHaveLength(2);
  });

  it('adds up size, bytes and speed, and rounds the percentage', () => {
    const [group] = groupDownloads([
      buildFile({ size: 1000, bytesTransferred: 1000, state: 'succeeded' }),
      buildFile({
        path: 'Music\\Artist\\Album\\02.flac',
        size: 2000,
        bytesTransferred: 500,
        averageSpeed: 250,
        state: 'downloading',
      }),
    ]);

    expect(group).toMatchObject({
      size: 3000,
      bytesTransferred: 1500,
      percentComplete: 50,
      speed: 250,
      state: 'downloading',
    });
    expect(group.files.map(file => file.percentComplete)).toEqual([100, 25]);
  });

  it('is failed when nothing is active and one file failed, even if the rest succeeded', () => {
    const [group] = groupDownloads([
      buildFile({ state: 'succeeded' }),
      buildFile({ path: 'Music\\Artist\\Album\\02.flac', state: 'failed', bytesTransferred: 0 }),
    ]);

    expect(group.state).toBe('failed');
  });

  it('has no progress for files of unknown size', () => {
    const [group] = groupDownloads([buildFile({ size: 0, bytesTransferred: 0 })]);

    expect(group.percentComplete).toBe(0);
  });

  it('lists active groups first, then the rest with the most recent first', () => {
    const groups = groupDownloads([
      buildFile({ path: 'Music\\old\\1.flac', lastActivityAt: '2026-01-01T00:00:00.000Z' }),
      buildFile({ path: 'Music\\new\\1.flac', lastActivityAt: '2026-03-01T00:00:00.000Z' }),
      buildFile({
        path: 'Music\\active-old\\1.flac',
        state: 'queued',
        lastActivityAt: '2026-02-01T00:00:00.000Z',
      }),
      buildFile({
        path: 'Music\\active-new\\1.flac',
        state: 'downloading',
        lastActivityAt: '2026-02-02T00:00:00.000Z',
      }),
      buildFile({ path: 'Music\\unknown\\1.flac' }),
    ]);

    expect(groups.map(group => group.name)).toEqual([
      'active-new',
      'active-old',
      'new',
      'old',
      'unknown',
    ]);
  });

  it('returns nothing for no downloads', () => {
    expect(groupDownloads([])).toEqual([]);
  });
});
