import { Body, Controller, Get, Post } from '@nestjs/common';
import type { DownloadGroup } from './download-grouping.js';
import { StartDownloadDto } from './start-download.dto.js';
import { DownloadsService, type StartedDownload } from './downloads.service.js';

@Controller('downloads')
export class DownloadsController {
  constructor(private readonly downloadsService: DownloadsService) {}

  @Post()
  start(@Body() body: StartDownloadDto): Promise<StartedDownload> {
    return this.downloadsService.start(body);
  }

  @Get()
  list(): Promise<DownloadGroup[]> {
    return this.downloadsService.list();
  }
}
