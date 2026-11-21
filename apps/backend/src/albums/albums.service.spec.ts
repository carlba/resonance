import { ApiError } from '@carlba/core';
import type { SearchProvider } from '../providers/search-provider.js';
import { AlbumsService } from './albums.service.js';

const AVAILABILITY = { hasFreeUploadSlot: true, queueLength: 0, uploadSpeed: 1_000_000 };

describe('AlbumsService', () => {
  const searchProvider = { search: vi.fn<SearchProvider['search']>() };
  const service = new AlbumsService(searchProvider);

  beforeEach(() => {
    searchProvider.search.mockReset();
  });

  it('searches the provider with the search text', async () => {
    searchProvider.search.mockResolvedValue([]);

    await service.search('Daft Punk Discovery');

    expect(searchProvider.search).toHaveBeenCalledWith('Daft Punk Discovery');
  });

  it('groups the audio files of every result into albums', async () => {
    searchProvider.search.mockResolvedValue([
      {
        username: 'alice',
        availability: AVAILABILITY,
        files: [
          { path: 'Music\\Daft Punk - Discovery (2001)\\02 - Aerodynamic.flac', size: 200 },
          { path: 'Music\\Daft Punk - Discovery (2001)\\01 - One More Time.flac', size: 300 },
          { path: 'Music\\Daft Punk - Discovery (2001)\\folder.jpg', size: 10 },
        ],
      },
      {
        username: 'bob',
        availability: AVAILABILITY,
        files: [
          { path: 'music/Daft Punk/Discovery/01 - One More Time.mp3', size: 50, bitRate: 320 },
        ],
      },
    ]);

    const albums = await service.search('query');

    expect(albums).toEqual([
      expect.objectContaining({
        username: 'alice',
        artist: 'Daft Punk',
        album: 'Discovery',
        year: 2001,
        trackCount: 2,
        totalSize: 500,
        dominantExtension: 'flac',
        tracks: [
          expect.objectContaining({ filename: '01 - One More Time.flac' }),
          expect.objectContaining({ filename: '02 - Aerodynamic.flac' }),
        ],
      }),
      expect.objectContaining({
        username: 'bob',
        artist: 'Daft Punk',
        album: 'Discovery',
        trackCount: 1,
        dominantBitRate: 320,
      }),
    ]);
  });

  it('returns no albums when no result holds audio files', async () => {
    searchProvider.search.mockResolvedValue([
      {
        username: 'alice',
        availability: AVAILABILITY,
        files: [{ path: 'A\\cover.jpg', size: 10 }],
      },
    ]);

    await expect(service.search('query')).resolves.toEqual([]);
  });

  it('passes provider errors through', async () => {
    const error = new ApiError('slskd is unreachable', { statusCode: 502 });
    searchProvider.search.mockRejectedValue(error);

    await expect(service.search('query')).rejects.toBe(error);
  });
});
