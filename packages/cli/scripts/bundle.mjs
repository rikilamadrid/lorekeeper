#!/usr/bin/env node
/**
 * Bundle the built CLI into the one file npm ships: `dist/lore.js`.
 *
 * Development keeps the monorepo boundary: `@lorekeeper/core` is its own
 * private workspace, `tsc --build` compiles both packages through project
 * references, and `dist/cli.js` imports core by its bare name, resolved through
 * the workspace link. That specifier cannot survive publication — core is
 * private and never on the registry, so an installed `lore` would fail with
 * E404 before printing its help.
 *
 * So the published artefact is self-contained instead. This script takes the
 * `tsc` output, exactly what the type checker and the tests saw, and inlines
 * core into it. `yaml` stays external: it is the one runtime dependency, is
 * declared in this package's `dependencies`, and has none of its own.
 *
 * After bundling, the output's imports are checked against the only two kinds
 * allowed — Node built-ins and `yaml` — and core must have been inlined. Either
 * failure stops the build, so a pack can never carry a bare core specifier.
 */

import { chmodSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = join(PACKAGE_ROOT, 'dist', 'cli.js');
const OUTFILE = join(PACKAGE_ROOT, 'dist', 'lore.js');

/** The runtime dependencies the bundle may import, as declared in package.json. */
const EXTERNAL = ['yaml'];

const result = await build({
  entryPoints: [ENTRY],
  outfile: OUTFILE,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: EXTERNAL,
  // Readable output: no minification, no renaming. A user reading a stack
  // trace from the installed `lore` sees the same function names as the source.
  minify: false,
  legalComments: 'inline',
  metafile: true,
  logLevel: 'warning',
});

const output = result.metafile.outputs[relative(process.cwd(), OUTFILE)];
if (output === undefined) {
  throw new Error(`esbuild reported no output for ${OUTFILE}`);
}

const builtins = new Set(builtinModules);
const disallowed = output.imports
  .map((entry) => entry.path)
  .filter(
    (path) =>
      !EXTERNAL.includes(path) &&
      !path.startsWith('node:') &&
      !builtins.has(path),
  );
if (disallowed.length > 0) {
  throw new Error(
    `dist/lore.js imports modules it must not: ${disallowed.join(', ')}`,
  );
}

const CORE_DIST = join(PACKAGE_ROOT, '..', 'core', 'dist');
const inlinedCore = Object.keys(output.inputs).filter((path) =>
  resolve(process.cwd(), path).startsWith(CORE_DIST),
);
if (inlinedCore.length === 0) {
  throw new Error('dist/lore.js does not contain @lorekeeper/core');
}

chmodSync(OUTFILE, 0o755);
