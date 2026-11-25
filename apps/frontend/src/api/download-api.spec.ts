import { buildDownloadGroup, getRequestUrl, jsonResponse } from '@/test/fixtures.ts';
import {
  deleteDownload,
  encodeDirectory,
  fetchDownloadCapabilities,
  fetchDownloads,
  startDownload,
} from './download-api.ts';
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

describe('encodeDirectory', () => {
  it('encodes the folder as base64url without padding', () => {
    expect(encodeDirectory('Music\\A?>?')).toBe('TXVzaWNcQT8-Pw');
  });

  it.each(['Music\\Album', 'Björk – Homogenic', 'a?>?>~~~\\ü/日本語', 'x'])(
    'gives what the backend decodes back into %s',
    directory => {
      const encoded = encodeDirectory(directory);
      const base64 = encoded.replaceAll('-', '+').replaceAll('_', '/');
      const bytes = Uint8Array.from(atob(base64), character => character.codePointAt(0) ?? 0);

      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(new TextDecoder().decode(bytes)).toBe(directory);
    }
  );
});

describe('fetchDownloadCapabilities', () => {
  it('reads /api/downloads/capabilities', async () => {
    const capabilities = {
      canDelete: false,
      unavailableReason: 'file-management-disabled',
      destinationPattern: '${SOURCE_DIRECTORY}',
    };
    const fetchStub = stubFetch(capabilities);

    await expect(fetchDownloadCapabilities()).resolves.toEqual(capabilities);
    expect(getRequestUrl(fetchStub).pathname).toBe('/api/downloads/capabilities');
  });

  it('fails with an invalid-response error when the answer has the wrong shape', async () => {
    stubFetch({ canDelete: 'yes' });

    expect(await catchError(fetchDownloadCapabilities())).toMatchObject({
      kind: 'invalid-response',
    });
  });
});

describe('deleteDownload', () => {
  it('sends DELETE with the user and the encoded folder and returns the counts', async () => {
    const deleted = { deletedFiles: 2, missingFiles: 1, removedTransfers: 3 };
    const fetchStub = stubFetch(deleted);

    await expect(deleteDownload('al ice', 'Music\\Album')).resolves.toEqual(deleted);

    const [input] = fetchStub.mock.calls[0];
    expect((input as Request).method).toBe('DELETE');
    expect(getRequestUrl(fetchStub).pathname).toBe(
      `/api/downloads/al%20ice/${encodeDirectory('Music\\Album')}`
    );
  });

  it('reports the backend message of a refused delete', async () => {
    stubFetch({ statusCode: 409, message: 'Deleting downloads is not available' }, 409);

    expect(await catchError(deleteDownload('alice', 'Music\\Album'))).toMatchObject({
      kind: 'http',
      statusCode: 409,
      message: 'Deleting downloads is not available',
    });
  });
});
