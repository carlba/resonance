import { ApiError } from '@carlba/core';
import type {
  DownloadProvider,
  DownloadStorageOptions,
  ProviderDownloadFile,
} from '../providers/download-provider.js';
import { DownloadsService, getCapabilities } from './downloads.service.js';

const DEFAULT_OPTIONS: DownloadStorageOptions = {
  isFileManagementEnabled: true,
  destinationPattern: '${SOURCE_DIRECTORY}',
};

function buildFile(overrides: Partial<ProviderDownloadFile> = {}): ProviderDownloadFile {
  return {
    id: 'id-1',
    username: 'alice',
    path: 'Music\\Album\\01.flac',
    size: 10,
    state: 'succeeded',
    bytesTransferred: 10,
    averageSpeed: 0,
    ...overrides,
  };
}

describe('getCapabilities', () => {
  it('allows deleting when file management is on and the pattern is supported', () => {
    expect(getCapabilities(DEFAULT_OPTIONS)).toEqual({
      canDelete: true,
      destinationPattern: '${SOURCE_DIRECTORY}',
    });
  });

  it('reports that file management is off', () => {
    expect(getCapabilities({ ...DEFAULT_OPTIONS, isFileManagementEnabled: false })).toMatchObject({
      canDelete: false,
      unavailableReason: 'file-management-disabled',
    });
  });

  it('reports a pattern that depends on how the download was started', () => {
    expect(
      getCapabilities({ ...DEFAULT_OPTIONS, destinationPattern: '${SEARCH_TEXT}/${SOURCE_PATH}' })
    ).toEqual({
      canDelete: false,
      unavailableReason: 'unsupported-destination-pattern',
      destinationPattern: '${SEARCH_TEXT}/${SOURCE_PATH}',
    });
  });

  it('reports file management first when both block deleting', () => {
    expect(
      getCapabilities({ isFileManagementEnabled: false, destinationPattern: '${BATCH_ID}' })
    ).toMatchObject({ unavailableReason: 'file-management-disabled' });
  });
});

describe('DownloadsService', () => {
  const downloadProvider = {
    enqueue: vi.fn<DownloadProvider['enqueue']>(),
    list: vi.fn<DownloadProvider['list']>(),
    getStorageOptions: vi.fn<DownloadProvider['getStorageOptions']>(),
    cancelTransfer: vi.fn<DownloadProvider['cancelTransfer']>(),
    removeTransfer: vi.fn<DownloadProvider['removeTransfer']>(),
    deleteFile: vi.fn<DownloadProvider['deleteFile']>(),
    listDirectory: vi.fn<DownloadProvider['listDirectory']>(),
    deleteDirectory: vi.fn<DownloadProvider['deleteDirectory']>(),
  };
  const service = new DownloadsService(downloadProvider);

  /** Every call to the provider that changes something, in the order it was made. */
  let calls: string[];

  beforeEach(() => {
    calls = [];
    downloadProvider.enqueue.mockReset().mockResolvedValue();
    downloadProvider.list.mockReset().mockResolvedValue([]);
    downloadProvider.getStorageOptions.mockReset().mockResolvedValue(DEFAULT_OPTIONS);
    downloadProvider.cancelTransfer.mockReset().mockImplementation(async ({ id }) => {
      calls.push(`cancel ${id}`);
    });
    downloadProvider.removeTransfer.mockReset().mockImplementation(async ({ id }) => {
      calls.push(`remove ${id}`);
    });
    downloadProvider.deleteFile.mockReset().mockImplementation(async (location, path) => {
      calls.push(`delete-file ${location}:${path}`);
      return 'deleted';
    });
    downloadProvider.listDirectory
      .mockReset()
      .mockResolvedValue({ fileCount: 0, directoryCount: 0 });
    downloadProvider.deleteDirectory.mockReset().mockImplementation(async (location, path) => {
      calls.push(`delete-folder ${location}:${path}`);
    });
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
      buildFile({ state: 'queued', bytesTransferred: 0, size: 10 }),
    ]);

    await expect(service.list()).resolves.toMatchObject([
      { username: 'alice', name: 'Album', state: 'downloading' },
    ]);
  });

  it('reports what deleting is possible from the provider options', async () => {
    downloadProvider.getStorageOptions.mockResolvedValue({
      ...DEFAULT_OPTIONS,
      isFileManagementEnabled: false,
    });

    await expect(service.getCapabilities()).resolves.toMatchObject({
      canDelete: false,
      unavailableReason: 'file-management-disabled',
    });
  });

  describe('delete', () => {
    it('cancels, deletes the files, removes the folders and then the transfers, in that order', async () => {
      downloadProvider.list.mockResolvedValue([
        buildFile({ id: 'running', path: 'Music\\Album\\01.flac', state: 'downloading' }),
        buildFile({ id: 'done', path: 'Music\\Album\\02.flac', state: 'succeeded' }),
      ]);

      const result = await service.delete('alice', 'Music\\Album');

      expect(calls).toEqual([
        'cancel running',
        'delete-file incomplete:alice/Music/Album/01.flac',
        'delete-file downloads:Album/02.flac',
        'delete-folder downloads:Album',
        'delete-folder incomplete:alice/Music/Album',
        'delete-folder incomplete:alice/Music',
        'delete-folder incomplete:alice',
        'remove running',
        'remove done',
      ]);
      expect(result).toEqual({ deletedFiles: 2, missingFiles: 0, removedTransfers: 2 });
    });

    it('cancels only the transfers that are queued or downloading', async () => {
      downloadProvider.list.mockResolvedValue([
        buildFile({ id: 'queued', path: 'Music\\Album\\01.flac', state: 'queued' }),
        buildFile({ id: 'failed', path: 'Music\\Album\\02.flac', state: 'failed' }),
        buildFile({ id: 'done', path: 'Music\\Album\\03.flac', state: 'succeeded' }),
      ]);

      await service.delete('alice', 'Music\\Album');

      expect(downloadProvider.cancelTransfer).toHaveBeenCalledTimes(1);
      expect(downloadProvider.cancelTransfer).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'queued', username: 'alice' })
      );
    });

    it('looks for finished files in the downloads folder and for the rest in the incomplete one', async () => {
      downloadProvider.list.mockResolvedValue([
        buildFile({ id: 'done', path: 'Music\\Album\\01.flac', state: 'succeeded' }),
        buildFile({ id: 'failed', path: 'Music\\Album\\02.flac', state: 'failed' }),
      ]);

      await service.delete('alice', 'Music\\Album');

      expect(downloadProvider.deleteFile).toHaveBeenCalledWith('downloads', 'Album/01.flac');
      expect(downloadProvider.deleteFile).toHaveBeenCalledWith(
        'incomplete',
        'alice/Music/Album/02.flac'
      );
    });

    it('counts a file that is not on disk as missing and still removes the transfer', async () => {
      downloadProvider.list.mockResolvedValue([
        buildFile({ id: 'a', path: 'Music\\Album\\01.flac' }),
        buildFile({ id: 'b', path: 'Music\\Album\\02.flac' }),
      ]);
      downloadProvider.deleteFile.mockResolvedValueOnce('missing').mockResolvedValueOnce('deleted');

      await expect(service.delete('alice', 'Music\\Album')).resolves.toEqual({
        deletedFiles: 1,
        missingFiles: 1,
        removedTransfers: 2,
      });
      expect(downloadProvider.removeTransfer).toHaveBeenCalledTimes(2);
    });

    it('only touches the files of the requested user and folder', async () => {
      downloadProvider.list.mockResolvedValue([
        buildFile({ id: 'mine', username: 'alice', path: 'Music\\Album\\01.flac' }),
        buildFile({ id: 'other-user', username: 'bob', path: 'Music\\Album\\01.flac' }),
        buildFile({ id: 'other-folder', username: 'alice', path: 'Music\\Other\\01.flac' }),
      ]);

      const result = await service.delete('alice', 'Music\\Album');

      expect(result.removedTransfers).toBe(1);
      expect(downloadProvider.removeTransfer).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'mine' })
      );
      expect(downloadProvider.removeTransfer).not.toHaveBeenCalledWith(
        expect.objectContaining({ id: 'other-user' })
      );
    });

    it('deletes the files of every disc folder of an album as one group', async () => {
      downloadProvider.list.mockResolvedValue([
        buildFile({ id: 'cd1', path: 'Music\\Album\\CD1\\01.flac' }),
        buildFile({ id: 'cd2', path: 'Music\\Album\\CD2\\01.flac' }),
      ]);

      const result = await service.delete('alice', 'Music\\Album');

      expect(downloadProvider.deleteFile).toHaveBeenCalledWith('downloads', 'CD1/01.flac');
      expect(downloadProvider.deleteFile).toHaveBeenCalledWith('downloads', 'CD2/01.flac');
      expect(result.deletedFiles).toBe(2);
    });

    it('keeps a folder that still has other files', async () => {
      downloadProvider.list.mockResolvedValue([buildFile({ state: 'succeeded' })]);
      downloadProvider.listDirectory.mockResolvedValue({ fileCount: 1, directoryCount: 0 });

      await service.delete('alice', 'Music\\Album');

      expect(downloadProvider.deleteDirectory).not.toHaveBeenCalled();
      expect(downloadProvider.removeTransfer).toHaveBeenCalledTimes(1);
    });

    it('keeps a folder that still has a sub-folder', async () => {
      downloadProvider.list.mockResolvedValue([buildFile({ state: 'succeeded' })]);
      downloadProvider.listDirectory.mockResolvedValue({ fileCount: 0, directoryCount: 1 });

      await service.delete('alice', 'Music\\Album');

      expect(downloadProvider.deleteDirectory).not.toHaveBeenCalled();
    });

    it('skips a folder that is already gone', async () => {
      downloadProvider.list.mockResolvedValue([buildFile({ state: 'succeeded' })]);
      downloadProvider.listDirectory.mockResolvedValue(undefined);

      await service.delete('alice', 'Music\\Album');

      expect(downloadProvider.deleteDirectory).not.toHaveBeenCalled();
    });

    it('never removes the root of the downloads folder', async () => {
      downloadProvider.getStorageOptions.mockResolvedValue({
        ...DEFAULT_OPTIONS,
        destinationPattern: '{}',
      });
      downloadProvider.list.mockResolvedValue([buildFile({ state: 'succeeded' })]);

      await service.delete('alice', 'Music\\Album');

      expect(downloadProvider.listDirectory).not.toHaveBeenCalledWith(
        'downloads',
        expect.anything()
      );
      expect(downloadProvider.deleteDirectory).not.toHaveBeenCalledWith(
        'downloads',
        expect.anything()
      );
    });

    it('keeps two albums with the same folder name apart when the pattern has the username', async () => {
      downloadProvider.getStorageOptions.mockResolvedValue({
        ...DEFAULT_OPTIONS,
        destinationPattern: '${SOURCE_USERNAME}/${SOURCE_DIRECTORY}',
      });
      downloadProvider.list.mockResolvedValue([
        buildFile({ id: 'a', username: 'alice', path: 'Music\\Album\\01.flac' }),
        buildFile({ id: 'b', username: 'bob', path: 'Rips\\Album\\01.flac' }),
      ]);

      await service.delete('bob', 'Rips\\Album');

      expect(downloadProvider.deleteFile).toHaveBeenCalledTimes(1);
      expect(downloadProvider.deleteFile).toHaveBeenCalledWith('downloads', 'bob/Album/01.flac');
    });

    it('stops before removing the transfers when a file cannot be deleted', async () => {
      const cause = new ApiError('slskd denied the request', { statusCode: 502 });
      downloadProvider.list.mockResolvedValue([
        buildFile({ id: 'a', path: 'Music\\Album\\01.flac' }),
        buildFile({ id: 'b', path: 'Music\\Album\\02.flac' }),
      ]);
      downloadProvider.deleteFile.mockResolvedValueOnce('deleted').mockRejectedValueOnce(cause);

      const failure = await service
        .delete('alice', 'Music\\Album')
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ApiError);
      expect((failure as ApiError).statusCode).toBe(502);
      expect((failure as ApiError).message).toContain('username=alice');
      expect((failure as ApiError).message).toContain('directory=Music\\Album');
      expect((failure as ApiError).message).toContain('path=Album/02.flac');
      expect((failure as ApiError).cause).toBe(cause);
      expect(downloadProvider.removeTransfer).not.toHaveBeenCalled();
      expect(downloadProvider.deleteDirectory).not.toHaveBeenCalled();
    });

    it('answers 500 when a failure carries no status', async () => {
      downloadProvider.list.mockResolvedValue([buildFile()]);
      downloadProvider.deleteFile.mockRejectedValue(new Error('disk on fire'));

      await expect(service.delete('alice', 'Music\\Album')).rejects.toMatchObject({
        statusCode: 500,
      });
      expect(downloadProvider.removeTransfer).not.toHaveBeenCalled();
    });

    it('stops before removing the transfers when a folder cannot be removed', async () => {
      downloadProvider.list.mockResolvedValue([buildFile()]);
      downloadProvider.deleteDirectory.mockRejectedValue(
        new ApiError('slskd denied the request', { statusCode: 502 })
      );

      await expect(service.delete('alice', 'Music\\Album')).rejects.toMatchObject({
        statusCode: 502,
        message: expect.stringContaining('path=Album'),
      });
      expect(downloadProvider.removeTransfer).not.toHaveBeenCalled();
    });

    it('stops before deleting anything when a transfer cannot be cancelled', async () => {
      downloadProvider.list.mockResolvedValue([buildFile({ state: 'downloading' })]);
      downloadProvider.cancelTransfer.mockRejectedValue(
        new ApiError('slskd is unreachable', { statusCode: 502 })
      );

      await expect(service.delete('alice', 'Music\\Album')).rejects.toMatchObject({
        statusCode: 502,
      });
      expect(downloadProvider.deleteFile).not.toHaveBeenCalled();
      expect(downloadProvider.removeTransfer).not.toHaveBeenCalled();
    });

    it('answers 409 and touches nothing when remote file management is off', async () => {
      downloadProvider.getStorageOptions.mockResolvedValue({
        ...DEFAULT_OPTIONS,
        isFileManagementEnabled: false,
      });

      await expect(service.delete('alice', 'Music\\Album')).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining('file-management-disabled'),
      });
      expect(downloadProvider.list).not.toHaveBeenCalled();
      expect(calls).toEqual([]);
    });

    it('answers 409 and touches nothing when the destination pattern is not supported', async () => {
      downloadProvider.getStorageOptions.mockResolvedValue({
        ...DEFAULT_OPTIONS,
        destinationPattern: '${BATCH_ID}/${SOURCE_DIRECTORY}',
      });

      await expect(service.delete('alice', 'Music\\Album')).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining('${BATCH_ID}'),
      });
      expect(calls).toEqual([]);
    });

    it('answers 404 when no download matches the user and folder', async () => {
      downloadProvider.list.mockResolvedValue([buildFile({ username: 'bob' })]);

      await expect(service.delete('alice', 'Music\\Album')).rejects.toMatchObject({
        statusCode: 404,
        message: 'Download not found: username=alice directory=Music\\Album',
      });
      expect(calls).toEqual([]);
    });
  });
});
