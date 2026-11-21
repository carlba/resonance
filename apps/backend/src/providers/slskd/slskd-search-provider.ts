import { ApiError } from '@carlba/core';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HttpClient,
  HttpClientError,
  HttpParseError,
  HttpResponseError,
  HttpTimeoutError,
  InjectHttpClient,
  type HttpResponse,
} from '@nestjs/http-client';
import type { z } from 'zod';
import type { Env } from '../../config/env.schema.js';
import { sleep } from '../../utils/sleep.js';
import type { ProviderSearchResult, SearchProvider } from '../search-provider.js';
import {
  slskdSearchResponsesSchema,
  slskdSearchSchema,
  toProviderSearchResult,
  type SlskdSearchResponse,
} from './slskd-api.js';

/** Name of the `HttpClient` registered for slskd in `ProvidersModule`. */
export const SLSKD_HTTP_CLIENT = 'slskd';

const SEARCHES_PATH = 'api/v0/searches';
const SEARCH_PATH = `${SEARCHES_PATH}/:searchId`;
const POLL_INTERVAL_MS = 500;
const UNAUTHORIZED_STATUS_CODES = new Set<number>([HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN]);

/** Identifies one call to slskd in error messages. */
interface SlskdCallContext {
  operation: string;
  searchText: string;
  searchId?: string;
}

type SearchContext = Omit<SlskdCallContext, 'operation'> & { searchId: string };

function describeCall({ operation, searchText, searchId }: SlskdCallContext): string {
  const searchIdPart = searchId === undefined ? '' : ` searchId=${searchId}`;
  return `operation=${operation} searchText=${JSON.stringify(searchText)}${searchIdPart}`;
}

/**
 * slskd answered 2xx, but with a body that doesn't match the schema. The `ZodError` is the cause,
 * so the log shows which fields were wrong.
 */
export class UnexpectedResponseError extends ApiError {
  constructor(context: SlskdCallContext, zodError: z.ZodError) {
    super(`slskd returned an unexpected response: ${describeCall(context)}`, {
      statusCode: HttpStatus.BAD_GATEWAY,
      cause: zodError,
    });
    this.name = 'UnexpectedResponseError';
  }
}

function parseResponse<T extends z.ZodType>(
  schema: T,
  data: unknown,
  context: SlskdCallContext
): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new UnexpectedResponseError(context, result.error);
  }
  return result.data;
}

/** The `code` of a network error's cause, such as `ECONNREFUSED`, when there is one. */
function getErrorCode(error: HttpClientError): string {
  const { cause } = error;
  if (typeof cause === 'object' && cause !== null && 'code' in cause) {
    return String(cause.code);
  }
  return 'unknown';
}

/** The reason for a failed slskd call, as the start of the `ApiError` message. */
function describeFailure(error: HttpClientError): string {
  if (error instanceof HttpResponseError) {
    return UNAUTHORIZED_STATUS_CODES.has(error.status)
      ? `slskd rejected the API key, check SLSKD_API_KEY (status=${error.status})`
      : `slskd returned an error (status=${error.status})`;
  }
  if (error instanceof HttpParseError) {
    return 'slskd returned an unexpected response';
  }
  if (error instanceof HttpTimeoutError) {
    return `slskd did not answer in time (timeoutMs=${error.timeoutMs})`;
  }
  return `slskd is unreachable (code=${getErrorCode(error)})`;
}

/**
 * Wraps a failed slskd call in an `ApiError`. A single call failing is a bad gateway (502); only
 * the search as a whole running out of time is a gateway timeout (504). Errors that don't come
 * from the HTTP client pass through.
 */
function toApiError(error: unknown, context: SlskdCallContext): unknown {
  if (error instanceof HttpClientError) {
    return new ApiError(`${describeFailure(error)}: ${describeCall(context)}`, {
      statusCode: HttpStatus.BAD_GATEWAY,
      cause: error,
    });
  }
  return error;
}

/**
 * Searches the Soulseek network through slskd's REST API: starts a search, polls it until slskd
 * marks it complete or SEARCH_TIMEOUT_MS passes, reads the responses and deletes the search again
 * so slskd doesn't accumulate them.
 */
@Injectable()
export class SlskdSearchProvider implements SearchProvider {
  private readonly logger = new Logger(SlskdSearchProvider.name);
  private readonly searchTimeoutMs: number;

  constructor(
    @InjectHttpClient(SLSKD_HTTP_CLIENT) private readonly httpClient: HttpClient,
    configService: ConfigService<Env, true>
  ) {
    this.searchTimeoutMs = configService.get('SEARCH_TIMEOUT_MS', { infer: true });
  }

  async search(searchText: string): Promise<ProviderSearchResult[]> {
    const searchId = await this.startSearch(searchText);
    const context = { searchText, searchId };

    try {
      const isComplete = await this.waitForCompletion(context);
      if (!isComplete) {
        await this.stopSearch(context);
      }
      const responses = await this.fetchResponses(context);

      if (!isComplete && responses.length === 0) {
        throw new ApiError(
          `slskd search timed out without results: ${describeCall({ operation: 'wait', ...context })} timeoutMs=${this.searchTimeoutMs}`,
          { statusCode: HttpStatus.GATEWAY_TIMEOUT }
        );
      }
      return responses.map(toProviderSearchResult);
    } finally {
      await this.deleteSearch(context);
    }
  }

  /**
   * Sends one call to slskd and checks its body against `schema`. A failed request and a body that
   * doesn't match both throw an `ApiError` that names the call.
   */
  private async request<T extends z.ZodType>(
    context: SlskdCallContext,
    schema: T,
    send: () => Promise<HttpResponse>
  ): Promise<z.infer<T>> {
    let response: HttpResponse;
    try {
      response = await send();
    } catch (error) {
      throw toApiError(error, context);
    }
    return parseResponse(schema, response.data, context);
  }

  private async startSearch(searchText: string): Promise<string> {
    // POST is not retried by the client, so a failed request never starts a second search.
    const search = await this.request({ operation: 'create', searchText }, slskdSearchSchema, () =>
      this.httpClient.post(SEARCHES_PATH, { json: { searchText } })
    );
    this.logger.debug({ searchId: search.id, searchText }, 'Started slskd search');
    return search.id;
  }

  /** Resolves `true` once slskd marks the search complete, `false` when the timeout passes first. */
  private async waitForCompletion(context: SearchContext): Promise<boolean> {
    const deadline = Date.now() + this.searchTimeoutMs;

    while (Date.now() < deadline) {
      await sleep(Math.min(POLL_INTERVAL_MS, deadline - Date.now()));
      const search = await this.request({ operation: 'poll', ...context }, slskdSearchSchema, () =>
        this.httpClient.get(SEARCH_PATH, { params: { searchId: context.searchId } })
      );
      if (search.isComplete) {
        return true;
      }
    }
    return false;
  }

  private fetchResponses(context: SearchContext): Promise<SlskdSearchResponse[]> {
    return this.request({ operation: 'responses', ...context }, slskdSearchResponsesSchema, () =>
      this.httpClient.get(`${SEARCH_PATH}/responses`, { params: { searchId: context.searchId } })
    );
  }

  // Stopping and deleting are cleanup. A failure there must not hide the search results or the
  // error that is already on its way to the client, so it is logged instead of thrown.

  private async stopSearch(context: SearchContext): Promise<void> {
    try {
      await this.httpClient.put(SEARCH_PATH, { params: { searchId: context.searchId } });
    } catch (error) {
      this.logger.warn({ err: error, ...context }, 'Failed to stop slskd search');
    }
  }

  private async deleteSearch(context: SearchContext): Promise<void> {
    try {
      await this.httpClient.delete(SEARCH_PATH, { params: { searchId: context.searchId } });
    } catch (error) {
      this.logger.warn({ err: error, ...context }, 'Failed to delete slskd search');
    }
  }
}
