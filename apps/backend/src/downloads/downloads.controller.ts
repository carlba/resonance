import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { decodeDirectory, DeleteDownloadParamsDto } from './delete-download.dto.js';
import type { DownloadGroup } from './download-grouping.js';
import { StartDownloadDto } from './start-download.dto.js';
import {
  DownloadsService,
  type DeletedDownload,
  type DownloadCapabilities,
  type StartedDownload,
} from './downloads.service.js';

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

  @Get('capabilities')
  getCapabilities(): Promise<DownloadCapabilities> {
    return this.downloadsService.getCapabilities();
  }

  @Delete(':username/:directory')
  delete(@Param() { username, directory }: DeleteDownloadParamsDto): Promise<DeletedDownload> {
    return this.downloadsService.delete(username, decodeDirectory(directory));
  }
}
