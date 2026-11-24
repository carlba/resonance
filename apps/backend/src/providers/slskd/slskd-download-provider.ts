import { ApiError } from '@carlba/core';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { HttpClient, InjectHttpClient } from '@nestjs/http-client';
import type {
  DownloadProvider,
  DownloadRequest,
  ProviderDownloadFile,
} from '../download-provider.js';
import {
  slskdDownloadsSchema,
  slskdEnqueueResponseSchema,
  toProviderDownloadFiles,
} from './slskd-download-api.js';
import { requestSlskd } from './slskd-request.js';
import { SLSKD_HTTP_CLIENT } from './slskd-search-provider.js';

const DOWNLOADS_PATH = 'api/v0/transfers/downloads';
const USER_DOWNLOADS_PATH = `${DOWNLOADS_PATH}/:username`;

/** Downloads through slskd's transfers API. slskd holds all state; nothing is stored here. */
@Injectable()
export class SlskdDownloadProvider implements DownloadProvider {
  private readonly logger = new Logger(SlskdDownloadProvider.name);

  constructor(@InjectHttpClient(SLSKD_HTTP_CLIENT) private readonly httpClient: HttpClient) {}

  async enqueue({ username, files }: DownloadRequest): Promise<void> {
    const description = `operation=enqueue username=${username} fileCount=${files.length}`;
    // slskd wants the full remote path as `filename`. POST is not retried by the client, so a
    // failed request never enqueues the files twice.
    const response = await requestSlskd(description, slskdEnqueueResponseSchema, () =>
      this.httpClient.post(USER_DOWNLOADS_PATH, {
        params: { username },
        json: files.map(({ path, size }) => ({ filename: path, size })),
      })
    );

    const rejectedCount = response.failed.length;
    if (rejectedCount > 0) {
      // The files slskd did accept stay in its transfers, so they show up as downloads even
      // though the caller is told the request failed.
      this.logger.warn({ username, rejected: response.failed }, 'slskd rejected some files');
      throw new ApiError(
        `slskd rejected some of the files: ${description} rejectedCount=${rejectedCount}`,
        {
          statusCode: HttpStatus.BAD_GATEWAY,
        }
      );
    }
    this.logger.debug({ username, fileCount: files.length }, 'Enqueued slskd downloads');
  }

  async list(): Promise<ProviderDownloadFile[]> {
    const usersTransfers = await requestSlskd('operation=list', slskdDownloadsSchema, () =>
      this.httpClient.get(DOWNLOADS_PATH)
    );
    return toProviderDownloadFiles(usersTransfers);
  }
}
