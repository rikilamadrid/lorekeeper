/**
 * Walking the Markdown files of a brain, once, under rules every command shares.
 *
 * These rules were established by duplicate detection, which was the first
 * thing that had to read a whole vault it did not own. They are not that
 * feature's rules, though — they are the toolkit's, and a second walk that
 * re-derived them would be a second chance to get them subtly wrong:
 *
 * - Entries are visited in sorted order, so a vault holding the same content
 *   twice reports the same file every run. An answer that named a different
 *   path each time would be worse than useless.
 *
 * - No symlink is followed, and that falls out of how the entries are read
 *   rather than from a check applied to them. `readdirSync` with `withFileTypes`
 *   reports what each name *is*, not what it points at, so a symlink answers
 *   `false` to both `isDirectory()` and `isFile()` however it resolves. A
 *   symlinked folder is therefore never descended and a symlinked document
 *   never read.
 *
 *   That is the behavior this wants, for two reasons. A vault may symlink one
 *   of its folders somewhere else, and reading through one would touch files
 *   outside the directory the user named. And a cycle — a link pointing back at
 *   an ancestor — cannot arise, so the walk terminates on the directory tree
 *   alone. The cost is real and accepted: a document reachable only through a
 *   symlink is not seen.
 *
 * - Dot directories are skipped. `.lorekeeper/` is ownership metadata, not
 *   knowledge, and a dot directory in a vault is tooling state — `.obsidian/`,
 *   `.git/`. None of it holds a user's notes, and some of it is large.
 *
 * - A budget bounds the work, so a pathological directory is a finished run
 *   rather than one that appears to hang. Reaching it is reported rather than
 *   swallowed, because "I did not find it" and "I stopped looking" are
 *   different answers and callers act differently on them.
 *
 * Every read here is a read. Nothing in this module writes, moves, or repairs
 * anything, and a file it cannot read is skipped rather than judged.
 */

import { type Dirent, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isInside } from './brain.js';

/** The extension a document carries. Nothing else is read. */
export const MARKDOWN = '.md';

/**
 * How many files are examined before a walk gives up.
 *
 * The bound is not what rules out a symlink cycle. Nothing here follows a
 * symlink at all, so a cycle is not reachable in the first place.
 */
export const MAX_FILES_SCANNED = 50_000;

/** One Markdown file, as the walk found it. */
export interface WalkedFile {
  /** Absolute path on disk. */
  readonly path: string;
  /** POSIX path relative to the directory the walk started from. */
  readonly relative: string;
  /** The file's name without its extension — the name a link would use. */
  readonly name: string;
  readonly text: string;
}

/** What a visitor says about whether the walk should keep going. */
export type WalkVerdict = 'continue' | 'stop';

export interface WalkResult {
  /** Whether the walk hit its bound before it could finish. */
  readonly exhausted: boolean;
  /** Whether a visitor stopped the walk early. */
  readonly stopped: boolean;
}

/**
 * Visit every Markdown file under `target`, in sorted order.
 *
 * `brain` is taken and checked so the containment rule is stated where the walk
 * happens, rather than resting on a detail of `readdirSync` that a later edit
 * could drop without noticing.
 *
 * A visitor returning `'stop'` ends the walk — that is how a search for one
 * file avoids reading a whole vault after it has its answer.
 */
export function walkMarkdown(
  target: string,
  brain: string,
  visit: (file: WalkedFile) => WalkVerdict,
  budget: number = MAX_FILES_SCANNED,
): WalkResult {
  let remaining = budget;
  let stopped = false;

  const descend = (directory: string, prefix: string): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      // A directory that cannot be listed holds no answer this run. It is the
      // user's to fix, and refusing the whole command over it would be worse.
      return;
    }

    for (const entry of [...entries].sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    )) {
      if (stopped || remaining <= 0) {
        return;
      }
      const path = join(directory, entry.name);
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;

      // A symlink is neither a directory nor a file to `readdirSync`, so it
      // matches no branch below and is skipped without a decision being made
      // about it.
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.')) {
          continue;
        }
        // Belt and braces. A real directory is already inside the brain, so
        // this turns nothing away today; it is the line that keeps the walk
        // contained if the entry test above is ever loosened.
        if (!isInside(path, brain)) {
          continue;
        }
        descend(path, relative);
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith(MARKDOWN)) {
        continue;
      }
      remaining -= 1;

      let text: string;
      try {
        text = readFileSync(path, 'utf8');
      } catch {
        continue;
      }

      if (
        visit({
          path,
          relative,
          name: entry.name.slice(0, -MARKDOWN.length),
          text,
        }) === 'stop'
      ) {
        stopped = true;
        return;
      }
    }
  };

  descend(target, '');
  return { exhausted: !stopped && remaining <= 0, stopped };
}
