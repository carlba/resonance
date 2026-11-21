import { readSearchState, toSearchParams, updateSearchState } from './search-state.ts';

describe('readSearchState', () => {
  it('reads every parameter', () => {
    const params = new URLSearchParams('q= daft punk &type=tracks&format=FLAC&sort=speed');
    expect(readSearchState(params)).toEqual({
      searchText: 'daft punk',
      mode: 'tracks',
      format: 'flac',
      sort: 'speed',
    });
  });

  it('defaults to an album search in relevance order', () => {
    expect(readSearchState(new URLSearchParams())).toEqual({
      searchText: '',
      mode: 'albums',
      format: undefined,
      sort: 'relevance',
    });
  });

  it('falls back to the defaults for unknown values', () => {
    const state = readSearchState(new URLSearchParams('type=videos&sort=random&format='));
    expect(state).toMatchObject({ mode: 'albums', sort: 'relevance', format: undefined });
  });
});

describe('toSearchParams', () => {
  it('leaves out the default sort and an unset format', () => {
    const params = toSearchParams({ searchText: 'air', mode: 'albums', sort: 'relevance' });
    expect(params.toString()).toBe('q=air&type=albums');
  });

  it('round-trips through readSearchState', () => {
    const state = { searchText: 'air', mode: 'tracks', format: 'mp3', sort: 'size' } as const;
    expect(readSearchState(toSearchParams(state))).toEqual(state);
  });
});

describe('updateSearchState', () => {
  const state = { searchText: 'air', mode: 'albums', format: 'flac', sort: 'quality' } as const;

  it('clears the format filter on a new search text or mode', () => {
    expect(updateSearchState(state, { searchText: 'moon safari' }).format).toBeUndefined();
    expect(updateSearchState(state, { mode: 'tracks' }).format).toBeUndefined();
  });

  it('keeps the sort order on a new search', () => {
    expect(updateSearchState(state, { searchText: 'moon safari' }).sort).toBe('quality');
  });

  it('keeps the format filter when only the sort changes', () => {
    expect(updateSearchState(state, { sort: 'size' }).format).toBe('flac');
  });
});
