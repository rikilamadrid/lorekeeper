/**
 * Finding a source already in the brain, by the stable ID it carries.
 *
 * Duplicate detection is the reason this exists, and it decides on one thing
 * only: the `id` in a file's frontmatter. Never the filename, never the folder,
 * never the URL text. The frozen v0.1 contract resolves provenance by stable
 * source ID, so the ID is the identity — and a user who renames or moves a
 * source has changed nothing about what it is. Matching on a path would answer
 * "have I seen this filename" when the question is "have I seen this source",
 * and would start writing second copies the moment someone tidied a folder.
 *
 * The search reads the whole brain rather than `sources/` alone, for the same
 * reason. A source that was filed somewhere else is still that source, and
 * capturing it a second time because it was not where this code expected would
 * be exactly the duplicate this is here to prevent.
 *
 * Every read here is a read. Nothing in this module writes, moves, or repairs
 * anything: it runs before the decision to write, over files that are mostly
 * the user's own, and a file it cannot parse is skipped rather than judged.
 * `readDocument` never throws and reports a `parseError` instead, so a brain
 * holding one broken file still gets correct dedup for every other.
 */

import { type Dirent, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { readDocument } from '@lorekeeper/core';
import { isInside } from './brain.js';

/** The extension a document carries. Nothing else is read. */
const MARKDOWN = '.md';

/**
 * How many files are examined before the search gives up.
 *
 * A bound exists so a pathological directory is a finished run rather than one
 * that appears to hang. Reaching it is reported by
 * {@link SourceSearch.exhausted} rather than swallowed, because "I did not find
 * it" and "I stopped looking" are different answers and only one of them makes
 * it safe to write.
 *
 * The bound is not what rules out a symlink cycle. Nothing here follows a
 * symlink at all — see {@link findSourceById} — so a cycle is not reachable in
 * the first place.
 */
const MAX_FILES_SCANNED = 50_000;

export interface SourceSearch {
  /** The brain-relative POSIX path of the file carrying `id`, or `null`. */
  readonly path: string | null;
  /** Whether the scan hit its bound before it could finish. */
  readonly exhausted: boolean;
}

/**
 * The file in this brain whose frontmatter `id` is `id`, if there is one.
 *
 * Directory entries are walked in sorted order so that a brain holding the
 * same ID twice — which validation reports as `duplicate-id`, and which this
 * function is not the place to fix — reports the same file every run. A
 * duplicate report that named a different path each time would be worse than
 * useless.
 *
 * No symlink is followed, and that falls out of how the entries are read rather
 * than from a check applied to them. `readdirSync` with `withFileTypes` reports
 * what each name *is*, not what it points at, so a symlink answers `false` to
 * both `isDirectory()` and `isFile()` however it resolves. A symlinked folder is
 * therefore never descended and a symlinked document never read.
 *
 * That is the behavior this scan wants, for two reasons. A vault may symlink one
 * of its folders somewhere else, and reading through one would scan files
 * outside the directory the user named. And a cycle — a link pointing back at an
 * ancestor — cannot arise, so the walk terminates on the directory tree alone.
 *
 * The cost is real and accepted: a source reachable only through a symlink is
 * not found, and capturing its URL again writes a second file. `brain` is still
 * taken and checked, so that the containment rule is stated where the walk
 * happens rather than resting on a detail of `readdirSync` that a later edit
 * could drop without noticing.
 */
export function findSourceById(
  target: string,
  brain: string,
  id: string,
): SourceSearch {
  let budget = MAX_FILES_SCANNED;

  const search = (directory: string, prefix: string): string | null => {
    let entries: Dirent[];
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      // A directory that cannot be listed holds no answer this run. It is the
      // user's to fix, and refusing the whole capture over it would be worse.
      return null;
    }

    for (const entry of [...entries].sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    )) {
      if (budget <= 0) {
        return null;
      }
      const path = join(directory, entry.name);
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;

      // A symlink is neither a directory nor a file to `readdirSync`, so it
      // matches no branch below and is skipped without a decision being made
      // about it.
      if (entry.isDirectory()) {
        // `.lorekeeper/` is ownership metadata, not knowledge, and a dot
        // directory in a vault is tooling state — `.obsidian/`, `.git/`. None
        // of it holds a source, and some of it is large.
        if (entry.name.startsWith('.')) {
          continue;
        }
        // Belt and braces. A real directory is already inside the brain, so
        // this turns nothing away today; it is the line that keeps the walk
        // contained if the entry test above is ever loosened.
        if (!isInside(path, brain)) {
          continue;
        }
        const found = search(path, relative);
        if (found !== null) {
          return found;
        }
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith(MARKDOWN)) {
        continue;
      }
      budget -= 1;

      let text: string;
      try {
        text = readFileSync(path, 'utf8');
      } catch {
        continue;
      }
      const document = readDocument(basename(entry.name, MARKDOWN), text);
      if (document.frontmatter.id === id) {
        return relative;
      }
    }
    return null;
  };

  const path = search(target, '');
  return { path, exhausted: path === null && budget <= 0 };
}
