import { describe, expect, it } from 'vitest';
import { PRODUCT_NAME, TAGLINE } from '../src/index.js';

/**
 * Feature 01 gives core no behavior to test. These assertions guard the one
 * thing that is real here: the package exports usable identity strings that
 * the CLI renders. Feature 02 replaces this file with schema tests.
 */
describe('core identity exports', () => {
  it('exports a non-empty product name', () => {
    expect(PRODUCT_NAME).toBe('Lorekeeper');
  });

  it('exports a tagline safe to print in a terminal', () => {
    expect(TAGLINE.length).toBeGreaterThan(0);
    expect(TAGLINE).not.toContain('\n');
  });
});
