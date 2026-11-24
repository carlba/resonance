import { buildDownloadGroup, getRequestUrl, jsonResponse } from '@/test/fixtures.ts';
import { fetchDownloads, startDownload } from './download-api.ts';
import { DownloadApiError } from './download-api-error.ts';

/** Answers every request, the downloads ones included, with the same JSON body. */
function stubFetch(body: unknown, status = 200) {
  const fetchStub = vi.fn<typeof fetch>(async () => jsonResponse(body, status));
  vi.stubGlobal('fetch', fetchStub);
  return fetchStub;
}

async function catchError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the promise to reject');
}

const REQUEST = { username: 'alice', files: [{ path: 'Music\\a.flac', size: 10 }] };

describe('startDownload', () => {
  it('posts the files to /api/downloads and returns what was started', async () => {
    const started = { username: 'alice', fileCount: 1, totalSize: 10 };
    const sentBodies: unknown[] = [];
    const fetchStub = vi.fn<typeof fetch>(async input => {
      sentBodies.push(await (input as Request).clone().json());
      return jsonResponse(started, 201);
    });
    vi.stubGlobal('fetch', fetchStub);

    await expect(startDownload(REQUEST)).resolves.toEqual(started);

    const [input] = fetchStub.mock.calls[0];
    const request = input as Request;
    expect(request.method).toBe('POST');
    expect(getRequestUrl(fetchStub).pathname).toBe('/api/downloads');
    expect(sentBodies).toEqual([REQUEST]);
  });

  it('turns a 5xx into an error that says slskd failed', async () => {
    stubFetch({ statusCode: 502, message: 'Internal server error' }, 502);

    const error = await catchError(startDownload(REQUEST));

    expect(error).toBeInstanceOf(DownloadApiError);
    expect(error).toMatchObject({ kind: 'http', statusCode: 502 });
    expect((error as Error).message).toContain('slskd could not be reached');
  });

  it('shows the validation messages of a 4xx', async () => {
    stubFetch({ statusCode: 400, message: ['files must contain at least 1 elements'] }, 400);

    const error = await catchError(startDownload(REQUEST));

    expect(error).toMatchObject({ kind: 'http', statusCode: 400 });
    expect((error as Error).message).toBe('files must contain at least 1 elements');
  });

  it('reports an unreachable backend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );

    await expect(startDownload(REQUEST)).rejects.toMatchObject({ kind: 'network' });
  });

  it('reports a response that does not match the schema', async () => {
    stubFetch({ unexpected: true });

    await expect(startDownload(REQUEST)).rejects.toMatchObject({ kind: 'invalid-response' });
  });
});

describe('fetchDownloads', () => {
  it('reads /api/downloads and returns the parsed groups', async () => {
    const groups = [buildDownloadGroup()];
    const fetchStub = stubFetch(groups);

    await expect(fetchDownloads()).resolves.toEqual(groups);
    expect(getRequestUrl(fetchStub).pathname).toBe('/api/downloads');
  });

  it('reports a response that does not match the schema', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse([{ username: 'alice' }]))
    );

    await expect(fetchDownloads()).rejects.toMatchObject({ kind: 'invalid-response' });
  });
});
