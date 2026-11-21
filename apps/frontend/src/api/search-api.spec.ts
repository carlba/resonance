import { buildAlbum, buildTrack, getRequestUrl, stubFetchWithJson } from '@/test/fixtures.ts';
import { searchAlbums, searchTracks } from './search-api.ts';
import { SearchApiError } from './search-api-error.ts';

async function catchError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the promise to reject');
}

describe('searchTracks', () => {
  it('requests /api/tracks with the search text and returns the parsed tracks', async () => {
    const tracks = [buildTrack()];
    const fetchStub = stubFetchWithJson(tracks);

    await expect(searchTracks('daft punk')).resolves.toEqual(tracks);

    const url = getRequestUrl(fetchStub);
    expect(url.pathname).toBe('/api/tracks');
    expect(url.searchParams.get('q')).toBe('daft punk');
  });

  it('accepts tracks without a bitrate or duration', async () => {
    const track = buildTrack({ bitRate: undefined, durationSeconds: undefined });
    stubFetchWithJson([track]);

    await expect(searchTracks('air')).resolves.toEqual([track]);
  });
});

describe('searchAlbums', () => {
  it('requests /api/albums and returns the parsed albums', async () => {
    const albums = [buildAlbum()];
    const fetchStub = stubFetchWithJson(albums);

    await expect(searchAlbums('discovery')).resolves.toEqual(albums);
    expect(getRequestUrl(fetchStub).pathname).toBe('/api/albums');
  });
});

describe('error mapping', () => {
  it('turns an error response into an http error with the backend message', async () => {
    stubFetchWithJson({ statusCode: 502, message: 'Internal server error' }, 502);

    const error = await catchError(searchAlbums('air'));

    expect(error).toBeInstanceOf(SearchApiError);
    expect(error).toMatchObject({
      kind: 'http',
      statusCode: 502,
      message: 'Internal server error',
    });
  });

  it('joins the messages of a validation error', async () => {
    stubFetchWithJson({ statusCode: 400, message: ['q must be a string', 'q is too long'] }, 400);

    await expect(searchTracks('air')).rejects.toMatchObject({
      kind: 'http',
      statusCode: 400,
      message: 'q must be a string, q is too long',
    });
  });

  it('falls back to the status when the error body is not the expected shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Bad gateway', { status: 504 }))
    );

    await expect(searchTracks('air')).rejects.toMatchObject({
      kind: 'http',
      statusCode: 504,
      message: 'Search failed: status=504',
    });
  });

  it('turns a failed request into a network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );

    await expect(searchTracks('air')).rejects.toMatchObject({
      name: 'SearchApiError',
      kind: 'network',
    });
  });

  it('turns a response that does not match the schema into an invalid-response error', async () => {
    stubFetchWithJson([{ filename: 42 }]);

    await expect(searchTracks('air')).rejects.toMatchObject({ kind: 'invalid-response' });
  });

  it('passes an abort through unchanged', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        // ky passes the signal on the Request it builds.
        const signal = input instanceof Request ? input.signal : init?.signal;
        return new Promise<Response>((_resolve, reject) => {
          if (signal?.aborted === true) {
            reject(signal.reason);
          }
          signal?.addEventListener('abort', () => reject(signal.reason));
        });
      })
    );
    const controller = new AbortController();

    const pending = searchTracks('air', { signal: controller.signal });
    controller.abort();

    const error = await catchError(pending);
    expect(error).not.toBeInstanceOf(SearchApiError);
    expect(error).toMatchObject({ name: 'AbortError' });
  });
});
