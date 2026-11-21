import { Controller, Get, Query } from '@nestjs/common';
import type { AlbumResult } from './album-grouping.js';
import { AlbumsService } from './albums.service.js';
import { SearchAlbumsQueryDto } from './search-albums-query.dto.js';

@Controller('albums')
export class AlbumsController {
  constructor(private readonly albumsService: AlbumsService) {}

  @Get()
  search(@Query() query: SearchAlbumsQueryDto): Promise<AlbumResult[]> {
    return this.albumsService.search(query.q);
  }
}
