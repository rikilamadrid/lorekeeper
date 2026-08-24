import { describe, expect, it } from 'vitest';
import { readDocument } from '../src/document.js';
import { RECOGNIZED_FIELDS, toFrontmatter } from '../src/fields.js';
import { indexDocuments } from '../src/links.js';
import { fixture } from './fixtures.js';

describe('readDocument', () => {
  it('reads the recognized fields of a source', () => {
    const doc = readDocument('source', fixture('source-youtube'));
    const fm = doc.frontmatter;
    expect(fm.id).toBe('20260817-1930-yt-example-messaging');
    expect(fm.type).toBe('source');
    expect(fm.kind).toBe('video');
    expect(fm.url).toBe('https://www.youtube.com/watch?v=EXAMPLE0001');
    expect(fm.created).toBe('2026-08-17T19:30:00-05:00');
    expect(fm.tags).toEqual(['messaging', 'video']);
    expect(fm.about).toEqual([
      '[[Event-driven architecture]]',
      '[[Example Project]]',
    ]);
  });

  it('reads derived_from as an ordered list of source IDs', () => {
    const doc = readDocument('note', fixture('note-derived'));
    expect(doc.frontmatter.derivedFrom).toEqual([
      '20260817-1930-yt-example-messaging',
      '20260818-0810-example-article-queues',
    ]);
  });

  it('treats an absent derived_from as absent, not as original authorship', () => {
    const doc = readDocument('source', fixture('source-youtube'));
    expect(doc.frontmatter.derivedFrom).toEqual([]);
    expect(doc.frontmatter.data).not.toHaveProperty('derived_from');
  });

  it('gives an ordinary note no id and does not treat that as a defect', () => {
    const doc = readDocument('note', fixture('note-derived'));
    expect(doc.frontmatter.id).toBeNull();
    expect(doc.parseError).toBeNull();
  });

  it('keeps unrecognized fields out of the typed view but never drops them', () => {
    const doc = readDocument('note', fixture('note-unknown-fields'));
    expect(doc.frontmatter.unrecognized).toEqual({
      reviewed_by: 'someone-elses-tool',
      confidence: 0.8,
      custom_list: ['alpha', 'beta'],
    });
    expect(doc.frontmatter.data.confidence).toBe(0.8);
    for (const field of RECOGNIZED_FIELDS) {
      expect(doc.frontmatter.unrecognized).not.toHaveProperty(field);
    }
  });

  it('carries duplicate-key evidence onto the document', () => {
    const doc = readDocument('dup', '---\nid: a\nid: b\n---\n\nbody\n');
    expect(doc.duplicateKeys).toEqual(['id']);
    expect(doc.frontmatter.id).toBe('b');
    expect(doc.parseError).toBeNull();
  });

  it('reads a file with no frontmatter as valid knowledge', () => {
    const doc = readDocument('plain', fixture('plain-no-frontmatter'));
    expect(doc.block).toBeNull();
    expect(doc.frontmatter.data).toEqual({});
    expect(doc.h1).toBe('A note with no frontmatter at all');
  });

  it('ignores an H1 inside a fenced code block', () => {
    const doc = readDocument('fenced', fixture('fenced-h1-first'));
    expect(doc.h1).toBe('The real H1');
  });

  it('finds the H1 in a CRLF file without its carriage return', () => {
    const doc = readDocument('crlf', fixture('crlf-endings'));
    expect(doc.h1).toBe('Windows line endings');
  });

  it('keeps the original text byte-exact', () => {
    const text = fixture('note-unknown-fields');
    expect(readDocument('note', text).text).toBe(text);
  });
});

describe('toFrontmatter value handling', () => {
  it('reads a lone scalar list field as a one-item list', () => {
    const fm = toFrontmatter({ derived_from: 'one-source-id', tags: 'solo' });
    expect(fm.derivedFrom).toEqual(['one-source-id']);
    expect(fm.tags).toEqual(['solo']);
  });

  it('keeps an unquoted numeric id as the text the author typed', () => {
    expect(toFrontmatter({ id: 20260817 }).id).toBe('20260817');
  });

  it('drops unusable list items rather than failing the read', () => {
    const fm = toFrontmatter({ about: ['[[Kept]]', null, { nested: true }] });
    expect(fm.about).toEqual(['[[Kept]]']);
  });

  it('does not enumerate or constrain provisional vocabulary', () => {
    const fm = toFrontmatter({ type: 'not-a-frozen-value', kind: 'anything' });
    expect(fm.type).toBe('not-a-frozen-value');
    expect(fm.kind).toBe('anything');
  });
});

describe('Setext H1', () => {
  it('reads an underlined title from a fixture', () => {
    const doc = readDocument('setext', fixture('setext-h1'));
    expect(doc.h1).toBe('Setext Heading Style');
  });

  it('does not read a `---` underline as an H1', () => {
    const doc = readDocument('h2-only', 'Just A Subheading\n---------\n\nBody');
    expect(doc.h1).toBeNull();
  });

  it('ignores a Setext underline inside a fenced code block', () => {
    const doc = readDocument(
      'fenced',
      '```\nNot A Title\n===========\n```\n\n# Real Title\n',
    );
    expect(doc.h1).toBe('Real Title');
  });

  it('ignores an underline with no paragraph above it', () => {
    expect(readDocument('bare', '\n=====\n\nBody\n').h1).toBeNull();
  });

  it('does not treat a list item or blockquote as a Setext title', () => {
    expect(readDocument('list', '- an item\n=====\n').h1).toBeNull();
    expect(readDocument('quote', '> quoted\n=====\n').h1).toBeNull();
  });

  it('takes whichever H1 spelling comes first', () => {
    expect(readDocument('a', '# ATX First\n\nSetext\n======\n').h1).toBe(
      'ATX First',
    );
    expect(readDocument('b', 'Setext First\n======\n\n# ATX\n').h1).toBe(
      'Setext First',
    );
  });

  it('reads a Setext title through a name-resolution fallback', () => {
    const doc = readDocument('setext', fixture('setext-h1'));
    expect(indexDocuments([doc]).resolveName('Setext Heading Style')).toEqual({
      status: 'resolved',
      document: doc,
      matchedBy: 'h1',
    });
  });
});
