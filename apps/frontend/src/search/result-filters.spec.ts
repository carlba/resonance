import { buildAlbum, buildAvailability, buildTrack } from '@/test/fixtures.ts';
import {
  applyResultControls,
  filterByFormat,
  getFormatOptions,
  sortResults,
} from './result-filters.ts';

const flacHiRes = buildTrack({ filename: 'hires.flac', bitDepth: 24, sampleRate: 96_000 });
const flacCd = buildTrack({ filename: 'cd.flac', bitDepth: 16, sampleRate: 44_100 });
const mp3High = buildTrack({
  filename: 'high.mp3',
  extension: 'mp3',
  bitRate: 320,
  bitDepth: undefined,
  sampleRate: undefined,
});
const mp3Low = buildTrack({
  filename: 'low.mp3',
  extension: 'mp3',
  bitRate: 128,
  bitDepth: undefined,
  sampleRate: undefined,
});
const mp3UnknownBitRate = buildTrack({
  filename: 'unknown.mp3',
  extension: 'mp3',
  bitRate: undefined,
  bitDepth: undefined,
  sampleRate: undefined,
  durationSeconds: undefined,
});

function filenames(tracks: readonly { filename: string }[]): string[] {
  return tracks.map(track => track.filename);
}

describe('getFormatOptions', () => {
  it('lists the track formats, most common first', () => {
    expect(getFormatOptions([mp3High, flacCd, mp3Low])).toEqual([
      { format: 'mp3', count: 2 },
      { format: 'flac', count: 1 },
    ]);
  });

  it('orders formats with the same count alphabetically', () => {
    const ogg = buildTrack({ extension: 'ogg' });
    expect(getFormatOptions([ogg, flacCd]).map(option => option.format)).toEqual(['flac', 'ogg']);
  });

  it("uses an album's dominant extension", () => {
    const mixedAlbum = buildAlbum({
      dominantExtension: 'mp3',
      tracks: [mp3High, mp3Low, flacCd],
    });
    expect(getFormatOptions([mixedAlbum])).toEqual([{ format: 'mp3', count: 1 }]);
  });

  it('leaves out results without an extension and returns nothing for no results', () => {
    expect(getFormatOptions([buildTrack({ extension: '' })])).toEqual([]);
    expect(getFormatOptions([])).toEqual([]);
  });
});

describe('filterByFormat', () => {
  it('keeps only tracks with the format', () => {
    expect(filenames(filterByFormat([flacCd, mp3High, mp3Low], 'mp3'))).toEqual([
      'high.mp3',
      'low.mp3',
    ]);
  });

  it('filters albums by their dominant extension', () => {
    const flacAlbum = buildAlbum({ album: 'Lossless', dominantExtension: 'flac' });
    const mp3Album = buildAlbum({ album: 'Lossy', dominantExtension: 'mp3' });
    expect(filterByFormat([flacAlbum, mp3Album], 'mp3')).toEqual([mp3Album]);
  });

  it('keeps every result when no format is given', () => {
    expect(filterByFormat([flacCd, mp3High])).toEqual([flacCd, mp3High]);
  });

  it('returns nothing when no result has the format', () => {
    expect(filterByFormat([flacCd], 'ogg')).toEqual([]);
  });
});

describe('sortResults', () => {
  it('keeps the backend order for relevance', () => {
    expect(sortResults([mp3Low, flacCd], 'relevance')).toEqual([mp3Low, flacCd]);
  });

  it('does not change the input', () => {
    const tracks = [mp3Low, flacCd];
    sortResults(tracks, 'quality');
    expect(tracks).toEqual([mp3Low, flacCd]);
  });

  describe('by quality', () => {
    it('puts lossless first, then bit depth and sample rate, then bitrate', () => {
      const sorted = sortResults([mp3Low, flacCd, mp3High, flacHiRes], 'quality');
      expect(filenames(sorted)).toEqual(['hires.flac', 'cd.flac', 'high.mp3', 'low.mp3']);
    });

    it('puts a track with an unknown bitrate after the known ones of its kind', () => {
      const sorted = sortResults([mp3UnknownBitRate, mp3Low, flacCd], 'quality');
      expect(filenames(sorted)).toEqual(['cd.flac', 'low.mp3', 'unknown.mp3']);
    });

    it("sorts albums by their dominant format and bitrate and their tracks' bit depth", () => {
      const hiResAlbum = buildAlbum({ album: 'Hi-res', tracks: [flacHiRes] });
      const cdAlbum = buildAlbum({ album: 'CD', tracks: [flacCd] });
      const mp3Album = buildAlbum({
        album: 'MP3',
        dominantExtension: 'mp3',
        dominantBitRate: 320,
        tracks: [mp3High],
      });
      const unknownBitRateAlbum = buildAlbum({
        album: 'Unknown',
        dominantExtension: 'mp3',
        dominantBitRate: undefined,
        totalDurationSeconds: undefined,
        tracks: [mp3UnknownBitRate],
      });

      const sorted = sortResults([unknownBitRateAlbum, mp3Album, cdAlbum, hiResAlbum], 'quality');
      expect(sorted.map(album => album.album)).toEqual(['Hi-res', 'CD', 'MP3', 'Unknown']);
    });
  });

  describe('by speed', () => {
    it('puts a free slot first, then the faster upload, then the shorter queue', () => {
      const busyFast = buildTrack({
        filename: 'busy-fast',
        availability: buildAvailability({ hasFreeUploadSlot: false, uploadSpeed: 9_000_000 }),
      });
      const freeSlow = buildTrack({
        filename: 'free-slow',
        availability: buildAvailability({ uploadSpeed: 100_000 }),
      });
      const freeFastLongQueue = buildTrack({
        filename: 'free-fast-long-queue',
        availability: buildAvailability({ uploadSpeed: 2_000_000, queueLength: 10 }),
      });
      const freeFastShortQueue = buildTrack({
        filename: 'free-fast-short-queue',
        availability: buildAvailability({ uploadSpeed: 2_000_000, queueLength: 1 }),
      });

      const sorted = sortResults(
        [busyFast, freeSlow, freeFastLongQueue, freeFastShortQueue],
        'speed'
      );
      expect(filenames(sorted)).toEqual([
        'free-fast-short-queue',
        'free-fast-long-queue',
        'free-slow',
        'busy-fast',
      ]);
    });

    it('sorts albums by availability too', () => {
      const busyAlbum = buildAlbum({
        album: 'Busy',
        availability: buildAvailability({ hasFreeUploadSlot: false }),
      });
      const freeAlbum = buildAlbum({ album: 'Free' });
      expect(sortResults([busyAlbum, freeAlbum], 'speed')).toEqual([freeAlbum, busyAlbum]);
    });
  });

  describe('by size', () => {
    it('puts the largest track first', () => {
      const small = buildTrack({ filename: 'small', size: 1 });
      const large = buildTrack({ filename: 'large', size: 3 });
      expect(filenames(sortResults([small, large], 'size'))).toEqual(['large', 'small']);
    });

    it('sorts albums by their total size', () => {
      const small = buildAlbum({ album: 'Small', totalSize: 10 });
      const large = buildAlbum({ album: 'Large', totalSize: 20 });
      expect(sortResults([small, large], 'size')).toEqual([large, small]);
    });

    it('keeps the backend order for results of the same size', () => {
      const first = buildTrack({ filename: 'first' });
      const second = buildTrack({ filename: 'second' });
      expect(filenames(sortResults([first, second], 'size'))).toEqual(['first', 'second']);
    });
  });
});

describe('applyResultControls', () => {
  it('filters and then sorts', () => {
    const results = applyResultControls([mp3Low, flacCd, mp3High], {
      format: 'mp3',
      sort: 'quality',
    });
    expect(filenames(results)).toEqual(['high.mp3', 'low.mp3']);
  });
});
