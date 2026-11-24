import { Inject, Injectable } from '@nestjs/common';
import { DOWNLOAD_PROVIDER } from '../providers/download-provider.js';
import type { DownloadProvider, DownloadRequest } from '../providers/download-provider.js';
import { groupDownloads, type DownloadGroup } from './download-grouping.js';

/** What the provider accepted. */
export interface StartedDownload {
  username: string;
  fileCount: number;
  /** Combined size of the files in bytes. */
  totalSize: number;
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
}
