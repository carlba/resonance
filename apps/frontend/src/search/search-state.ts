export const SEARCH_MODES = ['albums', 'tracks'] as const;
export type SearchMode = (typeof SEARCH_MODES)[number];

export const SORT_KEYS = ['relevance', 'quality', 'speed', 'size'] as const;
/** `relevance` keeps the order the backend returned. */
export type SortKey = (typeof SORT_KEYS)[number];

export const DEFAULT_SEARCH_MODE: SearchMode = 'albums';
export const DEFAULT_SORT_KEY: SortKey = 'relevance';

/** The URL query parameters that hold the search state, so a search can be shared and reloaded. */
export const SEARCH_PARAM = {
  searchText: 'q',
  mode: 'type',
  format: 'format',
  sort: 'sort',
} as const;

export interface SearchState {
  /** Trimmed; `''` when nothing has been searched yet. */
  searchText: string;
  mode: SearchMode;
  /** The file extension to show, e.g. `flac`; unset to show every format. */
  format?: string;
  sort: SortKey;
}

/** Whether a value, e.g. from the URL or a Radix `onValueChange`, is one of the options. */
export function isOneOf<T extends string>(options: readonly T[], value: string | null): value is T {
  // Widening the options to plain strings lets `includes` take any string.
  const knownOptions: readonly string[] = options;
  return value !== null && knownOptions.includes(value);
}

/** Reads the search state from URL query parameters, falling back to defaults for bad values. */
export function readSearchState(params: URLSearchParams): SearchState {
  const mode = params.get(SEARCH_PARAM.mode);
  const sort = params.get(SEARCH_PARAM.sort);
  const format = params.get(SEARCH_PARAM.format)?.trim().toLowerCase();

  return {
    searchText: params.get(SEARCH_PARAM.searchText)?.trim() ?? '',
    mode: isOneOf(SEARCH_MODES, mode) ? mode : DEFAULT_SEARCH_MODE,
    format: format === '' ? undefined : format,
    sort: isOneOf(SORT_KEYS, sort) ? sort : DEFAULT_SORT_KEY,
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
  return params;
}

/**
 * The state after a change. A new search text or mode clears the format filter, since the
 * formats on offer come from the results and the new results may not have it.
 */
export function updateSearchState(state: SearchState, change: Partial<SearchState>): SearchState {
  const next = { ...state, ...change };
  const isNewSearch = next.searchText !== state.searchText || next.mode !== state.mode;
  return isNewSearch && !('format' in change) ? { ...next, format: undefined } : next;
}
