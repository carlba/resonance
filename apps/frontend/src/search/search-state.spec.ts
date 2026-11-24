import {
  ADVANCED_FILTER_DEFAULTS,
  getClearedAdvancedFilters,
  parseTrackCount,
  QUALITY_PRESETS,
  readSearchState,
  toSearchParams,
  updateSearchState,
  type SearchState,
} from './search-state.ts';

const defaultState: SearchState = {
  searchText: 'air',
  mode: 'albums',
  sort: 'relevance',
  ...ADVANCED_FILTER_DEFAULTS,
};

describe('readSearchState', () => {
  it('reads every parameter', () => {
    const params = new URLSearchParams(
      'q= daft punk &type=tracks&format=FLAC&sort=speed&quality=cd&log=1&minTracks=10&maxTracks=12'
    );
    expect(readSearchState(params)).toEqual({
      searchText: 'daft punk',
      mode: 'tracks',
      format: 'flac',
      sort: 'speed',
      quality: 'cd',
      hasRipLog: true,
      minTracks: 10,
      maxTracks: 12,
    });
  });

  it('defaults to an album search in relevance order without advanced filters', () => {
    expect(readSearchState(new URLSearchParams())).toEqual({
      searchText: '',
      mode: 'albums',
      format: undefined,
      sort: 'relevance',
      quality: 'any',
      hasRipLog: false,
      minTracks: undefined,
      maxTracks: undefined,
    });
  });

  it('falls back to the defaults for unknown values', () => {
    const state = readSearchState(
      new URLSearchParams('type=videos&sort=random&format=&quality=128&log=yes')
    );
    expect(state).toMatchObject({
      mode: 'albums',
      sort: 'relevance',
      format: undefined,
      quality: 'any',
      hasRipLog: false,
    });
  });

  it.each(QUALITY_PRESETS)('reads the %s quality preset', preset => {
    expect(readSearchState(new URLSearchParams(`quality=${preset}`)).quality).toBe(preset);
  });

  it('does not accept a quality preset in another case', () => {
    expect(readSearchState(new URLSearchParams('quality=HIRES')).quality).toBe('any');
  });

  it('ignores invalid track counts', () => {
    const state = readSearchState(new URLSearchParams('minTracks=-1&maxTracks=ten'));
    expect(state).toMatchObject({ minTracks: undefined, maxTracks: undefined });
  });

  it('keeps a minimum larger than the maximum so it can be shown and fixed', () => {
    const state = readSearchState(new URLSearchParams('minTracks=12&maxTracks=10'));
    expect(state).toMatchObject({ minTracks: 12, maxTracks: 10 });
  });
});

describe('parseTrackCount', () => {
  it.each([
    ['12', 12],
    [' 7 ', 7],
    ['0', 0],
  ])('reads %j as %d', (value, expected) => {
    expect(parseTrackCount(value)).toBe(expected);
  });

  it.each([null, '', '-1', '1.5', '1e2', 'abc', '12abc'])('ignores %j', value => {
    expect(parseTrackCount(value)).toBeUndefined();
  });
});

describe('toSearchParams', () => {
  it('leaves out the defaults and an unset format', () => {
    expect(toSearchParams(defaultState).toString()).toBe('q=air&type=albums');
  });

  it('writes the advanced filters that are set', () => {
    const params = toSearchParams({
      ...defaultState,
      quality: 'hires',
      hasRipLog: true,
      minTracks: 10,
    });
    expect(params.toString()).toBe('q=air&type=albums&quality=hires&log=1&minTracks=10');
  });

  it('round-trips through readSearchState', () => {
    const state: SearchState = {
      searchText: 'air',
      mode: 'tracks',
      format: 'mp3',
      sort: 'size',
      quality: '320',
      hasRipLog: true,
      minTracks: 8,
      maxTracks: 8,
    };
    expect(readSearchState(toSearchParams(state))).toEqual(state);
  });
});

describe('updateSearchState', () => {
  const state: SearchState = {
    searchText: 'air',
    mode: 'albums',
    format: 'flac',
    sort: 'quality',
    quality: 'lossless',
    hasRipLog: true,
    minTracks: 10,
    maxTracks: 12,
  };

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

  it('keeps the advanced filters on a new search text or mode', () => {
    const advancedFilters = { quality: 'lossless', hasRipLog: true, minTracks: 10, maxTracks: 12 };
    expect(updateSearchState(state, { searchText: 'moon safari' })).toMatchObject(advancedFilters);
    expect(updateSearchState(state, { mode: 'tracks' })).toMatchObject(advancedFilters);
  });

  it('clears a track-count bound', () => {
    expect(updateSearchState(state, { minTracks: undefined }).minTracks).toBeUndefined();
  });
});

describe('getClearedAdvancedFilters', () => {
  const state: SearchState = {
    ...defaultState,
    format: 'flac',
    sort: 'size',
    quality: 'hires',
    hasRipLog: true,
    minTracks: 10,
    maxTracks: 12,
  };

  it('clears every advanced filter in the Albums view and keeps format and sort', () => {
    expect(updateSearchState(state, getClearedAdvancedFilters('albums'))).toEqual({
      ...defaultState,
      format: 'flac',
      sort: 'size',
    });
  });

  it('clears only the quality filter in the Tracks view, keeping the hidden album filters', () => {
    const tracksState: SearchState = { ...state, mode: 'tracks' };
    expect(updateSearchState(tracksState, getClearedAdvancedFilters('tracks'))).toEqual({
      ...tracksState,
      quality: 'any',
    });
  });
});
