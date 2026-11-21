import { ApiError } from '@carlba/core';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { SEARCH_PROVIDER, type SearchProvider } from '../src/providers/search-provider.js';

const AVAILABILITY = { hasFreeUploadSlot: true, queueLength: 0, uploadSpeed: 1_000_000 };

describe('AppModule (e2e)', () => {
  let app: INestApplication<App>;
  const searchProvider = { search: vi.fn<SearchProvider['search']>() };

  beforeEach(async () => {
    searchProvider.search.mockReset();

    // slskd isn't reachable in tests, so the provider is replaced; the env vars it would read are
    // set in vitest.config.e2e.ts.
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SEARCH_PROVIDER)
      .useValue(searchProvider)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET / returns the greeting', () => {
    return request(app.getHttpServer()).get('/').expect(200).expect('Hello World!');
  });

  it('GET on an unknown route answers 404 through the exception filter', async () => {
    const response = await request(app.getHttpServer()).get('/does-not-exist').expect(404);

    expect(response.body).toMatchObject({ statusCode: 404 });
  });

  describe('GET /tracks', () => {
    it('returns every file found by the provider, audio or not', async () => {
      searchProvider.search.mockResolvedValue([
        {
          username: 'alice',
          availability: AVAILABILITY,
          files: [
            { path: 'Music\\Artist\\01 - Song.flac', size: 30_000_000, bitDepth: 16 },
            { path: 'Music\\Artist\\cover.jpg', size: 200_000 },
          ],
        },
      ]);

      const response = await request(app.getHttpServer())
        .get('/tracks')
        .query({ q: '  Daft Punk  ' })
        .expect(200);

      expect(searchProvider.search).toHaveBeenCalledWith('Daft Punk');
      expect(response.body).toEqual([
        {
          filename: '01 - Song.flac',
          path: 'Music\\Artist\\01 - Song.flac',
          username: 'alice',
          extension: 'flac',
          size: 30_000_000,
          bitDepth: 16,
          availability: AVAILABILITY,
        },
        {
          filename: 'cover.jpg',
          path: 'Music\\Artist\\cover.jpg',
          username: 'alice',
          extension: 'jpg',
          size: 200_000,
          availability: AVAILABILITY,
        },
      ]);
    });

    it.each([
      ['missing', {}],
      ['empty', { q: '' }],
      ['only whitespace', { q: '   ' }],
      ['too long', { q: 'a'.repeat(201) }],
    ])('rejects a %s q with 400', async (_case, query) => {
      const response = await request(app.getHttpServer()).get('/tracks').query(query).expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringMatching(/^q must/)])
      );
      expect(searchProvider.search).not.toHaveBeenCalled();
    });

    it('rejects an unknown query parameter with 400', async () => {
      const response = await request(app.getHttpServer())
        .get('/tracks')
        .query({ q: 'Daft Punk', page: '2' })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining(['property page should not exist'])
      );
    });

    it.each([
      [502, 'slskd is unreachable: operation=create searchText="Daft Punk" code=ECONNREFUSED'],
      [504, 'slskd search timed out without results: searchText="Daft Punk"'],
    ])('answers %d when the provider fails with it', async (statusCode, message) => {
      searchProvider.search.mockRejectedValue(new ApiError(message, { statusCode }));

      const response = await request(app.getHttpServer())
        .get('/tracks')
        .query({ q: 'Daft Punk' })
        .expect(statusCode);

      // The filter hides the details of 5xx errors from clients; they are only logged.
      expect(response.body).toEqual({ statusCode, message: 'Internal server error' });
    });
  });

  describe('GET /albums', () => {
    it('returns the files found by the provider grouped into albums', async () => {
      searchProvider.search.mockResolvedValue([
        {
          username: 'alice',
          availability: AVAILABILITY,
          files: [
            {
              path: 'Music\\Daft Punk - Discovery (2001)\\CD1\\01 - One.flac',
              size: 300,
              bitRate: 1000,
            },
            {
              path: 'Music\\Daft Punk - Discovery (2001)\\CD2\\01 - Two.flac',
              size: 200,
              bitRate: 1000,
            },
            { path: 'Music\\Daft Punk - Discovery (2001)\\cover.jpg', size: 10 },
          ],
        },
      ]);

      const response = await request(app.getHttpServer())
        .get('/albums')
        .query({ q: '  Daft Punk Discovery  ' })
        .expect(200);

      expect(searchProvider.search).toHaveBeenCalledWith('Daft Punk Discovery');
      expect(response.body).toEqual([
        {
          username: 'alice',
          directory: 'Music\\Daft Punk - Discovery (2001)',
          artist: 'Daft Punk',
          album: 'Discovery',
          year: 2001,
          trackCount: 2,
          totalSize: 510,
          dominantExtension: 'flac',
          dominantBitRate: 1000,
          availability: AVAILABILITY,
          tracks: [
            expect.objectContaining({
              path: 'Music\\Daft Punk - Discovery (2001)\\CD1\\01 - One.flac',
            }),
            expect.objectContaining({
              path: 'Music\\Daft Punk - Discovery (2001)\\CD2\\01 - Two.flac',
            }),
            expect.objectContaining({ path: 'Music\\Daft Punk - Discovery (2001)\\cover.jpg' }),
          ],
        },
      ]);
    });

    it.each([
      ['missing', {}],
      ['empty', { q: '' }],
      ['only whitespace', { q: '   ' }],
      ['too long', { q: 'a'.repeat(201) }],
    ])('rejects a %s q with 400', async (_case, query) => {
      const response = await request(app.getHttpServer()).get('/albums').query(query).expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([expect.stringMatching(/^q must/)])
      );
      expect(searchProvider.search).not.toHaveBeenCalled();
    });

    it('rejects an unknown query parameter with 400', async () => {
      const response = await request(app.getHttpServer())
        .get('/albums')
        .query({ q: 'Daft Punk', page: '2' })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining(['property page should not exist'])
      );
    });

    it('answers with the status of a provider ApiError', async () => {
      searchProvider.search.mockRejectedValue(
        new ApiError('slskd is unreachable: searchText="Daft Punk"', { statusCode: 502 })
      );

      const response = await request(app.getHttpServer())
        .get('/albums')
        .query({ q: 'Daft Punk' })
        .expect(502);

      expect(response.body).toEqual({ statusCode: 502, message: 'Internal server error' });
    });
  });
});
