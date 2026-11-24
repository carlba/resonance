import { ApiError } from '@carlba/core';
import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpClientModule } from '@nestjs/http-client';
import { Test } from '@nestjs/testing';
import { ZodError } from 'zod';
import type { Env } from '../../config/env.schema.js';
import { ProvidersModule } from '../providers.module.js';
import {
  SEARCH_PROVIDER,
  type ProviderSearchResult,
  type SearchProvider,
} from '../search-provider.js';
import { UnexpectedResponseError } from './slskd-request.js';

const SEARCH_TIMEOUT_MS = 2000;
const SEARCH_ID = '3f1c2b4e-0000-4000-8000-000000000001';
const SEARCHES_PATH = '/api/v0/searches';
const SEARCH_PATH = `${SEARCHES_PATH}/${SEARCH_ID}`;
const RESPONSES_PATH = `${SEARCH_PATH}/responses`;
const CONFIG: Pick<Env, 'SLSKD_URL' | 'SLSKD_API_KEY' | 'SEARCH_TIMEOUT_MS'> = {
  SLSKD_URL: 'http://slskd:5030',
  SLSKD_API_KEY: 'test-api-key',
  SEARCH_TIMEOUT_MS,
};

// Stands in for the global ConfigModule, so the test doesn't depend on the shell's environment.
@Global()
@Module({
  providers: [
    { provide: ConfigService, useValue: { get: (key: keyof typeof CONFIG) => CONFIG[key] } },
  ],
  exports: [ConfigService],
})
class TestConfigModule {}

const SLSKD_RESPONSE = {
  username: 'alice',
  token: 42,
  fileCount: 2,
  hasFreeUploadSlot: true,
  queueLength: 3,
  uploadSpeed: 2_000_000,
  lockedFileCount: 0,
  lockedFiles: [],
  files: [
    {
      code: 1,
      filename: '@@alice\\Music\\Artist\\Album\\01 - Intro.flac',
      size: 30_000_000,
      extension: '',
      bitRate: 1000,
      bitDepth: 16,
      sampleRate: 44_100,
      length: 245,
      isVariableBitRate: false,
      isLocked: false,
    },
    {
      code: 1,
      filename: '@@alice\\Music\\Artist\\Album\\cover.jpg',
      size: 200_000,
      extension: 'jpg',
      bitRate: null,
      isLocked: false,
    },
  ],
};

const PROVIDER_RESULT: ProviderSearchResult = {
  username: 'alice',
  availability: { hasFreeUploadSlot: true, queueLength: 3, uploadSpeed: 2_000_000 },
  files: [
    {
      path: '@@alice\\Music\\Artist\\Album\\01 - Intro.flac',
      size: 30_000_000,
      bitRate: 1000,
      bitDepth: 16,
      sampleRate: 44_100,
      durationSeconds: 245,
      isVariableBitRate: false,
    },
    {
      path: '@@alice\\Music\\Artist\\Album\\cover.jpg',
      size: 200_000,
      bitRate: undefined,
      bitDepth: undefined,
      sampleRate: undefined,
      durationSeconds: undefined,
      isVariableBitRate: undefined,
    },
  ],
};

/** A fake slskd endpoint. It builds a new `Response` per call, since a body can only be read once. */
type Route = () => Promise<Response>;

function connectionRefused(): Promise<Response> {
  const cause = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
  return Promise.reject(new TypeError('fetch failed', { cause }));
}

function status(statusCode: number): Route {
  return () => Promise.resolve(new Response(null, { status: statusCode }));
}

function json(body: unknown): Route {
  return () => Promise.resolve(Response.json(body));
}

/** Answers polls with `isComplete` values in order, repeating the last one. */
function polls(...completionStates: boolean[]): Route {
  let pollCount = 0;
  return () => {
    const isComplete = completionStates[Math.min(pollCount, completionStates.length - 1)];
    pollCount += 1;
    return Promise.resolve(Response.json({ id: SEARCH_ID, isComplete }));
  };
}

type FetchInput = Parameters<typeof globalThis.fetch>[0];

function getRequestUrl(input: FetchInput): URL {
  return new URL(input instanceof Request ? input.url : input);
}

function describeRequest(input: FetchInput, init?: RequestInit): string {
  return `${init?.method} ${getRequestUrl(input).pathname}`;
}

describe('SlskdSearchProvider', () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  let routes: Record<string, Route>;
  let provider: SearchProvider;

  /** The requests sent to slskd, as `METHOD /path`. */
  function sentRequests(): string[] {
    return fetch.mock.calls.map(([url, init]) => describeRequest(url, init));
  }

  beforeEach(async () => {
    routes = {
      [`POST ${SEARCHES_PATH}`]: json({ id: SEARCH_ID, isComplete: false, searchText: 'x' }),
      [`GET ${SEARCH_PATH}`]: polls(true),
      [`GET ${RESPONSES_PATH}`]: json([SLSKD_RESPONSE]),
      [`PUT ${SEARCH_PATH}`]: status(200),
      [`DELETE ${SEARCH_PATH}`]: status(204),
    };
    fetch.mockReset();
    fetch.mockImplementation((url, init) => {
      const route = routes[describeRequest(url, init)] ?? status(404);
      return route();
    });

    const moduleRef = await Test.createTestingModule({
      imports: [TestConfigModule, HttpClientModule.forRoot({ fetch }), ProvidersModule],
    }).compile();
    provider = moduleRef.get(SEARCH_PROVIDER);

    // Faked after compiling, so only the polling and the client's retry backoff run on it.
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** Runs a search to the end, letting the fake clock run through every poll and retry. */
  async function runSearch(searchText = 'Daft Punk'): Promise<ProviderSearchResult[]> {
    const [[result]] = await Promise.all([
      Promise.allSettled([provider.search(searchText)]),
      vi.runAllTimersAsync(),
    ]);
    if (result.status === 'rejected') {
      throw result.reason;
    }
    return result.value;
  }

  async function runFailingSearch(): Promise<ApiError> {
    const error = await runSearch().then(
      () => undefined,
      (reason: unknown) => reason
    );
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }

  it('starts a search on the configured slskd with the API key and search text', async () => {
    await runSearch('Daft Punk');

    const [url, init] = fetch.mock.calls[0];
    expect(getRequestUrl(url).href).toBe(`http://slskd:5030${SEARCHES_PATH}`);
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('x-api-key')).toBe('test-api-key');
    expect(init?.body).toBe(JSON.stringify({ searchText: 'Daft Punk' }));
  });

  it('polls until the search is complete, returns the mapped responses and deletes it', async () => {
    routes[`GET ${SEARCH_PATH}`] = polls(false, false, true);

    const results = await runSearch();

    expect(results).toEqual([PROVIDER_RESULT]);
    expect(sentRequests()).toEqual([
      `POST ${SEARCHES_PATH}`,
      `GET ${SEARCH_PATH}`,
      `GET ${SEARCH_PATH}`,
      `GET ${SEARCH_PATH}`,
      `GET ${RESPONSES_PATH}`,
      `DELETE ${SEARCH_PATH}`,
    ]);
  });

  it('returns no results when a completed search found nothing', async () => {
    routes[`GET ${RESPONSES_PATH}`] = json([]);

    await expect(runSearch()).resolves.toEqual([]);
  });

  it('stops the search on timeout and returns the results found so far', async () => {
    routes[`GET ${SEARCH_PATH}`] = polls(false);
    const startedAt = Date.now();

    const results = await runSearch();

    expect(results).toEqual([PROVIDER_RESULT]);
    expect(Date.now() - startedAt).toBe(SEARCH_TIMEOUT_MS);
    expect(sentRequests().slice(-3)).toEqual([
      `PUT ${SEARCH_PATH}`,
      `GET ${RESPONSES_PATH}`,
      `DELETE ${SEARCH_PATH}`,
    ]);
  });

  it('throws a 504 when the search times out without results, and still deletes it', async () => {
    routes[`GET ${SEARCH_PATH}`] = polls(false);
    routes[`GET ${RESPONSES_PATH}`] = json([]);

    const error = await runFailingSearch();

    expect(error.statusCode).toBe(504);
    expect(error.message).toBe(
      `slskd search timed out without results: operation=wait searchText="Daft Punk" searchId=${SEARCH_ID} timeoutMs=${SEARCH_TIMEOUT_MS}`
    );
    expect(sentRequests()).toContain(`DELETE ${SEARCH_PATH}`);
  });

  it.each([[401], [403]])('throws a 502 about the API key when slskd answers %d', async code => {
    routes[`POST ${SEARCHES_PATH}`] = status(code);

    const error = await runFailingSearch();

    expect(error.statusCode).toBe(502);
    expect(error.message).toBe(
      `slskd rejected the API key, check SLSKD_API_KEY (status=${code}): operation=create searchText="Daft Punk"`
    );
  });

  it('throws a 502 when slskd is unreachable, without retrying the search', async () => {
    routes[`POST ${SEARCHES_PATH}`] = connectionRefused;

    const error = await runFailingSearch();

    expect(error.statusCode).toBe(502);
    expect(error.message).toBe(
      'slskd is unreachable (code=ECONNREFUSED): operation=create searchText="Daft Punk"'
    );
    expect(sentRequests()).toEqual([`POST ${SEARCHES_PATH}`]);
  });

  it('throws a 502 when polling keeps failing, and still deletes the search', async () => {
    routes[`GET ${SEARCH_PATH}`] = status(500);

    const error = await runFailingSearch();

    expect(error.statusCode).toBe(502);
    expect(error.message).toBe(
      `slskd returned an error (status=500): operation=poll searchText="Daft Punk" searchId=${SEARCH_ID}`
    );
    expect(sentRequests()).toContain(`DELETE ${SEARCH_PATH}`);
  });

  it('retries a poll that fails once', async () => {
    routes[`GET ${SEARCH_PATH}`] = vi
      .fn<Route>()
      .mockImplementationOnce(status(503))
      .mockImplementation(polls(true));

    await expect(runSearch()).resolves.toEqual([PROVIDER_RESULT]);
  });

  it('throws a 502 when slskd answers with an unexpected body', async () => {
    routes[`GET ${RESPONSES_PATH}`] = json([{ username: 'alice' }]);

    const error = await runFailingSearch();

    expect(error.statusCode).toBe(502);
    expect(error.message).toBe(
      `slskd returned an unexpected response: operation=responses searchText="Daft Punk" searchId=${SEARCH_ID}`
    );
    expect(error).toBeInstanceOf(UnexpectedResponseError);
    expect(error.cause).toBeInstanceOf(ZodError);
  });

  it('returns the results even when deleting the search fails', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    routes[`DELETE ${SEARCH_PATH}`] = status(500);

    await expect(runSearch()).resolves.toEqual([PROVIDER_RESULT]);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ searchId: SEARCH_ID }),
      'Failed to delete slskd search'
    );
  });

  it('returns the results even when stopping a timed-out search fails', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    routes[`GET ${SEARCH_PATH}`] = polls(false);
    routes[`PUT ${SEARCH_PATH}`] = status(500);

    await expect(runSearch()).resolves.toEqual([PROVIDER_RESULT]);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ searchId: SEARCH_ID }),
      'Failed to stop slskd search'
    );
  });
});
