import { buildAlbum, buildAvailability, buildTrack } from '@/test/fixtures.ts';
import {
  applyResultControls,
  countActiveFilters,
  countCueSheets,
  countRipLogs,
  filterByFormat,
  filterByQuality,
  filterByRipLog,
  filterByTrackCount,
  getFormatOptions,
  isValidTrackCountRange,
  meetsQualityPreset,
  sortResults,
  type QualityFacts,
  type ResultControls,
} from './result-filters.ts';
import { ADVANCED_FILTER_DEFAULTS, QUALITY_PRESETS, type QualityPreset } from './search-state.ts';

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

function titles(albums: readonly { album: string }[]): string[] {
  return albums.map(album => album.album);
}

function lossy(bitRate?: number): QualityFacts {
  return { extension: 'mp3', bitRate };
}

function lossless(bitDepth?: number, sampleRate?: number): QualityFacts {
  return { extension: 'flac', bitDepth, sampleRate };
}

function matchingPresets(facts: QualityFacts): QualityPreset[] {
  return QUALITY_PRESETS.filter(preset => meetsQualityPreset(facts, preset));
}

/** An album holding the given non-audio files next to one audio track. */
function buildAlbumWithFiles(album: string, fileNames: readonly string[]) {
  const files = fileNames.map(filename =>
    buildTrack({ filename, path: filename, extension: filename.split('.').pop()?.toLowerCase() })
  );
  return buildAlbum({ album, directory: album, tracks: [buildTrack(), ...files], trackCount: 1 });
}

/** A lossless album with a rip log and 10 tracks. */
function buildRippedAlbum(album: string, totalSize: number) {
  return buildAlbum({ ...buildAlbumWithFiles(album, ['rip.log']), trackCount: 10, totalSize });
}

const noFilters: ResultControls = { sort: 'relevance', ...ADVANCED_FILTER_DEFAULTS };

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

describe('meetsQualityPreset', () => {
  const lossyPresets: QualityPreset[] = ['any', '256', '320'];
  const cdPresets: QualityPreset[] = [...lossyPresets, 'cd', 'lossless'];
  const otherLosslessPresets: QualityPreset[] = [...lossyPresets, 'lossless'];
  const hiResPresets: QualityPreset[] = [...lossyPresets, 'lossless', 'hires'];

  it.each([
    { description: 'a 128 kbps lossy file', facts: lossy(128), presets: ['any'] },
    { description: 'a 255 kbps lossy file', facts: lossy(255), presets: ['any'] },
    { description: 'a 256 kbps lossy file', facts: lossy(256), presets: ['any', '256'] },
    { description: 'a 319 kbps lossy file', facts: lossy(319), presets: ['any', '256'] },
    { description: 'a 320 kbps lossy file', facts: lossy(320), presets: lossyPresets },
    { description: 'a lossy file with an unknown bitrate', facts: lossy(), presets: ['any'] },
    {
      description: 'a 24-bit 96 kHz lossy file',
      facts: { extension: 'mp3', bitRate: 320, bitDepth: 24, sampleRate: 96_000 },
      presets: lossyPresets,
    },
    {
      description: 'a 16-bit 44.1 kHz lossless file',
      facts: lossless(16, 44_100),
      presets: cdPresets,
    },
    {
      description: 'a 16-bit 48 kHz lossless file',
      facts: lossless(16, 48_000),
      presets: otherLosslessPresets,
    },
    {
      description: 'a 16-bit 48.1 kHz lossless file',
      facts: lossless(16, 48_100),
      presets: hiResPresets,
    },
    {
      description: 'a 24-bit 44.1 kHz lossless file',
      facts: lossless(24, 44_100),
      presets: hiResPresets,
    },
    {
      description: 'a 16-bit lossless file with an unknown sample rate',
      facts: lossless(16),
      presets: cdPresets,
    },
    {
      description: 'a 44.1 kHz lossless file with an unknown bit depth',
      facts: lossless(undefined, 44_100),
      presets: cdPresets,
    },
    {
      description: 'a 48 kHz lossless file with an unknown bit depth',
      facts: lossless(undefined, 48_000),
      presets: otherLosslessPresets,
    },
    {
      description: 'a 24-bit lossless file with an unknown sample rate',
      facts: lossless(24),
      presets: hiResPresets,
    },
    {
      description: 'a 96 kHz lossless file with an unknown bit depth',
      facts: lossless(undefined, 96_000),
      presets: hiResPresets,
    },
    {
      description: 'a lossless file with an unknown bit depth and sample rate',
      facts: lossless(),
      presets: cdPresets,
    },
  ] satisfies { description: string; facts: QualityFacts; presets: QualityPreset[] }[])(
    'matches $description to $presets',
    ({ facts, presets }) => {
      expect(matchingPresets(facts)).toEqual(presets);
    }
  );

  it.each(['aif', 'aiff', 'alac', 'flac', 'wav'])('counts %s as lossless', extension => {
    expect(meetsQualityPreset({ extension }, 'lossless')).toBe(true);
  });

  it('lets a lossless file with a low reported bitrate through the bitrate presets', () => {
    expect(meetsQualityPreset({ extension: 'flac', bitRate: 128 }, '320')).toBe(true);
  });
});

describe('filterByQuality', () => {
  const tracks = [mp3Low, mp3High, mp3UnknownBitRate, flacCd, flacHiRes];

  it.each([
    { preset: 'any', expected: ['low.mp3', 'high.mp3', 'unknown.mp3', 'cd.flac', 'hires.flac'] },
    { preset: '256', expected: ['high.mp3', 'cd.flac', 'hires.flac'] },
    { preset: '320', expected: ['high.mp3', 'cd.flac', 'hires.flac'] },
    { preset: 'cd', expected: ['cd.flac'] },
    { preset: 'lossless', expected: ['cd.flac', 'hires.flac'] },
    { preset: 'hires', expected: ['hires.flac'] },
  ] satisfies { preset: QualityPreset; expected: string[] }[])(
    'keeps the tracks matching $preset',
    ({ preset, expected }) => {
      expect(filenames(filterByQuality(tracks, preset))).toEqual(expected);
    }
  );

  describe('for albums', () => {
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
      tracks: [mp3UnknownBitRate],
    });
    // One odd track doesn't change an album's dominant quality.
    const mostlyCdAlbum = buildAlbum({ album: 'Mostly CD', tracks: [flacCd, flacCd, flacHiRes] });
    const mostlyHiResAlbum = buildAlbum({
      album: 'Mostly Hi-Res',
      tracks: [flacHiRes, flacHiRes, flacCd],
    });
    const albums = [mp3Album, unknownBitRateAlbum, mostlyCdAlbum, mostlyHiResAlbum];

    it.each([
      { preset: 'any', expected: ['MP3', 'Unknown', 'Mostly CD', 'Mostly Hi-Res'] },
      { preset: '256', expected: ['MP3', 'Mostly CD', 'Mostly Hi-Res'] },
      { preset: '320', expected: ['MP3', 'Mostly CD', 'Mostly Hi-Res'] },
      { preset: 'cd', expected: ['Mostly CD'] },
      { preset: 'lossless', expected: ['Mostly CD', 'Mostly Hi-Res'] },
      { preset: 'hires', expected: ['Mostly Hi-Res'] },
    ] satisfies { preset: QualityPreset; expected: string[] }[])(
      'keeps the albums whose dominant quality matches $preset',
      ({ preset, expected }) => {
        expect(titles(filterByQuality(albums, preset))).toEqual(expected);
      }
    );
  });
});

describe('countRipLogs and countCueSheets', () => {
  it('counts nothing for an album without logs or cue sheets', () => {
    const album = buildAlbumWithFiles('Plain', ['cover.jpg']);
    expect(countRipLogs(album)).toBe(0);
    expect(countCueSheets(album)).toBe(0);
  });

  it('counts logs and cue sheets in any case, including those in disc folders', () => {
    const album = buildAlbumWithFiles('Two discs', [
      'CD1\\rip.log',
      'CD2\\RIP.LOG',
      'CD1\\album.cue',
      'catalog.txt',
    ]);
    expect(countRipLogs(album)).toBe(2);
    expect(countCueSheets(album)).toBe(1);
  });

  it('does not count a file that only mentions log in its name', () => {
    expect(countRipLogs(buildAlbumWithFiles('Blog', ['blog.txt', 'log.jpg']))).toBe(0);
  });
});

describe('filterByRipLog', () => {
  const noLog = buildAlbumWithFiles('No log', ['cover.jpg']);
  const oneLog = buildAlbumWithFiles('One log', ['rip.log']);
  const severalLogs = buildAlbumWithFiles('Several logs', ['CD1\\rip.log', 'CD2\\rip.log']);
  const upperCaseLog = buildAlbumWithFiles('Upper case', ['RIP.LOG']);
  const albums = [noLog, oneLog, severalLogs, upperCaseLog];

  it('keeps the albums with at least one log', () => {
    expect(titles(filterByRipLog(albums, true))).toEqual(['One log', 'Several logs', 'Upper case']);
  });

  it('keeps every album when the filter is off', () => {
    expect(filterByRipLog(albums, false)).toEqual(albums);
  });
});

describe('filterByTrackCount', () => {
  const albums = [8, 10, 12, 14].map(trackCount =>
    buildAlbum({ album: `${trackCount} tracks`, trackCount })
  );

  it.each([
    { range: {}, expected: ['8 tracks', '10 tracks', '12 tracks', '14 tracks'] },
    { range: { minTracks: 10 }, expected: ['10 tracks', '12 tracks', '14 tracks'] },
    { range: { maxTracks: 10 }, expected: ['8 tracks', '10 tracks'] },
    { range: { minTracks: 10, maxTracks: 12 }, expected: ['10 tracks', '12 tracks'] },
    { range: { minTracks: 12, maxTracks: 12 }, expected: ['12 tracks'] },
    { range: { minTracks: 0 }, expected: ['8 tracks', '10 tracks', '12 tracks', '14 tracks'] },
  ])('keeps the albums within $range', ({ range, expected }) => {
    expect(titles(filterByTrackCount(albums, range))).toEqual(expected);
  });

  it('keeps every album while the minimum is larger than the maximum', () => {
    expect(filterByTrackCount(albums, { minTracks: 12, maxTracks: 10 })).toEqual(albums);
  });

  it('counts audio tracks only, not logs, cue sheets or cover art', () => {
    const album = buildAlbumWithFiles('One track', ['rip.log', 'album.cue', 'cover.jpg']);
    expect(filterByTrackCount([album], { maxTracks: 1 })).toEqual([album]);
  });
});

describe('isValidTrackCountRange', () => {
  it.each([
    [{}, true],
    [{ minTracks: 10 }, true],
    [{ maxTracks: 10 }, true],
    [{ minTracks: 10, maxTracks: 10 }, true],
    [{ minTracks: 11, maxTracks: 10 }, false],
  ])('judges %j as %s', (range, expected) => {
    expect(isValidTrackCountRange(range)).toBe(expected);
  });
});

describe('countActiveFilters', () => {
  const allFilters = { quality: 'cd', hasRipLog: true, minTracks: 10, maxTracks: 12 } as const;

  it('counts nothing when every advanced filter is at its default', () => {
    expect(countActiveFilters(ADVANCED_FILTER_DEFAULTS, 'albums')).toBe(0);
  });

  it('counts the quality, rip log and track-count filters for albums', () => {
    expect(countActiveFilters(allFilters, 'albums')).toBe(3);
  });

  it('counts a track-count range with both bounds once', () => {
    expect(
      countActiveFilters({ ...ADVANCED_FILTER_DEFAULTS, minTracks: 1, maxTracks: 2 }, 'albums')
    ).toBe(1);
  });

  it('counts only the quality filter for tracks', () => {
    expect(countActiveFilters(allFilters, 'tracks')).toBe(1);
  });

  it('does not count a track-count range that is not applied', () => {
    const filters = { ...ADVANCED_FILTER_DEFAULTS, minTracks: 12, maxTracks: 10 };
    expect(countActiveFilters(filters, 'albums')).toBe(0);
  });
});

describe('applyResultControls', () => {
  it('filters by format and then sorts', () => {
    const results = applyResultControls([mp3Low, flacCd, mp3High], {
      ...noFilters,
      format: 'mp3',
      sort: 'quality',
    });
    expect(filenames(results)).toEqual(['high.mp3', 'low.mp3']);
  });

  it('keeps only the results that pass both the format and the quality filter', () => {
    const results = applyResultControls([mp3Low, flacCd, mp3High, mp3UnknownBitRate], {
      ...noFilters,
      format: 'mp3',
      quality: '256',
    });
    expect(filenames(results)).toEqual(['high.mp3']);
  });

  it('sorts the results that pass the quality filter', () => {
    const results = applyResultControls([mp3Low, flacCd, mp3High, flacHiRes], {
      ...noFilters,
      sort: 'quality',
      quality: '320',
    });
    expect(filenames(results)).toEqual(['hires.flac', 'cd.flac', 'high.mp3']);
  });

  it('keeps only the albums that pass every filter, in the sort order', () => {
    const smallMatch = buildRippedAlbum('Small match', 1);
    const largeMatch = buildRippedAlbum('Large match', 2);
    const noLog = buildAlbum({ album: 'No log', trackCount: 10 });
    const tooFewTracks = buildAlbum({ ...buildRippedAlbum('Too few tracks', 3), trackCount: 9 });
    const mp3 = buildAlbum({
      ...buildRippedAlbum('MP3', 4),
      dominantExtension: 'mp3',
      tracks: [mp3High],
    });

    const results = applyResultControls([smallMatch, noLog, tooFewTracks, mp3, largeMatch], {
      format: 'flac',
      sort: 'size',
      quality: 'lossless',
      hasRipLog: true,
      minTracks: 10,
      maxTracks: 12,
    });
    expect(titles(results)).toEqual(['Large match', 'Small match']);
  });

  it('ignores the album filters for tracks', () => {
    const results = applyResultControls([flacCd, mp3High], {
      ...noFilters,
      hasRipLog: true,
      minTracks: 5,
    });
    expect(results).toEqual([flacCd, mp3High]);
  });
});
