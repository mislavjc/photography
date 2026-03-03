import path from 'node:path';
import { defineConfig } from 'vitest/config';

const webRoot = path.resolve(__dirname, 'apps/web');

export default defineConfig({
  test: {
    include: ['apps/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 70,
        functions: 70,
        statements: 70,
        branches: 50,
      },
    },
  },
  resolve: {
    alias: {
      'lib/': `${webRoot}/lib/`,
      types: `${webRoot}/types.ts`,
      'components/': `${webRoot}/components/`,
    },
  },
});
