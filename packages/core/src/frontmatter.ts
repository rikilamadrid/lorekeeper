/**
 * Locating and reading a Markdown file's YAML frontmatter.
 *
 * Two rules from the frozen v0.1 contract shape this module.
 *
 * Reads may parse freely, so a YAML parser is used here. Writes may not, so
 * every read hands back {@link FrontmatterBlock.raw} and the exact offsets the
 * block occupies. A later mutation edits that span; it never re-serializes
 * `data` over a user's file.
 *
 * Nothing is mandatory. A file with no frontmatter, an unterminated block, or
 * frontmatter YAML cannot parse is still valid indexable knowledge, so this
 * module never throws on content.
 */

import { isMap, isScalar, parseDocument, type YAMLMap } from 'yaml';

/** The exact text span a frontmatter block occupies in a file. */
export interface FrontmatterBlock {
  /** Offset of the opening delimiter. Always 0 — frontmatter starts the file. */
  readonly start: number;
  /** Offset just past the closing delimiter's line ending. */
  readonly end: number;
  /**
   * The text between the delimiters, byte-exact, including its final line
   * ending. Empty when the block holds no lines.
   */
  readonly raw: string;
  /** The line ending this block uses: `\n` or `\r\n`. */
  readonly eol: '\n' | '\r\n';
}

export interface FrontmatterRead {
  /** `null` when the file has no readable frontmatter block. */
  readonly block: FrontmatterBlock | null;
  /**
   * The parsed mapping. Empty when there is no block, when the block is empty,
   * when its YAML failed to parse, or when it is not a mapping at the top
   * level. Values are whatever YAML 1.2 core produces — notably, timestamps
   * stay strings, so an author's local offset survives a read.
   */
  readonly data: Readonly<Record<string, unknown>>;
  /** The parser's message when the block exists but did not yield a mapping. */
  readonly parseError: string | null;
  /**
   * Keys the block declares more than once, in order of first appearance.
   *
   * A duplicate is a defect in the file, not an accepted spelling, and it is
   * reported here so validation can say so. The read still returns the rest of
   * the mapping — losing an entire file's provenance to one repeated key would
   * be a worse outcome than a reported defect. Where a key repeats, `data`
   * holds the last value, which is what every YAML consumer will see.
   */
  readonly duplicateKeys: readonly string[];
  /** Everything after the block. The whole file when there is no block. */
  readonly body: string;
}

const OPENING = /^---[ \t]*(\r?\n)/;

/**
 * Read the frontmatter block of `text`, if it has one.
 *
 * A block exists only when the file opens with a `---` delimiter line and a
 * later line is exactly `---`. An unterminated opening delimiter is body text,
 * not a broken block: treating it as frontmatter would let a reassembly
 * duplicate the file.
 */
export function readFrontmatter(text: string): FrontmatterRead {
  const opening = OPENING.exec(text);
  if (!opening) {
    return noBlock(text);
  }

  const eol = opening[1] === '\r\n' ? '\r\n' : '\n';
  const contentStart = opening[0].length;
  const closing = findClosingDelimiter(text, contentStart);
  if (!closing) {
    return noBlock(text);
  }

  const raw = text.slice(contentStart, closing.start);
  const block: FrontmatterBlock = {
    start: 0,
    end: closing.end,
    raw,
    eol,
  };

  return {
    block,
    ...parseBlock(raw),
    body: text.slice(closing.end),
  };
}

/** A file with no readable frontmatter block: all of it is body. */
function noBlock(text: string): FrontmatterRead {
  return {
    block: null,
    data: {},
    parseError: null,
    duplicateKeys: [],
    body: text,
  };
}

/**
 * Find the closing `---` line at or after `from`.
 *
 * `start` is the offset of the delimiter line itself, so the caller can slice
 * the block content without it. `end` is past the delimiter's line ending, or
 * at end of file when the delimiter is the final line with no trailing newline.
 * Either line ending is accepted, so a file with mixed endings still reads.
 */
function findClosingDelimiter(
  text: string,
  from: number,
): { start: number; end: number } | null {
  let lineStart = from;
  while (lineStart <= text.length) {
    const newline = text.indexOf('\n', lineStart);
    const lineEnd = newline === -1 ? text.length : newline;
    const line = text.slice(lineStart, lineEnd);
    if (line.trimEnd() === '---') {
      return {
        start: lineStart,
        end: newline === -1 ? text.length : newline + 1,
      };
    }
    if (newline === -1) return null;
    lineStart = newline + 1;
  }
  return null;
}

function parseBlock(raw: string): {
  data: Readonly<Record<string, unknown>>;
  parseError: string | null;
  duplicateKeys: readonly string[];
} {
  const empty = { data: {}, parseError: null, duplicateKeys: [] };
  if (raw.trim() === '') return empty;

  try {
    const document = parseDocument(raw);

    // A duplicated key is recoverable: the mapping still parsed, and the
    // duplicate is reported rather than tolerated. Any other error means the
    // text does not describe a mapping, and guessing at one would invent
    // metadata the author did not write.
    const fatal = document.errors.find(
      (error) => error.code !== 'DUPLICATE_KEY',
    );
    if (fatal) {
      return { data: {}, parseError: fatal.message, duplicateKeys: [] };
    }

    const contents = document.contents;
    if (contents === null || contents === undefined) return empty;
    if (!isMap(contents)) {
      return {
        data: {},
        parseError: 'frontmatter is not a mapping',
        duplicateKeys: [],
      };
    }

    const parsed = document.toJS() as Record<string, unknown>;
    return {
      data: parsed,
      parseError: null,
      duplicateKeys: findDuplicateKeys(contents),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { data: {}, parseError: message, duplicateKeys: [] };
  }
}

/** Keys the mapping declares more than once, in order of first appearance. */
function findDuplicateKeys(contents: YAMLMap): readonly string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const item of contents.items) {
    const key = isScalar(item.key) ? String(item.key.value) : String(item.key);
    if (seen.has(key)) {
      if (!duplicates.includes(key)) duplicates.push(key);
    } else {
      seen.add(key);
    }
  }
  return duplicates;
}
