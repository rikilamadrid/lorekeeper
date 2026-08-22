import { describe, expect, it } from 'vitest';
import { PRODUCT_NAME, TAGLINE } from '../src/index.js';

/**
 * These assertions guard the identity strings the CLI renders. The frontmatter
 * contract is tested alongside its own modules, not here.
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
