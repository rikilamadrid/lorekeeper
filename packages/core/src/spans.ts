/**
 * A document, split into the addressable pieces retrieval returns.
 *
 * The frozen v0.1 contract is that the index addresses locations — a file plus
 * a heading or block anchor, and a line range — and not whole files. A search
 * that could only say "the answer is somewhere in this note" would hand an
 * agent the same problem it was asked to solve.
 *
 * Splitting is structural first and size-bounded second. Headings are where a
 * human already decided one idea ends and the next begins, so they delimit
 * spans; a section longer than {@link MAX_SPAN_LINES} is then divided at a
 * blank line, because a span nobody can read in one screen is a file by another
 * name.
 *
 * Line numbers are 1-based and count from the first byte of the file,
 * frontmatter included. They are an address a person opens in an editor, so
 * they have to mean what the editor's gutter means.
 *
 * This module derives nothing from a file path. The caller supplies the path it
 * wants results addressed by, and meaning is read from the text — which is what
 * lets a vault's folders be reorganized without breaking retrieval.
 */

import type { LoreDocument } from './document.js';

/**
 * Lines a heading-delimited section may hold before it is divided further.
 *
 * Fixed in advance by prototype `retrieval-v0` and never tuned against a
 * failing question. Changing it changes what every stored line range means, so
 * it is a decision, not a knob.
 */
export const MAX_SPAN_LINES = 40;

/** What a span carries about the document it came from, for ranking. */
export interface SpanMeta {
  /** Frontmatter `title`, else the document's first H1, else its name. */
  readonly title: string;
  /** Enclosing headings, outermost first, excluding the span's own anchor. */
  readonly trail: readonly string[];
  readonly tags: readonly string[];
  readonly aliases: readonly string[];
  /**
   * PROVISIONAL `about`, carried as ordinary terms. Retrieval correctness must
   * not depend on it, and nothing here reads it as structure.
   */
  readonly about: readonly string[];
  /** Path segments above the file. Ergonomics only; never meaning. */
  readonly folder: readonly string[];
}

/** One addressable piece of one document. */
export interface Span {
  /** Brain-relative POSIX path, exactly as the caller supplied it. */
  readonly path: string;
  /**
   * The heading this span sits under, or `null` when it sits under none.
   *
   * `null` is deliberate. The contract says a heading or block anchor, and a
   * synthesized anchor would be neither — it would be an address that looks
   * citable and is not. A span with no anchor is still fully addressed, by
   * path and line range.
   */
  readonly anchor: string | null;
  /** First line of the span, 1-based, counting from the start of the file. */
  readonly startLine: number;
  /** Last line of the span, 1-based and inclusive. */
  readonly endLine: number;
  /** The span's text, trailing and leading blank lines trimmed. */
  readonly text: string;
  readonly meta: SpanMeta;
}

const ATX_HEADING = /^ {0,3}(#{1,6})\s+(.*)$/;

/**
 * The spans of one document.
 *
 * `path` is what results are addressed by and is never parsed for meaning; only
 * {@link SpanMeta.folder} uses its shape, and nothing ranks on that alone. A
 * document whose frontmatter could not be parsed still yields spans: a file the
 * toolkit cannot fully read is still knowledge worth retrieving.
 *
 * Returns an empty array only when the body holds no non-blank line. An empty
 * file has nothing to address, which is different from a file whose one span
 * happens to score low.
 */
export function spansOf(document: LoreDocument, path: string): readonly Span[] {
  const meta = metaOf(document, path);
  const offset = bodyLineOffset(document);
  const lines = document.body.split('\n');

  const sections = sectionsOf(lines);
  const spans: Span[] = [];

  for (const section of sections) {
    for (const part of divide(section.lines, section.start)) {
      const text = trimBlankEdges(part.lines);
      if (text.body === '') {
        continue;
      }
      const start = part.start + text.leading;
      spans.push({
        path,
        anchor: section.anchor,
        startLine: offset + start + 1,
        endLine: offset + start + text.height,
        text: text.body,
        meta: { ...meta, trail: section.trail },
      });
    }
  }

  return spans;
}

interface Section {
  readonly anchor: string | null;
  /** 0-based index into the body's lines of this section's first content line. */
  readonly start: number;
  readonly lines: readonly string[];
  readonly trail: readonly string[];
}

/**
 * The body split at ATX headings.
 *
 * A heading line is consumed by the section it opens rather than kept in it:
 * it is that section's anchor, and repeating it in the span text would rank the
 * same words twice, once as text and once as metadata.
 *
 * Setext headings are not delimiters here. `readDocument` reads a Setext H1 for
 * the title, but treating `---` as a heading underline mid-body would collide
 * with a thematic break, and guessing wrong splits a document at a horizontal
 * rule. A KNOWN LIMITATION, stated rather than hidden.
 */
function sectionsOf(lines: readonly string[]): readonly Section[] {
  const sections: Section[] = [];
  let anchor: string | null = null;
  let start = 0;
  let held: string[] = [];
  let trail: string[] = [];
  let openTrail: string[] = [];

  lines.forEach((line, index) => {
    const heading = ATX_HEADING.exec(line);
    if (heading === null) {
      held.push(line);
      return;
    }

    sections.push({ anchor, start, lines: held, trail });

    const depth = (heading[1] ?? '').length;
    const text = (heading[2] ?? '').trim();
    // A jump in depth — an H3 with no H2 above it — leaves gaps, so the trail
    // is what is actually there rather than what a well-formed document would
    // have had.
    openTrail = [...openTrail.slice(0, depth - 1)];
    trail = openTrail.filter(
      (entry): entry is string => typeof entry === 'string' && entry !== '',
    );
    openTrail[depth - 1] = text;
    anchor = text;
    start = index + 1;
    held = [];
  });

  sections.push({ anchor, start, lines: held, trail });
  return sections;
}

interface Part {
  readonly start: number;
  readonly lines: readonly string[];
}

/**
 * A section, divided at blank lines when it exceeds {@link MAX_SPAN_LINES}.
 *
 * Dividing only at a blank line keeps a paragraph, list, or fenced block whole
 * wherever the author left one, so a returned span is something a reader can
 * actually read. A section with no blank line in it is returned whole rather
 * than cut mid-sentence at an arbitrary count.
 */
function divide(lines: readonly string[], start: number): readonly Part[] {
  if (lines.length <= MAX_SPAN_LINES) {
    return [{ start, lines }];
  }

  const parts: Part[] = [];
  let held: string[] = [];
  let heldStart = start;

  lines.forEach((line, index) => {
    held.push(line);
    if (line.trim() === '' && held.length >= MAX_SPAN_LINES) {
      parts.push({ start: heldStart, lines: held });
      held = [];
      heldStart = start + index + 1;
    }
  });

  if (held.length > 0) {
    parts.push({ start: heldStart, lines: held });
  }
  return parts;
}

interface Trimmed {
  /** Blank lines dropped from the front, to be added to the start line. */
  readonly leading: number;
  /** Lines the trimmed text spans. */
  readonly height: number;
  readonly body: string;
}

/** The text with blank edges removed, and what that did to its line range. */
function trimBlankEdges(lines: readonly string[]): Trimmed {
  let first = 0;
  let last = lines.length - 1;
  while (first <= last && (lines[first] ?? '').trim() === '') first += 1;
  while (last >= first && (lines[last] ?? '').trim() === '') last -= 1;
  if (first > last) {
    return { leading: 0, height: 0, body: '' };
  }
  return {
    leading: first,
    height: last - first + 1,
    body: lines.slice(first, last + 1).join('\n'),
  };
}

/**
 * How many lines precede the body, so a body line can be reported as a file
 * line.
 *
 * Counted from the frontmatter block's own end offset rather than by splitting
 * the file, because the block reports exactly where it stops and re-deriving
 * that would be a second answer to a question already answered.
 */
function bodyLineOffset(document: LoreDocument): number {
  if (document.block === null) {
    return 0;
  }
  const consumed = document.text.slice(0, document.block.end);
  let lines = 0;
  for (const character of consumed) {
    if (character === '\n') lines += 1;
  }
  return lines;
}

function metaOf(document: LoreDocument, path: string): SpanMeta {
  const declared = document.frontmatter.unrecognized.title;
  const title =
    typeof declared === 'string' && declared.trim() !== ''
      ? declared.trim()
      : (document.h1 ?? document.name);

  const segments = path.split('/');
  return {
    title,
    trail: [],
    tags: document.frontmatter.tags,
    aliases: document.frontmatter.aliases,
    about: document.frontmatter.about,
    folder: segments.slice(0, -1).filter((segment) => segment !== ''),
  };
}
