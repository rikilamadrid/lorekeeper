/**
 * Representation-preserving mutation of a Markdown file's frontmatter.
 *
 * This module is the only place in the package that produces file text, and it
 * exists to honour one rule from the frozen v0.1 contract: a write never
 * serializes a parsed object back over a user's file. Every mutation here is a
 * splice into the smallest span of the original text that achieves the change.
 * Bytes nobody asked to change are not rewritten — not the author's quoting,
 * their comments, their indentation, their local-offset timestamps, their
 * unrecognized fields, nor their choice of line ending.
 *
 * YAML is still parsed, but only to *locate* things. The parser answers "where
 * does the `derived_from` value start", never "what should this file look
 * like".
 *
 * Two habits follow from that:
 *
 * - **Existing style is preserved, never normalized.** A flow list stays flow,
 *   a block list stays block, and a new entry copies the indentation and
 *   separator its neighbours use. Only a field being created from nothing has
 *   no style to preserve; it is written flow, which is what the contract's own
 *   fixtures and the prototype vault use.
 * - **When a file cannot be edited safely, nothing is written.** A mutation
 *   refuses rather than guesses — see {@link WriteRefusalCode}. Refusing leaves
 *   a defect in place, which is the lesser harm: validation already reports it,
 *   and repairing files is out of scope by contract.
 */

import {
  isMap,
  isScalar,
  isSeq,
  type Node,
  type Pair,
  parseDocument,
} from 'yaml';
import type { LoreDocument } from './document.js';
import { normalizeId } from './links.js';

/** A replacement of one byte range in a file's text. */
export interface Edit {
  /** Offset of the first byte replaced. */
  readonly start: number;
  /** Offset just past the last byte replaced. Equal to `start` for an insert. */
  readonly end: number;
  /** The text to put there. Empty for a deletion. */
  readonly text: string;
}

/**
 * Why a mutation declined to write.
 *
 * - `frontmatter-unreadable` — the block's YAML did not parse into a mapping,
 *   so there is no reliable place to put anything.
 * - `duplicate-key` — the field is declared more than once. Which declaration
 *   an edit belongs in is the author's answer to give, not this module's.
 * - `field-not-list` — the field holds a mapping. Turning it into a list would
 *   discard what is written there.
 * - `value-blank` — the caller passed an empty or whitespace-only ID. A blank
 *   provenance entry is a defect validation reports; writing one is worse.
 */
export type WriteRefusalCode =
  | 'frontmatter-unreadable'
  | 'duplicate-key'
  | 'field-not-list'
  | 'value-blank';

export interface WriteRefusal {
  readonly code: WriteRefusalCode;
  /** One sentence a human can act on. Never contains body text. */
  readonly reason: string;
}

export interface WriteResult {
  /** The resulting file text. Byte-identical to the input unless `changed`. */
  readonly text: string;
  /** Whether anything was written. `false` is the idempotent second run. */
  readonly changed: boolean;
  /** The exact spans replaced. Empty when nothing changed. */
  readonly edits: readonly Edit[];
  /** Non-null when the mutation declined to write. */
  readonly refusal: WriteRefusal | null;
}

/**
 * Apply edits to `text`.
 *
 * The primitive every mutation is built on. Edits are applied right to left so
 * earlier offsets stay valid, and overlapping edits throw rather than silently
 * producing text no caller intended. An empty edit list returns `text` itself,
 * which is what makes read-then-write with no mutation byte-exact.
 */
export function applyEdits(text: string, edits: readonly Edit[]): string {
  if (edits.length === 0) return text;

  const ordered = [...edits].sort((a, b) => a.start - b.start);
  let previousStart = text.length;
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    const edit = ordered[i] as Edit;
    if (edit.start < 0 || edit.end > text.length || edit.start > edit.end) {
      throw new RangeError(`edit ${edit.start}..${edit.end} is out of range`);
    }
    if (edit.end > previousStart) {
      throw new RangeError(`edit ${edit.start}..${edit.end} overlaps another`);
    }
    previousStart = edit.start;
  }

  let out = text;
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    const edit = ordered[i] as Edit;
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  return out;
}

const PROVENANCE_FIELD = 'derived_from';

/**
 * Record that this document was derived from the source `sourceId`.
 *
 * The edge points from the derived artifact to its origin; no inverse edge is
 * written anywhere. Adding an ID the file already carries changes nothing, so a
 * second run is a no-op — comparison is by {@link normalizeId}, so a
 * canonically equivalent spelling counts as already present and the author's
 * own spelling is left alone.
 */
export function addDerivedFrom(
  document: LoreDocument,
  sourceId: string,
): WriteResult {
  return mutate(document, sourceId, planAdd);
}

/**
 * Remove the provenance edge to `sourceId`, if this document carries it.
 *
 * Removing the field's last entry removes the field, because absence is how the
 * contract spells "unknown or unrecorded" — an empty list would assert
 * something stronger. An empty frontmatter block left behind is not removed:
 * this operation did not create the block and does not own it.
 *
 * That rule makes this the inverse of {@link addDerivedFrom} for every file
 * whose `derived_from` was absent or held real entries, but not for the two
 * degenerate spellings of emptiness — `derived_from:` with no value, and
 * `derived_from: []`. Adding to one of those and removing again leaves the
 * field gone rather than restored. Both spell absence either way; neither is
 * worth keeping a written-out empty field for.
 */
export function removeDerivedFrom(
  document: LoreDocument,
  sourceId: string,
): WriteResult {
  return mutate(document, sourceId, planRemove);
}

type Planner = (
  document: LoreDocument,
  value: string,
  located: Located,
) => Edit | null;

/** Where the field lives, once the block has been found and parsed. */
interface Located {
  readonly text: string;
  /** Offsets are absolute in `text`, not relative to the block. */
  readonly contentStart: number;
  readonly contentEnd: number;
  readonly pair: Pair<unknown, unknown> | null;
}

function mutate(
  document: LoreDocument,
  sourceId: string,
  plan: Planner,
): WriteResult {
  const value = sourceId.trim();
  if (value === '') {
    return refuse(
      document,
      'value-blank',
      'a provenance ID must be non-empty text',
    );
  }

  const located = locate(document);
  if ('code' in located) {
    return refuse(document, located.code, located.reason);
  }

  const edit = plan(document, value, located);
  if (edit === null) {
    return { text: document.text, changed: false, edits: [], refusal: null };
  }
  return {
    text: applyEdits(document.text, [edit]),
    changed: true,
    edits: [edit],
    refusal: null,
  };
}

function refuse(
  document: LoreDocument,
  code: WriteRefusalCode,
  reason: string,
): WriteResult {
  return {
    text: document.text,
    changed: false,
    edits: [],
    refusal: { code, reason },
  };
}

/** Find the field's pair, or say why the file cannot be edited. */
function locate(document: LoreDocument): Located | WriteRefusal {
  const block = document.block;
  if (block === null) {
    return {
      text: document.text,
      contentStart: 0,
      contentEnd: 0,
      pair: null,
    };
  }
  if (document.parseError !== null) {
    return {
      code: 'frontmatter-unreadable',
      reason: `frontmatter did not parse into a mapping: ${document.parseError}`,
    };
  }
  if (document.duplicateKeys.includes(PROVENANCE_FIELD)) {
    return {
      code: 'duplicate-key',
      reason: `frontmatter declares \`${PROVENANCE_FIELD}\` more than once; which one to edit is the author's choice`,
    };
  }

  const contents = parseDocument(block.raw).contents;
  const pair =
    contents !== null && contents !== undefined && isMap(contents)
      ? (contents.items.find(
          (item) =>
            isScalar(item.key) && String(item.key.value) === PROVENANCE_FIELD,
        ) ?? null)
      : null;

  // Editable shapes are: absent, a list, a lone ID, or a key with no value.
  // Anything else — a mapping, an alias, a tagged node — is something this
  // module would have to reinterpret rather than extend, so it declines.
  const value = pair === null ? null : pair.value;
  if (
    pair !== null &&
    value !== null &&
    value !== undefined &&
    !isSeq(value) &&
    !isScalar(value)
  ) {
    return {
      code: 'field-not-list',
      reason: isMap(value)
        ? `\`${PROVENANCE_FIELD}\` holds a mapping; editing it as a list would discard what is written there`
        : `\`${PROVENANCE_FIELD}\` holds neither a list nor a single ID; editing it would change what it means`,
    };
  }

  return {
    text: document.text,
    contentStart: block.contentStart,
    contentEnd: block.contentEnd,
    pair,
  };
}

function planAdd(
  document: LoreDocument,
  value: string,
  located: Located,
): Edit | null {
  const wanted = normalizeId(value);
  if (
    document.frontmatter.derivedFrom.some((id) => normalizeId(id) === wanted)
  ) {
    return null;
  }

  const { text, contentStart, contentEnd, pair } = located;

  // No block at all: write one, after any byte order mark.
  if (document.block === null) {
    const eol = dominantEol(text);
    const start = text.startsWith('\uFEFF') ? 1 : 0;
    return {
      start,
      end: start,
      text: `---${eol}${PROVENANCE_FIELD}: [${renderScalar(value)}]${eol}---${eol}`,
    };
  }

  // Block, but no such field: one new line at the end of the block.
  if (pair === null) {
    const eol =
      contentEnd > contentStart
        ? endingBefore(text, contentEnd)
        : document.block.eol;
    return {
      start: contentEnd,
      end: contentEnd,
      text: `${PROVENANCE_FIELD}: [${renderScalar(value)}]${eol}`,
    };
  }

  const node = pair.value;

  // `derived_from:` with nothing after it.
  if (
    node === null ||
    node === undefined ||
    (isScalar(node) && node.value === null)
  ) {
    const at =
      node === null || node === undefined
        ? contentStart + rangeOf(pair.key)[1]
        : contentStart + rangeOf(node)[0];
    return { start: at, end: at, text: ` [${renderScalar(value)}]` };
  }

  if (isSeq(node)) {
    const [seqStart, seqEnd] = rangeOf(node);
    // An empty list has no style to copy; give it the one entry.
    if (node.items.length === 0) {
      return {
        start: contentStart + seqStart,
        end: contentStart + seqEnd,
        text: `[${renderScalar(value)}]`,
      };
    }
    return node.flow === true
      ? appendToFlowSeq(text, contentStart, node.items, value)
      : appendToBlockSeq(
          text,
          contentStart,
          node.items,
          value,
          document.block.eol,
        );
  }

  // A lone scalar. Widening it in place edits one span and keeps the author's
  // own spelling of the existing ID, quoting and all.
  const [scalarStart, scalarEnd] = rangeOf(node);
  const existing = text.slice(
    contentStart + scalarStart,
    contentStart + scalarEnd,
  );
  return {
    start: contentStart + scalarStart,
    end: contentStart + scalarEnd,
    text: `[${existing}, ${renderScalar(value)}]`,
  };
}

function planRemove(
  document: LoreDocument,
  value: string,
  located: Located,
): Edit | null {
  const wanted = normalizeId(value);
  if (
    !document.frontmatter.derivedFrom.some((id) => normalizeId(id) === wanted)
  ) {
    return null;
  }

  const { text, contentStart, pair } = located;
  if (pair === null) return null;

  const node = pair.value;
  if (node === null || node === undefined) return null;

  if (isSeq(node)) {
    const index = node.items.findIndex(
      (item) => isScalar(item) && normalizeId(String(item.value)) === wanted,
    );
    if (index === -1) return null;
    if (node.items.length === 1) {
      // A block sequence's own range runs to the start of the next key, so the
      // last line of the *field* is the last line of its last item, not the
      // last line of the node. A flow sequence ends at its own `]`.
      const anchor =
        node.flow === true
          ? rangeOf(node)[1]
          : rangeOf(node.items[0] as Node)[1];
      return removeField(text, contentStart, pair, anchor);
    }

    return node.flow === true
      ? removeFromFlowSeq(contentStart, node.items, index)
      : removeLine(text, contentStart, node.items[index] as Node);
  }

  if (isScalar(node) && node.value !== null) {
    if (normalizeId(String(node.value)) !== wanted) return null;
    return removeField(text, contentStart, pair, rangeOf(node)[1]);
  }

  return null;
}

/** Append to `[a, b]`, copying whichever separator spelling is already in use. */
function appendToFlowSeq(
  text: string,
  contentStart: number,
  items: readonly unknown[],
  value: string,
): Edit {
  const last = items[items.length - 1] as Node;
  const at = contentStart + rangeOf(last)[1];
  let separator = ', ';
  if (items.length >= 2) {
    const previous = items[items.length - 2] as Node;
    const between = text.slice(
      contentStart + rangeOf(previous)[1],
      contentStart + rangeOf(last)[0],
    );
    if (between.includes(',')) separator = between;
  }
  return { start: at, end: at, text: `${separator}${renderScalar(value)}` };
}

/** Append a `- item` line, copying the indentation and dash spacing above it. */
function appendToBlockSeq(
  text: string,
  contentStart: number,
  items: readonly unknown[],
  value: string,
  fallbackEol: string,
): Edit {
  const last = items[items.length - 1] as Node;
  const [itemStart, itemEnd] = rangeOf(last);
  const lineStart = startOfLine(text, contentStart + itemStart);
  const line = text.slice(
    lineStart,
    endOfLineContent(text, contentStart + itemStart).end,
  );
  const prefix = /^[ \t]*-[ \t]+/.exec(line)?.[0] ?? '  - ';

  // Anchor on the item's last byte, so a value spread over several lines is
  // appended after all of it rather than into the middle.
  const { end, eol } = endOfLineContent(text, contentStart + itemEnd);
  return {
    start: end,
    end,
    text: `${eol === '' ? fallbackEol : eol}${prefix}${renderScalar(value)}`,
  };
}

/** Drop one entry from `[a, b, c]`, taking its separator with it. */
function removeFromFlowSeq(
  contentStart: number,
  items: readonly unknown[],
  index: number,
): Edit {
  const item = items[index] as Node;
  if (index > 0) {
    const previous = items[index - 1] as Node;
    return {
      start: contentStart + rangeOf(previous)[1],
      end: contentStart + rangeOf(item)[1],
      text: '',
    };
  }
  const next = items[1] as Node;
  return {
    start: contentStart + rangeOf(item)[0],
    end: contentStart + rangeOf(next)[0],
    text: '',
  };
}

/** Delete the whole line a node sits on, its line ending included. */
function removeLine(text: string, contentStart: number, node: Node): Edit {
  const [nodeStart, nodeEnd] = rangeOf(node);
  const start = startOfLine(text, contentStart + nodeStart);
  const { end, eol } = endOfLineContent(text, contentStart + nodeEnd);
  return { start, end: end + eol.length, text: '' };
}

/** Delete the field entirely: its key line through the last line of its value. */
function removeField(
  text: string,
  contentStart: number,
  pair: Pair<unknown, unknown>,
  valueEnd: number,
): Edit {
  const start = startOfLine(text, contentStart + rangeOf(pair.key)[0]);
  const { end, eol } = endOfLineContent(text, contentStart + valueEnd);
  return { start, end: end + eol.length, text: '' };
}

/** A YAML node's `[start, valueEnd, nodeEnd]` offsets, relative to the block. */
function rangeOf(node: unknown): [number, number, number] {
  const range = (node as { range?: [number, number, number] }).range;
  if (!range) throw new Error('YAML node has no source range');
  return range;
}

function startOfLine(text: string, index: number): number {
  const newline = text.lastIndexOf('\n', index - 1);
  return newline === -1 ? 0 : newline + 1;
}

/**
 * Where the line holding `index` stops, and how it ends.
 *
 * `end` excludes the line ending, so an insertion at `end` lands after the
 * line's last visible character. `eol` is empty only at end of file.
 */
function endOfLineContent(
  text: string,
  index: number,
): { end: number; eol: string } {
  const newline = text.indexOf('\n', index);
  if (newline === -1) return { end: text.length, eol: '' };
  if (newline > index && text[newline - 1] === '\r') {
    return { end: newline - 1, eol: '\r\n' };
  }
  return { end: newline, eol: '\n' };
}

/** The line ending of the line that stops at `index`. */
function endingBefore(text: string, index: number): string {
  return index >= 2 && text[index - 2] === '\r' ? '\r\n' : '\n';
}

/** The first line ending in the file, for a block that has none yet. */
function dominantEol(text: string): string {
  const newline = text.indexOf('\n');
  if (newline === -1) return '\n';
  return newline > 0 && text[newline - 1] === '\r' ? '\r\n' : '\n';
}

/** Anything YAML would read back as something other than this exact string. */
const NEEDS_QUOTING =
  /^([-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?|true|false|null|yes|no|on|off|~)$/i;
const PLAIN_SAFE = /^[A-Za-z0-9][A-Za-z0-9._/@+-]*$/;

/**
 * Render an ID as YAML that reads back as the same text.
 *
 * Plain where plain is unambiguous, single-quoted otherwise. Single quotes are
 * used rather than double so no backslash escaping enters the file.
 */
function renderScalar(value: string): string {
  if (PLAIN_SAFE.test(value) && !NEEDS_QUOTING.test(value)) return value;
  return `'${value.replace(/'/g, "''")}'`;
}
