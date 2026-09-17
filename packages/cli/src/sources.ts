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

import { readDocument } from '@lorekeeper/core';
import { walkMarkdown } from './walk.js';

export interface SourceSearch {
  /** The brain-relative POSIX path of the file carrying `id`, or `null`. */
  readonly path: string | null;
  /** Whether the scan hit its bound before it could finish. */
  readonly exhausted: boolean;
}

/**
 * The file in this brain whose frontmatter `id` is `id`, if there is one.
 *
 * The walk's rules — sorted order, no symlink followed, dot directories
 * skipped, a bounded scan — live in `walk.js`, because indexing needs exactly
 * the same ones and two walks would be two chances to get them wrong. This
 * function adds only the question it asks of each file, and stops at the first
 * file that answers it.
 */
export function findSourceById(
  target: string,
  brain: string,
  id: string,
): SourceSearch {
  let found: string | null = null;

  const result = walkMarkdown(target, brain, (file) => {
    // `readDocument` never throws and reports a `parseError` instead, so a
    // brain holding one broken file still gets correct dedup for every other.
    const document = readDocument(file.name, file.text);
    if (document.frontmatter.id === id) {
      found = file.relative;
      return 'stop';
    }
    return 'continue';
  });

  return { path: found, exhausted: found === null && result.exhausted };
}
