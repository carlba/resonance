import { envSchema } from './env.schema.js';

const REQUIRED_ENV = { SLSKD_URL: 'http://slskd:5030', SLSKD_API_KEY: 'secret' };

describe('envSchema', () => {
  it('applies defaults when only the required variables are set', () => {
    expect(envSchema.parse(REQUIRED_ENV)).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'debug',
      SLSKD_URL: 'http://slskd:5030',
      SLSKD_API_KEY: 'secret',
      SEARCH_TIMEOUT_MS: 30_000,
    });
  });

  it('coerces PORT from a string', () => {
    expect(envSchema.parse({ ...REQUIRED_ENV, PORT: '3456' }).PORT).toBe(3456);
  });

  it('coerces SEARCH_TIMEOUT_MS from a string', () => {
    expect(envSchema.parse({ ...REQUIRED_ENV, SEARCH_TIMEOUT_MS: '5000' }).SEARCH_TIMEOUT_MS).toBe(
      5000
    );
  });

  it('accepts every supported value', () => {
    expect(
      envSchema.parse({
        NODE_ENV: 'production',
        PORT: '8080',
        LOG_LEVEL: 'warn',
        SLSKD_URL: 'https://slskd.example.com/',
        SLSKD_API_KEY: 'key',
        SEARCH_TIMEOUT_MS: '60000',
      })
    ).toEqual({
      NODE_ENV: 'production',
      PORT: 8080,
      LOG_LEVEL: 'warn',
      SLSKD_URL: 'https://slskd.example.com/',
      SLSKD_API_KEY: 'key',
      SEARCH_TIMEOUT_MS: 60_000,
    });
  });

  it.each([['abc'], ['0'], ['65536'], ['3.5']])('rejects PORT=%s', port => {
    expect(envSchema.safeParse({ ...REQUIRED_ENV, PORT: port }).success).toBe(false);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(envSchema.safeParse({ ...REQUIRED_ENV, NODE_ENV: 'staging' }).success).toBe(false);
  });

  it('rejects the Nest-only level name "log"', () => {
    expect(envSchema.safeParse({ ...REQUIRED_ENV, LOG_LEVEL: 'log' }).success).toBe(false);
  });

  it.each([['SLSKD_URL'], ['SLSKD_API_KEY']])('requires %s', name => {
    const { [name as keyof typeof REQUIRED_ENV]: _omitted, ...env } = REQUIRED_ENV;

    expect(envSchema.safeParse(env).success).toBe(false);
  });

  it.each([['not a url'], ['ftp://slskd:5030'], ['']])('rejects SLSKD_URL=%s', url => {
    expect(envSchema.safeParse({ ...REQUIRED_ENV, SLSKD_URL: url }).success).toBe(false);
  });

  it('rejects an empty SLSKD_API_KEY', () => {
    expect(envSchema.safeParse({ ...REQUIRED_ENV, SLSKD_API_KEY: '' }).success).toBe(false);
  });

  it.each([['abc'], ['999'], ['1500.5']])('rejects SEARCH_TIMEOUT_MS=%s', timeout => {
    expect(envSchema.safeParse({ ...REQUIRED_ENV, SEARCH_TIMEOUT_MS: timeout }).success).toBe(
      false
    );
  });
});
