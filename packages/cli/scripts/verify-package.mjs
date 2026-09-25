#!/usr/bin/env node
/**
 * Pack `create-lorekeeper` and prove the tarball is what users should receive.
 *
 *     node packages/cli/scripts/verify-package.mjs [--keep <dir>]
 *
 * CI runs this on every pull request, so the artefact is checked continuously
 * rather than discovered at release time. Each check is named and printed; any
 * failure exits non-zero. Zero dependencies: Node built-ins, npm, and tar.
 *
 * The central claim is that the published package is self-contained. The
 * private `@lorekeeper/core` workspace is inlined into `dist/lore.js`, so an
 * install must never try to fetch it: it is in no dependency field, no shipped
 * file imports it, and a real install from the tarball neither contains it nor
 * needs it to run.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(PACKAGE_ROOT, '..', '..');

const EXPECTED_FILES = ['LICENSE', 'README.md', 'dist/lore.js', 'package.json'];
const RUNTIME_DEPENDENCIES = ['yaml'];
const PRIVATE = '@lorekeeper/core';

const keepIndex = process.argv.indexOf('--keep');
const work =
  keepIndex === -1
    ? mkdtempSync(join(tmpdir(), 'lore-verify-'))
    : resolve(process.argv[keepIndex + 1]);
mkdirSync(work, { recursive: true });

let failures = 0;
function check(name, ok, detail = '') {
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures += 1;
}

// Pack. `npm pack` runs `prepack`, which rebuilds and re-bundles, so this is
// the same artefact `npm publish` would upload. npm 11 prints an array of
// entries; npm 12 prints an object keyed by package name. Accept both, since
// the release workflow runs the newest npm and contributors run their own.
const packJson = JSON.parse(
  execFileSync('npm', ['pack', '--json', '--pack-destination', work], {
    cwd: PACKAGE_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }),
);
const packed = Array.isArray(packJson)
  ? packJson[0]
  : packJson['create-lorekeeper'];
if (packed?.filename === undefined) {
  throw new Error('unrecognised npm pack --json output');
}
const tarball = join(work, packed.filename);
const files = packed.files.map((file) => file.path).sort();

check(
  'tarball holds exactly the expected files',
  JSON.stringify(files) === JSON.stringify(EXPECTED_FILES),
  files.join(', '),
);
console.log(
  `      ${packed.filename}: ${packed.size} B packed, ${packed.unpackedSize} B unpacked, ${packed.entryCount} entries`,
);

const unpacked = join(work, 'unpacked');
mkdirSync(unpacked, { recursive: true });
execFileSync('tar', ['-xzf', tarball, '-C', unpacked]);
const root = join(unpacked, 'package');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const changelog = readFileSync(join(REPO_ROOT, 'CHANGELOG.md'), 'utf8');
const newest = /^## \[(\d+\.\d+\.\d+)\]/m.exec(changelog)?.[1];
check('name is create-lorekeeper', manifest.name === 'create-lorekeeper');
check(
  'version matches the newest CHANGELOG.md section',
  manifest.version === newest,
  `${manifest.version} / ${newest}`,
);
check(
  'bin is exactly lore → dist/lore.js',
  Object.keys(manifest.bin ?? {}).join() === 'lore' &&
    manifest.bin.lore.replace(/^\.\//, '') === 'dist/lore.js',
);
check(
  'runtime dependencies are exactly yaml',
  JSON.stringify(Object.keys(manifest.dependencies ?? {})) ===
    JSON.stringify(RUNTIME_DEPENDENCIES),
);
const installedFields = [
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
  'bundleDependencies',
  'bundledDependencies',
];
check(
  `${PRIVATE} is in no field an install reads`,
  installedFields.every((field) => {
    const value = manifest[field];
    if (value === undefined) return true;
    return Array.isArray(value)
      ? !value.includes(PRIVATE)
      : !Object.hasOwn(value, PRIVATE);
  }),
);
check(
  'repository names this repository and directory, as provenance requires',
  manifest.repository?.url ===
    'git+https://github.com/rikilamadrid/lorekeeper.git' &&
    manifest.repository?.directory === 'packages/cli',
);
check(
  'LICENSE is byte-identical to the repository licence',
  readFileSync(join(root, 'LICENSE')).equals(
    readFileSync(join(REPO_ROOT, 'LICENSE')),
  ),
);

const bundle = readFileSync(join(root, 'dist', 'lore.js'), 'utf8');
const specifiers = [
  ...bundle.matchAll(/^\s*(?:import|export)\b[^'"]*?from\s*["']([^"']+)["']/gm),
  ...bundle.matchAll(/^\s*import\s*["']([^"']+)["']/gm),
  ...bundle.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
].map((match) => match[1]);
const foreign = [...new Set(specifiers)].filter(
  (specifier) =>
    !specifier.startsWith('node:') && !RUNTIME_DEPENDENCIES.includes(specifier),
);
check(
  'dist/lore.js imports only node: built-ins and yaml',
  foreign.length === 0,
  foreign.join(', '),
);
check(`dist/lore.js never names ${PRIVATE}`, !bundle.includes(PRIVATE));
check(
  'dist/lore.js starts with a node shebang',
  bundle.startsWith('#!/usr/bin/env node\n'),
);

// Install the tarball into a clean prefix, exactly as a user's global install
// would, and run the binary from there.
const prefix = join(work, 'prefix');
const install = spawnSync(
  'npm',
  [
    'install',
    '--global',
    '--prefix',
    prefix,
    '--cache',
    join(work, 'cache'),
    '--no-audit',
    '--no-fund',
    tarball,
  ],
  { encoding: 'utf8' },
);
check(
  'global install from the tarball succeeds',
  install.status === 0,
  install.status === 0 ? '' : install.stderr.trim().split('\n').at(-1),
);
const installed = join(prefix, 'lib', 'node_modules', 'create-lorekeeper');
check(
  `the install contains no ${PRIVATE}`,
  !existsSync(join(installed, 'node_modules', '@lorekeeper')) &&
    !existsSync(join(prefix, 'lib', 'node_modules', '@lorekeeper')),
);

const lore = join(prefix, 'bin', 'lore');
const env = { PATH: process.env.PATH ?? '' };
const run = (args, cwd = work) =>
  spawnSync(lore, args, { cwd, encoding: 'utf8', env });

const version = run(['--version']);
check(
  'installed lore --version prints the package version',
  version.status === 0 && version.stdout.trim() === manifest.version,
  version.stdout.trim(),
);
const help = run(['--help']);
check(
  'installed lore --help names the product and its commands',
  help.status === 0 &&
    help.stdout.startsWith('Lorekeeper') &&
    help.stdout.includes('lore init <dir>'),
);
const init = run(['init', 'verify-brain']);
check(
  'installed lore init creates a brain',
  init.status === 0 && existsSync(join(work, 'verify-brain', 'AGENTS.md')),
);
run(['capture', 'verify-brain', 'The tide table decides the hour.']);
const search = run(['search', 'verify-brain', 'tide table', '--json']);
let results = -1;
try {
  results = JSON.parse(search.stdout).count;
} catch {}
check(
  'installed lore search --json returns parseable results',
  search.status === 0 && results > 0,
  `count ${results}`,
);

if (keepIndex === -1) {
  rmSync(work, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\n${failures} package check(s) failed.`);
  process.exit(1);
}
console.log('\nAll package checks passed.');
