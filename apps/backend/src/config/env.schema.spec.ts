import { envSchema } from './env.schema.js';

describe('envSchema', () => {
  it('applies defaults when no variables are set', () => {
    expect(envSchema.parse({})).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'debug',
    });
  });

  it('coerces PORT from a string', () => {
    expect(envSchema.parse({ PORT: '3456' }).PORT).toBe(3456);
  });

  it('accepts every supported value', () => {
    expect(envSchema.parse({ NODE_ENV: 'production', PORT: '8080', LOG_LEVEL: 'warn' })).toEqual({
      NODE_ENV: 'production',
      PORT: 8080,
      LOG_LEVEL: 'warn',
    });
  });

  it.each([['abc'], ['0'], ['65536'], ['3.5']])('rejects PORT=%s', port => {
    expect(envSchema.safeParse({ PORT: port }).success).toBe(false);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(envSchema.safeParse({ NODE_ENV: 'staging' }).success).toBe(false);
  });

  it('rejects the Nest-only level name "log"', () => {
    expect(envSchema.safeParse({ LOG_LEVEL: 'log' }).success).toBe(false);
  });
});
