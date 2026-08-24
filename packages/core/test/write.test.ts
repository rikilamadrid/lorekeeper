import { describe, expect, it } from 'vitest';
import { readDocument } from '../src/document.js';
import { validateDocument } from '../src/validate.js';
import { addDerivedFrom, applyEdits, removeDerivedFrom } from '../src/write.js';
import { fixture, fixtures } from './fixtures.js';

const BOM = '﻿';

function doc(text: string, name = 'note') {
  return readDocument(name, text);
}

/** The lines that differ between two texts, as `-old` / `+new` markers. */
function changedLines(before: string, after: string): string[] {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  const changed: string[] = [];
  const seen = new Set<string>();
  for (const line of a) if (!b.includes(line)) changed.push(`-${line}`);
  for (const line of b) {
    if (!a.includes(line) && !seen.has(line)) {
      seen.add(line);
      changed.push(`+${line}`);
    }
  }
  return changed;
}

describe('applyEdits', () => {
  it('returns the original text for an empty edit list', () => {
    const text = fixture('source-youtube');
    expect(applyEdits(text, [])).toBe(text);
  });

  it('applies several edits without disturbing earlier offsets', () => {
    expect(
      applyEdits('abcdef', [
        { start: 4, end: 5, text: 'E' },
        { start: 1, end: 1, text: 'X' },
      ]),
    ).toBe('aXbcdEf');
  });

  it('throws rather than silently merging overlapping edits', () => {
    expect(() =>
      applyEdits('abcdef', [
        { start: 0, end: 3, text: 'x' },
        { start: 2, end: 4, text: 'y' },
      ]),
    ).toThrow(RangeError);
  });

  it('throws on an edit outside the text', () => {
    expect(() => applyEdits('abc', [{ start: 0, end: 9, text: '' }])).toThrow(
      RangeError,
    );
  });
});

/**
 * The acceptance criterion the whole write side rests on: read then write with
 * no mutation is byte-exact, across every representation the fixtures cover —
 * local-offset timestamps, inline arrays, comments, mixed quoting, unknown
 * fields, CRLF, a BOM, a missing trailing newline, and absent frontmatter.
 */
describe('round-trip through read-then-write', () => {
  for (const { name, text } of fixtures) {
    it(`writes ${name} back byte-identically`, () => {
      expect(applyEdits(doc(text, name).text, [])).toBe(text);
    });
  }
});

describe('addDerivedFrom', () => {
  it('appends to an existing flow list, keeping it flow', () => {
    const before = fixture('note-derived');
    const after = addDerivedFrom(doc(before), '20260822-0900-new-source').text;

    expect(after).toContain(
      'derived_from: [20260817-1930-yt-example-messaging, 20260818-0810-example-article-queues, 20260822-0900-new-source]',
    );
    expect(changedLines(before, after)).toHaveLength(2);
  });

  it('appends to a block list, copying the indentation above it', () => {
    const before =
      '---\nderived_from:\n  - one\n  - two\ntags: [x]\n---\n\nbody\n';
    const after = addDerivedFrom(doc(before), 'three').text;

    expect(after).toBe(
      '---\nderived_from:\n  - one\n  - two\n  - three\ntags: [x]\n---\n\nbody\n',
    );
  });

  it('copies an unusual block-list indentation rather than normalizing it', () => {
    const before = '---\nderived_from:\n    -   one\n---\n';
    expect(addDerivedFrom(doc(before), 'two').text).toBe(
      '---\nderived_from:\n    -   one\n    -   two\n---\n',
    );
  });

  it('copies a tight flow separator rather than normalizing it', () => {
    const before = '---\nderived_from: [a,b]\n---\n';
    expect(addDerivedFrom(doc(before), 'c').text).toBe(
      '---\nderived_from: [a,b,c]\n---\n',
    );
  });

  it('widens a lone scalar in place, keeping the author spelling', () => {
    const before = "---\nderived_from: 'quoted id'\n---\n";
    expect(addDerivedFrom(doc(before), 'second').text).toBe(
      "---\nderived_from: ['quoted id', second]\n---\n",
    );
  });

  it('fills in a key written with no value', () => {
    const before = '---\ntype: note\nderived_from:\ntags: [x]\n---\n';
    expect(addDerivedFrom(doc(before), 'abc').text).toBe(
      '---\ntype: note\nderived_from: [abc]\ntags: [x]\n---\n',
    );
  });

  it('fills in an empty list', () => {
    const before = '---\nderived_from: []\n---\n';
    expect(addDerivedFrom(doc(before), 'abc').text).toBe(
      '---\nderived_from: [abc]\n---\n',
    );
  });

  it('adds the field at the end of a block that lacks it', () => {
    const before = fixture('source-youtube');
    const after = addDerivedFrom(doc(before), '20260822-0900-new-source').text;

    expect(after).toContain(
      'title: "A quoted title, with a comma"\nderived_from: [20260822-0900-new-source]\n---\n',
    );
    expect(changedLines(before, after)).toEqual([
      '+derived_from: [20260822-0900-new-source]',
    ]);
  });

  it('adds the field to an empty block', () => {
    const before = fixture('empty-frontmatter');
    expect(addDerivedFrom(doc(before), 'abc').text).toBe(
      before.replace('---\n---\n', '---\nderived_from: [abc]\n---\n'),
    );
  });

  it('creates a block for a file that has none, leaving the body alone', () => {
    const before = fixture('plain-no-frontmatter');
    const after = addDerivedFrom(doc(before), 'abc').text;

    expect(after).toBe(`---\nderived_from: [abc]\n---\n${before}`);
    expect(after.endsWith(before)).toBe(true);
  });

  /**
   * An unterminated opening delimiter is body text by the read contract, so
   * this file has no block and the add creates one — which leaves the original
   * `---` and the keys under it where they were, as body. The result is a file
   * with two consecutive `---` lines and a `type` the frontmatter no longer
   * carries. That is the contract's answer, not a repair, and it is pinned so
   * a later change cannot alter the shape without saying so.
   */
  it('prepends a block to a file whose delimiter was never closed', () => {
    const before = fixture('unterminated-frontmatter');
    const added = addDerivedFrom(doc(before), 'abc');

    expect(added.text).toBe(`---\nderived_from: [abc]\n---\n${before}`);
    expect(added.text.endsWith(before)).toBe(true);
    expect(doc(added.text).frontmatter.derivedFrom).toEqual(['abc']);
    expect(doc(added.text).frontmatter.type).toBeNull();

    // A second add finds the block it created and changes nothing.
    expect(addDerivedFrom(doc(added.text), 'abc').text).toBe(added.text);
  });

  it('creates a block after a byte order mark, never before it', () => {
    const after = addDerivedFrom(doc(`${BOM}# Title\n`), 'abc').text;
    expect(after).toBe(`${BOM}---\nderived_from: [abc]\n---\n# Title\n`);
  });

  it('edits inside the block of a file that opens with a BOM', () => {
    const before = fixture('bom-frontmatter');
    const after = addDerivedFrom(doc(before), 'abc').text;

    expect(after.startsWith(`${BOM}---\n`)).toBe(true);
    expect(after.match(/^---$/gm)).toHaveLength(1);
    expect(changedLines(before, after)).toEqual(['+derived_from: [abc]']);
  });

  it('uses the line ending the file already uses', () => {
    const before = fixture('crlf-endings');
    const after = addDerivedFrom(doc(before), 'abc').text;

    expect(after).toContain('derived_from: [abc]\r\n');
    expect(after).not.toContain('derived_from: [abc]\n---');
    expect(
      after
        .split('\n')
        .every((line, index, all) =>
          index === all.length - 1 ? true : line.endsWith('\r'),
        ),
    ).toBe(true);
  });

  it('appends to a file with no trailing newline without adding one', () => {
    const before = fixture('no-trailing-newline');
    const after = addDerivedFrom(doc(before), 'abc').text;

    expect(after.endsWith('# No newline at end of file')).toBe(true);
  });

  it('quotes an ID that YAML would otherwise read as something else', () => {
    expect(addDerivedFrom(doc('---\nid: x\n---\n'), 'true').text).toContain(
      "derived_from: ['true']",
    );
    expect(
      addDerivedFrom(doc('---\nid: x\n---\n'), 'has: colon, and comma').text,
    ).toContain("derived_from: ['has: colon, and comma']");
    expect(addDerivedFrom(doc('---\nid: x\n---\n'), "it's").text).toContain(
      "derived_from: ['it''s']",
    );
  });

  it('is idempotent', () => {
    const once = addDerivedFrom(doc(fixture('note-derived')), 'new-source');
    const twice = addDerivedFrom(doc(once.text), 'new-source');

    expect(once.changed).toBe(true);
    expect(twice.changed).toBe(false);
    expect(twice.text).toBe(once.text);
    expect(twice.edits).toEqual([]);
  });

  it('treats a canonically equivalent ID as already present', () => {
    const nfd = 'café-source';
    const before = `---\nderived_from: [${nfd}]\n---\n`;
    const result = addDerivedFrom(doc(before), 'café-source');

    expect(result.changed).toBe(false);
    expect(result.text).toBe(before);
  });

  it('preserves unrecognized fields, comments, and timestamps through a mutation', () => {
    const before = fixture('note-unknown-fields');
    const after = addDerivedFrom(doc(before), 'abc').text;
    const reread = doc(after);

    expect(reread.frontmatter.unrecognized).toEqual({
      reviewed_by: 'someone-elses-tool',
      confidence: 0.8,
      custom_list: ['alpha', 'beta'],
    });
    expect(after).toContain('created: 2026-08-20T08:00:00+02:00');
    expect(after).toContain('custom_list:\n  - alpha\n  - beta\n');
    expect(reread.frontmatter.derivedFrom).toEqual(['abc']);
  });

  it('keeps a YAML comment and its mixed quoting untouched', () => {
    const after = addDerivedFrom(doc(fixture('source-youtube')), 'abc').text;
    expect(after).toContain(
      'kind: video          # PROVISIONAL vocabulary, free string in v0.1',
    );
    expect(after).toContain('title: "A quoted title, with a comma"');
  });

  it('leaves the body untouched', () => {
    const before = fixture('note-derived');
    const body = doc(before).body;
    expect(doc(addDerivedFrom(doc(before), 'abc').text).body).toBe(body);
  });
});

/**
 * A file this module cannot edit safely is left exactly as it is. Validation
 * already reports these defects; repairing them is out of scope by contract.
 */
describe('refusals', () => {
  it('refuses a blank ID', () => {
    const before = fixture('note-derived');
    const result = addDerivedFrom(doc(before), '   ');

    expect(result.refusal?.code).toBe('value-blank');
    expect(result.changed).toBe(false);
    expect(result.text).toBe(before);
  });

  it('refuses frontmatter that did not parse', () => {
    const before = fixture('broken-yaml');
    const result = addDerivedFrom(doc(before), 'abc');

    expect(result.refusal?.code).toBe('frontmatter-unreadable');
    expect(result.text).toBe(before);
  });

  it('refuses a field declared twice', () => {
    const before = '---\nderived_from: [a]\nderived_from: [b]\n---\n';
    const result = addDerivedFrom(doc(before), 'c');

    expect(result.refusal?.code).toBe('duplicate-key');
    expect(result.text).toBe(before);
  });

  it('refuses a field holding a mapping', () => {
    const before = '---\nderived_from:\n  source: a\n---\n';
    const result = addDerivedFrom(doc(before), 'b');

    expect(result.refusal?.code).toBe('field-not-list');
    expect(result.text).toBe(before);
  });

  it('never quotes file content in a refusal reason', () => {
    // The delimiters enclose a line the author means as body, so the parser
    // fails on prose. Its own message would quote that line back.
    const result = addDerivedFrom(
      doc(
        '---\ntype: note\ntags: [unclosed\n' +
          'Private prose the author would not paste into an issue.\n' +
          '---\n\nbody\n',
      ),
      'abc',
    );

    expect(result.refusal?.code).toBe('frontmatter-unreadable');
    expect(result.refusal?.reason).not.toContain('Private prose');
    expect(result.refusal?.reason).not.toContain('unclosed');
  });
});

describe('removeDerivedFrom', () => {
  it('drops one entry from a flow list, taking its separator', () => {
    const before = fixture('note-derived');
    const after = removeDerivedFrom(
      doc(before),
      '20260818-0810-example-article-queues',
    ).text;

    expect(after).toContain(
      'derived_from: [20260817-1930-yt-example-messaging]\n',
    );
    expect(changedLines(before, after)).toHaveLength(2);
  });

  it('drops the first entry of a flow list', () => {
    const before = '---\nderived_from: [a, b, c]\n---\n';
    expect(removeDerivedFrom(doc(before), 'a').text).toBe(
      '---\nderived_from: [b, c]\n---\n',
    );
  });

  it('drops one line from a block list', () => {
    const before = '---\nderived_from:\n  - one\n  - two\ntags: [x]\n---\n';
    expect(removeDerivedFrom(doc(before), 'one').text).toBe(
      '---\nderived_from:\n  - two\ntags: [x]\n---\n',
    );
  });

  it('removes the whole field when the last entry goes', () => {
    const before = '---\ntype: note\nderived_from: [only]\ntags: [x]\n---\n';
    expect(removeDerivedFrom(doc(before), 'only').text).toBe(
      '---\ntype: note\ntags: [x]\n---\n',
    );
  });

  it('removes the whole field when it held a lone scalar', () => {
    const before = '---\nderived_from: only\ntags: [x]\n---\n';
    expect(removeDerivedFrom(doc(before), 'only').text).toBe(
      '---\ntags: [x]\n---\n',
    );
  });

  it('removes the whole field when it held a one-item block list', () => {
    const before = '---\nderived_from:\n  - only\ntags: [x]\n---\n';
    expect(removeDerivedFrom(doc(before), 'only').text).toBe(
      '---\ntags: [x]\n---\n',
    );
  });

  it('leaves an empty block behind rather than deleting a block it did not create', () => {
    const before = '---\nderived_from: [only]\n---\n\nbody\n';
    expect(removeDerivedFrom(doc(before), 'only').text).toBe(
      '---\n---\n\nbody\n',
    );
  });

  it('is idempotent', () => {
    const before = fixture('note-derived');
    const once = removeDerivedFrom(
      doc(before),
      '20260817-1930-yt-example-messaging',
    );
    const twice = removeDerivedFrom(
      doc(once.text),
      '20260817-1930-yt-example-messaging',
    );

    expect(once.changed).toBe(true);
    expect(twice.changed).toBe(false);
    expect(twice.text).toBe(once.text);
  });

  it('changes nothing for an ID the file does not carry', () => {
    const before = fixture('note-derived');
    const result = removeDerivedFrom(doc(before), 'not-here');

    expect(result.changed).toBe(false);
    expect(result.text).toBe(before);
    expect(result.refusal).toBeNull();
  });

  it('changes nothing for a file with no frontmatter', () => {
    const before = fixture('plain-no-frontmatter');
    expect(removeDerivedFrom(doc(before), 'abc').text).toBe(before);
  });
});

/**
 * Removal promises a postcondition, not a single edit: the edge must be gone
 * afterwards. A file spelling the same ID twice is a defect validation reports,
 * but taking only the first occurrence would report success with the edge still
 * in place, and running again would keep reporting the same thing.
 */
describe('an ID a file spells more than once', () => {
  it('takes every occurrence out of a flow list', () => {
    const before = '---\nderived_from: [abc, x, abc, y]\ntags: [t]\n---\n';
    const result = removeDerivedFrom(doc(before), 'abc');

    expect(result.refusal).toBeNull();
    expect(result.text).toBe('---\nderived_from: [x, y]\ntags: [t]\n---\n');
  });

  // Two entries deleted side by side both want the comma between them. They are
  // dropped as one span, because overlapping edits are rejected outright.
  it('takes an adjacent run out as one span', () => {
    const before = '---\nderived_from: [x, abc, abc, y]\n---\n';
    const result = removeDerivedFrom(doc(before), 'abc');

    expect(result.text).toBe('---\nderived_from: [x, y]\n---\n');
    expect(result.edits).toHaveLength(1);
  });

  it('takes a leading run out, keeping what follows it', () => {
    const before = '---\nderived_from: [abc, abc, y]\n---\n';
    expect(removeDerivedFrom(doc(before), 'abc').text).toBe(
      '---\nderived_from: [y]\n---\n',
    );
  });

  it('takes every occurrence out of a block list, one line each', () => {
    const before =
      '---\nderived_from:\n  - abc\n  - y\n  - abc\ntags: [t]\n---\n';
    const result = removeDerivedFrom(doc(before), 'abc');

    expect(result.text).toBe('---\nderived_from:\n  - y\ntags: [t]\n---\n');
    expect(result.edits).toHaveLength(2);
  });

  it('removes the whole field when every entry is that ID', () => {
    const before =
      '---\ntype: note\nderived_from: [abc, abc]\ntags: [t]\n---\n';
    expect(removeDerivedFrom(doc(before), 'abc').text).toBe(
      '---\ntype: note\ntags: [t]\n---\n',
    );
  });

  it('leaves the edge absent, so a second run is the idempotent no-op', () => {
    const once = removeDerivedFrom(
      doc('---\nderived_from:\n  - abc\n  - abc\ntags: [t]\n---\n'),
      'abc',
    );
    const twice = removeDerivedFrom(doc(once.text), 'abc');

    expect(doc(once.text).frontmatter.derivedFrom).toEqual([]);
    expect(twice.changed).toBe(false);
    expect(twice.refusal).toBeNull();
  });
});

/**
 * A flow entry is not only its value. A tag or an anchor is written in front of
 * it and `yaml` reports the range of the value alone, so a span built from raw
 * ranges cuts through the middle of an entry: it leaves a removed entry's tag
 * behind, where it binds to the survivor after it, and it swallows a survivor's
 * own tag along with the entry before it. Neither shows up as a wrong edge —
 * the ID really is gone — which is why these assert on bytes.
 */
describe('a flow entry carrying a tag or an anchor', () => {
  it("takes a leading entry's tag with it", () => {
    const before = '---\nderived_from: [!!int 123, y]\n---\n';
    expect(removeDerivedFrom(doc(before), '123').text).toBe(
      '---\nderived_from: [y]\n---\n',
    );
  });

  it("takes a leading entry's anchor with it", () => {
    const before = '---\nderived_from: [&e abc, y]\n---\n';
    expect(removeDerivedFrom(doc(before), 'abc').text).toBe(
      '---\nderived_from: [y]\n---\n',
    );
  });

  it("leaves a surviving entry's tag alone", () => {
    const before = '---\nderived_from: [abc, !!int 123]\n---\n';
    expect(removeDerivedFrom(doc(before), 'abc').text).toBe(
      '---\nderived_from: [!!int 123]\n---\n',
    );
  });

  it("leaves a surviving entry's anchor alone", () => {
    const before = '---\nderived_from: [abc, &e y]\n---\n';
    expect(removeDerivedFrom(doc(before), 'abc').text).toBe(
      '---\nderived_from: [&e y]\n---\n',
    );
  });

  it('takes a tag on a middle entry with it', () => {
    const before = '---\nderived_from: [x, !!str abc, y]\n---\n';
    expect(removeDerivedFrom(doc(before), 'abc').text).toBe(
      '---\nderived_from: [x, y]\n---\n',
    );
  });
});

/**
 * A comment between two entries is not the field's trailing comment, and it is
 * not the removed entry's either. Reaching back over it or forward through it
 * would delete bytes the author wrote and nobody asked to change, silently —
 * the one thing this module exists to avoid. So a span stops at a comment on
 * either side, taking the separator it can still reach instead.
 */
describe('a comment inside a multi-line flow list', () => {
  it('keeps a comment written before the entry being removed', () => {
    const before = '---\nderived_from: [x, # note\n  abc, y]\n---\n';
    expect(removeDerivedFrom(doc(before), 'abc').text).toBe(
      '---\nderived_from: [x, # note\n  y]\n---\n',
    );
  });

  it('removes a comment sharing the line of the entry being removed', () => {
    const before = '---\nderived_from: [abc, # note\n  y]\n---\n';
    const result = removeDerivedFrom(doc(before), 'abc');

    // `# note` shares a line with `abc`, so it trails `abc` and goes with it —
    // the same bytes the block spelling loses by deleting the entry's line.
    expect(result.text).toBe('---\nderived_from: [\n  y]\n---\n');
    expect(doc(result.text).frontmatter.derivedFrom).toEqual(['y']);
  });

  it('keeps a comment written before the separating comma', () => {
    const before = '---\nderived_from: [x # note\n  , abc, y]\n---\n';
    expect(removeDerivedFrom(doc(before), 'abc').text).toBe(
      '---\nderived_from: [x # note\n  , y]\n---\n',
    );
  });

  it('keeps a comment when the last entry after it goes', () => {
    const before = '---\nderived_from: [x, # note\n  abc]\n---\n';
    const result = removeDerivedFrom(doc(before), 'abc');

    // The comma behind the comment is not reachable without deleting the
    // comment, so it stays; YAML reads a trailing comma as a closed list.
    expect(result.text).toBe('---\nderived_from: [x, # note\n  ]\n---\n');
    expect(doc(result.text).frontmatter.derivedFrom).toEqual(['x']);
  });

  it('takes the trailing comma when the last entry after a comment goes', () => {
    // The same shape as the test above with the author's own trailing comma
    // added. Keeping both commas leaves `[x, ,]`, which YAML rejects outright,
    // so the run leaves the one behind the comment and takes this one instead.
    const before = '---\nderived_from: [\n  x, # note\n  abc,\n]\n---\n';
    const result = removeDerivedFrom(doc(before), 'abc');

    expect(result.refusal).toBeNull();
    expect(result.text).toBe('---\nderived_from: [\n  x, # note\n]\n---\n');
    expect(doc(result.text).frontmatter.derivedFrom).toEqual(['x']);
  });

  it('takes the trailing comma past a comment on its own line', () => {
    const before = '---\nderived_from: [\n  x,\n  # note\n  abc,\n]\n---\n';
    const result = removeDerivedFrom(doc(before), 'abc');

    expect(result.refusal).toBeNull();
    expect(result.text).toBe('---\nderived_from: [\n  x,\n  # note\n]\n---\n');
    expect(doc(result.text).frontmatter.derivedFrom).toEqual(['x']);
  });

  it('removes the comment trailing the entry and keeps the neighbour one', () => {
    const before = '---\nderived_from: [\n  x, # one\n  abc, # two\n]\n---\n';
    const result = removeDerivedFrom(doc(before), 'abc');

    // `# two` trails `abc` and goes; `# one` trails the surviving `x` and stays.
    expect(result.refusal).toBeNull();
    expect(result.text).toBe('---\nderived_from: [\n  x, # one\n]\n---\n');
    expect(doc(result.text).frontmatter.derivedFrom).toEqual(['x']);
  });

  it('leaves a comment on its own line where the author put it', () => {
    const before = '---\nderived_from: [\n  x,\n  # own line\n  abc,\n]\n---\n';
    const result = removeDerivedFrom(doc(before), 'abc');

    // Belongs to neither neighbour, so removing either one leaves it alone.
    expect(result.refusal).toBeNull();
    expect(result.text).toBe(
      '---\nderived_from: [\n  x,\n  # own line\n]\n---\n',
    );
    expect(doc(result.text).frontmatter.derivedFrom).toEqual(['x']);
  });

  it('leaves a comment on its own line when the entry above it goes', () => {
    const before = '---\nderived_from: [\n  x,\n  # own line\n  abc,\n]\n---\n';
    const result = removeDerivedFrom(doc(before), 'x');

    expect(result.refusal).toBeNull();
    expect(doc(result.text).text).toContain('# own line');
    expect(doc(result.text).frontmatter.derivedFrom).toEqual(['abc']);
  });

  it('removes the last of three past a comment without refusing', () => {
    const before = '---\nderived_from: [\n  x,\n  y, # note\n  abc,\n]\n---\n';
    const result = removeDerivedFrom(doc(before), 'abc');

    expect(result.refusal).toBeNull();
    expect(result.text).toBe(
      '---\nderived_from: [\n  x,\n  y, # note\n]\n---\n',
    );
    expect(doc(result.text).frontmatter.derivedFrom).toEqual(['x', 'y']);
  });
});

/**
 * The two spellings of a list must answer the same question the same way.
 *
 * A block sequence has always deleted whole lines, so a comment sharing a line
 * with an entry went with it and a comment on its own line stayed. Flow once
 * kept both. These pin the two spellings to one rule, in the pairs that used
 * to disagree.
 */
describe('flow and block agree about who a comment belongs to', () => {
  const survivors = (text: string) => doc(text).frontmatter.derivedFrom;

  it('drops a comment sharing the removed entry line in both spellings', () => {
    const flow = '---\nderived_from: [abc, # note\n  y]\n---\n';
    const block = '---\nderived_from:\n  - abc # note\n  - y\n---\n';
    const fromFlow = removeDerivedFrom(doc(flow), 'abc');
    const fromBlock = removeDerivedFrom(doc(block), 'abc');

    expect(fromFlow.refusal).toBeNull();
    expect(fromBlock.refusal).toBeNull();
    expect(fromFlow.text).not.toContain('# note');
    expect(fromBlock.text).not.toContain('# note');
    expect(survivors(fromFlow.text)).toEqual(['y']);
    expect(survivors(fromBlock.text)).toEqual(['y']);
  });

  it('keeps a comment on its own line in both spellings', () => {
    const flow = '---\nderived_from: [\n  x,\n  # own line\n  abc,\n]\n---\n';
    const block = '---\nderived_from:\n  - x\n  # own line\n  - abc\n---\n';
    const fromFlow = removeDerivedFrom(doc(flow), 'abc');
    const fromBlock = removeDerivedFrom(doc(block), 'abc');

    expect(fromFlow.refusal).toBeNull();
    expect(fromBlock.refusal).toBeNull();
    expect(fromFlow.text).toContain('# own line');
    expect(fromBlock.text).toContain('# own line');
    expect(survivors(fromFlow.text)).toEqual(['x']);
    expect(survivors(fromBlock.text)).toEqual(['x']);
  });

  it('keeps a comment trailing a surviving entry in both spellings', () => {
    const flow = '---\nderived_from: [x, # note\n  abc, y]\n---\n';
    const block = '---\nderived_from:\n  - x # note\n  - abc\n  - y\n---\n';
    const fromFlow = removeDerivedFrom(doc(flow), 'abc');
    const fromBlock = removeDerivedFrom(doc(block), 'abc');

    expect(fromFlow.text).toContain('# note');
    expect(fromBlock.text).toContain('# note');
    expect(survivors(fromFlow.text)).toEqual(['x', 'y']);
    expect(survivors(fromBlock.text)).toEqual(['x', 'y']);
  });
});

/**
 * Adding writes one entry and invents nothing else.
 *
 * A flow list's new separator is copied from the gap between its last two
 * entries, and that gap can hold text that is not separator at all: a comment
 * the author wrote, and the last entry's own tag or anchor, which YAML reports
 * outside the entry's range. Copying the raw gap duplicated all three into the
 * file — a fabricated comment, an inert tag, an unused anchor.
 */
describe('adding to a flow list copies the separator and nothing else', () => {
  it('does not duplicate a comment written in the gap it copies', () => {
    const before = '---\nderived_from: [\n  x, # note\n  y,\n]\n---\n';
    const after = addDerivedFrom(doc(before), 'abc').text;

    expect(after).toBe(
      '---\nderived_from: [\n  x, # note\n  y, abc,\n]\n---\n',
    );
    expect(after.match(/# note/g)).toHaveLength(1);
  });

  it('does not duplicate a tag written before the last entry', () => {
    const before = '---\nderived_from: [x, !!str y]\n---\n';
    expect(addDerivedFrom(doc(before), 'abc').text).toBe(
      '---\nderived_from: [x, !!str y, abc]\n---\n',
    );
  });

  it('does not duplicate an anchor written before the last entry', () => {
    const before = '---\nderived_from: [x, &m y]\n---\n';
    expect(addDerivedFrom(doc(before), 'abc').text).toBe(
      '---\nderived_from: [x, &m y, abc]\n---\n',
    );
  });

  it('falls back to a plain separator across a standalone comment', () => {
    const before = '---\nderived_from: [\n  x,\n  # own line\n  y,\n]\n---\n';
    const after = addDerivedFrom(doc(before), 'abc').text;

    expect(after).toBe(
      '---\nderived_from: [\n  x,\n  # own line\n  y, abc,\n]\n---\n',
    );
    expect(after.match(/# own line/g)).toHaveLength(1);
  });
});

/**
 * A comment trailing the last entry belongs to that entry — the same line rule
 * removal follows — so the new entry goes past it rather than under it. Adding
 * before the comment silently transferred it to the entry being added.
 */
describe('adding past a comment that trails the last entry', () => {
  it('leaves the comment on the entry it belongs to', () => {
    const before = '---\nderived_from: [\n  x,\n  y, # note\n]\n---\n';
    expect(addDerivedFrom(doc(before), 'abc').text).toBe(
      '---\nderived_from: [\n  x,\n  y, # note\n  abc\n]\n---\n',
    );
  });

  it('writes the separator it needs onto the line it owns', () => {
    const before = '---\nderived_from: [\n  x,\n  y # note\n]\n---\n';
    const after = addDerivedFrom(doc(before), 'abc').text;

    // The author's line is untouched to the byte: the comma this needs goes on
    // the new line instead, which is what makes the edit retractable.
    expect(after).toBe(
      '---\nderived_from: [\n  x,\n  y # note\n  , abc\n]\n---\n',
    );
    expect(doc(after).frontmatter.derivedFrom).toEqual(['x', 'y', 'abc']);
  });

  it('retracts that separator and its line when the entry goes again', () => {
    const before = '---\nderived_from: [\n  x,\n  y # note\n]\n---\n';
    const added = addDerivedFrom(doc(before), 'abc');
    const removed = removeDerivedFrom(doc(added.text), 'abc');

    expect(removed.refusal).toBeNull();
    expect(removed.text).toBe(before);
  });

  it('retracts only its own line when the author wrote the comma', () => {
    const before = '---\nderived_from: [\n  x,\n  y, # note\n]\n---\n';
    const added = addDerivedFrom(doc(before), 'abc');

    expect(added.text).toBe(
      '---\nderived_from: [\n  x,\n  y, # note\n  abc\n]\n---\n',
    );
    expect(removeDerivedFrom(doc(added.text), 'abc').text).toBe(before);
  });

  it('keeps CRLF endings when it writes past the comment', () => {
    const before =
      '---\r\nderived_from: [\r\n  x,\r\n  y, # note\r\n]\r\n---\r\n';
    const after = addDerivedFrom(doc(before), 'abc').text;

    expect(after).toBe(
      '---\r\nderived_from: [\r\n  x,\r\n  y, # note\r\n  abc\r\n]\r\n---\r\n',
    );
    expect(after).not.toMatch(/[^\r]\n/);
  });

  it('leaves a comment past the closing bracket to the field', () => {
    const before = '---\nderived_from: [x, y] # note\n---\n';
    expect(addDerivedFrom(doc(before), 'abc').text).toBe(
      '---\nderived_from: [x, y, abc] # note\n---\n',
    );
  });

  it('agrees with the block spelling about who the comment belongs to', () => {
    const flow = '---\nderived_from: [\n  x,\n  y, # note\n]\n---\n';
    const block = '---\nderived_from:\n  - x\n  - y # note\n---\n';
    const fromFlow = addDerivedFrom(doc(flow), 'abc').text;
    const fromBlock = addDerivedFrom(doc(block), 'abc').text;

    expect(fromFlow).toContain('y, # note');
    expect(fromBlock).toContain('- y # note');
    expect(fromFlow).not.toContain('abc # note');
    expect(fromBlock).not.toContain('abc # note');
    expect(doc(fromFlow).frontmatter.derivedFrom).toEqual(['x', 'y', 'abc']);
    expect(doc(fromBlock).frontmatter.derivedFrom).toEqual(['x', 'y', 'abc']);
  });
});

/**
 * A flow collection inside a block mapping has to be indented further than the
 * key holding it. When the author opened the list on the field's own line, that
 * line's indentation is the key's, so copying it writes the new entry at or
 * left of the key and YAML stops reading the list as a list. The `mutation-
 * unsafe` backstop caught that and refused, which turned a shape the module had
 * always handled into one it would not touch.
 */
describe("a flow list opened on the field's own line", () => {
  it('indents the new line past the key rather than level with it', () => {
    const before = '---\nderived_from: [x # note\n  ]\n---\n';
    const after = addDerivedFrom(doc(before), 'abc');

    expect(after.refusal).toBeNull();
    expect(after.text).toBe(
      '---\nderived_from: [x # note\n  , abc\n  ]\n---\n',
    );
    expect(doc(after.text).frontmatter.derivedFrom).toEqual(['x', 'abc']);
  });

  it('copies the indentation the author gave the closing bracket', () => {
    const before = '---\nderived_from: [x # note\n      ]\n---\n';
    const after = addDerivedFrom(doc(before), 'abc');

    expect(after.text).toBe(
      '---\nderived_from: [x # note\n      , abc\n      ]\n---\n',
    );
  });

  it('does not copy a closing bracket indented with a tab', () => {
    // A tab does not indent a YAML line, so `\t]` sits at the key's own depth
    // however wide it looks. Copying those bytes would write a line the
    // document can no longer read, and the mutation would refuse its own edit.
    const before = '---\nderived_from: [x # note\n\t]\n---\n';
    const after = addDerivedFrom(doc(before), 'abc');

    expect(after.refusal).toBeNull();
    expect(after.text).toBe(
      '---\nderived_from: [x # note\n  , abc\n\t]\n---\n',
    );
    expect(doc(after.text).parseError).toBeNull();
    expect(doc(after.text).frontmatter.derivedFrom).toEqual(['x', 'abc']);
    expect(removeDerivedFrom(doc(after.text), 'abc').text).toBe(before);
  });

  it('keeps a tab that follows real indentation', () => {
    // Past the first space the tab is separation, not indentation, and the
    // line is deep enough without it — so the author's spelling is copied.
    const before = '---\nderived_from: [x # note\n \t]\n---\n';
    const after = addDerivedFrom(doc(before), 'abc');

    expect(after.text).toBe(
      '---\nderived_from: [x # note\n \t, abc\n \t]\n---\n',
    );
    expect(doc(after.text).frontmatter.derivedFrom).toEqual(['x', 'abc']);
  });

  it('stays clear of a key that is itself indented', () => {
    const before = '---\nmeta:\n  derived_from: [x # note\n    ]\n---\n';
    const after = addDerivedFrom(doc(before), 'abc');

    // The field this module edits is the top-level one, and there is none here,
    // so it writes a new field rather than touching the nested list.
    expect(after.refusal).toBeNull();
    expect(after.text).toContain('  derived_from: [x # note\n    ]');
    expect(doc(after.text).frontmatter.derivedFrom).toEqual(['abc']);
  });

  it('still copies the entry line when the list opens on its own line', () => {
    const before = '---\nderived_from:\n  [x # note\n  ]\n---\n';
    const after = addDerivedFrom(doc(before), 'abc');

    // Nothing but blanks stands in front of the `[`, so that line's indentation
    // is the list's and there is no reason to look further.
    expect(after.text).toBe(
      '---\nderived_from:\n  [x # note\n  , abc\n  ]\n---\n',
    );
  });

  it('retracts the line it wrote', () => {
    for (const before of [
      '---\nderived_from: [x # note\n  ]\n---\n',
      '---\nderived_from: [x, y # note\n  ]\n---\n',
      '---\nderived_from: [x # note\n  ,]\n---\n',
      '---\r\nderived_from: [x # note\r\n  ]\r\n---\r\n',
    ]) {
      const added = addDerivedFrom(doc(before), 'abc');
      expect(added.refusal).toBeNull();
      expect(removeDerivedFrom(doc(added.text), 'abc').text).toBe(before);
    }
  });
});

/**
 * `,]` is the author's spelling and it has to come back as `,]`. A removal that
 * reaches over the comma ahead of it also has to take the gap the added entry
 * left behind it, or the retraction hands back `, ]` — one byte the author
 * never wrote, in a file this module promises not to rewrite.
 */
describe('a closing bracket written against the trailing comma', () => {
  it('gives the spacing back when the added entry goes', () => {
    const before = '---\nderived_from: [x # note\n  , y # more\n  ,]\n---\n';
    const added = addDerivedFrom(doc(before), 'abc');

    expect(added.text).toBe(
      '---\nderived_from: [x # note\n  , y # more\n  , abc\n  ,]\n---\n',
    );
    expect(removeDerivedFrom(doc(added.text), 'abc').text).toBe(before);
  });

  it('gives back the closing line the author indented differently', () => {
    // The separator this add writes goes behind the new entry, on a line of
    // its own. A removal that reached forward instead would take the author's
    // comma from the closing line and leave the tool's in its place, handing
    // back an indentation the author never wrote.
    const before =
      '---\nderived_from: [x # note\n  , y # more\n      ,]\n---\n';
    const added = addDerivedFrom(doc(before), 'abc');

    expect(added.text).toBe(
      '---\nderived_from: [x # note\n  , y # more\n  , abc\n      ,]\n---\n',
    );
    expect(removeDerivedFrom(doc(added.text), 'abc').text).toBe(before);
  });

  it('still takes the comma ahead when a comment stands behind the entry', () => {
    // Nothing separates `abc` from the comment above it, so the comma behind
    // is the first entry's and cannot be reached without deleting that
    // comment. The one on the closing line goes instead, the span reaching it
    // over the line ending and the indentation in front of it.
    const before = '---\nderived_from: [x, # note\n  abc\n      ,]\n---\n';

    expect(removeDerivedFrom(doc(before), 'abc').text).toBe(
      '---\nderived_from: [x, # note\n  ]\n---\n',
    );
  });

  it('takes only one of the two gaps around the entry it removes', () => {
    // The span already reaches over the blank ahead of `abc`, so the blank
    // behind it belongs to the comma that survives and stays where it is.
    const before = '---\nderived_from: [x # note\n  , abc, y]\n---\n';
    expect(removeDerivedFrom(doc(before), 'abc').text).toBe(
      '---\nderived_from: [x # note\n  , y]\n---\n',
    );
  });

  it('leaves a surviving entry the indentation of its own line', () => {
    const before = '---\nderived_from: [x, # note\n  abc, y]\n---\n';
    const result = removeDerivedFrom(doc(before), 'abc');

    // Backing up over the blanks in front of `abc` would reach the line ending
    // and pull `y` left of where the author put it.
    expect(result.text).toBe('---\nderived_from: [x, # note\n  y]\n---\n');
  });
});

/**
 * The same claim, made over the fixtures rather than over hand-written shapes:
 * a mutation may move no comment and write no new one. The fixture set carries
 * comments on a scalar field, inside a flow list and inside a block list, so
 * every place a comment can sit next to an edit is covered here.
 */
describe('a mutation invents no comment text', () => {
  /** Every comment in the frontmatter, by line, as its own bytes. */
  const commentsIn = (text: string, name: string): string[] => {
    const block = doc(text, name).block;
    if (block === null) return [];
    return text
      .slice(block.contentStart, block.contentEnd)
      .split(/\r?\n/)
      .flatMap((line) => {
        const at = line.search(/(^|\s)#/);
        return at === -1 ? [] : [line.slice(at).trim()];
      });
  };

  for (const { name, text } of fixtures) {
    const document = doc(text, name);
    if (document.block === null || document.parseError !== null) continue;

    it(`adds to ${name} leaving every comment where it was`, () => {
      const added = addDerivedFrom(document, '20260822-1200-probe');
      expect(added.changed).toBe(true);
      expect(commentsIn(added.text, name)).toEqual(commentsIn(text, name));
    });
  }
});

/**
 * A separator the author wrote *after* the comment it follows.
 *
 * A trailing comment does not say where the comma is. `abc, # note` puts it in
 * front, `abc # note` / `, y` puts it on the next line behind, and a run taking
 * the comma ahead has to find it either way. Stopping at the comment left the
 * comma with nothing in front of it, which YAML does not read as punctuation it
 * can ignore.
 */
describe('a comma written past the comment it separates', () => {
  const survivors = (text: string) => doc(text).frontmatter.derivedFrom;

  it('takes the comma with the entry and its comment', () => {
    const before = '---\nderived_from: [\n  abc # note\n  , y\n]\n---\n';
    const result = removeDerivedFrom(doc(before), 'abc');

    expect(result.refusal).toBeNull();
    expect(result.text).toBe('---\nderived_from: [\n  y\n]\n---\n');
    expect(survivors(result.text)).toEqual(['y']);
  });

  it('leaves nothing YAML reads as an empty entry', () => {
    const before = '---\nderived_from: [\n  abc # note\n  , y\n]\n---\n';
    const after = doc(removeDerivedFrom(doc(before), 'abc').text);

    expect(after.parseError).toBeNull();
    expect(after.frontmatter.data.derived_from).toEqual(['y']);
  });

  it('keeps CRLF endings while it does so', () => {
    const before =
      '---\r\nderived_from: [\r\n  abc # note\r\n  , y\r\n]\r\n---\r\n';
    const result = removeDerivedFrom(doc(before), 'abc');

    expect(result.text).toBe('---\r\nderived_from: [\r\n  y\r\n]\r\n---\r\n');
    expect(result.text).not.toMatch(/[^\r]\n/);
  });

  it('takes one comma only, whichever side of the comment it sits', () => {
    const ahead = '---\nderived_from: [\n  abc # note\n  , y\n]\n---\n';
    const behind = '---\nderived_from: [\n  abc, # note\n  y\n]\n---\n';

    expect(survivors(removeDerivedFrom(doc(ahead), 'abc').text)).toEqual(['y']);
    expect(survivors(removeDerivedFrom(doc(behind), 'abc').text)).toEqual([
      'y',
    ]);
  });

  it('keeps a middle entry and both of its neighbours', () => {
    const before = '---\nderived_from: [\n  x\n  , abc # note\n  , y\n]\n---\n';
    const result = removeDerivedFrom(doc(before), 'abc');

    expect(result.text).toBe('---\nderived_from: [\n  x\n  , y\n]\n---\n');
    expect(survivors(result.text)).toEqual(['x', 'y']);
  });

  it('takes the author trailing comma when the last entry goes', () => {
    const before = '---\nderived_from: [\n  x\n  , abc # note\n  ,\n]\n---\n';
    const result = removeDerivedFrom(doc(before), 'abc');

    expect(result.text).toBe('---\nderived_from: [\n  x\n  ,\n]\n---\n');
    expect(survivors(result.text)).toEqual(['x']);
  });

  it('does not mistake a comma inside the comment for the separator', () => {
    const before = '---\nderived_from: [\n  abc # a, b\n  , y\n]\n---\n';
    const result = removeDerivedFrom(doc(before), 'abc');

    expect(result.text).toBe('---\nderived_from: [\n  y\n]\n---\n');
    expect(survivors(result.text)).toEqual(['y']);
  });

  it('adds past that comment without merging the new entry into it', () => {
    const before = '---\nderived_from: [\n  x,\n  y # a, b\n]\n---\n';
    const after = addDerivedFrom(doc(before), 'abc');

    expect(after.refusal).toBeNull();
    expect(after.text).toBe(
      '---\nderived_from: [\n  x,\n  y # a, b\n  , abc\n]\n---\n',
    );
    expect(survivors(after.text)).toEqual(['x', 'y', 'abc']);
  });

  it('restores the original bytes through add then remove', () => {
    for (const before of [
      '---\nderived_from: [\n  abc # note\n  , y\n]\n---\n',
      '---\r\nderived_from: [\r\n  abc # note\r\n  , y\r\n]\r\n---\r\n',
      '---\nderived_from: [\n  x\n  , abc # note\n  ,\n]\n---\n',
      '---\nderived_from: [\n  abc # a, b\n  , y\n]\n---\n',
    ]) {
      const added = addDerivedFrom(doc(before), '20260823-1200-probe');
      expect(added.changed).toBe(true);
      expect(
        removeDerivedFrom(doc(added.text), '20260823-1200-probe').text,
      ).toBe(before);
    }
  });

  it('would otherwise have written frontmatter nothing can read', () => {
    // What stopping at the comment used to leave behind. YAML does not accept
    // a flow sequence opening on a comma, so the postcondition would have
    // refused the edit and the entry could never have been removed at all.
    const broken = doc('---\nderived_from: [\n  \n  , y\n]\n---\n');

    expect(broken.parseError).not.toBeNull();
  });
});

/**
 * A separator the run cannot reach without crossing a comment.
 *
 * The comma still belongs to the deletion — a run that gives up both of its
 * separators leaves the survivors with nothing between them — but the comment
 * standing in the way is on its own line and belongs to neither neighbour. So
 * the comma is deleted where it stands and the comment is not touched.
 */
describe('a separator with a standalone comment in front of it', () => {
  const survivors = (text: string) => doc(text).frontmatter.derivedFrom;

  it('takes the comma and leaves the comment', () => {
    const before =
      '---\nderived_from: [\n  abc\n  # standalone\n  , y\n]\n---\n';
    const result = removeDerivedFrom(doc(before), 'abc');

    expect(result.refusal).toBeNull();
    expect(result.text).toBe(
      '---\nderived_from: [\n  # standalone\n  y\n]\n---\n',
    );
    expect(survivors(result.text)).toEqual(['y']);
  });

  it('takes the run own comment too, and still only one comma', () => {
    const before =
      '---\nderived_from: [\n  abc # note\n  # standalone\n  , y\n]\n---\n';
    const result = removeDerivedFrom(doc(before), 'abc');

    expect(result.text).toBe(
      '---\nderived_from: [\n  # standalone\n  y\n]\n---\n',
    );
    expect(survivors(result.text)).toEqual(['y']);
  });

  it('keeps both neighbours when the run sits between two of them', () => {
    const before =
      '---\nderived_from: [\n  x\n  # one\n  , abc\n  # two\n  , y\n]\n---\n';
    const result = removeDerivedFrom(doc(before), 'abc');

    expect(result.text).toContain('# one');
    expect(result.text).toContain('# two');
    expect(survivors(result.text)).toEqual(['x', 'y']);
    expect(doc(result.text).parseError).toBeNull();
  });

  it('keeps CRLF endings while it does so', () => {
    const before =
      '---\r\nderived_from: [\r\n  abc\r\n  # standalone\r\n  , y\r\n]\r\n---\r\n';
    const result = removeDerivedFrom(doc(before), 'abc');

    expect(result.text).toBe(
      '---\r\nderived_from: [\r\n  # standalone\r\n  y\r\n]\r\n---\r\n',
    );
    expect(result.text).not.toMatch(/[^\r]\n/);
  });

  it('leaves nothing YAML reads as an empty entry', () => {
    for (const before of [
      '---\nderived_from: [\n  abc\n  # standalone\n  , y\n]\n---\n',
      '---\nderived_from: [\n  x,\n  abc\n  # standalone\n  , y\n]\n---\n',
      '---\nderived_from: [\n  x\n  # one\n  , abc\n  # two\n  , y\n]\n---\n',
    ]) {
      const after = doc(removeDerivedFrom(doc(before), 'abc').text);

      expect(after.parseError).toBeNull();
      expect(after.frontmatter.data.derived_from).not.toContain(null);
    }
  });
});

/**
 * An empty entry the *author* wrote is not this module's to repair. It is
 * counted before the edit and counted after, so a file that already carries
 * one stays mutable, and only an entry an edit emptied is refused.
 */
describe('an empty entry already in the list', () => {
  for (const [label, spelling] of [
    ['an explicit null', 'null'],
    ['a tilde', '~'],
    ['an empty string', "''"],
  ] as const) {
    it(`leaves ${label} alone and still adds`, () => {
      const before = `---\nderived_from: [abc, ${spelling}]\n---\n`;
      const result = addDerivedFrom(doc(before), 'y');

      expect(result.refusal).toBeNull();
      expect(result.text).toBe(
        `---\nderived_from: [abc, ${spelling}, y]\n---\n`,
      );
    });

    it(`leaves ${label} alone and still removes`, () => {
      const before = `---\nderived_from: [abc, ${spelling}]\n---\n`;
      const result = removeDerivedFrom(doc(before), 'abc');

      expect(result.refusal).toBeNull();
      expect(result.text).toBe(`---\nderived_from: [${spelling}]\n---\n`);
    });
  }
});

/**
 * `changed: false, refusal: null` is the caller's "already done". It must never
 * also mean "could not do it": the read view says this file carries the edge,
 * but the text spells it out nowhere this module can delete, because an alias
 * resolves to it. Deleting the anchor's own field is an edit to a field the
 * caller never named.
 */
describe('an entry a file reaches through an alias', () => {
  const before = '---\nbase: &b abc\nderived_from: [*b]\ntags: [t]\n---\n';

  it('is present in the read view', () => {
    expect(doc(before).frontmatter.derivedFrom).toEqual(['abc']);
  });

  it('refuses instead of reporting a silent no-op', () => {
    const result = removeDerivedFrom(doc(before), 'abc');

    expect(result.refusal?.code).toBe('entry-not-removable');
    expect(result.changed).toBe(false);
    expect(result.edits).toEqual([]);
    expect(result.text).toBe(before);
  });

  it('names the field in a reason a human can act on', () => {
    const reason = removeDerivedFrom(doc(before), 'abc').refusal?.reason ?? '';

    expect(reason).toContain('derived_from');
    expect(reason).toContain('alias');
  });

  it('still refuses when plain entries sit beside it', () => {
    const mixed = '---\nbase: &b abc\nderived_from: [*b, y]\n---\n';
    const result = removeDerivedFrom(doc(mixed), 'abc');

    expect(result.refusal?.code).toBe('entry-not-removable');
    expect(result.text).toBe(mixed);
  });

  // The refusal is for an ID the read view actually carries. An ID nowhere in
  // the file is still the ordinary no-op.
  it('leaves an ID the file does not carry as a plain no-op', () => {
    const result = removeDerivedFrom(doc(before), 'not-here');

    expect(result.changed).toBe(false);
    expect(result.refusal).toBeNull();
  });
});

/**
 * Adding an edge and then removing it returns the file to its exact bytes,
 * whenever the file already had a block to edit. This is the strongest
 * available evidence that a mutation touches only what it must.
 */
describe('add then remove restores the original bytes', () => {
  for (const { name, text } of fixtures) {
    const document = doc(text, name);
    if (document.block === null || document.parseError !== null) continue;

    it(`restores ${name}`, () => {
      const added = addDerivedFrom(document, '20260822-1200-round-trip');
      expect(added.changed).toBe(true);
      const removed = removeDerivedFrom(
        doc(added.text, name),
        '20260822-1200-round-trip',
      );
      expect(removed.text).toBe(text);
    });
  }
});

/**
 * The exceptions {@link removeDerivedFrom} names. Add-then-remove is an inverse
 * for the fixtures above; these are the shapes where it is not, and each one is
 * pinned here so the docstring cannot drift away from what the code does.
 */
describe('add then remove is not an inverse', () => {
  it('leaves a lone ID promoted to a one-item list', () => {
    const before = '---\nderived_from: aaa\ntags: [x]\n---\n';
    const added = addDerivedFrom(doc(before), 'bbb');
    expect(added.text).toBe('---\nderived_from: [aaa, bbb]\ntags: [x]\n---\n');

    const removed = removeDerivedFrom(doc(added.text), 'bbb');
    expect(removed.text).toBe('---\nderived_from: [aaa]\ntags: [x]\n---\n');
    expect(doc(removed.text).frontmatter.derivedFrom).toEqual(['aaa']);
  });

  it('leaves every spelling of emptiness gone rather than restored', () => {
    for (const before of [
      '---\nderived_from:\ntags: [x]\n---\n',
      '---\nderived_from: []\ntags: [x]\n---\n',
      '---\nderived_from: null\ntags: [x]\n---\n',
      '---\nderived_from: ~\ntags: [x]\n---\n',
    ]) {
      const added = addDerivedFrom(doc(before), 'bbb');
      expect(added.refusal).toBeNull();
      expect(removeDerivedFrom(doc(added.text), 'bbb').text).toBe(
        '---\ntags: [x]\n---\n',
      );
    }
  });

  it('leaves behind the block it created for a file that had none', () => {
    const before = 'body only\n';
    const added = addDerivedFrom(doc(before), 'bbb');
    const removed = removeDerivedFrom(doc(added.text), 'bbb');

    expect(removed.text).toBe('---\n---\nbody only\n');
  });
});

/**
 * A key written with no value may still carry a trailing comment, and YAML puts
 * the empty value node *at the comment*. Writing the value there would swallow
 * the `#` and silently destroy both the comment and the document.
 */
describe('a key with no value but a trailing comment', () => {
  const cases = [
    ['a spaced comment', 'derived_from: # why', 'derived_from: [abc] # why'],
    ['a tight comment', 'derived_from: #x', 'derived_from: [abc] #x'],
    [
      'extra spacing before the comment',
      'derived_from:    # why',
      'derived_from: [abc]    # why',
    ],
  ] as const;

  for (const [name, field, expected] of cases) {
    const before = `---\ntype: note\n${field}\ntags: [x]\n---\n\nBody.\n`;

    it(`writes the value before ${name}`, () => {
      const added = addDerivedFrom(doc(before), 'abc');

      expect(added.changed).toBe(true);
      expect(added.text).toBe(
        `---\ntype: note\n${expected}\ntags: [x]\n---\n\nBody.\n`,
      );
      expect(changedLines(before, added.text)).toEqual([
        `-${field}`,
        `+${expected}`,
      ]);
    });

    it(`leaves ${name} in a document that still reads`, () => {
      const after = doc(addDerivedFrom(doc(before), 'abc').text);

      expect(after.parseError).toBeNull();
      expect(after.frontmatter.derivedFrom).toEqual(['abc']);
      expect(after.frontmatter.type).toBe('note');
      expect(after.frontmatter.tags).toEqual(['x']);
      expect(after.body).toBe('\nBody.\n');
    });

    it(`keeps the field removable after ${name}`, () => {
      const added = addDerivedFrom(doc(before), 'abc');
      const back = removeDerivedFrom(doc(added.text), 'abc');

      expect(back.changed).toBe(true);
      expect(back.text).toBe('---\ntype: note\ntags: [x]\n---\n\nBody.\n');
      expect(doc(back.text).frontmatter.derivedFrom).toEqual([]);
    });
  }

  it('writes before a comment on a CRLF line without touching the ending', () => {
    const before =
      '---\r\ntype: note\r\nderived_from: # why\r\ntags: [x]\r\n---\r\n';
    const added = addDerivedFrom(doc(before), 'abc');

    expect(added.text).toBe(
      '---\r\ntype: note\r\nderived_from: [abc] # why\r\ntags: [x]\r\n---\r\n',
    );
    expect(doc(added.text).frontmatter.derivedFrom).toEqual(['abc']);
    expect(removeDerivedFrom(doc(added.text), 'abc').text).toBe(
      '---\r\ntype: note\r\ntags: [x]\r\n---\r\n',
    );
  });
});

/**
 * A field that holds nothing comes in two shapes the parser reports very
 * differently, and conflating them corrupts files. `derived_from:` writes no
 * value token at all, so YAML hands back an empty span that already sits past
 * any anchor or tag; `derived_from: null` writes one, and those bytes are what
 * a new value has to replace rather than sit beside.
 */
describe('a field whose value is empty or explicitly null', () => {
  const cases = [
    ['no value', 'derived_from:', 'derived_from: [abc]'],
    ['a lowercase null', 'derived_from: null', 'derived_from: [abc]'],
    ['a tilde', 'derived_from: ~', 'derived_from: [abc]'],
    ['an uppercase NULL', 'derived_from: NULL', 'derived_from: [abc]'],
    ['a capitalized Null', 'derived_from: Null', 'derived_from: [abc]'],
    [
      'a null with a trailing comment',
      'derived_from: null # why',
      'derived_from: [abc] # why',
    ],
    [
      'a tilde spaced away from its comment',
      'derived_from: ~   # why',
      'derived_from: [abc]   # why',
    ],
    ['an anchor and no value', 'derived_from: &a', 'derived_from: &a [abc]'],
    [
      'an anchor and an explicit null',
      'derived_from: &a null',
      'derived_from: &a [abc]',
    ],
    [
      'an anchor, no value, and a comment',
      'derived_from: &a # c',
      'derived_from: &a [abc] # c',
    ],
    [
      'a null tag and no value',
      'derived_from: !!null',
      'derived_from: !!null [abc]',
    ],
    [
      'a null tag and an explicit null',
      'derived_from: !!null null',
      'derived_from: !!null [abc]',
    ],
    [
      'a string tag and no value',
      'derived_from: !!str',
      'derived_from: !!str [abc]',
    ],
  ] as const;

  for (const [name, field, expected] of cases) {
    const before = `---\ntype: note\n${field}\ntags: [x]\n---\n\nBody.\n`;

    it(`replaces ${name} with the new list`, () => {
      const added = addDerivedFrom(doc(before), 'abc');

      expect(added.changed).toBe(true);
      expect(added.text).toBe(
        `---\ntype: note\n${expected}\ntags: [x]\n---\n\nBody.\n`,
      );
      expect(changedLines(before, added.text)).toEqual([
        `-${field}`,
        `+${expected}`,
      ]);
    });

    // An anchor or a tag written after the value is not YAML, and a second
    // value left beside the first stops the whole block parsing — which takes
    // unrelated fields such as `tags` down with it.
    it(`leaves a block that still parses after ${name}`, () => {
      const after = doc(addDerivedFrom(doc(before), 'abc').text);

      expect(after.parseError).toBeNull();
      expect(after.frontmatter.derivedFrom).toEqual(['abc']);
      expect(after.frontmatter.type).toBe('note');
      expect(after.frontmatter.tags).toEqual(['x']);
      expect(after.body).toBe('\nBody.\n');
    });

    it(`is idempotent and removable after ${name}`, () => {
      const added = addDerivedFrom(doc(before), 'abc');

      expect(addDerivedFrom(doc(added.text), 'abc').changed).toBe(false);

      const back = removeDerivedFrom(doc(added.text), 'abc');
      expect(back.text).toBe('---\ntype: note\ntags: [x]\n---\n\nBody.\n');
    });
  }

  it('keeps CRLF endings when replacing an explicit null', () => {
    const before =
      '---\r\ntype: note\r\nderived_from: null # why\r\ntags: [x]\r\n---\r\n';
    const added = addDerivedFrom(doc(before), 'abc');

    expect(added.text).toBe(
      '---\r\ntype: note\r\nderived_from: [abc] # why\r\ntags: [x]\r\n---\r\n',
    );
    expect(doc(added.text).frontmatter.derivedFrom).toEqual(['abc']);
  });

  it('keeps CRLF endings when writing past an anchor', () => {
    const before =
      '---\r\ntype: note\r\nderived_from: &a\r\ntags: [x]\r\n---\r\n';
    const added = addDerivedFrom(doc(before), 'abc');

    expect(added.text).toBe(
      '---\r\ntype: note\r\nderived_from: &a [abc]\r\ntags: [x]\r\n---\r\n',
    );
    expect(doc(added.text).frontmatter.derivedFrom).toEqual(['abc']);
  });

  // An explicit key has no colon to write a value after, so the value goes on
  // its own `: value` line rather than onto the end of the key, which would
  // rename the key instead of giving it a value.
  it('gives an explicit key its own value line', () => {
    const before = '---\ntype: note\n? derived_from\ntags: [x]\n---\n';
    const added = addDerivedFrom(doc(before), 'abc');

    expect(added.text).toBe(
      '---\ntype: note\n? derived_from\n: [abc]\ntags: [x]\n---\n',
    );

    const after = doc(added.text);
    expect(after.parseError).toBeNull();
    expect(after.frontmatter.derivedFrom).toEqual(['abc']);
    expect(after.frontmatter.tags).toEqual(['x']);
  });
});

/**
 * The shapes where add-then-remove is deliberately not an inverse. Every one of
 * them spells "no recorded provenance" before and after, so the field is left
 * gone rather than restored to an empty spelling of the same thing. The list
 * matches the spellings {@link removeDerivedFrom} names, so the docstring
 * cannot drift away from what the code does.
 *
 * Only the end state is asserted, because the end state is what these cases
 * are about. The intermediate is not left open: `a field whose value is empty
 * or explicitly null` above already pins `!!null` to `!!null [abc]` and `!!str`
 * to `!!str [abc]` as exact text. Resolving the open `!!null [abc]` /
 * `!!str [abc]` contract question means changing those cases, not these.
 */
describe('degenerate empty spellings', () => {
  for (const [name, before] of [
    ['a key with no value', '---\nderived_from:\n---\n'],
    ['an empty list', '---\nderived_from: []\n---\n'],
    ['an explicit null', '---\nderived_from: null\n---\n'],
    ['a tilde', '---\nderived_from: ~\n---\n'],
    ['a shouted null', '---\nderived_from: NULL\n---\n'],
    ['an anchored empty value', '---\nderived_from: &a\n---\n'],
    ['a tagged empty value', '---\nderived_from: !!null\n---\n'],
  ] as const) {
    it(`collapses ${name} to absence`, () => {
      const added = addDerivedFrom(doc(before), 'abc');
      const back = removeDerivedFrom(doc(added.text), 'abc');

      expect(added.changed).toBe(true);
      expect(back.text).toBe('---\n---\n');
      expect(doc(back.text).frontmatter.derivedFrom).toEqual([]);
    });
  }
});

describe('values this module will not reinterpret', () => {
  it('refuses an alias rather than rewriting what it points at', () => {
    const before = '---\nbase: &b [a]\nderived_from: *b\n---\n';
    const result = addDerivedFrom(doc(before), 'abc');

    expect(result.refusal?.code).toBe('field-not-list');
    expect(result.text).toBe(before);
  });
});

/**
 * A block scalar reads as a lone scalar, but its span covers the `|` or `>`
 * indicator and every indented line under it. Widening that span into `[...]`
 * does not produce YAML, and the wreckage does not stop at this field: the keys
 * below it get swallowed into the broken line, so `type` and `tags` go with it.
 * There is no smaller span to edit, so the only safe answer is to decline.
 */
describe('a field holding a block scalar', () => {
  const cases = [
    ['a literal block', 'derived_from: |\n  src-001'],
    ['a folded block', 'derived_from: >-\n  src-001'],
    ['a literal block with no value', 'derived_from: |\n'],
    ['a block with an explicit chomp', 'derived_from: |-\n  src-001'],
    ['a block with an indentation indicator', 'derived_from: |2\n   src-001'],
  ] as const;

  for (const [name, field] of cases) {
    const before = `---\ntype: note\n${field}\ntags: [x]\n---\n\nBody.\n`;

    it(`refuses to add to ${name}`, () => {
      const result = addDerivedFrom(doc(before), 'abc');

      expect(result.refusal?.code).toBe('field-not-list');
      expect(result.changed).toBe(false);
      expect(result.edits).toEqual([]);
      expect(result.text).toBe(before);
    });

    it(`refuses to remove from ${name}`, () => {
      const result = removeDerivedFrom(doc(before), 'src-001');

      expect(result.refusal?.code).toBe('field-not-list');
      expect(result.text).toBe(before);
    });
  }

  // The refusal has to be narrow. A value spread over several lines *without* a
  // block indicator has a span that widens correctly, and refusing it would
  // take away an edit that works.
  it('still widens a multi-line plain scalar', () => {
    const before =
      '---\ntype: note\nderived_from: src-001\n  more\ntags: [x]\n---\n';
    const result = addDerivedFrom(doc(before), 'abc');

    expect(result.refusal).toBeNull();
    expect(result.text).toBe(
      '---\ntype: note\nderived_from: [src-001\n  more, abc]\ntags: [x]\n---\n',
    );
    expect(doc(result.text).parseError).toBeNull();
    expect(doc(result.text).frontmatter.tags).toEqual(['x']);
  });
});

/**
 * An anchor is a shared definition, so a field carrying one is not only itself.
 * Widening `derived_from: &a` hands every `*a` in the block the new list, and
 * removing the field takes the definition away and leaves those aliases
 * pointing at nothing — which stops the whole block parsing. Either way a field
 * the caller never named changes, so the edit is declined instead.
 */
describe('a field whose anchor another field aliases', () => {
  const cases = [
    ['an empty anchored value', 'derived_from: &a', 'about: *a'],
    ['an anchored list', 'derived_from: &a [zzz]', 'about: *a'],
    [
      'an anchor on an entry inside the list',
      'derived_from: [&i zzz]',
      'about: *i',
    ],
    ['an anchored lone ID', 'derived_from: &a zzz', 'about: *a'],
  ] as const;

  for (const [name, field, alias] of cases) {
    const before = `---\ntype: note\n${field}\n${alias}\ntags: [x]\n---\n`;

    it(`refuses to add to ${name}`, () => {
      const result = addDerivedFrom(doc(before), 'abc');

      expect(result.refusal?.code).toBe('anchor-aliased');
      expect(result.changed).toBe(false);
      expect(result.edits).toEqual([]);
      expect(result.text).toBe(before);
    });

    it(`refuses to remove from ${name}`, () => {
      const result = removeDerivedFrom(doc(before), 'zzz');

      expect(result.refusal?.code).toBe('anchor-aliased');
      expect(result.text).toBe(before);
    });
  }

  // Without this, removing the field would orphan `*a` and the whole block —
  // `type` and `tags` included — would stop reading.
  it('leaves every other field readable when it declines', () => {
    const before = '---\ntype: note\nderived_from: &a [zzz]\nabout: *a\n---\n';
    const after = doc(removeDerivedFrom(doc(before), 'zzz').text);

    expect(after.parseError).toBeNull();
    expect(after.frontmatter.type).toBe('note');
    expect(after.frontmatter.about).toEqual(['zzz']);
  });

  // The refusal is about *sharing*, not about anchors. An anchor nothing points
  // at is the author's own spelling and is preserved through the edit.
  it('still edits an anchor no other field aliases', () => {
    const before = '---\ntype: note\nderived_from: &a [zzz]\nabout: [q]\n---\n';
    const result = addDerivedFrom(doc(before), 'abc');

    expect(result.refusal).toBeNull();
    expect(result.text).toBe(
      '---\ntype: note\nderived_from: &a [zzz, abc]\nabout: [q]\n---\n',
    );
  });

  it('is unbothered by an alias that points somewhere else entirely', () => {
    const before =
      '---\ntype: note\nbase: &b [q]\nabout: *b\nderived_from: [zzz]\n---\n';
    const result = addDerivedFrom(doc(before), 'abc');

    expect(result.refusal).toBeNull();
    expect(result.text).toBe(
      '---\ntype: note\nbase: &b [q]\nabout: *b\nderived_from: [zzz, abc]\n---\n',
    );
  });
});

/**
 * The backstop. Every branch above is meant to produce readable frontmatter
 * carrying exactly the requested change; this catches the representation none
 * of them anticipated, so a caller who writes the returned text to disk never
 * finds out the hard way.
 *
 * `!!omap` is a real instance rather than a hypothetical one: the result parses
 * cleanly and still reads back with no `derived_from` at all, so the edge would
 * have vanished silently.
 */
describe('a mutation that does not read back as promised', () => {
  const before = '---\ntype: note\nderived_from: !!omap\ntags: [x]\n---\n';

  it('throws the edit away and returns the original text', () => {
    const result = addDerivedFrom(doc(before), 'abc');

    expect(result.refusal?.code).toBe('mutation-unsafe');
    expect(result.changed).toBe(false);
    expect(result.edits).toEqual([]);
    expect(result.text).toBe(before);
  });

  it('names the field in a reason a human can act on', () => {
    const reason = addDerivedFrom(doc(before), 'abc').refusal?.reason ?? '';

    expect(reason).toContain('derived_from');
    expect(reason).toContain('left unchanged');
  });

  it('would otherwise have lost the edge without saying so', () => {
    const written = doc(
      '---\ntype: note\nderived_from: !!omap [abc]\ntags: [x]\n---\n',
    );

    expect(written.parseError).toBeNull();
    expect(written.frontmatter.derivedFrom).toEqual([]);
  });
});

/**
 * The *valued* spelling of the same tag. `!!omap` and `!!pairs` are sequences,
 * so `isSeq` accepts them, but their entries parse as `Pair` and carry no
 * source range — there is no span to append after or delete. A public write
 * operation meeting a representation it cannot mutate must refuse, not throw:
 * a traversal over a vault has no way to recover from an exception thrown at
 * one file, and the file it was about to write is not the caller's mistake.
 */
describe('a field holding a tagged list of pairs', () => {
  const shapes = [
    ['a flow omap', '---\nderived_from: !!omap [abc]\ntags: [x]\n---\n'],
    ['a flow pairs', '---\nderived_from: !!pairs [a: 1]\ntags: [x]\n---\n'],
    ['a block omap', '---\nderived_from: !!omap\n  - abc: 1\ntags: [x]\n---\n'],
  ] as const;

  for (const [label, before] of shapes) {
    it(`refuses to add to ${label} without throwing`, () => {
      const result = addDerivedFrom(doc(before), 'abc');

      expect(result.refusal?.code).toBe('field-not-list');
      expect(result.changed).toBe(false);
      expect(result.text).toBe(before);
    });

    it(`refuses to remove from ${label} without throwing`, () => {
      const result = removeDerivedFrom(doc(before), 'abc');

      expect(result.refusal?.code).toBe('field-not-list');
      expect(result.text).toBe(before);
    });
  }

  it('names the field in a reason a human can act on', () => {
    const reason =
      addDerivedFrom(doc(shapes[0][1]), 'abc').refusal?.reason ?? '';

    expect(reason).toContain('derived_from');
    expect(reason).toContain('IDs');
  });

  // A tagged list whose entries *are* nodes keeps its ordinary span, so it is
  // edited rather than refused. The guard is about pairs, not about tags.
  it('still edits a tagged list of plain entries', () => {
    const before = '---\nderived_from: !!seq [zzz]\ntags: [x]\n---\n';
    const result = addDerivedFrom(doc(before), 'abc');

    expect(result.refusal).toBeNull();
    expect(result.text).toBe(
      '---\nderived_from: !!seq [zzz, abc]\ntags: [x]\n---\n',
    );
  });
});

/**
 * Acceptance criterion, end to end: a file whose fields this contract version
 * does not recognize is not an error, and stays intact through a later
 * mutation. A tool that strips unrecognized fields is the real corruption risk.
 */
describe('unrecognized fields survive validation and a later mutation', () => {
  it('reports no error and preserves every unknown field', () => {
    const before = fixture('note-unknown-fields');
    const file = 'notes/unknown.md';

    const beforeFindings = validateDocument({
      file,
      document: doc(before, 'unknown'),
    });
    expect(beforeFindings.filter((f) => f.severity === 'error')).toEqual([]);

    const after = addDerivedFrom(doc(before, 'unknown'), 'abc').text;
    const afterFindings = validateDocument({
      file,
      document: doc(after, 'unknown'),
    });
    expect(afterFindings.filter((f) => f.severity === 'error')).toEqual([]);

    for (const line of before.split('\n')) {
      expect(after).toContain(line);
    }
  });
});
