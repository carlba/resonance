import { useMemo } from 'react';
import type { SearchResults as SearchResultsData } from '@/search/use-search.ts';
import {
  applyResultControls,
  countActiveFilters,
  getFormatOptions,
  type FormatOption,
} from '@/search/result-filters.ts';
import { getClearedAdvancedFilters, type SearchState } from '@/search/search-state.ts';
import type { UpdateSearchState } from '@/search/use-search-state.ts';
import { AdvancedFilters } from './advanced-filters.tsx';
import { AlbumResults } from './album-results.tsx';
import { ResultControls } from './result-controls.tsx';
import { AllHiddenState, EmptyState } from './search-states.tsx';
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

/** The results of a finished search, with the filters and sort order applied. */
export function SearchResults({ data, searchState, onSearchStateChange }: SearchResultsProps) {
  const { format, sort, mode, searchText } = searchState;
  const formatOptions = useMemo(
    () => withSelectedFormat(getFormatOptions(data.results), format),
    [data.results, format]
  );

  if (data.results.length === 0) {
    return <EmptyState mode={mode} searchText={searchText} />;
  }

  const visibleResults =
    data.mode === 'albums'
      ? { mode: data.mode, results: applyResultControls(data.results, searchState) }
      : { mode: data.mode, results: applyResultControls(data.results, searchState) };
  const isAllHidden = visibleResults.results.length === 0;
  // Clearing the advanced filters only helps when one of them is active; otherwise the format
  // filter alone hides everything, which has a message of its own.
  const hasActiveAdvancedFilters = countActiveFilters(searchState, data.mode) > 0;

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
      <AdvancedFilters
        filters={searchState}
        mode={data.mode}
        onFiltersChange={onSearchStateChange}
      />
      {isAllHidden && hasActiveAdvancedFilters ? (
        <AllHiddenState
          mode={data.mode}
          resultCount={data.results.length}
          onClearFilters={() => onSearchStateChange(getClearedAdvancedFilters(data.mode))}
        />
      ) : isAllHidden ? (
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
