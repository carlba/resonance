import { defineConfig } from 'vitest/config';

// e2e tests live in test/, outside src/, so this config can't use the `dir: 'src'` the other
// packages use.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    // The env schema requires these. The tests replace the search provider, so nothing connects to
    // this URL. Set here, they win over the repo-root .env.
    env: {
      SLSKD_URL: 'http://slskd.invalid:5030',
      SLSKD_API_KEY: 'e2e-test-api-key',
    },
  },
});
