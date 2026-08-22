/**
 * A Markdown file read as a Lorekeeper document.
 *
 * Reads never derive meaning from a file path. The caller supplies the
 * document's `name` — the identifier a name-based link would use, conventionally
 * the filename without its extension — and this module reads everything else
 * from the text itself. That is what lets a vault's folders be reorganized
 * without breaking retrieval.
 */

import { type LoreFrontmatter, toFrontmatter } from './fields.js';
import { type FrontmatterBlock, readFrontmatter } from './frontmatter.js';

export interface LoreDocument {
  /** The name a link would use to address this document. */
  readonly name: string;
  /** The original file text, byte-exact. Any mutation starts from this. */
  readonly text: string;
  /** The frontmatter span, or `null` when the file has none. */
  readonly block: FrontmatterBlock | null;
  readonly frontmatter: LoreFrontmatter;
  /** Everything after the frontmatter block. The whole file when there is none. */
  readonly body: string;
  /** The first H1 in the body — ATX or Setext — trimmed, or `null`. */
  readonly h1: string | null;
  /** The YAML parser's message when the block did not yield a mapping. */
  readonly parseError: string | null;
  /** Frontmatter keys this file declares more than once. Evidence for validation. */
  readonly duplicateKeys: readonly string[];
}

/**
 * Read one document. Never throws: unparseable frontmatter yields an empty
 * typed view and a `parseError`, because a file the tool cannot fully read is
 * still knowledge worth indexing.
 */
export function readDocument(name: string, text: string): LoreDocument {
  const { block, data, parseError, duplicateKeys, body } =
    readFrontmatter(text);
  return {
    name,
    text,
    block,
    frontmatter: toFrontmatter(data),
    body,
    h1: findH1(body),
    parseError,
    duplicateKeys,
  };
}

const ATX_H1 = /^#[ \t]+(.*)$/;
const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;
const SETEXT_H1_UNDERLINE = /^[ \t]{0,3}=+[ \t]*$/;
/** Line openers that start a block other than a paragraph. */
const NOT_PARAGRAPH = /^[ \t]{0,3}([#>*+-]|\d+[.)])([ \t]|$)/;

/**
 * The first H1 in the body, outside any fenced code block.
 *
 * Both Markdown spellings are read, whichever comes first:
 *
 * - ATX — `# Title`
 * - Setext — `Title` on one line, underlined by `=` on the next
 *
 * Only `=` underlines an H1. A `---` underline is Setext H2, and is left alone:
 * reading it as a heading would collide with the frontmatter delimiter this
 * reader already treats specially.
 *
 * A Setext underline titles the paragraph line above it, so that line must be
 * ordinary paragraph text — not blank, not a fence, and not the opener of a
 * list, blockquote, or ATX heading.
 */
function findH1(body: string): string | null {
  let fence: string | null = null;
  let previous: string | null = null;
  for (const rawLine of body.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1] as string;
      if (fence === null) {
        fence = marker[0] as string;
      } else if (marker[0] === fence) {
        fence = null;
      }
      previous = null;
      continue;
    }
    if (fence !== null) continue;

    if (previous !== null && SETEXT_H1_UNDERLINE.test(line)) {
      const title = previous.trim();
      if (title !== '') return title;
    }
    previous = isParagraphLine(line) ? line : null;

    const heading = ATX_H1.exec(line);
    if (heading) {
      // Trailing `#` characters are a closing sequence, not part of the title.
      const title = (heading[1] as string)
        .replace(/[ \t]+#+[ \t]*$/, '')
        .trim();
      if (title !== '') return title;
    }
  }
  return null;
}

/** Whether a line could be the content of a Setext heading. */
function isParagraphLine(line: string): boolean {
  return line.trim() !== '' && !NOT_PARAGRAPH.test(line);
}
