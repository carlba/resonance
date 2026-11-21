import type { Options } from 'pino-http';
import { createLoggerParams } from './logger-params.js';

function pinoHttpOptions(params: ReturnType<typeof createLoggerParams>): Options {
  return params.pinoHttp as Options;
}

describe('createLoggerParams', () => {
  it('uses LOG_LEVEL as the pino level', () => {
    const params = createLoggerParams({ NODE_ENV: 'development', LOG_LEVEL: 'warn' });

    expect(pinoHttpOptions(params).level).toBe('warn');
  });

  it('pretty-prints and renames the context to name outside production', () => {
    const params = createLoggerParams({ NODE_ENV: 'development', LOG_LEVEL: 'debug' });

    expect(params.renameContext).toBe('name');
    expect(pinoHttpOptions(params).transport).toEqual({
      target: 'pino-pretty',
      options: { ignore: 'pid,hostname' },
    });
  });

  it('logs plain JSON with the context field in production', () => {
    const params = createLoggerParams({ NODE_ENV: 'production', LOG_LEVEL: 'info' });

    expect(params.renameContext).toBeUndefined();
    expect(pinoHttpOptions(params).transport).toBeUndefined();
  });

  it.each(['trace', 'debug'] as const)('keeps request headers at %s', level => {
    const params = createLoggerParams({ NODE_ENV: 'development', LOG_LEVEL: level });

    expect(pinoHttpOptions(params).redact).toBeUndefined();
  });

  it.each(['info', 'warn', 'error', 'fatal'] as const)('removes request headers at %s', level => {
    const params = createLoggerParams({ NODE_ENV: 'development', LOG_LEVEL: level });

    expect(pinoHttpOptions(params).redact).toEqual({ paths: ['req.headers'], remove: true });
  });
});
