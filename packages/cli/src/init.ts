/**
 * `lore init <target>` — turn a directory into a brain.
 *
 * Every `fs` call in Lorekeeper lives in this package, and every one on the
 * init path lives in this file. `packages/core` decides what a manifest is;
 * this decides what touches the disk.
 *
 * Three rules constrain the writes below:
 *
 * - Additive only. Files are opened with `wx`, so the operating system, not a
 *   prior check, is what guarantees an existing file is never truncated.
 * - Nothing is claimed that was not written. A path only enters the manifest
 *   after the write that created it returned.
 * - The toolkit repository is not a brain. Generating into it is how private
 *   notes end up in a public repository, so it is refused.
 *
 * This slice handles an empty target. A target that already holds files is
 * refused rather than adopted; adoption is its own slice, and guessing at it
 * here would mean writing into someone's vault on the strength of an assumption.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import {
  buildManifest,
  MANIFEST_PATH,
  type ManifestEntry,
  serializeManifest,
} from '@lorekeeper/core';
import { hashText } from './hash.js';
import type { Streams } from './run.js';
import { STARTER_FILES, STARTER_FOLDERS } from './starter.js';
import { readVersion } from './version.js';

export interface InitOptions {
  /** Where a relative target resolves from. Defaults to the process's cwd. */
  readonly cwd?: string;
  /** The clock, injected so a test can assert an exact manifest. */
  readonly now?: () => Date;
  /**
   * Where the toolkit repository lives, if this toolkit is running from a
   * checkout of it. Defaults to searching upward from this module.
   */
  readonly toolkitRepoRoot?: string | null;
}

/**
 * Run the command. Returns the intended exit code and never throws for an
 * expected condition: a refusal is a message and a non-zero code, not a stack.
 */
export function init(
  args: readonly string[],
  streams: Streams,
  options: InitOptions = {},
): number {
  const [rawTarget, ...rest] = args;
  if (rawTarget === undefined) {
    streams.err('lore init: name the directory to initialize.\n');
    streams.err('  lore init <target>\n');
    return 2;
  }
  if (rest.length > 0) {
    streams.err(`lore init: unexpected argument "${rest[0]}".\n`);
    streams.err('  lore init <target>\n');
    return 2;
  }

  const cwd = options.cwd ?? process.cwd();
  const target = resolve(cwd, rawTarget);

  const written: ManifestEntry[] = [];

  try {
    const repoRoot =
      options.toolkitRepoRoot === undefined
        ? findToolkitRepoRoot(import.meta.dirname)
        : options.toolkitRepoRoot;

    if (repoRoot !== null && isInside(target, repoRoot)) {
      streams.err(
        `lore init: refusing to initialize inside the Lorekeeper repository at ${repoRoot}.\n`,
      );
      streams.err(
        'A brain holds your own notes and must live outside this toolkit.\n',
      );
      streams.err('  lore init ~/brain\n');
      return 1;
    }

    const occupancy = describeTarget(target);
    if (occupancy !== null) {
      streams.err(`lore init: ${occupancy}\n`);
      return 1;
    }

    mkdirSync(target, { recursive: true });
    for (const folder of STARTER_FOLDERS) {
      mkdirSync(join(target, folder), { recursive: true });
    }
    for (const file of STARTER_FILES) {
      writeFileSync(join(target, file.path), file.content, {
        encoding: 'utf8',
        flag: 'wx',
      });
      written.push({ path: file.path, sha256: hashText(file.content) });
    }

    const manifest = buildManifest({
      toolkitVersion: readVersion(),
      createdAt: (options.now?.() ?? new Date()).toISOString(),
      files: written,
    });
    if (!manifest.ok) {
      streams.err(`lore init: ${manifest.refusal.reason}\n`);
      return 1;
    }

    const manifestText = serializeManifest(manifest.manifest);
    mkdirSync(join(target, dirname(MANIFEST_PATH)), { recursive: true });
    writeFileSync(join(target, MANIFEST_PATH), manifestText, {
      encoding: 'utf8',
      flag: 'wx',
    });
  } catch (error) {
    streams.err(`lore init: ${(error as Error).message}\n`);
    return 1;
  }

  report(target, written, streams);
  return 0;
}

/**
 * Why this target cannot be initialized, or `null` when it can.
 *
 * A directory holding anything at all is refused whole. Adoption reads what is
 * already there before deciding what it may add, and this slice does not.
 */
function describeTarget(target: string): string | null {
  if (!existsSync(target)) {
    return null;
  }
  if (!statSync(target).isDirectory()) {
    return `${target} is not a directory.`;
  }
  if (readdirSync(target).length > 0) {
    return `${target} is not empty, and this version only initializes an empty directory. Nothing was written.`;
  }
  return null;
}

function report(
  target: string,
  written: readonly ManifestEntry[],
  streams: Streams,
): void {
  streams.out(`Initialized a brain at ${target}\n`);
  streams.out('\n');
  for (const folder of STARTER_FOLDERS) {
    streams.out(`  ${folder}/\n`);
  }
  streams.out('\n');
  streams.out(
    `${written.length} starter ${written.length === 1 ? 'file' : 'files'}, recorded in ${MANIFEST_PATH}.\n`,
  );
  streams.out('Everything else in that directory is yours.\n');
  streams.out('\n');
  streams.out(`Start by reading ${join(target, 'README.md')}\n`);
}

/** Whether `path` is `root` or sits under it, with symlinks resolved. */
function isInside(path: string, root: string): boolean {
  const realRoot = realOrNearest(root);
  const realPath = realOrNearest(path);
  return realPath === realRoot || realPath.startsWith(realRoot + sep);
}

/**
 * The real path of the nearest existing ancestor, with the rest appended.
 *
 * A target that does not exist yet still has to be located, and a symlinked
 * parent is the ordinary way a check like this is defeated.
 */
function realOrNearest(path: string): string {
  let existing = path;
  const trailing: string[] = [];

  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) {
      return path;
    }
    trailing.unshift(existing.slice(parent.length + 1));
    existing = parent;
  }

  return join(realpathSync(existing), ...trailing);
}

/**
 * The toolkit repository's root, or `null` when this toolkit is not running
 * from a checkout of it — the ordinary case for an installed `lore`, where
 * there is no repository to protect.
 */
function findToolkitRepoRoot(from: string): string | null {
  let directory = from;

  for (;;) {
    const manifestPath = join(directory, 'package.json');
    if (existsSync(manifestPath)) {
      try {
        const parsed: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          'name' in parsed &&
          parsed.name === 'lorekeeper' &&
          'workspaces' in parsed
        ) {
          return directory;
        }
      } catch {
        // An unreadable package.json on the way up is not this command's
        // problem; keep looking for the one that identifies the repository.
      }
    }

    const parent = dirname(directory);
    if (parent === directory) {
      return null;
    }
    directory = parent;
  }
}
