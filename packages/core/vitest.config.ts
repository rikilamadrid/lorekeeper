import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@lorekeeper/core',
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
