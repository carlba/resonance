import { z } from 'zod';

const DEFAULT_PORT = 3000;
// slskd ends a search after a stretch without new responses, which usually takes well under this.
// The timeout caps how long a request to this backend can block on one search.
const DEFAULT_SEARCH_TIMEOUT_MS = 30_000;
const MIN_SEARCH_TIMEOUT_MS = 1000;

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Environment variables are always strings, so the port has to be coerced.
  PORT: z.coerce.number().int().min(1).max(65_535).default(DEFAULT_PORT),
  // pino's level names; Nest's `log` and `verbose` are not valid here.
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('debug'),
  // Base URL of the slskd instance, e.g. http://slskd:5030.
  SLSKD_URL: z.url({ protocol: /^https?$/ }),
  SLSKD_API_KEY: z.string().min(1),
  SEARCH_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(MIN_SEARCH_TIMEOUT_MS)
    .default(DEFAULT_SEARCH_TIMEOUT_MS),
});

export type Env = z.infer<typeof envSchema>;
