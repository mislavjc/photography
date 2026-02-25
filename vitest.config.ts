import path from 'node:path';
import { defineConfig } from 'vitest/config';

const webRoot = path.resolve(__dirname, 'apps/web');

export default defineConfig({
  test: {
    include: ['apps/web/**/*.test.ts'],
  },
  resolve: {
    alias: {
      'lib/': `${webRoot}/lib/`,
      types: `${webRoot}/types.ts`,
      'components/': `${webRoot}/components/`,
    },
  },
});
