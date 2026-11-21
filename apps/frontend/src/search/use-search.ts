import { useCallback, useEffect, useState } from 'react';
import { searchAlbums, searchTracks } from '@/api/search-api.ts';
import type { AlbumResult, TrackResult } from '@/api/search-schemas.ts';
import type { SearchMode } from './search-state.ts';

export type SearchResults =
  { mode: 'albums'; results: AlbumResult[] } | { mode: 'tracks'; results: TrackResult[] };

export type SearchStatus =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: SearchResults }
  | { status: 'error'; error: Error };

type SettledSearch = Extract<SearchStatus, { status: 'success' | 'error' }>;

export type SearchOutcome = SearchStatus & {
  /** Runs the same search again, e.g. after an error. */
  retry: () => void;
};

async function runSearch(
  mode: SearchMode,
  searchText: string,
  signal: AbortSignal
): Promise<SearchResults> {
  if (mode === 'albums') {
    return { mode, results: await searchAlbums(searchText, { signal }) };
  }
  return { mode, results: await searchTracks(searchText, { signal }) };
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(`Search failed: error=${String(error)}`);
}

/**
 * Searches whenever the mode or search text changes and owns the loading, error and result
 * state. Responses to a search that has since been replaced are dropped, and its request aborted.
 */
export function useSearch(mode: SearchMode, searchText: string): SearchOutcome {
  const [attempt, setAttempt] = useState(0);
  // Remembering which search a result belongs to lets the status be derived instead of reset in
  // the effect: a result for any other search means the current one is still loading.
  const [settled, setSettled] = useState<{ key: string; search: SettledSearch }>();
  const requestKey = JSON.stringify([mode, searchText, attempt]);

  useEffect(() => {
    if (searchText === '') {
      return undefined;
    }
    const controller = new AbortController();
    const settle = (search: SettledSearch): void => {
      if (!controller.signal.aborted) {
        setSettled({ key: requestKey, search });
      }
    };

    runSearch(mode, searchText, controller.signal).then(
      data => settle({ status: 'success', data }),
      (error: unknown) => settle({ status: 'error', error: toError(error) })
    );
    return () => controller.abort();
  }, [mode, searchText, requestKey]);

  const retry = useCallback(() => setAttempt(current => current + 1), []);

  if (searchText === '') {
    return { status: 'idle', retry };
  }
  if (settled?.key !== requestKey) {
    return { status: 'loading', retry };
  }
  return { ...settled.search, retry };
}
