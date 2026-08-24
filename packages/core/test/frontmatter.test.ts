import { describe, expect, it } from 'vitest';
import { readFrontmatter } from '../src/frontmatter.js';
import { fixture, fixtures } from './fixtures.js';

describe('readFrontmatter', () => {
  it('preserves an author-written local offset as text', () => {
    const { data } = readFrontmatter(fixture('source-youtube'));
    expect(data.created).toBe('2026-08-17T19:30:00-05:00');
    expect(data.created).toBeTypeOf('string');
  });

  it('reads inline arrays, mixed quoting, and commented lines', () => {
    const { data } = readFrontmatter(fixture('source-youtube'));
    expect(data.tags).toEqual(['messaging', 'video']);
    expect(data.title).toBe('A quoted title, with a comma');
    expect(data.kind).toBe('video');
  });

  it('treats a file with no frontmatter as all body', () => {
    const text = fixture('plain-no-frontmatter');
    const read = readFrontmatter(text);
    expect(read.block).toBeNull();
    expect(read.body).toBe(text);
    expect(read.parseError).toBeNull();
  });

  it('treats an unterminated block as body, not as frontmatter', () => {
    const text = fixture('unterminated-frontmatter');
    const read = readFrontmatter(text);
    expect(read.block).toBeNull();
    expect(read.body).toBe(text);
  });

  it('reads an empty block as an empty mapping', () => {
    const read = readFrontmatter(fixture('empty-frontmatter'));
    expect(read.block?.raw).toBe('');
    expect(read.data).toEqual({});
    expect(read.parseError).toBeNull();
  });

  it('keeps the rest of the mapping when a key is duplicated', () => {
    const read = readFrontmatter(
      '---\ntype: note\ntype: source\ntags: [kept]\n---\n\nbody\n',
    );
    expect(read.parseError).toBeNull();
    expect(read.data.tags).toEqual(['kept']);
    // Last value wins, matching what every other YAML consumer will see.
    expect(read.data.type).toBe('source');
  });

  it('reports a duplicated key as evidence rather than accepting it', () => {
    const read = readFrontmatter(
      '---\ntype: note\ntype: source\nid: a\nid: b\nid: c\n---\n',
    );
    expect(read.duplicateKeys).toEqual(['type', 'id']);
  });

  it('reports no duplicates for a well-formed block', () => {
    expect(readFrontmatter(fixture('source-youtube')).duplicateKeys).toEqual(
      [],
    );
  });

  it('reports unparseable YAML without throwing or losing the body', () => {
    const read = readFrontmatter(fixture('broken-yaml'));
    expect(read.block).not.toBeNull();
    expect(read.parseError).toBeTypeOf('string');
    expect(read.data).toEqual({});
    expect(read.duplicateKeys).toEqual([]);
    expect(read.body).toContain('Still indexable knowledge.');
  });

  it('describes a parse failure without quoting the text that failed', () => {
    // Everything between the delimiters is parsed as YAML, whatever the author
    // meant it as, so a parser message that quotes its source can carry prose.
    // Every reason built from `parseError` promises it does not.
    const read = readFrontmatter(
      '---\ntype: note\ntags: [unclosed\n' +
        'Private prose the author would not paste into an issue.\n' +
        '---\n\nbody\n',
    );

    expect(read.parseError).toBe('BAD_INDENT at line 3, column 1');
    expect(read.body).toContain('body');
  });

  it('reports an alias with no anchor without naming it', () => {
    // This one parses without error and throws only on resolution, in a
    // `ReferenceError` that quotes the alias straight out of the file.
    const read = readFrontmatter(
      '---\ntype: note\nx: *BobHadSurgeryInMarch\n---\n\nbody\n',
    );

    expect(read.parseError).toBe(
      'frontmatter could not be resolved into a value',
    );
    expect(read.data).toEqual({});
    expect(read.body).toContain('body');
  });

  it('reads CRLF frontmatter and records the line ending', () => {
    const read = readFrontmatter(fixture('crlf-endings'));
    expect(read.block?.eol).toBe('\r\n');
    expect(read.data.tags).toEqual(['crlf']);
    expect(read.body.startsWith('\r\n')).toBe(true);
  });

  it('handles a closing delimiter on the final line with no trailing newline', () => {
    const text = fixture('no-trailing-newline');
    const read = readFrontmatter(text);
    expect(read.data.type).toBe('note');
    expect(read.body).toBe('\n# No newline at end of file');
  });

  it('rejects a top-level sequence as a mapping', () => {
    const read = readFrontmatter('---\n- one\n- two\n---\n\nbody\n');
    expect(read.data).toEqual({});
    expect(read.parseError).toBe('frontmatter is not a mapping');
  });
});

/**
 * Round-trip identity is a precondition for any code that writes into a brain.
 * The read must hand back pieces that reassemble into the original bytes, or a
 * later surgical mutation has nothing trustworthy to edit.
 */
describe('round-trip identity', () => {
  for (const { name, text } of fixtures) {
    it(`reassembles ${name} byte-identically`, () => {
      const { block, body } = readFrontmatter(text);
      if (block === null) {
        expect(body).toBe(text);
        return;
      }

      // Every offset the write primitive splices on is asserted here, because
      // a writer that re-derives them instead has been shown to lose bytes on
      // padded delimiters and on a closing delimiter at end of file.
      const prefix = text.slice(0, block.start);
      const opening = text.slice(block.start, block.contentStart);
      const closing = text.slice(block.contentEnd, block.end);

      expect(prefix === '' || prefix === '\uFEFF').toBe(true);
      expect(opening).toMatch(/^---[ \t]*\r?\n$/);
      expect(block.raw).toBe(text.slice(block.contentStart, block.contentEnd));
      expect(closing.trimEnd()).toBe('---');
      expect(prefix + opening + block.raw + closing + body).toBe(text);
    });
  }
});

/**
 * A byte order mark is a byte of the author's file. It must not hide the
 * frontmatter behind it, and it must not move.
 */
describe('byte order mark', () => {
  const bom = '\uFEFF';

  it('reads frontmatter behind a BOM', () => {
    const read = readFrontmatter(`${bom}---\nid: abc\n---\n\nbody\n`);
    expect(read.data.id).toBe('abc');
    expect(read.parseError).toBeNull();
  });

  it('leaves the BOM outside the block', () => {
    const text = `${bom}---\nid: abc\n---\n\nbody\n`;
    const { block } = readFrontmatter(text);
    expect(block?.start).toBe(1);
    expect(text.slice(0, block?.start)).toBe(bom);
    expect(block?.raw).toBe('id: abc\n');
  });

  it('keeps a BOM-only file as body, with no block', () => {
    const read = readFrontmatter(`${bom}# Title\n`);
    expect(read.block).toBeNull();
    expect(read.body).toBe(`${bom}# Title\n`);
  });
});

/**
 * The delimiter spellings the review found a rebuilding writer losing bytes on.
 * Reassembly through the published offsets must survive every one of them.
 */
describe('delimiter spellings', () => {
  const cases: readonly [string, string][] = [
    ['space-padded opening', '--- \nid: a\n---\nbody\n'],
    ['space-padded closing', '---\nid: a\n--- \nbody\n'],
    ['tab-padded closing', '---\nid: a\n---\t\nbody\n'],
    ['closing at end of file', '---\nid: a\n---'],
    ['mixed endings', '---\r\nid: a\n---\r\nbody\n'],
  ];

  for (const [name, text] of cases) {
    it(`reassembles with a ${name}`, () => {
      const { block, body } = readFrontmatter(text);
      expect(block).not.toBeNull();
      const b = block as NonNullable<typeof block>;
      expect(b.raw).toBe(text.slice(b.contentStart, b.contentEnd));
      expect(
        text.slice(b.start, b.contentStart) +
          b.raw +
          text.slice(b.contentEnd, b.end) +
          body,
      ).toBe(text);
    });
  }
});
