import { renderHook, waitFor } from '@testing-library/react';
import { buildAlbum, buildTrack } from '@/test/fixtures.ts';
import type { SearchMode } from './search-state.ts';
import { useSearch } from './use-search.ts';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
}

describe('useSearch', () => {
  it('stays idle without search text', () => {
    const fetchStub = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchStub);

    const { result } = renderHook(() => useSearch('albums', ''));

    expect(result.current.status).toBe('idle');
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('ignores the response to a search that has been replaced', async () => {
    // The album search only settles when the test answers it, after switching to tracks.
    const albumResponse = Promise.withResolvers<Response>();
    const fetchStub = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(albumResponse.promise)
      .mockResolvedValueOnce(jsonResponse([buildTrack({ filename: 'new.flac' })]));
    vi.stubGlobal('fetch', fetchStub);

    const { result, rerender } = renderHook(({ mode }) => useSearch(mode, 'air'), {
      initialProps: { mode: 'albums' as SearchMode },
    });
    expect(result.current.status).toBe('loading');

    rerender({ mode: 'tracks' });
    await waitFor(() => expect(result.current.status).toBe('success'));
    albumResponse.resolve(jsonResponse([buildAlbum()]));

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(result.current).toMatchObject({
      status: 'success',
      data: { mode: 'tracks', results: [{ filename: 'new.flac' }] },
    });
  });
});
