import { Inject, Injectable } from '@nestjs/common';
import { SEARCH_PROVIDER } from '../providers/search-provider.js';
import type { SearchProvider } from '../providers/search-provider.js';
import { toTrackResults } from '../tracks/track-mapping.js';
import { groupTracksIntoAlbums, type AlbumResult } from './album-grouping.js';

@Injectable()
export class AlbumsService {
  constructor(@Inject(SEARCH_PROVIDER) private readonly searchProvider: SearchProvider) {}

  // slskd has no notion of an album, so albums are built from the same file search as tracks.
  async search(searchText: string): Promise<AlbumResult[]> {
    const results = await this.searchProvider.search(searchText);
    return groupTracksIntoAlbums(toTrackResults(results));
  }
}
