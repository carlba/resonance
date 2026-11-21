import { ApiError } from '@carlba/core';
import type { SearchProvider } from '../providers/search-provider.js';
import { TracksService } from './tracks.service.js';

const AVAILABILITY = { hasFreeUploadSlot: true, queueLength: 0, uploadSpeed: 1_000_000 };

describe('TracksService', () => {
  const searchProvider = { search: vi.fn<SearchProvider['search']>() };
  const service = new TracksService(searchProvider);

  beforeEach(() => {
    searchProvider.search.mockReset();
  });

  it('searches the provider with the search text', async () => {
    searchProvider.search.mockResolvedValue([]);

    await service.search('Daft Punk');

    expect(searchProvider.search).toHaveBeenCalledWith('Daft Punk');
  });

  it('returns the audio files of every result as tracks', async () => {
    searchProvider.search.mockResolvedValue([
      {
        username: 'alice',
        availability: AVAILABILITY,
        files: [
          { path: 'Music\\Album\\01 - One.flac', size: 100 },
          { path: 'Music\\Album\\folder.jpg', size: 10 },
        ],
      },
      {
        username: 'bob',
        availability: AVAILABILITY,
        files: [{ path: 'Music/02 - Two.mp3', size: 50, bitRate: 320 }],
      },
    ]);

    const tracks = await service.search('query');

    expect(tracks).toEqual([
      expect.objectContaining({ filename: '01 - One.flac', username: 'alice', extension: 'flac' }),
      expect.objectContaining({ filename: '02 - Two.mp3', username: 'bob', bitRate: 320 }),
    ]);
  });

  it('passes provider errors through', async () => {
    const error = new ApiError('slskd is unreachable', { statusCode: 502 });
    searchProvider.search.mockRejectedValue(error);

    await expect(service.search('query')).rejects.toBe(error);
  });
});
