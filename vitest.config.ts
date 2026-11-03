import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const alias = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@refx/shared': alias('./packages/shared/src/index.ts'),
      '@refx/database': alias('./packages/database/src/index.ts'),
      '@refx/jobs': alias('./packages/jobs/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    pool: 'forks',
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
