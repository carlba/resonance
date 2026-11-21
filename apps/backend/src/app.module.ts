import { ExceptionFilterModule } from '@carlba/nest-modules';
import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AlbumsModule } from './albums/albums.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { envSchema, type Env } from './config/env.schema.js';
import { createLoggerParams } from './logging/logger-params.js';
import { TracksModule } from './tracks/tracks.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // pnpm runs package scripts from apps/backend, so this is the repo-root .env.
      envFilePath: '../../.env',
      validationSchema: envSchema,
    }),
    LoggerModule.forRootAsync({
      // ConfigModule is global, so ConfigService can be injected without importing it here.
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Env, true>) =>
        createLoggerParams({
          NODE_ENV: configService.get('NODE_ENV', { infer: true }),
          LOG_LEVEL: configService.get('LOG_LEVEL', { infer: true }),
        }),
    }),
    ExceptionFilterModule,
    TracksModule,
    AlbumsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      // Registered here rather than with app.useGlobalPipes() in main.ts, so the e2e tests, which
      // build the app from AppModule, validate too.
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
  ],
})
export class AppModule {}
