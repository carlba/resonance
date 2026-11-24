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
});
