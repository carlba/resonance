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
  },
});
