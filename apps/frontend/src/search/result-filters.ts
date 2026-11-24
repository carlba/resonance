import type { AlbumResult, TrackResult, UserAvailability } from '@/api/search-schemas.ts';
import type {
  AdvancedFilterState,
  QualityPreset,
  SearchMode,
  SearchState,
  SortKey,
} from './search-state.ts';

export type SearchResult = AlbumResult | TrackResult;

/** Lowercase extensions of formats that keep all of the original audio. */
const LOSSLESS_EXTENSIONS: ReadonlySet<string> = new Set(['aif', 'aiff', 'alac', 'flac', 'wav']);

// Sorts an unknown value below every known one.
const UNKNOWN = 0;

/** Bitrates in kbps a lossy result needs for the bitrate presets. */
const MIN_BIT_RATE_256 = 256;
const MIN_BIT_RATE_320 = 320;
const CD_BIT_DEPTH = 16;
const CD_SAMPLE_RATE = 44_100;
const MIN_HI_RES_BIT_DEPTH = 24;
/** CD and DAT rates go up to 48 kHz, so Hi-Res needs a sample rate above it. */
const MAX_STANDARD_SAMPLE_RATE = 48_000;

const RIP_LOG_EXTENSION = '.log';
const CUE_SHEET_EXTENSION = '.cue';

/** The facts filtering and sorting look at, the same for albums and tracks. */
export interface ResultFacts {
  extension: string;
  bitDepth?: number;
  sampleRate?: number;
  bitRate?: number;
  size: number;
  availability: UserAvailability;
}

export interface FormatOption {
  /** Lowercase extension, e.g. `flac`. */
  format: string;
  /** How many results have this format. */
  count: number;
}

/** The parts of the search state that filter and sort the results of a search. */
export type ResultControls = Pick<SearchState, 'format' | 'sort'> & AdvancedFilterState;

/** An inclusive range of audio track counts; an unset bound is open. */
export type TrackCountRange = Pick<AdvancedFilterState, 'minTracks' | 'maxTracks'>;

/** The facts a quality preset looks at. */
export type QualityFacts = Pick<ResultFacts, 'extension' | 'bitDepth' | 'sampleRate' | 'bitRate'>;

export function isAlbumResult(result: SearchResult): result is AlbumResult {
  return 'tracks' in result;
}

export function isLosslessFormat(extension: string): boolean {
  return LOSSLESS_EXTENSIONS.has(extension);
}

/** The value that occurs most often, ignoring `undefined`; on a tie the one seen first wins. */
function getMostCommon(values: readonly (number | undefined)[]): number | undefined {
  const counts = new Map<number, number>();
  for (const value of values) {
    if (value !== undefined) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  let mostCommon: number | undefined;
  let highestCount = 0;
  for (const [value, count] of counts) {
    if (count > highestCount) {
      mostCommon = value;
      highestCount = count;
    }
  }
  return mostCommon;
}

/** The quality, size and availability of a result; for an album, those of most of its tracks. */
export function getResultFacts(result: SearchResult): ResultFacts {
  if (isAlbumResult(result)) {
    // The backend sends the dominant extension and bitrate; bit depth and sample rate are left to
    // the tracks, so take their most common value the same way.
    return {
      extension: result.dominantExtension,
      bitDepth: getMostCommon(result.tracks.map(track => track.bitDepth)),
      sampleRate: getMostCommon(result.tracks.map(track => track.sampleRate)),
      bitRate: result.dominantBitRate,
      size: result.totalSize,
      availability: result.availability,
    };
  }
  return { ...result };
}

/** The formats present in the results, most common first, then alphabetically. */
export function getFormatOptions(results: readonly SearchResult[]): FormatOption[] {
  const counts = new Map<string, number>();
  for (const result of results) {
    const { extension } = getResultFacts(result);
    if (extension !== '') {
      counts.set(extension, (counts.get(extension) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([format, count]) => ({ format, count }))
    .toSorted(
      (first, second) => second.count - first.count || first.format.localeCompare(second.format)
    );
}

/** The results with the given format; all of them when `format` is unset. */
export function filterByFormat<T extends SearchResult>(
  results: readonly T[],
  format?: string
): T[] {
  if (format === undefined) {
    return [...results];
  }
  return results.filter(result => getResultFacts(result).extension === format);
}

/** Unknown values count as a match, since most lossless files that leave them out are CD rips. */
function isCd({ extension, bitDepth, sampleRate }: QualityFacts): boolean {
  const hasCdBitDepth = bitDepth === undefined || bitDepth === CD_BIT_DEPTH;
  const hasCdSampleRate = sampleRate === undefined || sampleRate === CD_SAMPLE_RATE;
  return isLosslessFormat(extension) && hasCdBitDepth && hasCdSampleRate;
}

function isHiRes({ extension, bitDepth, sampleRate }: QualityFacts): boolean {
  const hasHiResBitDepth = bitDepth !== undefined && bitDepth >= MIN_HI_RES_BIT_DEPTH;
  const hasHiResSampleRate = sampleRate !== undefined && sampleRate > MAX_STANDARD_SAMPLE_RATE;
  return isLosslessFormat(extension) && (hasHiResBitDepth || hasHiResSampleRate);
}

/** Lossless always passes, since its bitrate depends on the music, not on any compression. */
function meetsBitRate({ extension, bitRate }: QualityFacts, minBitRate: number): boolean {
  return isLosslessFormat(extension) || (bitRate !== undefined && bitRate >= minBitRate);
}

const QUALITY_PRESET_CHECKS: Record<QualityPreset, (facts: QualityFacts) => boolean> = {
  any: () => true,
  '256': facts => meetsBitRate(facts, MIN_BIT_RATE_256),
  '320': facts => meetsBitRate(facts, MIN_BIT_RATE_320),
  cd: isCd,
  lossless: facts => isLosslessFormat(facts.extension),
  hires: isHiRes,
};

/**
 * Whether a result matches a quality preset. Unknown values are judged by what is known: a lossy
 * result without a bitrate fails the bitrate presets, a lossless one that reports nothing against
 * 16-bit / 44.1 kHz counts as CD, and Hi-Res needs a known bit depth or sample rate.
 */
export function meetsQualityPreset(facts: QualityFacts, preset: QualityPreset): boolean {
  return QUALITY_PRESET_CHECKS[preset](facts);
}

/** The results matching the quality preset; for an album, judged by its dominant quality. */
export function filterByQuality<T extends SearchResult>(
  results: readonly T[],
  preset: QualityPreset
): T[] {
  return results.filter(result => meetsQualityPreset(getResultFacts(result), preset));
}

function countFilesWithExtension(album: AlbumResult, extension: string): number {
  return album.tracks.filter(track => track.filename.toLowerCase().endsWith(extension)).length;
}

/** The `.log` files of an album, in any case and including those in its disc folders. */
export function countRipLogs(album: AlbumResult): number {
  return countFilesWithExtension(album, RIP_LOG_EXTENSION);
}

/** The `.cue` files of an album, in any case and including those in its disc folders. */
export function countCueSheets(album: AlbumResult): number {
  return countFilesWithExtension(album, CUE_SHEET_EXTENSION);
}

function meetsRipLogFilter(album: AlbumResult, hasRipLog: boolean): boolean {
  return !hasRipLog || countRipLogs(album) > 0;
}

/** The albums with at least one rip log; all of them when the filter is off. */
export function filterByRipLog(albums: readonly AlbumResult[], hasRipLog: boolean): AlbumResult[] {
  return albums.filter(album => meetsRipLogFilter(album, hasRipLog));
}

/** A range is invalid when its minimum is larger than its maximum. */
export function isValidTrackCountRange({ minTracks, maxTracks }: TrackCountRange): boolean {
  return minTracks === undefined || maxTracks === undefined || minTracks <= maxTracks;
}

/** Whether the range narrows the results: it has a bound and is valid. */
function isTrackCountRangeActive(range: TrackCountRange): boolean {
  const hasBound = range.minTracks !== undefined || range.maxTracks !== undefined;
  return hasBound && isValidTrackCountRange(range);
}

/** An invalid range lets every album through, since it isn't applied until it is fixed. */
function isInTrackCountRange(album: AlbumResult, range: TrackCountRange): boolean {
  if (!isTrackCountRangeActive(range)) {
    return true;
  }
  const { minTracks = 0, maxTracks = Infinity } = range;
  return album.trackCount >= minTracks && album.trackCount <= maxTracks;
}

/** The albums whose audio track count is within the range, bounds included. */
export function filterByTrackCount(
  albums: readonly AlbumResult[],
  range: TrackCountRange
): AlbumResult[] {
  return albums.filter(album => isInTrackCountRange(album, range));
}

/**
 * How many advanced filters narrow the results in a mode. The album filters don't count in the
 * Tracks view, and an invalid track-count range doesn't count since it isn't applied.
 */
export function countActiveFilters(filters: AdvancedFilterState, mode: SearchMode): number {
  const activeFilters = [filters.quality !== 'any'];
  if (mode === 'albums') {
    activeFilters.push(filters.hasRipLog, isTrackCountRangeActive(filters));
  }
  return activeFilters.filter(Boolean).length;
}

function passesAlbumFilters(album: AlbumResult, controls: ResultControls): boolean {
  return meetsRipLogFilter(album, controls.hasRipLog) && isInTrackCountRange(album, controls);
}

type FactsComparator = (first: ResultFacts, second: ResultFacts) => number;

/** Best first: lossless before lossy, then bit depth, sample rate and bitrate. */
const compareQuality: FactsComparator = (first, second) =>
  Number(isLosslessFormat(second.extension)) - Number(isLosslessFormat(first.extension)) ||
  (second.bitDepth ?? UNKNOWN) - (first.bitDepth ?? UNKNOWN) ||
  (second.sampleRate ?? UNKNOWN) - (first.sampleRate ?? UNKNOWN) ||
  (second.bitRate ?? UNKNOWN) - (first.bitRate ?? UNKNOWN);

/** Quickest to start first: a free upload slot, then upload speed, then a shorter queue. */
const compareSpeed: FactsComparator = ({ availability: first }, { availability: second }) =>
  Number(second.hasFreeUploadSlot) - Number(first.hasFreeUploadSlot) ||
  second.uploadSpeed - first.uploadSpeed ||
  first.queueLength - second.queueLength;

/** Largest first. */
const compareSize: FactsComparator = (first, second) => second.size - first.size;

const COMPARATORS: Record<Exclude<SortKey, 'relevance'>, FactsComparator> = {
  quality: compareQuality,
  speed: compareSpeed,
  size: compareSize,
};

/** The results in the given order. The sort is stable, so ties keep the backend's order. */
export function sortResults<T extends SearchResult>(results: readonly T[], sort: SortKey): T[] {
  if (sort === 'relevance') {
    return [...results];
  }
  const compare = COMPARATORS[sort];
  return results
    .map(result => ({ result, facts: getResultFacts(result) }))
    .toSorted((first, second) => compare(first.facts, second.facts))
    .map(({ result }) => result);
}

/**
 * Keeps the results that pass every active filter, then sorts them. The rip log and track-count
 * filters only apply to albums, so tracks pass them.
 */
export function applyResultControls<T extends SearchResult>(
  results: readonly T[],
  controls: ResultControls
): T[] {
  const filtered = filterByQuality(
    filterByFormat(results, controls.format),
    controls.quality
  ).filter(result => !isAlbumResult(result) || passesAlbumFilters(result, controls));
  return sortResults(filtered, controls.sort);
}
