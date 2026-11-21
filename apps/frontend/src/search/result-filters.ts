import type { AlbumResult, TrackResult, UserAvailability } from '@/api/search-schemas.ts';
import type { SortKey } from './search-state.ts';

export type SearchResult = AlbumResult | TrackResult;

/** Lowercase extensions of formats that keep all of the original audio. */
const LOSSLESS_EXTENSIONS: ReadonlySet<string> = new Set(['aif', 'aiff', 'alac', 'flac', 'wav']);

// Sorts an unknown value below every known one.
const UNKNOWN = 0;

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

export interface ResultControls {
  /** Unset to keep every format. */
  format?: string;
  sort: SortKey;
}

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

/** Filters the results by format, then sorts them. */
export function applyResultControls<T extends SearchResult>(
  results: readonly T[],
  controls: ResultControls
): T[] {
  return sortResults(filterByFormat(results, controls.format), controls.sort);
}
