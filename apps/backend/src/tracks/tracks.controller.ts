import { Controller, Get, Query } from '@nestjs/common';
import { SearchTracksQueryDto } from './search-tracks-query.dto.js';
import type { TrackResult } from './track-mapping.js';
import { TracksService } from './tracks.service.js';

@Controller('tracks')
export class TracksController {
  constructor(private readonly tracksService: TracksService) {}

  @Get()
  search(@Query() query: SearchTracksQueryDto): Promise<TrackResult[]> {
    return this.tracksService.search(query.q);
  }
}
