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
      // Chunk 3's write primitive slices on both offsets, so both are asserted.
      expect(block.start).toBe(0);
      expect(text.slice(block.start, block.end).startsWith('---')).toBe(true);

      const openingEnd = text.indexOf('\n') + 1;
      const opening = text.slice(0, openingEnd);
      const closing = text.slice(openingEnd + block.raw.length, block.end);

      expect(text.slice(openingEnd, openingEnd + block.raw.length)).toBe(
        block.raw,
      );
      expect(closing.trimEnd()).toBe('---');
      expect(opening + block.raw + closing + body).toBe(text);
    });
  }
});
