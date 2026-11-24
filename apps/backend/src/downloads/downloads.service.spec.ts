import { ApiError } from '@carlba/core';
import type { DownloadProvider } from '../providers/download-provider.js';
import { DownloadsService } from './downloads.service.js';

describe('DownloadsService', () => {
  const downloadProvider = {
    enqueue: vi.fn<DownloadProvider['enqueue']>(),
    list: vi.fn<DownloadProvider['list']>(),
  };
  const service = new DownloadsService(downloadProvider);

  beforeEach(() => {
    downloadProvider.enqueue.mockReset().mockResolvedValue();
    downloadProvider.list.mockReset().mockResolvedValue([]);
  });

  it('hands the request to the provider and reports the file count and total size', async () => {
    const request = {
      username: 'alice',
      files: [
        { path: 'Music\\Album\\01.flac', size: 30 },
        { path: 'Music\\Album\\cover.jpg', size: 2 },
      ],
    };

    await expect(service.start(request)).resolves.toEqual({
      username: 'alice',
      fileCount: 2,
      totalSize: 32,
    });
    expect(downloadProvider.enqueue).toHaveBeenCalledWith(request);
  });

  it('lets the provider error through when the download is not accepted', async () => {
    const error = new ApiError('slskd is unreachable', { statusCode: 502 });
    downloadProvider.enqueue.mockRejectedValue(error);

    await expect(service.start({ username: 'alice', files: [] })).rejects.toBe(error);
  });

  it('lists the provider downloads grouped by user and folder', async () => {
    downloadProvider.list.mockResolvedValue([
      {
        username: 'alice',
        path: 'Music\\Album\\01.flac',
        size: 10,
        state: 'queued',
        bytesTransferred: 0,
        averageSpeed: 0,
      },
    ]);

    await expect(service.list()).resolves.toMatchObject([
      { username: 'alice', name: 'Album', state: 'downloading' },
    ]);
  });
});
