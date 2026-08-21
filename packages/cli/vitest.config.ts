import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'create-lorekeeper',
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
