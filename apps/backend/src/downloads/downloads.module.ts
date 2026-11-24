import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module.js';
import { DownloadsController } from './downloads.controller.js';
import { DownloadsService } from './downloads.service.js';

@Module({
  imports: [ProvidersModule],
  controllers: [DownloadsController],
  providers: [DownloadsService],
})
export class DownloadsModule {}
