import { defineConfig } from 'vitest/config';

/**
 * Root test entry point. Each package also carries its own config so its
 * suite can be run alone, which the Feature requires.
 */
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
  },
});
