import type { Params } from 'nestjs-pino';
import type { Env } from '../config/env.schema.js';

// Levels at which request headers are logged. Above these, `req.headers` is removed from every
// line: headers are bulky and can carry credentials, so they are only worth it while debugging.
const HEADER_LOG_LEVELS: readonly Env['LOG_LEVEL'][] = ['trace', 'debug'];

export function createLoggerParams({
  NODE_ENV,
  LOG_LEVEL,
}: Pick<Env, 'NODE_ENV' | 'LOG_LEVEL'>): Params {
  const isProduction = NODE_ENV === 'production';
  const showHeaders = HEADER_LOG_LEVELS.includes(LOG_LEVEL);

  return {
    // pino-pretty prints a log's `name` field in parentheses, `INFO (AppService): ...`, so the Nest
    // context is renamed to `name` in development. Production JSON keeps `context`.
    renameContext: isProduction ? undefined : 'name',
    pinoHttp: {
      level: LOG_LEVEL,
      redact: showHeaders ? undefined : { paths: ['req.headers'], remove: true },
      // Human-readable output while developing, plain JSON lines in production. pino-pretty is a
      // dev-only transport and not loaded in production.
      transport: isProduction
        ? undefined
        : { target: 'pino-pretty', options: { ignore: 'pid,hostname' } },
    },
  };
}
