import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@irises/extension-sdk/utils': path.resolve(__dirname, 'packages/extension-sdk/src/utils'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
  },
});
