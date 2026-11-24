import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpClientModule } from '@nestjs/http-client';
import type { Env } from '../config/env.schema.js';
import { DOWNLOAD_PROVIDER } from './download-provider.js';
import { SEARCH_PROVIDER } from './search-provider.js';
import { SlskdDownloadProvider } from './slskd/slskd-download-provider.js';
import { SLSKD_HTTP_CLIENT, SlskdSearchProvider } from './slskd/slskd-search-provider.js';

// Caps a single HTTP call to slskd; the search as a whole is capped by SEARCH_TIMEOUT_MS.
const SLSKD_REQUEST_TIMEOUT = '10s';

// slskd is the only provider so far. Features inject SEARCH_PROVIDER and DOWNLOAD_PROVIDER, so
// adding another provider changes only this module.
@Module({
  imports: [
    HttpClientModule.registerAsync({
      name: SLSKD_HTTP_CLIENT,
      // ConfigModule is global, so ConfigService can be injected without importing it here.
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Env, true>) => ({
        baseUrl: configService.get('SLSKD_URL', { infer: true }),
        headers: { 'x-api-key': configService.get('SLSKD_API_KEY', { infer: true }) },
        timeout: SLSKD_REQUEST_TIMEOUT,
      }),
    }),
  ],
  providers: [
    { provide: SEARCH_PROVIDER, useClass: SlskdSearchProvider },
    { provide: DOWNLOAD_PROVIDER, useClass: SlskdDownloadProvider },
  ],
  exports: [SEARCH_PROVIDER, DOWNLOAD_PROVIDER],
})
export class ProvidersModule {}
