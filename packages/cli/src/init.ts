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
 * A target that already holds files is adopted, not migrated. Init adds what is
 * missing and reads nothing else as an invitation: existing notes are not
 * validated, reformatted, or moved, and a starter path that is already occupied
 * is left byte-identical, kept out of the manifest, and reported as skipped.
 * Not claiming it is the load-bearing half — a claimed file is one a later
 * `lore update` would feel free to overwrite.
 *
 * Adoption is also where a starter path stops being a name and becomes a
 * traversal: a vault is free to symlink `notes/` somewhere else, and following
 * one would write outside the brain the user named — past the repository
 * refusal above, which only ever looked at the target. Every starter path is
 * resolved against the brain's real path before it is written to, and the
 * manifest's own destination is checked before the first of them is written —
 * where it leads, what already occupies it, and whether this process can
 * actually write there. A run that could not record what it owns never starts.
 *
 * Re-running against an already-initialized target is a later slice, and until
 * it lands there are two shapes of it. A partially initialized brain stops on
 * the manifest's own `wx` write, with an errno rather than the report that
 * slice will give. A fully initialized one has nothing left to write, so it
 * reports a run in which every starter path was already occupied and exits 0.
 * That report says only what this run did, and claims no ownership it has not
 * established: deciding what an existing manifest already owns is that slice's
 * work, not this one's.
 */

import {
  accessSync,
  constants,
  existsSync,
  lstatSync,
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
  const skipped: Skip[] = [];
  let adopting = false;
  let brain = target;
  let claimedAlready = false;

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

    const refusal = describeTarget(target);
    if (refusal !== null) {
      streams.err(`lore init: ${refusal}\n`);
      return 1;
    }

    adopting = holdsAnything(target);

    mkdirSync(target, { recursive: true });
    brain = realpathSync(target);

    const unusable = describeMetadataDestination(target, brain);
    if (unusable !== null) {
      streams.err(`lore init: ${unusable}\n`);
      streams.err(
        'The record of what this toolkit owns has to live inside the brain it describes.\n',
      );
      return 1;
    }

    // Read before the first write, so it describes the vault init was handed
    // rather than the one it leaves. What that manifest actually claims is a
    // later slice's question; that one is there at all is enough to keep this
    // run from calling a file it skipped unclaimed.
    claimedAlready = exists(join(target, MANIFEST_PATH));

    for (const folder of STARTER_FOLDERS) {
      if (leavesBrain(join(target, folder), brain)) {
        // Whatever this points at is not inside the brain, so it is not ours to
        // write into. The starter file below is skipped for the same reason.
        continue;
      }
      try {
        mkdirSync(join(target, folder), { recursive: true });
      } catch (error) {
        if (!isOccupied(error)) {
          throw error;
        }
        // Something of the user's already holds this name. It stays exactly as
        // it is, and the starter file below is skipped for the same reason.
      }
    }
    for (const file of STARTER_FILES) {
      const path = join(target, file.path);
      if (leavesBrain(path, brain)) {
        skipped.push({ path: file.path, reason: 'outside' });
        continue;
      }
      try {
        writeFileSync(path, file.content, { encoding: 'utf8', flag: 'wx' });
      } catch (error) {
        if (!isOccupied(error)) {
          throw error;
        }
        skipped.push({ path: file.path, reason: 'occupied' });
        continue;
      }
      written.push({ path: file.path, sha256: hashText(file.content) });
    }

    const refused = claim(target, written, options);
    if (refused !== null) {
      streams.err(`lore init: ${refused}\n`);
      return 1;
    }
  } catch (error) {
    // Whatever failed, the files already written are the toolkit's, and an
    // unclaimed starter file is the user's permanently — absence from the
    // manifest is a statement of ownership, not a gap. Claiming them is what
    // leaves a later run able to correct this one. Nothing is removed: deleting
    // inside someone's vault is not this command's decision to make.
    try {
      claim(target, written, options);
    } catch {
      // The original failure is the one worth reporting.
    }
    streams.err(`lore init: ${(error as Error).message}\n`);
    return 1;
  }

  report(
    { target, brain, adopting, claimedAlready, written, skipped },
    streams,
  );
  return 0;
}

/**
 * Why this target cannot be initialized, or `null` when it can.
 *
 * A directory that already holds notes is not a reason to refuse: it is the
 * adoption case, and the writes above are additive whether it is empty or not.
 */
function describeTarget(target: string): string | null {
  if (!existsSync(target)) {
    return null;
  }
  if (!statSync(target).isDirectory()) {
    return `${target} is not a directory.`;
  }
  return null;
}

/**
 * Why the manifest cannot be written where it belongs, or `null` when it can.
 *
 * This runs before the first starter path is written, and that ordering is the
 * whole point. The manifest is the record of what the toolkit owns; a run that
 * writes starter files and only then discovers it cannot write the manifest
 * leaves toolkit files in someone's vault with nothing claiming them. So the
 * destination is inspected first, and a run that could not record itself never
 * starts.
 *
 * The destination is two things, and both have to hold. `.lorekeeper` has to be
 * a directory this process can create a file in, inside the brain: one that
 * resolves outside would put the record somewhere other than the notes it
 * describes, one that is a plain file or a symlink to nothing cannot become a
 * directory without destroying what is there, and one that cannot be written
 * into is a destination in name only. A symlink to a directory inside the brain
 * is fine, and is left alone to work.
 *
 * Then the manifest's own name has to be free, or already be a manifest. A
 * directory or a dangling symlink sitting at `.lorekeeper/manifest.json` passes
 * every check on the directory around it and still cannot be written to, which
 * is the same failure one level down. A regular file there is the one occupant
 * that is not a refusal: that is an existing installation, and what a rerun
 * owes it is a later slice's question, reached the way it was before.
 *
 * The permission check asks the operating system rather than writing a probe
 * file. Init's whole claim is that it adds only what it says it added, and a
 * probe left behind by a crash between its creation and its removal would break
 * that claim to prove a permission bit. `access` answers the same question and
 * leaves nothing on disk.
 */
function describeMetadataDestination(
  target: string,
  brain: string,
): string | null {
  const metadataDirectory = dirname(MANIFEST_PATH);
  const path = join(target, metadataDirectory);

  if (leavesBrain(path, brain)) {
    return `${metadataDirectory} in ${target} resolves outside that directory, so ${MANIFEST_PATH} cannot be written. Nothing was written.`;
  }
  if (exists(path) && !isDirectory(path)) {
    return `${metadataDirectory} in ${target} already exists and is not a directory, so ${MANIFEST_PATH} cannot be written. Nothing was written.`;
  }
  if (leavesBrain(join(target, MANIFEST_PATH), brain)) {
    return `${MANIFEST_PATH} in ${target} resolves outside that directory. Nothing was written.`;
  }
  if (exists(path)) {
    if (!isWritableDirectory(path)) {
      return `${metadataDirectory} in ${target} cannot be written to, so ${MANIFEST_PATH} cannot be created there. Nothing was written.`;
    }
  } else if (!isWritableDirectory(target)) {
    return `${target} cannot be written to, so ${MANIFEST_PATH} cannot be created there. Nothing was written.`;
  }

  const manifestPath = join(target, MANIFEST_PATH);
  if (exists(manifestPath) && !isRegularFile(manifestPath)) {
    return `${MANIFEST_PATH} in ${target} is already taken by something that is not a file, so the record of what this toolkit owns cannot be written there. Nothing was written.`;
  }
  return null;
}

/**
 * Whether a regular file is what this name leads to, following symlinks.
 *
 * The question is not "is something here" — `exists` answers that — but "could
 * what is here be a manifest". A directory could not, and neither could a
 * symlink pointing at nothing, which `stat` reports by refusing to resolve.
 * A regular file could, and whether it actually is one is not asked here.
 */
function isRegularFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Whether this process can create a file inside `path` right now.
 *
 * Write permission alone is not enough: creating a file inside a directory
 * needs the search bit too, and a directory that grants one without the other
 * is exactly the case a check on `W_OK` by itself would wave through.
 */
function isWritableDirectory(path: string): boolean {
  try {
    accessSync(path, constants.W_OK | constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Whether the target already holds anything of the user's. */
function holdsAnything(target: string): boolean {
  return existsSync(target) && readdirSync(target).length > 0;
}

/**
 * Write the manifest for what was actually written, or say why it could not be.
 *
 * Called on the way out of a successful run and again after a failed one, so
 * the toolkit owns what it wrote either way. Nothing here overwrites an
 * existing manifest: the `wx` flag holds on this path too.
 */
function claim(
  target: string,
  written: readonly ManifestEntry[],
  options: InitOptions,
): string | null {
  if (written.length === 0) {
    return null;
  }

  const manifest = buildManifest({
    toolkitVersion: readVersion(),
    createdAt: (options.now?.() ?? new Date()).toISOString(),
    files: written,
  });
  if (!manifest.ok) {
    return manifest.refusal.reason;
  }

  mkdirSync(join(target, dirname(MANIFEST_PATH)), { recursive: true });
  writeFileSync(
    join(target, MANIFEST_PATH),
    serializeManifest(manifest.manifest),
    {
      encoding: 'utf8',
      flag: 'wx',
    },
  );
  return null;
}

/**
 * Whether this brain-relative path resolves anywhere other than inside `brain`.
 *
 * A symlink is the ordinary way a vault points one of its folders elsewhere,
 * and `mkdir -p` follows one without complaint. Init writes to the directory
 * the user named and to nothing else, so a path that leads out of it is left
 * alone rather than followed.
 */
function leavesBrain(path: string, brain: string): boolean {
  return !isInside(path, brain);
}

/** Why a starter file was not written. */
type SkipReason = 'occupied' | 'outside';

interface Skip {
  readonly path: string;
  readonly reason: SkipReason;
}

/**
 * Whether this write failed because something already occupies the path.
 *
 * The three errnos are one condition seen from three angles: the path is a
 * file (`EEXIST`), the path is a directory (`EISDIR`), or a parent of it is a
 * file (`ENOTDIR`). All three mean the same thing here — the user's bytes are
 * there and stay there. Anything else is a real failure and is rethrown.
 */
function isOccupied(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === 'EEXIST' || code === 'EISDIR' || code === 'ENOTDIR';
}

interface Report {
  readonly target: string;
  /** The brain's real path, so the summary and the writes agree on "inside". */
  readonly brain: string;
  readonly adopting: boolean;
  /**
   * Whether a manifest was already there when this run started. It is the one
   * thing this run knows about prior ownership, and all it is used for is to
   * stop the report claiming a skipped file belongs to nobody.
   */
  readonly claimedAlready: boolean;
  readonly written: readonly ManifestEntry[];
  readonly skipped: readonly Skip[];
}

/**
 * Say what happened, and nothing that did not.
 *
 * A report is the only account the user gets of what a tool did inside their
 * notes, so it lists the folders that are actually there rather than the ones
 * init meant to create, and it does not point at a file it did not write.
 */
function report(result: Report, streams: Streams): void {
  streams.out(
    result.adopting
      ? `Adopted the vault at ${result.target}\n`
      : `Initialized a brain at ${result.target}\n`,
  );
  streams.out('\n');
  for (const folder of STARTER_FOLDERS) {
    const path = join(result.target, folder);
    // The same test the writes used. A folder init refused to write through is
    // not one of the brain's folders, whatever it looks like from the outside.
    if (!leavesBrain(path, result.brain) && isDirectory(path)) {
      streams.out(`  ${folder}/\n`);
    }
  }
  streams.out('\n');
  // A run that wrote nothing wrote no manifest either: `claim` does not create
  // one for an empty set. Saying files were "recorded in" a file this run never
  // touched is the kind of confident falsehood a report exists to prevent.
  streams.out(
    result.written.length === 0
      ? `No starter files were written, and ${MANIFEST_PATH} was not changed.\n`
      : `${result.written.length} starter ${plural(result.written.length, 'file')}, recorded in ${MANIFEST_PATH}.\n`,
  );

  listSkipped(
    result.skipped.filter((skip) => skip.reason === 'occupied'),
    // "Unclaimed" is a statement about the whole vault, not about this run, and
    // it is only this run's to make when nothing was claiming anything before
    // it started. Where a manifest was already there, what it owns is 03.3's
    // question, and the report says the part that is certain and stops.
    result.claimedAlready
      ? 'already in your vault, left unchanged'
      : 'already in your vault, left unchanged and unclaimed',
    streams,
  );
  listSkipped(
    result.skipped.filter((skip) => skip.reason === 'outside'),
    `pointing outside ${result.target}, left alone`,
    streams,
  );

  streams.out('Everything else in that directory is yours.\n');

  if (result.written.some((entry) => entry.path === 'README.md')) {
    streams.out('\n');
    streams.out(`Start by reading ${join(result.target, 'README.md')}\n`);
  }
}

function listSkipped(
  skipped: readonly Skip[],
  why: string,
  streams: Streams,
): void {
  if (skipped.length === 0) {
    return;
  }
  streams.out(
    `Skipped ${skipped.length} starter ${plural(skipped.length, 'file')} ${why}:\n`,
  );
  for (const skip of skipped) {
    streams.out(`  ${skip.path}\n`);
  }
}

/** Whether this path is a directory now, following symlinks as the user would. */
function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

/**
 * Whether anything occupies this name, symlink included.
 *
 * `existsSync` follows the link and so calls a dangling symlink absent, which
 * is the wrong answer for a name init is about to try to create.
 */
function exists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
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
