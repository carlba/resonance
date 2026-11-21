import { Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group.tsx';
import { isOneOf, SEARCH_MODES, type SearchMode } from '@/search/search-state.ts';

const MODE_LABELS: Record<SearchMode, string> = { albums: 'Albums', tracks: 'Tracks' };

export interface SearchFormProps {
  searchText: string;
  mode: SearchMode;
  isLoading: boolean;
  onSearch: (searchText: string) => void;
  onModeChange: (mode: SearchMode) => void;
}

/**
 * The search text, the Albums/Tracks toggle and the submit button. Render it with
 * `key={searchText}` so it picks up a search text that changes in the URL.
 */
export function SearchForm({
  searchText,
  mode,
  isLoading,
  onSearch,
  onModeChange,
}: SearchFormProps) {
  const [draft, setDraft] = useState(searchText);
  const trimmedDraft = draft.trim();

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (trimmedDraft !== '') {
      onSearch(trimmedDraft);
    }
  };

  // Radix sends '' when the selected item is clicked again; keep the current mode then.
  const handleModeChange = (value: string): void => {
    if (isOneOf(SEARCH_MODES, value)) {
      onModeChange(value);
    }
  };

  return (
    <search>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          type="search"
          aria-label="Search text"
          placeholder="Artist, album or track"
          value={draft}
          onChange={event => setDraft(event.target.value)}
          disabled={isLoading}
          className="sm:flex-1"
        />
        <div className="flex gap-2">
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            aria-label="Search type"
            value={mode}
            onValueChange={handleModeChange}
            disabled={isLoading}>
            {SEARCH_MODES.map(searchMode => (
              <ToggleGroupItem key={searchMode} value={searchMode}>
                {MODE_LABELS[searchMode]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Button
            type="submit"
            disabled={isLoading || trimmedDraft === ''}
            className="flex-1 sm:flex-none">
            <Search aria-hidden data-icon="inline-start" />
            Search
          </Button>
        </div>
      </form>
    </search>
  );
}
