import { ApiError } from '@carlba/core';
import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpClientModule } from '@nestjs/http-client';
import { Test } from '@nestjs/testing';
import { ZodError } from 'zod';
import { DOWNLOAD_PROVIDER, type DownloadProvider } from '../download-provider.js';
import { ProvidersModule } from '../providers.module.js';
import { UnexpectedResponseError } from './slskd-request.js';

const CONFIG = {
  SLSKD_URL: 'http://slskd:5030',
  SLSKD_API_KEY: 'test-api-key',
  SEARCH_TIMEOUT_MS: 2000,
};
const DOWNLOADS_PATH = '/api/v0/transfers/downloads';
const USERNAME = 'alice smith';
const FILES = [
  { path: '@@alice\\Music\\Album\\01 - Intro.flac', size: 30_000_000 },
  { path: '@@alice\\Music\\Album\\cover.jpg', size: 200_000 },
];
const DESCRIPTION = `operation=enqueue username=${USERNAME} fileCount=2`;

// Stands in for the global ConfigModule, so the test doesn't depend on the shell's environment.
@Global()
@Module({
  providers: [
    { provide: ConfigService, useValue: { get: (key: keyof typeof CONFIG) => CONFIG[key] } },
  ],
  exports: [ConfigService],
})
class TestConfigModule {}

type Route = () => Promise<Response>;

function connectionRefused(): Promise<Response> {
  const cause = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
  return Promise.reject(new TypeError('fetch failed', { cause }));
}

function status(statusCode: number): Route {
  return () => Promise.resolve(new Response(null, { status: statusCode }));
}

function json(body: unknown, statusCode = 200): Route {
  return () => Promise.resolve(Response.json(body, { status: statusCode }));
}

/** Runs a call to the end, letting the fake clock run through the client's retry backoff. */
async function settle<T>(call: Promise<T>): Promise<PromiseSettledResult<T>> {
  vi.useFakeTimers();
  const [result] = await Promise.all([Promise.allSettled([call]), vi.runAllTimersAsync()]);
  return result[0];
}

async function catchApiError(call: Promise<unknown>): Promise<ApiError> {
  const result = await settle(call);
  expect(result.status).toBe('rejected');
  const { reason } = result as PromiseRejectedResult;
  expect(reason).toBeInstanceOf(ApiError);
  return reason as ApiError;
}

describe('SlskdDownloadProvider', () => {
  const fetch = vi.fn<typeof globalThis.fetch>();

  function getRequestedUrl(): URL {
    const [url] = fetch.mock.calls[0];
    return new URL(url instanceof Request ? url.url : url);
  }
  let route: Route;
  let provider: DownloadProvider;

  beforeEach(async () => {
    route = json({ enqueued: [{}, {}], failed: [] });
    fetch.mockReset();
    fetch.mockImplementation(() => route());

    const moduleRef = await Test.createTestingModule({
      imports: [TestConfigModule, HttpClientModule.forRoot({ fetch }), ProvidersModule],
    }).compile();
    provider = moduleRef.get(DOWNLOAD_PROVIDER);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('enqueue', () => {
    it('posts every file with its full path to the user, with the API key', async () => {
      await provider.enqueue({ username: USERNAME, files: FILES });

      const [url, init] = fetch.mock.calls[0];
      const requestUrl = new URL(url instanceof Request ? url.url : url);
      expect(init?.method).toBe('POST');
      expect(requestUrl.href).toBe(`http://slskd:5030${DOWNLOADS_PATH}/alice%20smith`);
      expect(new Headers(init?.headers).get('x-api-key')).toBe('test-api-key');
      expect(JSON.parse(init?.body as string)).toEqual([
        { filename: '@@alice\\Music\\Album\\01 - Intro.flac', size: 30_000_000 },
        { filename: '@@alice\\Music\\Album\\cover.jpg', size: 200_000 },
      ]);
    });

    it('resolves when slskd accepts all files', async () => {
      await expect(provider.enqueue({ username: USERNAME, files: FILES })).resolves.toBeUndefined();
    });

    it('throws a 502 naming the user and file count when slskd rejects some files', async () => {
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      route = json({ enqueued: [{}], failed: ['@@alice\\Music\\Album\\cover.jpg'] }, 207);

      const error = await catchApiError(provider.enqueue({ username: USERNAME, files: FILES }));

      expect(error.statusCode).toBe(502);
      expect(error.message).toBe(
        `slskd rejected some of the files: ${DESCRIPTION} rejectedCount=1`
      );
      expect(warn).toHaveBeenCalled();
    });

    it('throws a 502 when slskd is unreachable, without retrying', async () => {
      route = connectionRefused;

      const error = await catchApiError(provider.enqueue({ username: USERNAME, files: FILES }));

      expect(error.statusCode).toBe(502);
      expect(error.message).toBe(`slskd is unreachable (code=ECONNREFUSED): ${DESCRIPTION}`);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('throws a 502 when slskd answers with an error', async () => {
      route = status(500);

      const error = await catchApiError(provider.enqueue({ username: USERNAME, files: FILES }));

      expect(error.statusCode).toBe(502);
      expect(error.message).toBe(`slskd returned an error (status=500): ${DESCRIPTION}`);
    });

    it('throws a 502 about the API key when slskd answers 401', async () => {
      route = status(401);

      const error = await catchApiError(provider.enqueue({ username: USERNAME, files: FILES }));

      expect(error.message).toBe(
        `slskd rejected the API key, check SLSKD_API_KEY (status=401): ${DESCRIPTION}`
      );
    });

    it('throws a 502 when slskd answers with an unexpected body', async () => {
      route = json({ enqueued: 'two' });

      const error = await catchApiError(provider.enqueue({ username: USERNAME, files: FILES }));

      expect(error).toBeInstanceOf(UnexpectedResponseError);
      expect(error.statusCode).toBe(502);
      expect(error.cause).toBeInstanceOf(ZodError);
    });
  });

  describe('list', () => {
    it('reads the transfers of every user and maps them to download files', async () => {
      route = json([
        {
          username: 'alice',
          directories: [
            {
              directory: '@@alice\\Music\\Album',
              fileCount: 1,
              files: [
                {
                  id: 'transfer-1',
                  filename: '@@alice\\Music\\Album\\01 - Intro.flac',
                  size: 1000,
                  state: 'InProgress',
                  bytesTransferred: 250,
                  averageSpeed: 100,
                },
              ],
            },
          ],
        },
      ]);

      const files = await provider.list();

      const [url, init] = fetch.mock.calls[0];
      expect(new URL(url instanceof Request ? url.url : url).pathname).toBe(DOWNLOADS_PATH);
      expect(init?.method).toBe('GET');
      expect(files).toEqual([
        {
          id: 'transfer-1',
          username: 'alice',
          path: '@@alice\\Music\\Album\\01 - Intro.flac',
          size: 1000,
          state: 'downloading',
          bytesTransferred: 250,
          averageSpeed: 100,
          lastActivityAt: undefined,
        },
      ]);
    });

    it('returns nothing when slskd has no transfers', async () => {
      route = json([]);

      await expect(provider.list()).resolves.toEqual([]);
    });

    it('throws a 502 when slskd is unreachable', async () => {
      route = connectionRefused;

      const result = await settle(provider.list());

      expect(result).toMatchObject({
        status: 'rejected',
        reason: {
          statusCode: 502,
          message: 'slskd is unreachable (code=ECONNREFUSED): operation=list',
        },
      });
    });
  });

  describe('getStorageOptions', () => {
    it('reads the file management flag and the destination pattern from the options', async () => {
      route = json({
        remoteFileManagement: true,
        transfers: { download: { destination: { subdirectory: '${SOURCE_DIRECTORY}' } } },
      });

      await expect(provider.getStorageOptions()).resolves.toEqual({
        isFileManagementEnabled: true,
        destinationPattern: '${SOURCE_DIRECTORY}',
      });
      const [url, init] = fetch.mock.calls[0];
      expect(new URL(url instanceof Request ? url.url : url).pathname).toBe('/api/v0/options');
      expect(init?.method).toBe('GET');
    });

    it('says the API key needs the administrator role when slskd answers 403', async () => {
      route = status(403);

      const error = await catchApiError(provider.getStorageOptions());

      expect(error.statusCode).toBe(502);
      expect(error.message).toContain('administrator role');
      expect(error.message).toContain('operation=getOptions');
    });

    it('throws a 502 when the options are not what was expected', async () => {
      route = json({ remoteFileManagement: 'yes' });

      const error = await catchApiError(provider.getStorageOptions());

      expect(error).toBeInstanceOf(UnexpectedResponseError);
      expect(error.statusCode).toBe(502);
    });
  });

  describe('cancelTransfer and removeTransfer', () => {
    const TRANSFER = { username: USERNAME, id: 'abc' };

    it('cancels a transfer but keeps it listed', async () => {
      route = status(204);

      await provider.cancelTransfer(TRANSFER);

      expect(fetch.mock.calls[0][1]?.method).toBe('DELETE');
      expect(getRequestedUrl().pathname).toBe(`${DOWNLOADS_PATH}/alice%20smith/abc`);
      expect(getRequestedUrl().searchParams.get('remove')).toBe('false');
    });

    it('removes a transfer from the list', async () => {
      route = status(204);

      await provider.removeTransfer(TRANSFER);

      expect(getRequestedUrl().searchParams.get('remove')).toBe('true');
    });

    it('treats a transfer slskd does not know as already gone', async () => {
      route = status(404);

      await expect(provider.removeTransfer(TRANSFER)).resolves.toBeUndefined();
    });

    it('throws a 502 naming the transfer when slskd fails', async () => {
      route = status(500);

      const error = await catchApiError(provider.removeTransfer(TRANSFER));

      expect(error.statusCode).toBe(502);
      expect(error.message).toBe(
        `slskd returned an error (status=500): operation=removeTransfer username=${USERNAME} id=abc`
      );
    });
  });

  describe('deleteFile', () => {
    const RELATIVE_PATH = 'Album/01 - Intro.flac';
    // Standard base64 of the UTF-8 path; its `/` and `+` must be escaped in the URL.
    const ENCODED_PATH = Buffer.from(RELATIVE_PATH).toString('base64');

    it('deletes the file with its base64-encoded relative path', async () => {
      route = status(204);

      await expect(provider.deleteFile('downloads', RELATIVE_PATH)).resolves.toBe('deleted');

      const [url, init] = fetch.mock.calls[0];
      expect(init?.method).toBe('DELETE');
      expect(new URL(url instanceof Request ? url.url : url).pathname).toBe(
        `/api/v0/files/downloads/files/${encodeURIComponent(ENCODED_PATH)}`
      );
    });

    it('uses the incomplete folder for partial files', async () => {
      route = status(204);

      await provider.deleteFile('incomplete', RELATIVE_PATH);

      const [url] = fetch.mock.calls[0];
      expect(new URL(url instanceof Request ? url.url : url).pathname).toContain(
        '/api/v0/files/incomplete/files/'
      );
    });

    it('reports a 404 as a missing file', async () => {
      route = status(404);

      await expect(provider.deleteFile('downloads', RELATIVE_PATH)).resolves.toBe('missing');
    });

    it('names remote_file_management when slskd answers 403', async () => {
      route = status(403);

      const error = await catchApiError(provider.deleteFile('downloads', RELATIVE_PATH));

      expect(error.statusCode).toBe(502);
      expect(error.message).toContain('remote_file_management');
      expect(error.message).toContain(`path=${RELATIVE_PATH}`);
    });

    it('throws a 502 when slskd is unreachable', async () => {
      route = connectionRefused;

      const error = await catchApiError(provider.deleteFile('downloads', RELATIVE_PATH));

      expect(error.message).toBe(
        `slskd is unreachable (code=ECONNREFUSED): operation=deleteFile location=downloads path=${RELATIVE_PATH}`
      );
    });
  });

  describe('listDirectory', () => {
    it('counts the files and sub-folders of a folder', async () => {
      route = json({ name: 'Album', files: [{}, {}], directories: [{}] });

      await expect(provider.listDirectory('downloads', 'Album')).resolves.toEqual({
        fileCount: 2,
        directoryCount: 1,
      });
      expect(fetch.mock.calls[0][1]?.method).toBe('GET');
    });

    it('treats missing lists as an empty folder', async () => {
      route = json({ name: 'Album', files: null });

      await expect(provider.listDirectory('downloads', 'Album')).resolves.toEqual({
        fileCount: 0,
        directoryCount: 0,
      });
    });

    it('returns undefined for a folder that does not exist', async () => {
      route = status(404);

      await expect(provider.listDirectory('downloads', 'Album')).resolves.toBeUndefined();
    });
  });

  describe('deleteDirectory', () => {
    it('deletes the folder with its base64-encoded relative path', async () => {
      route = status(204);

      await provider.deleteDirectory('incomplete', 'alice/Album');

      const [url, init] = fetch.mock.calls[0];
      expect(init?.method).toBe('DELETE');
      expect(new URL(url instanceof Request ? url.url : url).pathname).toContain(
        `/api/v0/files/incomplete/directories/${encodeURIComponent(
          Buffer.from('alice/Album').toString('base64')
        )}`
      );
    });

    it('resolves quietly when the folder is gone', async () => {
      route = status(404);

      await expect(provider.deleteDirectory('downloads', 'Album')).resolves.toBeUndefined();
    });

    it('throws a 502 when slskd fails', async () => {
      route = status(500);

      const error = await catchApiError(provider.deleteDirectory('downloads', 'Album'));

      expect(error.statusCode).toBe(502);
    });
  });
});
