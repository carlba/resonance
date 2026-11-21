import { z } from 'zod';

const DEFAULT_PORT = 3000;

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Environment variables are always strings, so the port has to be coerced.
  PORT: z.coerce.number().int().min(1).max(65_535).default(DEFAULT_PORT),
  // pino's level names; Nest's `log` and `verbose` are not valid here.
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('debug'),
});

export type Env = z.infer<typeof envSchema>;
