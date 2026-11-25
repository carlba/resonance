import { ApiError } from '@carlba/core';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { getAlbumDirectory } from '../albums/album-grouping.js';
import { DOWNLOAD_PROVIDER } from '../providers/download-provider.js';
import type {
  DownloadProvider,
  DownloadRequest,
  DownloadStorageOptions,
  ProviderDownloadFile,
  StorageLocation,
} from '../providers/download-provider.js';
import { groupDownloads, type DownloadGroup } from './download-grouping.js';
import {
  checkDestinationPattern,
  getDownloadedFilePath,
  getFoldersToClean,
  getIncompleteFilePath,
} from './local-paths.js';

/** What the provider accepted. */
export interface StartedDownload {
  username: string;
  fileCount: number;
  /** Combined size of the files in bytes. */
  totalSize: number;
}

/** Why deleting downloads is not possible with the provider's current settings. */
export type DeleteUnavailableReason =
  'file-management-disabled' | 'unsupported-destination-pattern';

export interface DownloadCapabilities {
  canDelete: boolean;
  /** Set when `canDelete` is false. */
  unavailableReason?: DeleteUnavailableReason;
  /** The provider's destination pattern, so the UI can name it when it is not supported. */
  destinationPattern: string;
}

/** What deleting a download group did. */
export interface DeletedDownload {
  /** Files that were on disk and are gone now. */
  deletedFiles: number;
  /** Files that were not on disk any more, e.g. moved or removed by hand. */
  missingFiles: number;
  /** Transfers removed from the provider's list. */
  removedTransfers: number;
}

/** A file to delete, in the folder of the provider it lives in. */
interface FileToDelete {
  location: StorageLocation;
  /** `undefined` when the remote path has no file name, so nothing can be on disk. */
  relativePath?: string;
}

export function getCapabilities({
  isFileManagementEnabled,
  destinationPattern,
}: DownloadStorageOptions): DownloadCapabilities {
  if (!isFileManagementEnabled) {
    return { canDelete: false, unavailableReason: 'file-management-disabled', destinationPattern };
  }
  if (!checkDestinationPattern(destinationPattern).isSupported) {
    return {
      canDelete: false,
      unavailableReason: 'unsupported-destination-pattern',
      destinationPattern,
    };
  }
  return { canDelete: true, destinationPattern };
}

function isActive(file: ProviderDownloadFile): boolean {
  return file.state === 'queued' || file.state === 'downloading';
}

@Injectable()
export class DownloadsService {
  constructor(@Inject(DOWNLOAD_PROVIDER) private readonly downloadProvider: DownloadProvider) {}

  async start(request: DownloadRequest): Promise<StartedDownload> {
    // Throws unless the provider accepted every file, so the counts below are the accepted ones.
    await this.downloadProvider.enqueue(request);
    return {
      username: request.username,
      fileCount: request.files.length,
      totalSize: request.files.reduce((total, file) => total + file.size, 0),
    };
  }

  // The provider is the source of truth, so every call reads its downloads again.
  async list(): Promise<DownloadGroup[]> {
    return groupDownloads(await this.downloadProvider.list());
  }

  async getCapabilities(): Promise<DownloadCapabilities> {
    return getCapabilities(await this.downloadProvider.getStorageOptions());
  }

  /**
   * Deletes one group of downloads: cancels what is still running, deletes the files from disk,
   * removes the folders that leaves empty, and only then takes the transfers off the provider's
   * list. Any failure before that last step throws and leaves the group listed, so the deletion
   * can be retried instead of leaving files on disk that nothing points to.
   */
  async delete(username: string, directory: string): Promise<DeletedDownload> {
    const description = `username=${username} directory=${directory}`;
    const options = await this.downloadProvider.getStorageOptions();
    const capabilities = getCapabilities(options);
    if (!capabilities.canDelete) {
      throw new ApiError(
        `Deleting downloads is not available (${capabilities.unavailableReason}): ${description} destinationPattern=${options.destinationPattern}`,
        { statusCode: HttpStatus.CONFLICT }
      );
    }

    const files = (await this.downloadProvider.list()).filter(
      file => file.username === username && getAlbumDirectory(file.path) === directory
    );
    if (files.length === 0) {
      throw new ApiError(`Download not found: ${description}`, {
        statusCode: HttpStatus.NOT_FOUND,
      });
    }

    for (const file of files.filter(isActive)) {
      await this.downloadProvider.cancelTransfer(file);
    }

    const filesToDelete = files.map(file => toFileToDelete(file, options.destinationPattern));
    const { deletedFiles, missingFiles } = await this.deleteFiles(filesToDelete, description);
    await this.removeEmptyFolders(filesToDelete, description);

    for (const file of files) {
      await this.downloadProvider.removeTransfer(file);
    }
    return { deletedFiles, missingFiles, removedTransfers: files.length };
  }

  private async deleteFiles(
    files: readonly FileToDelete[],
    description: string
  ): Promise<Pick<DeletedDownload, 'deletedFiles' | 'missingFiles'>> {
    let deletedFiles = 0;
    for (const { location, relativePath } of files) {
      if (relativePath === undefined) {
        continue;
      }
      try {
        const outcome = await this.downloadProvider.deleteFile(location, relativePath);
        deletedFiles += outcome === 'deleted' ? 1 : 0;
      } catch (error) {
        throw new ApiError(
          `Failed to delete file: ${description} location=${location} path=${relativePath}`,
          { statusCode: getFailureStatus(error), cause: error }
        );
      }
    }
    return { deletedFiles, missingFiles: files.length - deletedFiles };
  }

  /** Removes each folder the files were in, deepest first, unless something is still in it. */
  private async removeEmptyFolders(
    files: readonly FileToDelete[],
    description: string
  ): Promise<void> {
    for (const location of ['downloads', 'incomplete'] as const) {
      const paths = files
        .filter(file => file.location === location && file.relativePath !== undefined)
        .map(file => file.relativePath ?? '');
      for (const folder of getFoldersToClean(paths)) {
        try {
          const contents = await this.downloadProvider.listDirectory(location, folder);
          const isEmpty =
            contents !== undefined && contents.fileCount + contents.directoryCount === 0;
          if (isEmpty) {
            await this.downloadProvider.deleteDirectory(location, folder);
          }
        } catch (error) {
          throw new ApiError(
            `Failed to remove folder: ${description} location=${location} path=${folder}`,
            { statusCode: getFailureStatus(error), cause: error }
          );
        }
      }
    }
  }
}

/** Finished files are in the downloads folder; everything else can only have a partial file. */
function toFileToDelete(file: ProviderDownloadFile, destinationPattern: string): FileToDelete {
  return file.state === 'succeeded'
    ? {
        location: 'downloads',
        relativePath: getDownloadedFilePath(destinationPattern, file.username, file.path),
      }
    : { location: 'incomplete', relativePath: getIncompleteFilePath(file.username, file.path) };
}

function getFailureStatus(error: unknown): number {
  return error instanceof ApiError ? error.statusCode : HttpStatus.INTERNAL_SERVER_ERROR;
}
