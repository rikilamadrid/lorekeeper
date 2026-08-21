import { describe, expect, it } from 'vitest';
import { DOCS_PLACEHOLDER } from '../src/index.js';

/**
 * The docs app is a reserved workspace slot until Feature 08 chooses a
 * framework. This test exists so the package participates in the test run and
 * a break in its build surfaces here.
 */
describe('docs placeholder', () => {
  it('builds and exports its placeholder marker', () => {
    expect(DOCS_PLACEHOLDER).toBe(true);
  });
});
