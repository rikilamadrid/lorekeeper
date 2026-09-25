#!/usr/bin/env node
/**
 * Generates src/styles/wonder-wagon-lorekeeper.css from @wonder-wagon/themes.
 *
 * The site is the Wonder Wagon `lorekeeper` theme's first web consumer, but
 * only for the family chrome — the environment lever and the family plate.
 * Everything else on the page reads Lorekeeper's own brand/tokens/tokens.css.
 *
 * The theme package is not published, and a Vercel build has no sibling
 * checkout of wonder-wagon-ui, so the site cannot import it at build time. The
 * generated file is committed instead, and `--check` fails when it no longer
 * matches the package at the pinned ref — the same generate-and-check shape as
 * brand/terminal/build.mjs.
 *
 *   node scripts/wonder-wagon-theme.mjs          write the file
 *   node scripts/wonder-wagon-theme.mjs --check  exit 1 if it is stale
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..');
const OUT = join(APP, 'src', 'styles', 'wonder-wagon-lorekeeper.css');

const require = createRequire(import.meta.url);

function generate() {
  const version = require('@wonder-wagon/themes/package.json').version;
  const css = readFileSync(
    require.resolve('@wonder-wagon/themes/lorekeeper.css'),
    'utf8',
  );
  const { status } = JSON.parse(
    readFileSync(
      require.resolve('@wonder-wagon/themes/lorekeeper.json'),
      'utf8',
    ),
  );
  const header = [
    '/*',
    ` * @wonder-wagon/themes ${version}, lorekeeper theme (${status}) — GENERATED, do not edit.`,
    ' *',
    ' * Regenerate: npm run theme -w @lorekeeper/docs',
    ' * Check:      npm run theme:check -w @lorekeeper/docs',
    ' *',
    ' * Family chrome only: the environment lever and the family plate read these',
    ' * --ww-* properties. Every other colour on the site is a --lk-* token.',
    ' */',
    '',
  ].join('\n');
  return `${header}${css.trimEnd()}\n`;
}

function main() {
  const where = relative(process.cwd(), OUT) || OUT;
  let expected;
  try {
    expected = generate();
  } catch (error) {
    console.error(
      `wonder-wagon theme: cannot read @wonder-wagon/themes (${error.message}). Build wonder-wagon-ui's packages/themes next to this repository first.`,
    );
    process.exitCode = 1;
    return;
  }

  if (!process.argv.includes('--check')) {
    writeFileSync(OUT, expected);
    console.log(`wonder-wagon theme: wrote ${where}.`);
    return;
  }

  let actual = '';
  try {
    actual = readFileSync(OUT, 'utf8');
  } catch {
    // Missing counts as stale.
  }
  if (actual !== expected) {
    console.error(
      `wonder-wagon theme check failed: ${where} is stale. Run \`npm run theme -w @lorekeeper/docs\`.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(`wonder-wagon theme check clean: ${where} is current.`);
}

main();
