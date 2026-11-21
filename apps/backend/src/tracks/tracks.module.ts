import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module.js';
import { TracksController } from './tracks.controller.js';
import { TracksService } from './tracks.service.js';

@Module({
  imports: [ProvidersModule],
  controllers: [TracksController],
  providers: [TracksService],
})
export class TracksModule {}
