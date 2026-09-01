/**
 * What every command that touches an existing brain has to agree on.
 *
 * `lore init` established these rules while it was the only command that wrote
 * into someone's notes. They are not init's rules, though — they are the
 * toolkit's, and a second command that re-derived them would be a second
 * chance to get them subtly wrong. So they live here, once:
 *
 * - The ownership record is read, and every ambiguity in it refused, before
 *   the first byte is written.
 * - Nothing is claimed that was not written, and the claim is merged into the
 *   record that already exists rather than replacing it.
 * - A brain-relative path that resolves outside the brain is left alone, not
 *   followed. A vault is free to symlink one of its folders elsewhere, and
 *   following one would write outside the directory the user named.
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, sep } from 'node:path';
import {
  buildManifest,
  MANIFEST_PATH,
  type Manifest,
  type ManifestEntry,
  parseManifest,
  serializeManifest,
} from '@lorekeeper/core';

export type InstallationRead =
  | { readonly ok: true; readonly manifest: Manifest | null }
  | { readonly ok: false; readonly reason: string };

/**
 * Read the ownership record before the first write, refusing every ambiguity.
 *
 * `retry` names what the user would be doing again once they have fixed it —
 * "running init again", "capturing again" — because a refusal that cannot say
 * what to do next is only half a message.
 */
export function readInstallationManifest(
  target: string,
  retry: string,
): InstallationRead {
  const path = join(target, MANIFEST_PATH);
  if (!exists(path)) {
    return { ok: true, manifest: null };
  }

  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return {
      ok: false,
      reason: `${MANIFEST_PATH} in ${target} cannot be read. Fix its permissions or restore it from backup before ${retry}. Nothing was written.`,
    };
  }

  const parsed = parseManifest(text);
  if (!parsed.ok) {
    return {
      ok: false,
      reason: `${MANIFEST_PATH} in ${target} cannot be used: ${parsed.refusal.reason} Fix or restore it before ${retry}. Nothing was written.`,
    };
  }
  return { ok: true, manifest: parsed.manifest };
}

export type ClaimResult =
  | { readonly ok: true; readonly manifest: Manifest | null }
  | { readonly ok: false; readonly reason: string };

/** What a first claim stamps into a manifest that does not exist yet. */
export interface ClaimContext {
  readonly toolkitVersion: string;
  /** The clock, injected so a test can assert an exact manifest. */
  readonly now: () => Date;
}

/**
 * Write the manifest for what was actually written, or say why it could not be.
 *
 * A first claim creates with `wx`. Every later one updates the manifest the
 * toolkit already owns, preserving its provenance and every prior entry while
 * recording this run's writes.
 *
 * A write to a path the manifest already claims *refreshes* that entry rather
 * than adding a second one. The manifest may never hold one path twice —
 * `buildManifest` refuses that, and this function must not be the thing that
 * hands it a duplicate. Appending blindly is what turned an ordinary sequence
 * into a failure: capture a source, delete the file, capture it again. The
 * path is deterministic, so the second write lands exactly where the first
 * one did, and the run died reporting that its own path was "claimed more than
 * once" while leaving the manifest holding a hash for bytes that no longer
 * existed.
 *
 * Refreshing is the honest record in every case that can reach here, because
 * everything that calls this writes with `wx`. A file at a claimed path was
 * therefore absent a moment ago, and the entry describing it was already stale;
 * this run's hash is what is true now. No caller can use this to paper over a
 * user's edit, because a user's file is never overwritten in the first place.
 */
export function claim(
  target: string,
  written: readonly ManifestEntry[],
  existing: Manifest | null,
  context: ClaimContext,
): ClaimResult {
  if (written.length === 0) {
    return { ok: true, manifest: existing };
  }

  const manifest = buildManifest({
    toolkitVersion: existing?.toolkitVersion ?? context.toolkitVersion,
    createdAt: existing?.createdAt ?? context.now().toISOString(),
    files: merge(existing?.files ?? [], written),
  });
  if (!manifest.ok) {
    return { ok: false, reason: manifest.refusal.reason };
  }

  const path = join(target, MANIFEST_PATH);
  mkdirSync(dirname(path), { recursive: true });
  const serialized = serializeManifest(manifest.manifest);
  if (existing === null) {
    writeFileSync(path, serialized, { encoding: 'utf8', flag: 'wx' });
  } else {
    replaceManifest(path, serialized);
  }
  return { ok: true, manifest: manifest.manifest };
}

/**
 * Prior entries plus this run's, with a rewritten path carrying its new hash
 * instead of appearing twice.
 *
 * Order is irrelevant to the result — `buildManifest` sorts by path — so this
 * keeps it simple and preserves the order it was given.
 */
function merge(
  existing: readonly ManifestEntry[],
  written: readonly ManifestEntry[],
): ManifestEntry[] {
  const fresh = new Map(written.map((entry) => [entry.path, entry]));
  const merged = existing.map((entry) => fresh.get(entry.path) ?? entry);
  const kept = new Set(existing.map((entry) => entry.path));
  return [...merged, ...written.filter((entry) => !kept.has(entry.path))];
}

/** Replace an owned manifest atomically, leaving the old record intact on failure. */
function replaceManifest(path: string, serialized: string): void {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, serialized, { encoding: 'utf8', flag: 'wx' });
  try {
    renameSync(temporary, path);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // Preserve the replacement error; a leftover temp file owns no path.
    }
    throw error;
  }
}

/**
 * Whether this brain-relative path resolves anywhere other than inside `brain`.
 *
 * A symlink is the ordinary way a vault points one of its folders elsewhere,
 * and `mkdir -p` follows one without complaint. A command writes to the
 * directory the user named and to nothing else, so a path that leads out of it
 * is left alone rather than followed.
 */
export function leavesBrain(path: string, brain: string): boolean {
  return !isInside(path, brain);
}

/** Whether `path` is `root` or sits under it, with symlinks resolved. */
export function isInside(path: string, root: string): boolean {
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
 * Whether anything occupies this name, symlink included.
 *
 * `existsSync` follows the link and so calls a dangling symlink absent, which
 * is the wrong answer for a name a command is about to try to create.
 */
export function exists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether a regular file is what this name leads to, following symlinks.
 *
 * The question is not "is something here" — {@link exists} answers that — but
 * "could what is here be the file we mean". A directory could not, and neither
 * could a symlink pointing at nothing, which `stat` reports by refusing to
 * resolve.
 */
export function isRegularFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Whether this path is a directory now, following symlinks as the user would. */
export function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

/**
 * Whether this write failed because something already occupies the path.
 *
 * The three errnos are one condition seen from three angles: the path is a
 * file (`EEXIST`), the path is a directory (`EISDIR`), or a parent of it is a
 * file (`ENOTDIR`). All three mean the same thing here — the user's bytes are
 * there and stay there. Anything else is a real failure and is rethrown.
 */
export function isOccupied(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === 'EEXIST' || code === 'EISDIR' || code === 'ENOTDIR';
}
