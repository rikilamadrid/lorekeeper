import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@lorekeeper/docs',
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
