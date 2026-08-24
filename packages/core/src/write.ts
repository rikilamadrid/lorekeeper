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
  isAlias,
  isMap,
  isNode,
  isScalar,
  isSeq,
  type Node,
  type Pair,
  parseDocument,
  visit,
} from 'yaml';
import { type LoreDocument, readDocument } from './document.js';
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
 * - `field-not-list` — the field holds something an edit would have to
 *   reinterpret rather than extend: a mapping, an alias, or a block scalar.
 *   A block scalar's span covers its `|` or `>` indicator and the indented
 *   lines under it, so there is no span that can be widened into a list
 *   without destroying the rest of the block.
 * - `anchor-aliased` — the field defines a YAML anchor that another field
 *   aliases. Editing the field would change what those other fields mean, and
 *   removing it would leave their aliases pointing at nothing.
 * - `value-blank` — the caller passed an empty or whitespace-only ID. A blank
 *   provenance entry is a defect validation reports; writing one is worse.
 * - `entry-not-removable` — the ID is in the read view, but the text does not
 *   spell it out anywhere this module can delete: an alias resolves to it.
 *   Removing it would mean editing what some other field defines, which is the
 *   author's edit to make. A merge key cannot put an ID here — the read view
 *   parses with `yaml`'s merge resolution off, so `<<` stays an ordinary key.
 * - `mutation-unsafe` — the edit was computed but its result did not read back
 *   as this module promised, so it was thrown away. This is the backstop for a
 *   representation nothing above anticipated; the file is returned untouched.
 */
export type WriteRefusalCode =
  | 'frontmatter-unreadable'
  | 'duplicate-key'
  | 'field-not-list'
  | 'anchor-aliased'
  | 'value-blank'
  | 'entry-not-removable'
  | 'mutation-unsafe';

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
  return mutate(document, sourceId, planAdd, 'present');
}

/**
 * Remove the provenance edge to `sourceId`, if this document carries it.
 *
 * What this promises is a postcondition, not one edit: afterwards the file
 * carries no such edge. A file that spells the same ID twice loses both. And
 * when the read view carries the ID but no text spells it out anywhere this
 * module can delete — an alias resolves to it — this refuses rather than
 * reporting the no-op it is not; see `entry-not-removable` in
 * {@link WriteRefusalCode}.
 *
 * Removing the field's last entry removes the field, because absence is how the
 * contract spells "unknown or unrecorded" — an empty list would assert
 * something stronger. An empty frontmatter block left behind is not removed:
 * this module cannot tell a block it created from one the author wrote, and
 * deleting the author's block would destroy bytes nobody asked it to touch.
 *
 * That rule makes this the inverse of {@link addDerivedFrom} for every file
 * whose `derived_from` was absent or held real entries, with three exceptions
 * where add-then-remove is *not* byte-identical to the original:
 *
 * - Any spelling of emptiness. `derived_from:` with no value, `derived_from:
 *   []`, an explicit `null`, `~` or `NULL`, and an anchored or tagged empty
 *   value all spell absence, so adding to one of them and removing again leaves
 *   the field gone rather than restored to the spelling it started with. None
 *   of them is worth keeping a written-out empty field for, and an anchor left
 *   behind on a field that no longer exists would be worse. That reasoning
 *   holds only because an anchor another field aliases is refused outright —
 *   see `anchor-aliased` in {@link WriteRefusalCode} — so the anchor dropped
 *   here is always one nothing else was using.
 * - A file with no frontmatter block at all. {@link addDerivedFrom} creates a
 *   block to hold the field; removing the field empties that block but leaves
 *   it in place, so the file keeps a `---`/`---` pair it did not start with.
 *   Removing it is the author's call, not this module's.
 * - A field holding a lone ID. {@link addDerivedFrom} widens `derived_from: a`
 *   in place into `derived_from: [a, b]`, because that is the one edit which
 *   keeps the author's spelling of `a`; removing `b` again deletes that entry's
 *   own span and leaves `derived_from: [a]`. The edge the file carries is the
 *   one it started with, spelled as a one-item list. Collapsing the brackets
 *   back would mean rewriting a value this module was not asked to touch, and
 *   it could not tell its own brackets from ones the author wrote there.
 *
 * Removing the field removes every byte of it, comments included: one trailing
 * its line, and any the author wrote *inside* a multi-line list. Both annotate
 * a field that will not be there, and flow and block spellings lose them alike.
 * Keeping them would leave a comment about nothing, attached to whatever field
 * happened to follow.
 */
export function removeDerivedFrom(
  document: LoreDocument,
  sourceId: string,
): WriteResult {
  return mutate(document, sourceId, planRemove, 'absent');
}

/**
 * Compute the edits one mutation needs.
 *
 * Three answers, and the difference between the last two is the whole point:
 * `null` means the requested logical state already holds and there is nothing
 * to do, a {@link WriteRefusal} means it does not hold and this module cannot
 * make it hold. Collapsing the second into the first would report "already
 * done" for work that never happened.
 */
type Planner = (
  document: LoreDocument,
  value: string,
  located: Located,
) => readonly Edit[] | WriteRefusal | null;

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
  expected: 'present' | 'absent',
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

  const planned = plan(document, value, located);
  if (planned === null) {
    return { text: document.text, changed: false, edits: [], refusal: null };
  }
  if (!Array.isArray(planned)) {
    const refusal = planned as WriteRefusal;
    return refuse(document, refusal.code, refusal.reason);
  }

  const edits = planned as readonly Edit[];
  const text = applyEdits(document.text, edits);
  const unsafe = checkResult(document, text, value, expected);
  if (unsafe !== null) {
    return refuse(document, unsafe.code, unsafe.reason);
  }

  return { text, changed: true, edits, refusal: null };
}

/**
 * Read the result back and confirm the mutation did what it claimed.
 *
 * Every branch above is meant to produce readable frontmatter carrying exactly
 * the requested change, and each has tests saying so. This is the backstop for
 * the representation nobody anticipated: a mutation that reports success must
 * survive a re-read, because a caller writing the returned text to disk has no
 * cheaper way to find out that it will not.
 *
 * Refusing here throws away a real edit, which is the lesser harm — the file on
 * disk is still whatever the author wrote, and the refusal names the field so
 * they can look at it. It is deliberately not a repair: guessing at a better
 * edit is what the rest of this module exists to avoid.
 */
function checkResult(
  document: LoreDocument,
  text: string,
  value: string,
  expected: 'present' | 'absent',
): WriteRefusal | null {
  const after = readDocument(document.name, text);
  if (after.parseError !== null) {
    return {
      code: 'mutation-unsafe',
      reason: `editing \`${PROVENANCE_FIELD}\` would leave frontmatter this tool can no longer read (${after.parseError}); the file was left unchanged`,
    };
  }

  // The read view coerces a list, dropping anything that is not text, so an
  // entry the edit emptied never reaches `derivedFrom` — a `[, y]` reads back
  // as the one ID it should and every other check here passes. The raw parsed
  // value is where an empty entry is still visible, and it is the shape a
  // misplaced separator produces, so it is checked before anything else.
  const blanks = blankEntries(after.frontmatter.data[PROVENANCE_FIELD]);
  if (blanks > blankEntries(document.frontmatter.data[PROVENANCE_FIELD])) {
    return {
      code: 'mutation-unsafe',
      reason: `editing \`${PROVENANCE_FIELD}\` would leave an empty entry in the list; the file was left unchanged`,
    };
  }

  const wanted = normalizeId(value);
  const present = after.frontmatter.derivedFrom.some(
    (id) => normalizeId(id) === wanted,
  );
  if (present !== (expected === 'present')) {
    return {
      code: 'mutation-unsafe',
      reason: `editing \`${PROVENANCE_FIELD}\` did not leave the entry ${expected} as intended; the file was left unchanged`,
    };
  }

  // The entry asked about is only half the promise. Every *other* entry has to
  // come through untouched and in the order the author left it, which is what
  // a span that reached too far would break — an add appends and a remove
  // deletes in place, so nothing legitimate here reorders or drops a survivor.
  //
  // A blank the author already had is not a survivor: every spelling of an
  // empty value is replaced outright by a field being written, and the count
  // of blanks is checked above rather than here.
  const survivors = (document_: LoreDocument): string[] =>
    document_.frontmatter.derivedFrom
      .map(normalizeId)
      .filter((id) => id !== '' && id !== wanted);
  const before = survivors(document);
  const kept = survivors(after);
  if (
    kept.length !== before.length ||
    kept.some((id, index) => id !== before[index])
  ) {
    return {
      code: 'mutation-unsafe',
      reason: `editing \`${PROVENANCE_FIELD}\` would change the other entries in the list; the file was left unchanged`,
    };
  }

  return null;
}

/**
 * How many entries of a parsed list hold nothing.
 *
 * Counted rather than merely detected, because a file may already carry one:
 * this exists to catch an entry an *edit* emptied, and refusing over one the
 * author wrote would make their file unmutable for a defect validation already
 * reports.
 */
function blankEntries(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  return value.filter(
    (item) => item === null || item === undefined || item === '',
  ).length;
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

  // `!!omap` and `!!pairs` are sequences, so `isSeq` accepts them, but their
  // entries parse as `Pair` rather than as nodes: they carry no source range,
  // so there is no span to append after or delete. They are key/value pairs
  // rather than IDs anyway, which is not the list this field means.
  if (isSeq(value) && value.items.some((item) => !isNode(item))) {
    return {
      code: 'field-not-list',
      reason: `\`${PROVENANCE_FIELD}\` holds a list of key/value pairs rather than a list of IDs; editing it would change what it means`,
    };
  }

  // A block scalar looks like a lone ID to `isScalar`, but its span covers the
  // `|` or `>` indicator and every indented line beneath it. Widening that span
  // into `[...]` produces text that is not YAML at all, and the damage does not
  // stop at this field: the fields below it get swallowed into the broken line.
  // There is no smaller span to edit, so there is nothing safe to do here.
  if (isScalar(value) && isBlockScalar(value)) {
    return {
      code: 'field-not-list',
      reason: `\`${PROVENANCE_FIELD}\` holds a block scalar; there is no span that can be widened into a list without breaking the rest of the frontmatter`,
    };
  }

  if (pair !== null && contents !== null && contents !== undefined) {
    const anchor = anchorAliasedElsewhere(contents as Node, pair);
    if (anchor !== null) {
      return {
        code: 'anchor-aliased',
        reason: `\`${PROVENANCE_FIELD}\` defines the anchor \`&${anchor}\`, which another field aliases; edit or remove that alias first, or give the other field its own value`,
      };
    }
  }

  return {
    text: document.text,
    contentStart: block.contentStart,
    contentEnd: block.contentEnd,
    pair,
  };
}

/**
 * Adding never refuses on its own: `locate` has already turned away every
 * representation this cannot extend, so what is left needs exactly one edit.
 */
function planAdd(
  document: LoreDocument,
  value: string,
  located: Located,
): readonly Edit[] | null {
  const edit = addEdit(document, value, located);
  return edit === null ? null : [edit];
}

function addEdit(
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

  // An explicit key — `? derived_from` — has no value node and no colon to put
  // one after. YAML's own answer is a `: value` line under the key, which is
  // also the only edit here that leaves the key's own bytes alone.
  if (node === null || node === undefined) {
    const { end, eol } = endOfLineContent(
      text,
      contentStart + rangeOf(pair.key)[1],
    );
    return {
      start: end,
      end,
      text: `${eol === '' ? document.block.eol : eol}: [${renderScalar(value)}]`,
    };
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
      ? appendToFlowSeq(text, contentStart, node, value)
      : appendToBlockSeq(
          text,
          contentStart,
          node.items,
          value,
          document.block.eol,
        );
  }

  // Everything still here is a scalar; `locate` refused every other shape. The
  // parser reports one span for whatever follows the colon, and it is that
  // span — not the parsed value — that says whether a value was written at all.
  const [scalarStart, scalarEnd] = rangeOf(node);
  const start = contentStart + scalarStart;
  const end = contentStart + scalarEnd;

  // An *empty* span means nothing was written: `derived_from:`,
  // `derived_from: # why`, `derived_from: &a`, `derived_from: !!null`. The span
  // already sits past any anchor or tag, so writing there leaves those
  // properties in the one position where they are legal. YAML places it at the
  // trailing comment when there is one, so the insertion backs up over the
  // spacing in between: the comment and the author's own spacing survive.
  if (start === end) {
    const at = backUpOverSpacing(text, start, contentStart);
    return spliceValue(text, at, at, `[${renderScalar(value)}]`);
  }

  // A *non-empty* span holding null is an explicit spelling — `null`, `~`,
  // `NULL`. Those bytes are the value, so they are what the new value replaces;
  // inserting beside them would leave two values on the line.
  if (isScalar(node) && node.value === null) {
    return spliceValue(text, start, end, `[${renderScalar(value)}]`);
  }

  // A lone ID. Widening it in place edits one span and keeps the author's
  // own spelling of the existing ID, quoting and all.
  const existing = text.slice(start, end);
  return spliceValue(text, start, end, `[${existing}, ${renderScalar(value)}]`);
}

/**
 * Removing has a postcondition, not a target: the edge must be *absent*
 * afterwards. So every occurrence goes, not just the first — a file that spells
 * the same ID twice would otherwise keep the edge after a successful-looking
 * removal, and re-running would never help.
 *
 * The only `null` here is the one at the top: the read view does not carry the
 * ID, so there is nothing to do. Past that point the ID is present, and a shape
 * this cannot delete is a refusal rather than a quiet no-op — see
 * `entry-not-removable` in {@link WriteRefusalCode}.
 */
function planRemove(
  document: LoreDocument,
  value: string,
  located: Located,
): readonly Edit[] | WriteRefusal | null {
  const wanted = normalizeId(value);
  if (
    !document.frontmatter.derivedFrom.some((id) => normalizeId(id) === wanted)
  ) {
    return null;
  }

  const { text, contentStart, pair } = located;
  if (pair === null) return notRemovable();

  const node = pair.value;
  if (node === null || node === undefined) return notRemovable();

  if (isSeq(node)) {
    const matches: number[] = [];
    node.items.forEach((item, index) => {
      if (isScalar(item) && normalizeId(String(item.value)) === wanted) {
        matches.push(index);
      }
    });
    if (matches.length === 0) return notRemovable();

    if (matches.length === node.items.length) {
      // A block sequence's own range runs to the start of the next key, so the
      // last line of the *field* is the last line of its last item, not the
      // last line of the node. A flow sequence ends at its own `]`.
      const last = node.items[node.items.length - 1] as Node;
      const anchor = node.flow === true ? rangeOf(node)[1] : rangeOf(last)[1];
      return [removeField(text, contentStart, pair, anchor)];
    }

    return node.flow === true
      ? removeFromFlowSeq(text, contentStart, node, matches)
      : matches.map((index) =>
          removeLine(text, contentStart, node.items[index] as Node),
        );
  }

  if (isScalar(node) && node.value !== null) {
    if (normalizeId(String(node.value)) !== wanted) return notRemovable();
    return [removeField(text, contentStart, pair, rangeOf(node)[1])];
  }

  return notRemovable();
}

/** The ID is in the read view, but no text this module owns spells it out. */
function notRemovable(): WriteRefusal {
  return {
    code: 'entry-not-removable',
    reason: `\`${PROVENANCE_FIELD}\` carries this ID through something other than a plain entry — an alias resolves to it — so removing it means editing what another field defines`,
  };
}

/**
 * Append to `[a, b]`, copying whichever separator spelling is already in use.
 *
 * The separator is the gap between the last two entries, but only the part of
 * that gap which is separator. {@link entryStart} says where the last entry's
 * own bytes begin, so a tag or an anchor written in front of it stays behind
 * instead of being copied onto the new entry. A gap holding a comment has no
 * separator worth copying — the comment is the author's own text, not a
 * spelling — so it falls back to `, `.
 *
 * A comment trailing the last entry belongs to that entry, under the same line
 * rule {@link removeFromFlowSeq} follows, so the new entry goes on its own line
 * *after* the comment. Such a list always has a line ending past the comment: a
 * `]` written after a `#` would be inside the comment, and the list would not
 * be closed at all.
 *
 * When the author wrote no comma before the comment, the separator this needs
 * goes on the new line too, in front of the new entry. YAML reads a flow
 * sequence across line breaks, so `y # note` / `, abc` is the same list as
 * `y, # note` / `abc` — and it leaves the author's line untouched to the byte.
 * That is what makes the edit retractable: everything this wrote sits on one
 * line nothing else owns, so removing the entry again takes the line with it
 * and hands back the original file. A comma written in front of the comment
 * instead would be indistinguishable from one the author wrote there, and
 * removal would have to guess.
 */
function appendToFlowSeq(
  text: string,
  contentStart: number,
  seq: Node & { items: readonly unknown[] },
  value: string,
): Edit {
  const { items } = seq;
  const last = items[items.length - 1] as Node;
  const valueEnd = contentStart + rangeOf(last)[1];

  const trailing = sameLineComment(
    text,
    valueEnd,
    contentStart + rangeOf(seq)[1],
  );
  if (trailing !== null) {
    const indent = continuationIndent(text, contentStart, seq, valueEnd);
    const { eol } = endOfLineContent(text, trailing.end);
    // A list spelled with a trailing comma already has its separator; one
    // without needs it, and it goes on the new line rather than the author's.
    // Only the bytes in front of the `#` answer that: a comma inside the
    // comment is the author's prose, not a separator.
    const comma = text.slice(valueEnd, trailing.start).includes(',')
      ? ''
      : ', ';
    return {
      start: trailing.end,
      end: trailing.end,
      text: `${eol === '' ? dominantEol(text) : eol}${indent}${comma}${renderScalar(value)}`,
    };
  }

  let separator = ', ';
  if (items.length >= 2) {
    const previousEnd =
      contentStart + rangeOf(items[items.length - 2] as Node)[1];
    const own = entryStart(text, previousEnd, contentStart + rangeOf(last)[0]);
    const between = text.slice(previousEnd, own.start);
    if (!own.commented && between.includes(',')) separator = between;
  }
  return {
    start: valueEnd,
    end: valueEnd,
    text: `${separator}${renderScalar(value)}`,
  };
}

/**
 * The indentation a new line of a flow sequence has to carry.
 *
 * A flow collection inside a block mapping must be indented further than the
 * key that holds it, so the indentation of the line the last entry sits on is
 * only usable when that line belongs to the sequence. When the author opened
 * the list on the field's own line — `derived_from: [a # note` — that line's
 * indentation is the *key's*, and copying it would write the new entry at or
 * left of the key, which YAML refuses to read as a continuation.
 *
 * The line the `]` sits on answers it instead. Such a list always has one: a
 * `]` written after a `#` would be inside the comment, so a list whose last
 * entry carries a trailing comment is closed on a later line, and the author
 * already indented that line far enough for the file to parse. Only if that
 * somehow gives nothing deeper than the key does this fall back to a step in
 * from the key's own indentation.
 *
 * Depth is counted in spaces, never in characters. Only spaces indent a YAML
 * line: a tab ends the indentation and is separation from there on, which a
 * flow collection allows but which cannot make the line any deeper. So a `]`
 * the author put on a tab-indented line looks indented and is not, and copying
 * those bytes onto a line of this module's own making would produce
 * frontmatter YAML no longer reads — an edit computed and then refused,
 * blaming the author's file for bytes this module wrote.
 */
function continuationIndent(
  text: string,
  contentStart: number,
  seq: Node & { items: readonly unknown[] },
  valueEnd: number,
): string {
  const indentAt = (index: number): string => {
    const lineStart = startOfLine(text, index);
    return /^[ \t]*/.exec(text.slice(lineStart, index))?.[0] ?? '';
  };
  const depth = (indent: string): number =>
    (/^ */.exec(indent)?.[0] ?? '').length;

  const open = contentStart + rangeOf(seq)[0];
  const lineStart = startOfLine(text, valueEnd);
  const indent = indentAt(valueEnd);

  // Anything but blanks in front of the `[` on its own line means the key is
  // there, so this line's indentation is the key's rather than the list's.
  const sharesKeyLine =
    lineStart === startOfLine(text, open) &&
    /[^ \t]/.test(text.slice(lineStart, open));
  if (!sharesKeyLine) return indent;

  const close = indentAt(contentStart + rangeOf(seq)[1] - 1);
  return depth(close) > depth(indent) ? close : `${indent}  `;
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

/**
 * Drop entries from `[a, b, c]`, each run of them taking one separator with it.
 *
 * Adjacent entries are dropped as one span rather than one edit each, because
 * two entries deleted side by side would otherwise both claim the comma between
 * them and `applyEdits` would reject the overlap. Callers remove a strict
 * subset — an all-entries removal takes the whole field instead — so a leading
 * run always has a surviving entry after it to delete up to.
 *
 * Which separator a run takes depends on what sits before it. Normally it takes
 * the comma behind it, so the span runs from the previous entry's last byte.
 * That span is wrong in two cases, and both are answered by starting at the
 * run's own first byte and taking the comma *ahead* of it instead:
 *
 * - A run that starts the list has nothing behind it to delete from.
 * - A comment behind the run belongs to the entry it trails, not to the run,
 *   and a span reaching back past it would delete it silently.
 *
 * A run's own first byte is not its value's first byte: a tag or an anchor is
 * written before the value and `yaml` reports the range of the value alone. So
 * both ends of every span are {@link entryStart} rather than a raw range, which
 * is what keeps a removed entry's tag from migrating onto its successor and
 * keeps a survivor's tag from being deleted along with the entry before it.
 *
 * A run that ends the list keeps the comma behind it and takes any comma the
 * author wrote after it instead — see {@link pastTrailingComma}. Keeping both
 * would leave two commas side by side, which YAML rejects outright.
 *
 * Comments are split by where the author put them, which is the same rule a
 * block sequence follows by deleting whole lines:
 *
 * - A comment sharing a line with the run's last entry, and written inside the
 *   sequence, trails that entry and belongs to it, so it goes when the entry
 *   goes — see {@link sameLineComment}, which is bounded by the sequence's
 *   own range. A comment past the closing bracket shares that line too but
 *   belongs to the field, not to any entry, and stays where it is:
 *   `[x, y, abc] # note` keeps its comment. A run with a trailing comment
 *   always takes the comma ahead, because the comment sits past that comma and
 *   a span reaching it from behind would take both commas and leave nothing
 *   between the survivors.
 * - A comment on its own line belongs to neither neighbour and is left where
 *   it is. Nothing here rewrites one, and a span that could only reach its
 *   separator by crossing one gives up that separator instead.
 *
 * A run written on lines of its own takes those lines whole, indentation and
 * line ending included — see {@link reclaimOwnLine}. That is the last thing
 * standing between this and a block sequence, which has deleted whole lines all
 * along.
 */
function removeFromFlowSeq(
  text: string,
  contentStart: number,
  seq: Node & { items: readonly unknown[] },
  indices: readonly number[],
): Edit[] {
  const { items } = seq;
  const edits: Edit[] = [];

  // Where the bytes available to entry `index` begin: just inside the `[` for
  // the first entry, and the previous entry's last byte for every other.
  const gapStart = (index: number): number =>
    index === 0
      ? contentStart + rangeOf(seq)[0] + 1
      : contentStart + rangeOf(items[index - 1] as Node)[1];

  const startOf = (index: number): EntryStart =>
    entryStart(
      text,
      gapStart(index),
      contentStart + rangeOf(items[index] as Node)[0],
    );

  for (let i = 0; i < indices.length; ) {
    let last = i;
    while (
      last + 1 < indices.length &&
      (indices[last + 1] as number) === (indices[last] as number) + 1
    ) {
      last += 1;
    }
    const first = indices[i] as number;
    const through = indices[last] as number;
    const own = startOf(first);
    const valueEnd = contentStart + rangeOf(items[through] as Node)[1];
    const trailing = sameLineComment(
      text,
      valueEnd,
      through + 1 < items.length
        ? contentStart + rangeOf(items[through + 1] as Node)[0]
        : contentStart + rangeOf(seq)[1],
    );

    if (first > 0 && !own.commented && trailing === null) {
      edits.push({
        start: contentStart + rangeOf(items[first - 1] as Node)[1],
        end: valueEnd,
        text: '',
      });
    } else {
      // No comma behind to take, so take the one ahead, and the run's own
      // trailing comment with it. The comma behind the run stays put and
      // separates whatever ends up on either side of it.
      //
      // Where that comma ahead sits is the author's choice, and a trailing
      // comment does not settle it: `abc, # note` puts it in front of the
      // comment, `abc # note` / `, y` puts it on the next line behind. So the
      // comment is taken first and the span reaches forward afterwards, unless
      // the comma is already inside it. Stopping at the comment would leave the
      // comma with nothing in front of it, which YAML does not read as
      // punctuation it can ignore.
      //
      // Exactly one comma leaves with the run. That is what the bookkeeping
      // here is for: a run that gave up both separators would leave the
      // survivors on either side with nothing between them.
      let end = trailing === null ? valueEnd : trailing.end;
      let commaGone = text
        .slice(valueEnd, trailing === null ? end : trailing.start)
        .includes(',');
      const detached: Edit[] = [];

      if (!commaGone && through + 1 < items.length) {
        const ahead = commaAhead(
          text,
          end,
          contentStart + rangeOf(items[through + 1] as Node)[0],
        );
        if (ahead !== null) {
          commaGone = true;
          // A comment standing between the run and its separator belongs to
          // neither, so the span cannot swallow it on the way. The comma goes
          // as an edit of its own and the comment is left exactly where it is.
          if (ahead.detached) {
            detached.push({ start: ahead.at, end: ahead.through, text: '' });
          } else {
            end = ahead.through;
          }
        }
      } else if (!commaGone && !ownsLineBehindComma(text, own.start, end)) {
        const past = pastTrailingComma(
          text,
          end,
          contentStart + rangeOf(seq)[1],
        );
        commaGone = past !== end;
        end = past;
      }

      edits.push({
        ...reclaimOwnLine(text, own.start, end, commaGone),
        text: '',
      });
      edits.push(...detached);
    }
    i = last + 1;
  }
  return edits;
}

/**
 * Whether the run's separator is the comma behind it, on a line of its own.
 *
 * A run ending the list normally takes the comma the author wrote after it,
 * because the comma behind it separates an entry a comment belongs to and
 * cannot be reached without deleting that comment — see
 * {@link pastTrailingComma}. That is wrong for the one shape
 * {@link appendToFlowSeq} writes when the entry above carries a trailing
 * comment: the separator goes on the new line, in front of the new entry, so
 * the comma behind the run is the run's own and no comment stands between
 * them. Reaching forward there would take a comma the author wrote further
 * down and leave the tool's in its place, so an added edge removed again would
 * hand back a file spelled differently from the one it was given.
 *
 * The shape is a comma with nothing but blanks between it and the run, nothing
 * but a line ending behind it, and nothing but blanks after the run to the end
 * of the line — which is exactly when {@link reclaimOwnLine} takes that comma
 * along with the line. A run cannot give up two separators, so where this
 * holds, the forward reach is skipped.
 */
function ownsLineBehindComma(
  text: string,
  start: number,
  end: number,
): boolean {
  const line = endOfLineContent(text, end);
  if (/[^ \t]/.test(text.slice(end, line.end))) return false;

  const comma = backUpOverSpacing(text, start, 0);
  if (text[comma - 1] !== ',') return false;

  const lineStart = backUpOverSpacing(text, comma - 1, 0);
  return lineStart > 0 && text[lineStart - 1] === '\n';
}

/**
 * Widen a span to the whole line, when the run it deletes had that line to
 * itself.
 *
 * An entry alone on a line owns the line ending in front of it and the
 * indentation after that — the same bytes a block sequence loses when it
 * deletes an entry's line. Leaving them behind is what made an add followed by
 * a remove hand back a file the author would not recognize: a blank indented
 * line where the entry had been.
 *
 * The comma in front of the run goes too, but only when the span does not
 * already take one ahead of it. A run cannot give up both of its separators:
 * the survivors on either side would be left with nothing between them, which
 * for two plain scalars is not two entries at all but one value spread over
 * two lines.
 *
 * No line is reclaimed when the span stops short of its line's end, because
 * what follows it there belongs to a surviving entry: deleting the line ending
 * in front would pull that entry up onto the line above, and deleting the
 * indentation would move it left of where the author put it. The blanks in
 * front of the run still go, though — they are the gap the author left after
 * the separator, and that separator leaves on one side of the deletion or the
 * other. Leaving them behind is what made add-then-remove hand back `, ]`
 * where the author had written `,]`.
 */
function reclaimOwnLine(
  text: string,
  start: number,
  end: number,
  takesCommaAhead: boolean,
): { start: number; end: number } {
  const line = endOfLineContent(text, end);

  let i = start;
  const backUpOverBlanks = (): void => {
    while (i > 0 && (text[i - 1] === ' ' || text[i - 1] === '\t')) i -= 1;
  };

  if (/[^ \t]/.test(text.slice(end, line.end))) {
    // One gap goes with the run, not both: a span that already reached over
    // the blanks ahead of it has taken its gap and leaves the ones behind.
    const blank = (char: string | undefined): boolean =>
      char === ' ' || char === '\t';
    if (end > start && blank(text[end - 1])) return { start, end };

    backUpOverBlanks();
    // Blanks reaching back to the line ending are the surviving entry's
    // indentation, not the run's gap, so they stay.
    return { start: i === 0 || text[i - 1] === '\n' ? start : i, end };
  }

  backUpOverBlanks();
  if (!takesCommaAhead && text[i - 1] === ',') {
    i -= 1;
    backUpOverBlanks();
  }

  // Only when that walk reaches a line ending is there a whole line to take,
  // and only then does the line ending go too.
  if (text[i - 1] !== '\n') return { start: i, end: line.end };

  i -= 1;
  if (text[i - 1] === '\r') i -= 1;
  return { start: i, end: line.end };
}

interface EntryStart {
  /** Offset of the entry's first byte, its tag or anchor included. */
  readonly start: number;
  /** Whether a comment sits between the entry and whatever precedes it. */
  readonly commented: boolean;
}

/**
 * Find where an entry's own bytes begin, given the span it may draw from.
 *
 * Between one entry's last byte and the next entry's value lie, in some order,
 * whitespace, the separating comma, comments, and the next entry's own tag and
 * anchor. Only the last of those belongs to the entry, so the scan restarts at
 * every comma and every comment and reports whatever non-blank run survives to
 * the end. Nothing there is a comment for YAML unless a blank precedes its `#`,
 * which is what keeps a verbatim tag's own `#` out of it.
 */
function entryStart(
  text: string,
  from: number,
  valueStart: number,
): EntryStart {
  let start = -1;
  let commented = false;
  let i = from;

  while (i < valueStart) {
    const char = text[i] as string;
    if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
      i += 1;
      continue;
    }
    if (char === '#' && isBlank(text[i - 1])) {
      const newline = text.indexOf('\n', i);
      i = newline === -1 || newline > valueStart ? valueStart : newline + 1;
      start = -1;
      commented = true;
      continue;
    }
    if (char === ',') {
      i += 1;
      start = -1;
      continue;
    }
    if (start === -1) start = i;
    i += 1;
  }

  return { start: start === -1 ? valueStart : start, commented };
}

interface CommaAhead {
  /** Offset of the separating comma itself. */
  readonly at: number;
  /** Where a deletion that takes this comma should stop. */
  readonly through: number;
  /**
   * Whether a comment stands between the run and this comma.
   *
   * A run cannot reach a separator on the far side of a comment by widening its
   * own span, because the comment is on its own line and belongs to neither
   * neighbour. The comma is still the run's to take; it just has to be taken
   * separately.
   */
  readonly detached: boolean;
}

/**
 * Find the separator written ahead of a run, wherever the author put it.
 *
 * The scan starts past the run's own trailing comment, so every comment it
 * meets is one on a later line, standing on its own. A comment before the comma
 * makes the comma {@link CommaAhead.detached}; a comment after it is what the
 * deletion must stop short of, one byte short, because the blank in front of a
 * `#` is what makes it a comment at all — delete it and `[# note` reads as a
 * scalar.
 *
 * A second comma ends the scan rather than joining it: two commas are two
 * separators, and only one of them is this run's.
 */
function commaAhead(
  text: string,
  from: number,
  limit: number,
): CommaAhead | null {
  let at = -1;
  let detached = false;
  let i = from;

  while (i < limit) {
    const char = text[i] as string;
    if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
      i += 1;
      continue;
    }
    if (char === '#' && isBlank(text[i - 1])) {
      if (at !== -1) return { at, through: i - 1, detached };
      detached = true;
      const newline = text.indexOf('\n', i);
      i = newline === -1 || newline > limit ? limit : newline + 1;
      continue;
    }
    if (char === ',' && at === -1) {
      at = i;
      i += 1;
      continue;
    }
    break;
  }

  if (at === -1) return null;
  if (!detached) return { at, through: Math.max(at + 1, i), detached };

  // A detached comma is deleted where it stands, so it takes the spacing the
  // author wrote after it — otherwise the entry behind it shifts a column
  // right. The line ending is not spacing and stays.
  let through = at + 1;
  while (text[through] === ' ' || text[through] === '\t') through += 1;
  return { at, through, detached };
}

/**
 * Find a comment written on the same line as the entry before it.
 *
 * A comment sharing a line with the entry it follows trails that entry and
 * belongs to it, so removing the entry removes the comment too — the same
 * bytes a block sequence loses when it deletes the entry's whole line. A
 * comment on its own line belongs to neither neighbour, so the scan stops at
 * the first line ending and reports nothing beyond it.
 *
 * Both offsets are reported, because the bytes in front of the `#` and the
 * bytes behind it answer different questions: whether the separating comma has
 * already been taken is decided in front of the comment, where a comma is
 * punctuation, never inside it, where a comma is somebody's prose.
 *
 * `end` stops short of the line ending itself, so a CRLF file keeps its `\r`.
 * Only a `#` with a blank in front of it opens a comment, which is what keeps
 * the `#` inside a verbatim tag or a plain scalar out.
 */
function sameLineComment(
  text: string,
  from: number,
  limit: number,
): { start: number; end: number } | null {
  for (let i = from; i < limit; i += 1) {
    const char = text[i] as string;
    if (char === '\n' || char === '\r') return null;
    if (char !== '#' || !isBlank(text[i - 1])) continue;
    const newline = text.indexOf('\n', i);
    let end = newline === -1 ? limit : Math.min(newline, limit);
    if (end > from && text[end - 1] === '\r') end -= 1;
    return { start: i, end };
  }
  return null;
}

/**
 * Reach past the comma the author wrote after the last entry, if there is one.
 *
 * A run ending the list cannot take the comma behind it: that comma separates
 * the entry a trailing comment belongs to, and reaching back past the comment
 * would delete the comment too. So the run leaves it and takes what follows
 * instead. A trailing comma there separates an entry that is going away, and
 * leaving it next to the one behind the comment gives `[a, ,]`, which YAML
 * rejects. When the author wrote no trailing comma there is nothing to take,
 * and the one comma left behind closes the list on its own.
 *
 * The scan stops at anything that is not blank, so a comment past the comma is
 * left alone with the blank in front of its `#` intact — the same rule the
 * forward scan into a successor follows.
 *
 * It crosses line endings, because the author may have closed the list on a
 * line of its own. That is why a run holding a separator of its own is asked
 * about first — see {@link ownsLineBehindComma} — and never reaches here.
 */
function pastTrailingComma(text: string, from: number, limit: number): number {
  let i = from;
  while (i < limit) {
    const char = text[i] as string;
    if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
      i += 1;
      continue;
    }
    return char === ',' ? i + 1 : from;
  }
  return from;
}

/** Whether `char` is YAML whitespace, treating the start of input as blank. */
function isBlank(char: string | undefined): boolean {
  return (
    char === undefined ||
    char === ' ' ||
    char === '\t' ||
    char === '\r' ||
    char === '\n'
  );
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

/**
 * Replace the span a value occupies, keeping it apart from its neighbours.
 *
 * The span of a value that was never written is empty, and can sit tight
 * against the colon before it or a comment after it. A space is added on either
 * side only where one is missing, so a file that already spaced its line keeps
 * exactly the bytes it had.
 */
function spliceValue(
  text: string,
  start: number,
  end: number,
  value: string,
): Edit {
  const before = /[ \t]/.test(text[start - 1] ?? ' ') ? '' : ' ';
  const after = /[ \t\r\n]/.test(text[end] ?? '\n') ? '' : ' ';
  return { start, end, text: `${before}${value}${after}` };
}

/** The start of the run of spaces and tabs ending at `index`, not past `floor`. */
function backUpOverSpacing(text: string, index: number, floor: number): number {
  let at = index;
  while (at > floor && /[ \t]/.test(text[at - 1] as string)) at -= 1;
  return at;
}

/** Whether a scalar was written as a `|` or `>` block, not as a plain value. */
function isBlockScalar(node: { type?: string }): boolean {
  return node.type === 'BLOCK_LITERAL' || node.type === 'BLOCK_FOLDED';
}

/**
 * The name of an anchor this field defines and some other field aliases, or
 * `null` when the field's anchors — if it has any — are its own business.
 *
 * An anchor is a shared definition, so a field that carries one is not only
 * itself. Widening `derived_from: &a` into `derived_from: &a [abc]` silently
 * gives every `*a` in the block the new list, and removing the field takes the
 * definition with it and leaves those aliases pointing at nothing, which stops
 * the whole block parsing. Both change fields the caller never named, so a
 * shared anchor is refused rather than edited.
 *
 * An alias *inside* the field is not other people's business and does not
 * count; containment is decided by span, since an alias must follow the anchor
 * it resolves to.
 */
function anchorAliasedElsewhere(
  contents: Node,
  pair: Pair<unknown, unknown>,
): string | null {
  const anchors = new Set<string>();
  const collect = (node: unknown) => {
    if (isNode(node) && typeof node.anchor === 'string')
      anchors.add(node.anchor);
  };

  collect(pair.key);
  if (isNode(pair.value)) visit(pair.value, (_key, node) => collect(node));
  if (anchors.size === 0) return null;

  const [fieldStart] = rangeOf(pair.key);
  const fieldEnd = isNode(pair.value)
    ? rangeOf(pair.value)[2]
    : rangeOf(pair.key)[2];

  let aliased: string | null = null;
  visit(contents, (_key, node) => {
    if (!isAlias(node) || !anchors.has(node.source)) return undefined;
    const [at] = rangeOf(node);
    if (at >= fieldStart && at < fieldEnd) return undefined;
    aliased = node.source;
    return visit.BREAK;
  });
  return aliased;
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
