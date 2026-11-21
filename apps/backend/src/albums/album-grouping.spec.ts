import type { TrackResult } from '../tracks/track-mapping.js';
import {
  getAlbumDirectory,
  getMostCommon,
  groupTracksIntoAlbums,
  type AlbumResult,
} from './album-grouping.js';

const AVAILABILITY = { hasFreeUploadSlot: true, queueLength: 0, uploadSpeed: 1_000_000 };
const BUSY_AVAILABILITY = { hasFreeUploadSlot: false, queueLength: 12, uploadSpeed: 50_000 };

function createTrack(overrides: Partial<TrackResult> & Pick<TrackResult, 'path'>): TrackResult {
  return {
    filename: overrides.path.split(/[\\/]/).at(-1) ?? overrides.path,
    username: 'alice',
    extension: 'flac',
    size: 100,
    availability: AVAILABILITY,
    ...overrides,
  };
}

function summarize(
  albums: readonly AlbumResult[]
): { username: string; directory: string; paths: string[] }[] {
  return albums.map(album => ({
    username: album.username,
    directory: album.directory,
    paths: album.tracks.map(track => track.path),
  }));
}

describe('getAlbumDirectory', () => {
  it.each([
    ['@@share\\Music\\Album\\01 - Song.flac', '@@share\\Music\\Album'],
    ['music/Album/01 - Song.mp3', 'music/Album'],
    ['@@share\\Music\\Album\\CD1\\01 - Song.flac', '@@share\\Music\\Album'],
    ['music/Album/CD 2/01 - Song.flac', 'music/Album'],
    ['music/Album/Disc 2/01 - Song.flac', 'music/Album'],
    ['music/Album/disk_1/01 - Song.flac', 'music/Album'],
    ['music/Album/Disc 1 - The Beginning/01 - Song.flac', 'music/Album'],
    ['music/Album/Disco Hits/01 - Song.flac', 'music/Album/Disco Hits'],
    ['music/Album/CDs/01 - Song.flac', 'music/Album/CDs'],
    ['CD1/01 - Song.flac', 'CD1'],
    ['01 - Song.flac', ''],
  ])('returns the album directory of %s', (path, expected) => {
    expect(getAlbumDirectory(path)).toBe(expected);
  });
});

describe('getMostCommon', () => {
  it('returns the value that occurs most often', () => {
    expect(getMostCommon(['mp3', 'flac', 'flac'])).toBe('flac');
  });

  it('returns the value seen first on a tie', () => {
    expect(getMostCommon([320, 256, 256, 320])).toBe(320);
  });

  it('ignores missing values', () => {
    expect(getMostCommon([undefined, undefined, 320])).toBe(320);
  });

  it('returns undefined when no value is known', () => {
    expect(getMostCommon([undefined, undefined])).toBeUndefined();
    expect(getMostCommon([])).toBeUndefined();
  });
});

describe('groupTracksIntoAlbums', () => {
  it('groups the tracks of each user and directory into one album', () => {
    const albums = groupTracksIntoAlbums([
      createTrack({ path: '@@a\\Music\\Album\\01 - One.flac' }),
      createTrack({ path: '@@a\\Music\\Other\\01 - Other.flac' }),
      createTrack({ path: '@@a\\Music\\Album\\02 - Two.flac' }),
    ]);

    expect(summarize(albums)).toEqual([
      {
        username: 'alice',
        directory: '@@a\\Music\\Album',
        paths: ['@@a\\Music\\Album\\01 - One.flac', '@@a\\Music\\Album\\02 - Two.flac'],
      },
      {
        username: 'alice',
        directory: '@@a\\Music\\Other',
        paths: ['@@a\\Music\\Other\\01 - Other.flac'],
      },
    ]);
  });

  it('keeps albums of different users apart even when their folders have the same path', () => {
    const albums = groupTracksIntoAlbums([
      createTrack({ path: 'Music\\Album\\01 - One.flac', username: 'alice' }),
      createTrack({
        path: 'Music\\Album\\01 - One.flac',
        username: 'bob',
        availability: BUSY_AVAILABILITY,
      }),
    ]);

    expect(albums).toEqual([
      expect.objectContaining({ username: 'alice', availability: AVAILABILITY, trackCount: 1 }),
      expect.objectContaining({ username: 'bob', availability: BUSY_AVAILABILITY, trackCount: 1 }),
    ]);
  });

  it('groups Windows and Unix style paths by their own separators', () => {
    const albums = groupTracksIntoAlbums([
      createTrack({ path: '@@a\\Music\\Album\\01 - One.flac', username: 'alice' }),
      createTrack({ path: 'music/Album/01 - One.flac', username: 'bob' }),
      createTrack({ path: 'music/Album/02 - Two.flac', username: 'bob' }),
    ]);

    expect(summarize(albums)).toEqual([
      {
        username: 'alice',
        directory: '@@a\\Music\\Album',
        paths: ['@@a\\Music\\Album\\01 - One.flac'],
      },
      {
        username: 'bob',
        directory: 'music/Album',
        paths: ['music/Album/01 - One.flac', 'music/Album/02 - Two.flac'],
      },
    ]);
  });

  it('folds disc sub-folders into one album with the tracks in disc order', () => {
    const albums = groupTracksIntoAlbums([
      createTrack({ path: 'Music\\Artist - Album\\CD2\\01 - Three.flac' }),
      createTrack({ path: 'Music\\Artist - Album\\CD1\\02 - Two.flac' }),
      createTrack({ path: 'Music\\Artist - Album\\CD1\\01 - One.flac' }),
    ]);

    expect(summarize(albums)).toEqual([
      {
        username: 'alice',
        directory: 'Music\\Artist - Album',
        paths: [
          'Music\\Artist - Album\\CD1\\01 - One.flac',
          'Music\\Artist - Album\\CD1\\02 - Two.flac',
          'Music\\Artist - Album\\CD2\\01 - Three.flac',
        ],
      },
    ]);
    expect(albums[0]).toMatchObject({ artist: 'Artist', album: 'Album' });
  });

  it('sorts track numbers numerically', () => {
    const albums = groupTracksIntoAlbums([
      createTrack({ path: 'Music/Album/10 - Ten.flac' }),
      createTrack({ path: 'Music/Album/2 - Two.flac' }),
    ]);

    expect(summarize(albums)[0].paths).toEqual([
      'Music/Album/2 - Two.flac',
      'Music/Album/10 - Ten.flac',
    ]);
  });

  it('makes an album of a folder that holds a single file', () => {
    const track = createTrack({
      path: 'Music\\Daft Punk - One More Time (2000)\\01 - One More Time.mp3',
      extension: 'mp3',
      size: 8_000_000,
      bitRate: 320,
      durationSeconds: 320,
    });

    expect(groupTracksIntoAlbums([track])).toEqual([
      {
        username: 'alice',
        directory: 'Music\\Daft Punk - One More Time (2000)',
        artist: 'Daft Punk',
        album: 'One More Time',
        year: 2000,
        trackCount: 1,
        totalSize: 8_000_000,
        totalDurationSeconds: 320,
        dominantExtension: 'mp3',
        dominantBitRate: 320,
        availability: AVAILABILITY,
        tracks: [track],
      },
    ]);
  });

  it('sums sizes and durations and picks the dominant format and bitrate', () => {
    const [album] = groupTracksIntoAlbums([
      createTrack({ path: 'A/01.flac', size: 30, bitRate: 900, durationSeconds: 200 }),
      createTrack({ path: 'A/02.flac', size: 20, bitRate: 1000, durationSeconds: 100 }),
      createTrack({ path: 'A/03.flac', size: 10, bitRate: 1000, durationSeconds: 50 }),
      createTrack({ path: 'A/04.mp3', extension: 'mp3', size: 5, durationSeconds: 25 }),
    ]);

    expect(album).toMatchObject({
      trackCount: 4,
      totalSize: 65,
      totalDurationSeconds: 375,
      dominantExtension: 'flac',
      dominantBitRate: 1000,
    });
  });

  it('leaves the total duration and dominant bitrate unset when they are unknown', () => {
    const [album] = groupTracksIntoAlbums([
      createTrack({ path: 'A/01.flac', durationSeconds: 200 }),
      createTrack({ path: 'A/02.flac' }),
    ]);

    expect(album.totalDurationSeconds).toBeUndefined();
    expect(album.dominantBitRate).toBeUndefined();
  });

  it('lists files that are not audio but takes the quality and length from the audio files', () => {
    const cover = createTrack({ path: 'A/cover.jpg', extension: 'jpg', size: 3 });
    const cueSheet = createTrack({ path: 'A/album.cue', extension: 'cue', size: 1 });
    const logFile = createTrack({ path: 'A/album.log', extension: 'log', size: 1 });
    const [album] = groupTracksIntoAlbums([
      cover,
      cueSheet,
      logFile,
      createTrack({ path: 'A/01.flac', size: 30, bitRate: 900, durationSeconds: 200 }),
    ]);

    expect(album).toMatchObject({
      trackCount: 1,
      totalSize: 35,
      totalDurationSeconds: 200,
      dominantExtension: 'flac',
      dominantBitRate: 900,
    });
    expect(album.tracks.map(track => track.path)).toEqual([
      'A/01.flac',
      'A/album.cue',
      'A/album.log',
      'A/cover.jpg',
    ]);
  });

  it('leaves out directories that hold no audio files', () => {
    const albums = groupTracksIntoAlbums([
      createTrack({ path: 'A/01.flac' }),
      createTrack({ path: 'A/Scans/front.jpg', extension: 'jpg' }),
      createTrack({ path: 'B/info.nfo', extension: 'nfo' }),
    ]);

    expect(summarize(albums)).toEqual([
      { username: 'alice', directory: 'A', paths: ['A/01.flac'] },
    ]);
  });

  it('returns no albums for no tracks', () => {
    expect(groupTracksIntoAlbums([])).toEqual([]);
  });
});
