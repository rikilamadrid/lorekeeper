import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = join(import.meta.dirname, '..', 'src');

/**
 * The layer split, asserted rather than remembered.
 *
 * `packages/core` owns contracts and pure computation; `packages/cli` owns
 * every side effect. Span extraction and ranking arrived in core with an
 * obvious temptation attached — read the vault here, where the spans are built
 * — so the boundary is worth a test that fails the moment someone reaches for
 * `node:fs`.
 */
describe('core layering', () => {
  const files = readdirSync(SOURCE).filter((name) => name.endsWith('.ts'));

  it('has source files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s imports no node: builtin', (name) => {
    const text = readFileSync(join(SOURCE, name), 'utf8');
    const imports = text.matchAll(/from\s+'([^']+)'/g);
    const builtins = [...imports]
      .map((match) => match[1] ?? '')
      .filter((specifier) => specifier.startsWith('node:'));

    expect(builtins).toEqual([]);
  });
});
