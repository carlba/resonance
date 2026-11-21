import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import {
  readSearchState,
  toSearchParams,
  updateSearchState,
  type SearchState,
} from './search-state.ts';

export type UpdateSearchState = (change: Partial<SearchState>) => void;

/** The search state kept in the URL query, and a function that changes it. */
export function useSearchState(): [SearchState, UpdateSearchState] {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchState = useMemo(() => readSearchState(searchParams), [searchParams]);

  const update = useCallback<UpdateSearchState>(
    change => {
      setSearchParams(current =>
        toSearchParams(updateSearchState(readSearchState(current), change))
      );
    },
    [setSearchParams]
  );

  return [searchState, update];
}
