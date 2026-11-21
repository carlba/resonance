import type { ProviderSearchResult } from '../providers/search-provider.js';
import { getFileExtension, getFileName, isAudioFile, toTrackResults } from './track-mapping.js';

const AVAILABILITY = { hasFreeUploadSlot: true, queueLength: 0, uploadSpeed: 1_000_000 };

describe('getFileName', () => {
  it.each([
    ['@@share\\Music\\Artist\\01 - Song.flac', '01 - Song.flac'],
    ['music/Artist/01 - Song.mp3', '01 - Song.mp3'],
    ['Song.mp3', 'Song.mp3'],
  ])('returns the last segment of %s', (path, expected) => {
    expect(getFileName(path)).toBe(expected);
  });
});

describe('getFileExtension', () => {
  it.each([
    ['Music\\Artist\\01 - Song.FLAC', 'flac'],
    ['music/Artist/song.name.with.dots.mp3', 'mp3'],
    ['Music\\Artist.Name\\README', ''],
    ['Music\\.flac', ''],
    ['Music\\trailing-dot.', ''],
  ])('returns the extension of %s', (path, expected) => {
    expect(getFileExtension(path)).toBe(expected);
  });
});

describe('isAudioFile', () => {
  it.each([['flac'], ['mp3'], ['m4a'], ['ogg'], ['opus'], ['wav'], ['aiff'], ['alac'], ['FLAC']])(
    'accepts .%s',
    extension => {
      expect(isAudioFile({ path: `Music\\Album\\01 - Song.${extension}` })).toBe(true);
    }
  );

  it.each([['jpg'], ['nfo'], ['cue'], ['log'], ['m3u'], ['txt'], ['']])(
    'rejects .%s',
    extension => {
      expect(isAudioFile({ path: `Music\\Album\\file.${extension}` })).toBe(false);
    }
  );
});

describe('toTrackResults', () => {
  it('flattens every file into a track with its user and availability', () => {
    const results: ProviderSearchResult[] = [
      {
        username: 'alice',
        availability: AVAILABILITY,
        files: [
          {
            path: '@@alice\\Music\\Artist\\Album\\01 - Intro.flac',
            size: 30_000_000,
            bitRate: 1000,
            bitDepth: 16,
            sampleRate: 44_100,
            durationSeconds: 245,
            isVariableBitRate: false,
          },
          { path: '@@alice\\Music\\Artist\\Album\\cover.jpg', size: 200_000 },
        ],
      },
      {
        username: 'bob',
        availability: { hasFreeUploadSlot: false, queueLength: 12, uploadSpeed: 50_000 },
        files: [{ path: 'shared/Artist - Intro.MP3', size: 8_000_000, bitRate: 320 }],
      },
    ];

    expect(toTrackResults(results)).toEqual([
      {
        filename: '01 - Intro.flac',
        path: '@@alice\\Music\\Artist\\Album\\01 - Intro.flac',
        username: 'alice',
        extension: 'flac',
        size: 30_000_000,
        bitRate: 1000,
        bitDepth: 16,
        sampleRate: 44_100,
        durationSeconds: 245,
        isVariableBitRate: false,
        availability: AVAILABILITY,
      },
      {
        filename: 'cover.jpg',
        path: '@@alice\\Music\\Artist\\Album\\cover.jpg',
        username: 'alice',
        extension: 'jpg',
        size: 200_000,
        availability: AVAILABILITY,
      },
      {
        filename: 'Artist - Intro.MP3',
        path: 'shared/Artist - Intro.MP3',
        username: 'bob',
        extension: 'mp3',
        size: 8_000_000,
        bitRate: 320,
        availability: { hasFreeUploadSlot: false, queueLength: 12, uploadSpeed: 50_000 },
      },
    ]);
  });

  it('keeps files that are not audio', () => {
    const results: ProviderSearchResult[] = [
      {
        username: 'alice',
        availability: AVAILABILITY,
        files: [
          { path: 'Album\\info.nfo', size: 1000 },
          { path: 'Album\\album.cue', size: 1000 },
        ],
      },
    ];

    expect(toTrackResults(results).map(track => track.filename)).toEqual(['info.nfo', 'album.cue']);
  });

  it('returns no tracks for no results', () => {
    expect(toTrackResults([])).toEqual([]);
  });
});
