#!/usr/bin/env node
/**
 * Generate the committed, dependency-free Lorekeeper terminal identity.
 *
 * Lorekeeper owns the geometry and palette below. wonder-wagon-ui/cli owns
 * capability detection, degradation, spacing, and emitted module structure.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderCliIdentityModule } from 'wonder-wagon-ui/cli';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const TOKENS = join(HERE, '..', 'tokens', 'tokens.json');
const OUT = join(ROOT, 'packages', 'cli', 'src', 'identity.ts');

const tokens = JSON.parse(readFileSync(TOKENS, 'utf8'));
const accent = tokens.color.dark.accent.value;
const gilt = tokens.color.dark.gold.value;

const product = {
  name: 'Lorekeeper',
  serial: 'LK-047',
  tagline: 'Pathfinder finds the way; Lorekeeper remembers the journey.',
  accent,
  secondary: gilt,
  ansi16: {
    accent: { name: 'blue', bright: true },
    secondary: { name: 'yellow', bright: false },
  },
  mark: {
    width: 8,
    nameRow: 2,
    rows: [
      {
        expressive: [{ text: '  ╭───╮', role: 'accent' }],
        plain: '  .---.',
      },
      {
        expressive: [{ text: ' ╭╯   ╰╮', role: 'accent' }],
        plain: ' /     \\',
      },
      {
        expressive: [
          { text: ' │  ', role: 'accent' },
          { text: '✦', role: 'secondary' },
          { text: '  │', role: 'accent' },
        ],
        plain: ' |  *  |',
      },
      {
        expressive: [{ text: ' ╰╮   ╭╯', role: 'accent' }],
        plain: ' \\     /',
      },
      {
        expressive: [{ text: '  ╰───╯', role: 'accent' }],
        plain: "  '---'",
      },
    ],
  },
};

const next = renderCliIdentityModule(product, { language: 'ts' });
const check = process.argv.includes('--check');
const where = relative(ROOT, OUT);

if (check) {
  let current = '';
  try {
    current = readFileSync(OUT, 'utf8');
  } catch {
    current = '';
  }
  if (current !== next) {
    console.error(
      `brand terminal: ${where} is stale; run \`npm run brand:terminal\`.`,
    );
    process.exitCode = 1;
  } else {
    console.log(`brand terminal check clean: ${where} is current.`);
  }
} else {
  writeFileSync(OUT, next);
  console.log(`wrote ${where} from wonder-wagon-ui/cli`);
}
