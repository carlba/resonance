export const SEARCH_MODES = ['albums', 'tracks'] as const;
export type SearchMode = (typeof SEARCH_MODES)[number];

export const SORT_KEYS = ['relevance', 'quality', 'speed', 'size'] as const;
/** `relevance` keeps the order the backend returned. */
export type SortKey = (typeof SORT_KEYS)[number];

/** The quality presets in the order the select lists them. */
export const QUALITY_PRESETS = ['any', '256', '320', 'cd', 'lossless', 'hires'] as const;
export type QualityPreset = (typeof QUALITY_PRESETS)[number];

export const DEFAULT_SEARCH_MODE: SearchMode = 'albums';
export const DEFAULT_SORT_KEY: SortKey = 'relevance';
export const DEFAULT_QUALITY_PRESET: QualityPreset = 'any';

/** The URL query parameters that hold the search state, so a search can be shared and reloaded. */
export const SEARCH_PARAM = {
  searchText: 'q',
  mode: 'type',
  format: 'format',
  sort: 'sort',
  quality: 'quality',
  hasRipLog: 'log',
  minTracks: 'minTracks',
  maxTracks: 'maxTracks',
} as const;

/** The value of the rip log parameter when the filter is on; it is left out when off. */
const RIP_LOG_PARAM_ON = '1';

// A track count in the URL must be a whole number written with digits only, so `-1`, `1.5`, `1e2`
// and `abc` are all rejected.
const TRACK_COUNT_PATTERN = /^\d+$/;

/** The filters in the collapsible "Advanced filters" panel. */
export interface AdvancedFilterState {
  quality: QualityPreset;
  /** Albums only: keep the albums with at least one `.log` file. */
  hasRipLog: boolean;
  /** Albums only: the fewest audio tracks an album may have; unset for no lower bound. */
  minTracks?: number;
  /** Albums only: the most audio tracks an album may have; unset for no upper bound. */
  maxTracks?: number;
}

export interface SearchState extends AdvancedFilterState {
  /** Trimmed; `''` when nothing has been searched yet. */
  searchText: string;
  mode: SearchMode;
  /** The file extension to show, e.g. `flac`; unset to show every format. */
  format?: string;
  sort: SortKey;
}

const QUALITY_FILTER_DEFAULTS: Pick<AdvancedFilterState, 'quality'> = {
  quality: DEFAULT_QUALITY_PRESET,
};

/** The advanced filters at their defaults, i.e. with none of them active. */
export const ADVANCED_FILTER_DEFAULTS: AdvancedFilterState = {
  ...QUALITY_FILTER_DEFAULTS,
  hasRipLog: false,
  minTracks: undefined,
  maxTracks: undefined,
};

/**
 * The change that clears the advanced filters a mode shows. The Tracks view only shows the
 * quality filter, so the album filters there are hidden, not cleared, and come back on Albums.
 */
export function getClearedAdvancedFilters(mode: SearchMode): Partial<AdvancedFilterState> {
  return mode === 'albums' ? ADVANCED_FILTER_DEFAULTS : QUALITY_FILTER_DEFAULTS;
}

/** Whether a value, e.g. from the URL or a Radix `onValueChange`, is one of the options. */
export function isOneOf<T extends string>(options: readonly T[], value: string | null): value is T {
  // Widening the options to plain strings lets `includes` take any string.
  const knownOptions: readonly string[] = options;
  return value !== null && knownOptions.includes(value);
}

/** A track count from the URL or an input; unset when empty or not a whole, non-negative number. */
export function parseTrackCount(value: string | null): number | undefined {
  const trimmed = value?.trim() ?? '';
  return TRACK_COUNT_PATTERN.test(trimmed) ? Number(trimmed) : undefined;
}

/** Reads the search state from URL query parameters, falling back to defaults for bad values. */
export function readSearchState(params: URLSearchParams): SearchState {
  const mode = params.get(SEARCH_PARAM.mode);
  const sort = params.get(SEARCH_PARAM.sort);
  const format = params.get(SEARCH_PARAM.format)?.trim().toLowerCase();
  const quality = params.get(SEARCH_PARAM.quality);

  return {
    searchText: params.get(SEARCH_PARAM.searchText)?.trim() ?? '',
    mode: isOneOf(SEARCH_MODES, mode) ? mode : DEFAULT_SEARCH_MODE,
    format: format === '' ? undefined : format,
    sort: isOneOf(SORT_KEYS, sort) ? sort : DEFAULT_SORT_KEY,
    quality: isOneOf(QUALITY_PRESETS, quality) ? quality : DEFAULT_QUALITY_PRESET,
    hasRipLog: params.get(SEARCH_PARAM.hasRipLog) === RIP_LOG_PARAM_ON,
    minTracks: parseTrackCount(params.get(SEARCH_PARAM.minTracks)),
    maxTracks: parseTrackCount(params.get(SEARCH_PARAM.maxTracks)),
  };
}

/** The URL query parameters for a search state. Defaults are left out to keep URLs short. */
export function toSearchParams(state: SearchState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.searchText !== '') {
    params.set(SEARCH_PARAM.searchText, state.searchText);
  }
  params.set(SEARCH_PARAM.mode, state.mode);
  if (state.format !== undefined) {
    params.set(SEARCH_PARAM.format, state.format);
  }
  if (state.sort !== DEFAULT_SORT_KEY) {
    params.set(SEARCH_PARAM.sort, state.sort);
  }
  if (state.quality !== DEFAULT_QUALITY_PRESET) {
    params.set(SEARCH_PARAM.quality, state.quality);
  }
  if (state.hasRipLog) {
    params.set(SEARCH_PARAM.hasRipLog, RIP_LOG_PARAM_ON);
  }
  // An invalid range (min > max) is kept as entered, so the inputs can show what to fix.
  if (state.minTracks !== undefined) {
    params.set(SEARCH_PARAM.minTracks, String(state.minTracks));
  }
  if (state.maxTracks !== undefined) {
    params.set(SEARCH_PARAM.maxTracks, String(state.maxTracks));
  }
  return params;
}

/**
 * The state after a change. A new search text or mode clears the format filter, since the
 * formats on offer come from the results and the new results may not have it. The advanced
 * filters don't depend on the results, so they are kept.
 */
export function updateSearchState(state: SearchState, change: Partial<SearchState>): SearchState {
  const next = { ...state, ...change };
  const isNewSearch = next.searchText !== state.searchText || next.mode !== state.mode;
  return isNewSearch && !('format' in change) ? { ...next, format: undefined } : next;
}
