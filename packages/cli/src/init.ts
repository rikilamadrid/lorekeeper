/**
 * `lore init <target>` — turn a directory into a brain.
 *
 * Every `fs` call in Lorekeeper lives in this package. `packages/core` decides
 * what a manifest is; this decides what touches the disk. The rules every
 * command that writes into a brain has to share — reading the ownership record
 * before writing, claiming only what was written, refusing to follow a path out
 * of the brain — live in `brain.ts`, and what is left here is init's own.
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
 * Re-running reads the existing ownership record before touching the brain.
 * Owned paths are inspected for drift and never repaired here. A partial
 * installation may add only starter paths that are both missing and unowned;
 * those new entries are then merged into the existing manifest.
 *
 * A rerun that finds no manifest but does find traces of one is the case that
 * has no safe answer, so it gets no answer: init refuses rather than adopting
 * a brain it may have written itself. The evidence is the surviving bytes
 * themselves, complete or not and whether or not `.lorekeeper/` outlived the
 * record inside it. Where even that is gone — the directory removed and every
 * surviving starter edited — ownership cannot be reconstructed at all, and
 * this file does not pretend otherwise: a starter path whose history is
 * unknown is neither claimed nor declared the user's.
 */

import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  detectDrift,
  isOwned,
  MANIFEST_PATH,
  type Manifest,
  type ManifestEntry,
} from '@lorekeeper/core';
import {
  type ClaimContext,
  claim,
  exists,
  isDirectory,
  isInside,
  isOccupied,
  isRegularFile,
  leavesBrain,
  readInstallationManifest,
} from './brain.js';
import { hashBytes, hashText } from './hash.js';
import type { Streams } from './run.js';
import { STARTER_FILES, STARTER_FOLDERS, type StarterFile } from './starter.js';
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
  let existingManifest: Manifest | null = null;
  let resultingManifest: Manifest | null = null;

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

    const installation = readInstallationManifest(target, 'running init again');
    if (!installation.ok) {
      streams.err(`lore init: ${installation.reason}\n`);
      return 1;
    }
    existingManifest = installation.manifest;
    resultingManifest = existingManifest;

    const evidence =
      existingManifest === null
        ? findInstallationWithoutManifest(target, brain)
        : null;
    if (evidence !== null) {
      const observed =
        evidence === 'toolkit-content'
          ? 'Starter files this toolkit wrote are still here with nothing recording them'
          : 'Every starter path is already occupied';
      streams.err(
        `lore init: ${MANIFEST_PATH} is missing from an ambiguous Lorekeeper installation at ${target}. Nothing was written.\n`,
      );
      streams.err(
        `${observed}, so ownership cannot be determined safely. Restore the manifest from backup before running init again.\n`,
      );
      return 1;
    }

    if (existingManifest === null) {
      for (const folder of STARTER_FOLDERS) {
        if (leavesBrain(join(target, folder), brain)) {
          // Whatever this points at is not inside the brain, so it is not ours
          // to write into. The starter file below is skipped for the same reason.
          continue;
        }
        try {
          mkdirSync(join(target, folder), { recursive: true });
        } catch (error) {
          if (!isOccupied(error)) {
            throw error;
          }
          // Something of the user's already holds this name. It stays exactly
          // as it is, and the starter file below is skipped too.
        }
      }
    }
    for (const file of STARTER_FILES) {
      if (existingManifest !== null && isOwned(existingManifest, file.path)) {
        // Missing and modified owned files are drift. Init reports them below;
        // repairing either one belongs to `lore update`.
        continue;
      }
      const path = join(target, file.path);
      if (leavesBrain(path, brain)) {
        skipped.push({ path: file.path, reason: 'outside' });
        continue;
      }
      try {
        mkdirSync(dirname(path), { recursive: true });
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

    const claimed = claim(
      target,
      written,
      existingManifest,
      claimContext(options),
    );
    if (!claimed.ok) {
      streams.err(`lore init: ${claimed.reason}\n`);
      return 1;
    }
    resultingManifest = claimed.manifest;
  } catch (error) {
    // Whatever failed, the files already written are the toolkit's, and an
    // unclaimed starter file is the user's permanently — absence from the
    // manifest is a statement of ownership, not a gap. Claiming them is what
    // leaves a later run able to correct this one. Nothing is removed: deleting
    // inside someone's vault is not this command's decision to make.
    try {
      claim(target, written, existingManifest, claimContext(options));
    } catch {
      // The original failure is the one worth reporting.
    }
    streams.err(`lore init: ${(error as Error).message}\n`);
    return 1;
  }

  report(
    {
      target,
      brain,
      adopting,
      existingInstallation: existingManifest !== null,
      manifest: resultingManifest,
      written,
      skipped,
    },
    streams,
  );
  return 0;
}

/** What a manifest-less target shows of a Lorekeeper installation that was here. */
type InstallationEvidence = 'toolkit-content' | 'every-starter-occupied';

/**
 * The evidence that a removed ownership record left behind, or `null` when
 * there is none and this is an ordinary vault to adopt.
 *
 * Two classes of evidence, asked in order of what they actually prove.
 *
 * The strong one is content, and it is asked first and unconditionally. A
 * starter path holding exactly the bytes this toolkit writes is not a shape a
 * vault arrives at on its own, and one such file speaks whether or not the
 * rest of the starter set survived — a run that failed part way through leaves
 * precisely that gap. It speaks just as loudly when `.lorekeeper/` is gone as
 * when it remains: removing the directory and removing the file inside it are
 * the same gesture from the surviving files' point of view, and gating the
 * fingerprints on the directory is what let `rm -rf .lorekeeper` be read as a
 * clean adoption, writing down a new manifest that disowned six files this
 * toolkit had written.
 *
 * The weak one is occupancy, and it stays gated on `.lorekeeper/`. Every
 * starter path taken with no toolkit bytes anywhere is the fully-edited
 * installation, where nothing proves ownership and nothing rules it out; a
 * surviving metadata directory is the only thing separating that from an
 * ordinary vault whose six README names happen to be taken. The gate is what
 * keeps the weak signal from swallowing vaults adoption exists for, so it is
 * not widened to cover what the strong signal now handles on its own.
 *
 * Neither is turned into ownership. Both are refused, because what cannot be
 * proven here also must not be reported as definitely the user's: a starter
 * path called unclaimed is a path a later run would feel free to overwrite.
 *
 * Below both lies a case no rule reaches. A partial installation whose
 * `.lorekeeper/` is gone and whose every surviving starter has been edited
 * leaves no durable evidence at all, and init adopts it. That is not an
 * oversight to fix later: with the record deleted and the bytes rewritten,
 * nothing on disk distinguishes it from a vault that was always the user's,
 * and guessing would mean claiming files this toolkit cannot show it wrote.
 */
function findInstallationWithoutManifest(
  target: string,
  brain: string,
): InstallationEvidence | null {
  if (STARTER_FILES.some((file) => holdsToolkitContent(target, brain, file))) {
    return 'toolkit-content';
  }

  const metadata = join(target, dirname(MANIFEST_PATH));
  if (!exists(metadata) || !isDirectory(metadata)) {
    return null;
  }
  return STARTER_FILES.every((file) => exists(join(target, file.path)))
    ? 'every-starter-occupied'
    : null;
}

/** Whether this starter path still holds the exact bytes the toolkit writes. */
function holdsToolkitContent(
  target: string,
  brain: string,
  file: StarterFile,
): boolean {
  const path = join(target, file.path);
  if (leavesBrain(path, brain) || !isRegularFile(path)) {
    return false;
  }
  try {
    return hashBytes(readFileSync(path)) === hashText(file.content);
  } catch {
    // Unreadable is not evidence of anything, and is not an error to raise
    // here: the paths that are readable answer the question on their own.
    return false;
  }
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

/** Why a starter file was not written. */
type SkipReason = 'occupied' | 'outside';

interface Skip {
  readonly path: string;
  readonly reason: SkipReason;
}

/** The clock and version a first claim would stamp into a new manifest. */
function claimContext(options: InitOptions): ClaimContext {
  return {
    toolkitVersion: readVersion(),
    now: options.now ?? (() => new Date()),
  };
}

interface Report {
  readonly target: string;
  /** The brain's real path, so the summary and the writes agree on "inside". */
  readonly brain: string;
  readonly adopting: boolean;
  readonly existingInstallation: boolean;
  readonly manifest: Manifest | null;
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
    result.existingInstallation
      ? `Found an existing Lorekeeper installation at ${result.target}\n`
      : result.adopting
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
      ? result.existingInstallation
        ? `No changes were needed, and ${MANIFEST_PATH} was not changed.\n`
        : `No starter files were written, and ${MANIFEST_PATH} was not changed.\n`
      : result.existingInstallation
        ? `${result.written.length} missing starter ${plural(result.written.length, 'file')} added and recorded in ${MANIFEST_PATH}.\n`
        : `${result.written.length} starter ${plural(result.written.length, 'file')}, recorded in ${MANIFEST_PATH}.\n`,
  );

  if (result.existingInstallation && result.manifest !== null) {
    streams.out('\nOwned files:\n');
    for (const entry of inspectDrift(
      result.target,
      result.brain,
      result.manifest,
    )) {
      streams.out(`  ${entry.state}: ${entry.path}\n`);
    }
  }

  listSkipped(
    result.skipped.filter((skip) => skip.reason === 'occupied'),
    'already in your vault, left unchanged and unclaimed',
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

/** Observe only manifest-owned paths, and never follow one outside the brain. */
function inspectDrift(target: string, brain: string, manifest: Manifest) {
  const observed = new Map<string, string | null>();
  const unreadable = new Set<string>();
  for (const entry of manifest.files) {
    const path = join(target, entry.path);
    if (!exists(path)) {
      observed.set(entry.path, null);
      continue;
    }
    if (leavesBrain(path, brain) || !isRegularFile(path)) {
      observed.set(entry.path, 'not-the-owned-file');
      continue;
    }
    try {
      observed.set(entry.path, hashBytes(readFileSync(path)));
    } catch {
      unreadable.add(entry.path);
    }
  }
  return detectDrift(manifest, observed).map((entry) =>
    unreadable.has(entry.path)
      ? { path: entry.path, state: 'unreadable' as const }
      : entry,
  );
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

function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
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
