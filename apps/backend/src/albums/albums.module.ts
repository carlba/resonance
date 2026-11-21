import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module.js';
import { AlbumsController } from './albums.controller.js';
import { AlbumsService } from './albums.service.js';

@Module({
  imports: [ProvidersModule],
  controllers: [AlbumsController],
  providers: [AlbumsService],
})
export class AlbumsModule {}
