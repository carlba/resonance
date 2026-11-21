import { useMemo } from 'react';
import type { SearchResults as SearchResultsData } from '@/search/use-search.ts';
import {
  applyResultControls,
  getFormatOptions,
  type FormatOption,
} from '@/search/result-filters.ts';
import type { SearchState } from '@/search/search-state.ts';
import type { UpdateSearchState } from '@/search/use-search-state.ts';
import { AlbumResults } from './album-results.tsx';
import { ResultControls } from './result-controls.tsx';
import { EmptyState } from './search-states.tsx';
import { TrackResults } from './track-results.tsx';

export interface SearchResultsProps {
  data: SearchResultsData;
  searchState: SearchState;
  onSearchStateChange: UpdateSearchState;
}

// A format from a shared URL may be missing from new results; listing it keeps the select showing
// what is filtered on, so it can be cleared.
function withSelectedFormat(options: FormatOption[], format: string | undefined): FormatOption[] {
  const isListed = format === undefined || options.some(option => option.format === format);
  return isListed ? options : [...options, { format, count: 0 }];
}

/** The results of a finished search, with the format filter and sort order applied. */
export function SearchResults({ data, searchState, onSearchStateChange }: SearchResultsProps) {
  const { format, sort, mode, searchText } = searchState;
  const formatOptions = useMemo(
    () => withSelectedFormat(getFormatOptions(data.results), format),
    [data.results, format]
  );

  if (data.results.length === 0) {
    return <EmptyState mode={mode} searchText={searchText} />;
  }

  const controls = { format, sort };
  const visibleResults =
    data.mode === 'albums'
      ? { mode: data.mode, results: applyResultControls(data.results, controls) }
      : { mode: data.mode, results: applyResultControls(data.results, controls) };

  return (
    <section aria-label="Search results" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <ResultControls
          formatOptions={formatOptions}
          format={format}
          sort={sort}
          onFormatChange={nextFormat => onSearchStateChange({ format: nextFormat })}
          onSortChange={nextSort => onSearchStateChange({ sort: nextSort })}
        />
        <p className="text-sm text-muted-foreground">
          Showing {visibleResults.results.length} of {data.results.length} {data.mode}
        </p>
      </div>
      {visibleResults.results.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          No {data.mode} in {format?.toUpperCase()} for this search
        </p>
      ) : visibleResults.mode === 'albums' ? (
        <AlbumResults albums={visibleResults.results} />
      ) : (
        <TrackResults tracks={visibleResults.results} />
      )}
    </section>
  );
}
