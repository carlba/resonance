import { ApiError } from '@carlba/core';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { HttpClient, InjectHttpClient } from '@nestjs/http-client';
import type {
  DeleteFileOutcome,
  DirectoryContents,
  DownloadProvider,
  DownloadRequest,
  DownloadStorageOptions,
  ProviderDownloadFile,
  StorageLocation,
  TransferReference,
} from '../download-provider.js';
import {
  slskdDirectorySchema,
  slskdDownloadsSchema,
  slskdEnqueueResponseSchema,
  slskdOptionsSchema,
  toProviderDownloadFiles,
} from './slskd-download-api.js';
import { hasSlskdStatus, requestSlskd, sendSlskd } from './slskd-request.js';
import { SLSKD_HTTP_CLIENT } from './slskd-search-provider.js';

const DOWNLOADS_PATH = 'api/v0/transfers/downloads';
const USER_DOWNLOADS_PATH = `${DOWNLOADS_PATH}/:username`;
const TRANSFER_PATH = `${USER_DOWNLOADS_PATH}/:id`;
const OPTIONS_PATH = 'api/v0/options';
const FILE_PATH = 'api/v0/files/:location/files/:encodedPath';
const DIRECTORY_PATH = 'api/v0/files/:location/directories/:encodedPath';

const NOT_FOUND_STATUS = HttpStatus.NOT_FOUND;
const FORBIDDEN_STATUS = HttpStatus.FORBIDDEN;

/** slskd takes the relative path of a file or folder as standard base64 of its UTF-8 bytes. */
function encodePath(relativePath: string): string {
  return Buffer.from(relativePath, 'utf8').toString('base64');
}

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

  async getStorageOptions(): Promise<DownloadStorageOptions> {
    const description = 'operation=getOptions';
    const options = await requestSlskd(description, slskdOptionsSchema, () =>
      this.httpClient.get(OPTIONS_PATH)
    ).catch((error: unknown) => {
      // A valid key without the administrator role gets a 403 here (slskd up to 0.26 at least),
      // which the generic message would blame on the key itself.
      if (hasSlskdStatus(error, HttpStatus.FORBIDDEN)) {
        throw new ApiError(
          `slskd refused to share its options, the API key needs the administrator role (status=403): ${description}`,
          { statusCode: HttpStatus.BAD_GATEWAY, cause: error }
        );
      }
      throw error;
    });
    return {
      isFileManagementEnabled: options.remoteFileManagement,
      destinationPattern: options.transfers.download.destination.subdirectory,
    };
  }

  async cancelTransfer({ username, id }: TransferReference): Promise<void> {
    await this.deleteTransfer({ username, id }, { remove: false });
  }

  async removeTransfer({ username, id }: TransferReference): Promise<void> {
    await this.deleteTransfer({ username, id }, { remove: true });
  }

  async deleteFile(location: StorageLocation, relativePath: string): Promise<DeleteFileOutcome> {
    const description = `operation=deleteFile location=${location} path=${relativePath}`;
    try {
      await sendSlskd(description, () =>
        this.httpClient.delete(FILE_PATH, {
          params: { location, encodedPath: encodePath(relativePath) },
        })
      );
      return 'deleted';
    } catch (error) {
      if (hasSlskdStatus(error, NOT_FOUND_STATUS)) {
        return 'missing';
      }
      throw this.explainForbidden(error, description);
    }
  }

  async listDirectory(
    location: StorageLocation,
    relativePath: string
  ): Promise<DirectoryContents | undefined> {
    const description = `operation=listDirectory location=${location} path=${relativePath}`;
    try {
      const directory = await requestSlskd(description, slskdDirectorySchema, () =>
        this.httpClient.get(DIRECTORY_PATH, {
          params: { location, encodedPath: encodePath(relativePath) },
        })
      );
      return {
        fileCount: directory.files?.length ?? 0,
        directoryCount: directory.directories?.length ?? 0,
      };
    } catch (error) {
      if (hasSlskdStatus(error, NOT_FOUND_STATUS)) {
        return undefined;
      }
      throw error;
    }
  }

  async deleteDirectory(location: StorageLocation, relativePath: string): Promise<void> {
    const description = `operation=deleteDirectory location=${location} path=${relativePath}`;
    try {
      await sendSlskd(description, () =>
        this.httpClient.delete(DIRECTORY_PATH, {
          params: { location, encodedPath: encodePath(relativePath) },
        })
      );
    } catch (error) {
      if (!hasSlskdStatus(error, NOT_FOUND_STATUS)) {
        throw this.explainForbidden(error, description);
      }
    }
  }

  /** Cancels a transfer, and with `remove` also takes it off the list; a 404 means it is gone. */
  private async deleteTransfer(
    { username, id }: TransferReference,
    { remove }: { remove: boolean }
  ): Promise<void> {
    const operation = remove ? 'removeTransfer' : 'cancelTransfer';
    try {
      await sendSlskd(`operation=${operation} username=${username} id=${id}`, () =>
        this.httpClient.delete(TRANSFER_PATH, {
          params: { username, id },
          query: { remove },
        })
      );
    } catch (error) {
      if (!hasSlskdStatus(error, NOT_FOUND_STATUS)) {
        throw error;
      }
    }
  }

  /**
   * slskd answers a file call with 403 when `remote_file_management` is off, which the generic
   * message would blame on the API key.
   */
  private explainForbidden(error: unknown, description: string): unknown {
    if (!hasSlskdStatus(error, FORBIDDEN_STATUS)) {
      return error;
    }
    return new ApiError(
      `slskd refused to manage files, enable remote_file_management in slskd (status=${FORBIDDEN_STATUS}): ${description}`,
      { statusCode: HttpStatus.BAD_GATEWAY, cause: error }
    );
  }
}
