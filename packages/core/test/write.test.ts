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

  it('reasons name the field and never quote body text', () => {
    const result = addDerivedFrom(doc(fixture('broken-yaml')), 'abc');
    expect(result.refusal?.reason).not.toContain('Still indexable knowledge');
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
 * The two shapes where add-then-remove is deliberately not an inverse. Both
 * spell "no recorded provenance" before and after, so the field is left gone
 * rather than restored to an empty spelling of the same thing.
 */
describe('degenerate empty spellings', () => {
  for (const [name, before] of [
    ['a key with no value', '---\nderived_from:\n---\n'],
    ['an empty list', '---\nderived_from: []\n---\n'],
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
