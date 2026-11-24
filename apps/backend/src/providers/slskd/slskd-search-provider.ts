import { ApiError } from '@carlba/core';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpClient, InjectHttpClient, type HttpResponse } from '@nestjs/http-client';
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
import { requestSlskd } from './slskd-request.js';

/** Name of the `HttpClient` registered for slskd in `ProvidersModule`. */
export const SLSKD_HTTP_CLIENT = 'slskd';

const SEARCHES_PATH = 'api/v0/searches';
const SEARCH_PATH = `${SEARCHES_PATH}/:searchId`;
const POLL_INTERVAL_MS = 500;

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

  private request<T extends z.ZodType>(
    context: SlskdCallContext,
    schema: T,
    send: () => Promise<HttpResponse>
  ): Promise<z.infer<T>> {
    return requestSlskd(describeCall(context), schema, send);
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
