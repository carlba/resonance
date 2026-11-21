import { Inject, Injectable } from '@nestjs/common';
import { SEARCH_PROVIDER } from '../providers/search-provider.js';
import type { SearchProvider } from '../providers/search-provider.js';
import { toTrackResults, type TrackResult } from './track-mapping.js';

@Injectable()
export class TracksService {
  constructor(@Inject(SEARCH_PROVIDER) private readonly searchProvider: SearchProvider) {}

  async search(searchText: string): Promise<TrackResult[]> {
    const results = await this.searchProvider.search(searchText);
    return toTrackResults(results);
  }
}
