import { useSearch } from '@/search/use-search.ts';
import { useSearchState } from '@/search/use-search-state.ts';
import { SearchForm } from './search-form.tsx';
import { SearchResults } from './search-results.tsx';
import { ErrorState, LoadingState } from './search-states.tsx';

export function SearchPage() {
  const [searchState, updateSearchState] = useSearchState();
  const { mode, searchText } = searchState;
  const search = useSearch(mode, searchText);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:py-10">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold">Resonance</h1>
        <p className="text-sm text-muted-foreground">Search albums and tracks on Soulseek.</p>
      </header>
      <SearchForm
        key={searchText}
        searchText={searchText}
        mode={mode}
        isLoading={search.status === 'loading'}
        onSearch={nextSearchText => updateSearchState({ searchText: nextSearchText })}
        onModeChange={nextMode => updateSearchState({ mode: nextMode })}
      />
      {search.status === 'loading' && <LoadingState />}
      {search.status === 'error' && <ErrorState error={search.error} onRetry={search.retry} />}
      {search.status === 'success' && (
        <SearchResults
          data={search.data}
          searchState={searchState}
          onSearchStateChange={updateSearchState}
        />
      )}
    </main>
  );
}
