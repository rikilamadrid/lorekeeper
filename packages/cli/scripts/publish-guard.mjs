#!/usr/bin/env node
/**
 * Refuse to publish unless a human asked for it and this commit is a release.
 *
 * Publishing is public and effectively irreversible: a version can be
 * deprecated but never reused. This runs from `prepublishOnly`, which fires on
 * `npm publish` from this directory (and on `--dry-run`) before registry
 * authentication. It does not run on `npm pack`, so packing and install tests
 * need none of this.
 *
 * It does not run on `npm publish <tarball>` either: npm runs no lifecycle
 * scripts for a tarball. That is the one-time bootstrap path in RELEASING.md,
 * where a human publishes the exact tarball that was verified, on purpose.
 *
 * To publish from this directory by hand, when the workflow cannot be used:
 *
 *     LOREKEEPER_PUBLISH=yes npm publish
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(PACKAGE_ROOT, '..', '..');

function refuse(problem, fix) {
  console.error(
    `\ncreate-lorekeeper: publish blocked — ${problem}\n\n${fix}\n`,
  );
  process.exit(1);
}

function git(...args) {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

const { version } = JSON.parse(
  readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'),
);

// 1. Intent.
if (process.env.LOREKEEPER_PUBLISH !== 'yes') {
  refuse(
    'no explicit intent to publish.',
    'Releases run from .github/workflows/release.yml. To publish by hand anyway,\n' +
      'follow RELEASING.md and set LOREKEEPER_PUBLISH=yes.',
  );
}

// 2. The version is a real one, and the changelog agrees with it.
if (version === '0.0.0') {
  refuse('0.0.0 is the unreleased sentinel.', 'Follow RELEASING.md.');
}
const changelog = readFileSync(join(REPO_ROOT, 'CHANGELOG.md'), 'utf8');
const newest = /^## \[(\d+\.\d+\.\d+)\]/m.exec(changelog)?.[1];
if (newest !== version) {
  refuse(
    `package.json says ${version}, the newest CHANGELOG.md section says ${newest ?? 'nothing'}.`,
    'The changelog is the source of truth. Make them agree in a release PR.',
  );
}

// 3. The tree is the commit, and the commit is on main.
if (git('status', '--porcelain') !== '') {
  refuse(
    'the working tree has uncommitted changes.',
    'Publish only a committed tree.',
  );
}
try {
  git('fetch', '--quiet', 'origin', 'main');
  git('merge-base', '--is-ancestor', 'HEAD', 'origin/main');
} catch {
  refuse(
    'HEAD is not contained in origin/main.',
    'Merge the release PR first, then publish from main.',
  );
}

// 4. A tag at HEAD, if there is one, must name this version.
let tag = null;
try {
  tag = git('describe', '--tags', '--exact-match', 'HEAD');
} catch {
  // No tag at HEAD is the expected state: the workflow tags after publishing.
}
if (tag !== null && tag !== `v${version}`) {
  refuse(
    `HEAD is tagged ${tag}, not v${version}.`,
    'Resolve the disagreement before publishing.',
  );
}
