import { describe, expect, it } from 'vitest';
import { readDocument } from '../src/document.js';
import {
  indexDocuments,
  normalizeName,
  parseLinkTarget,
} from '../src/links.js';
import { fixture } from './fixtures.js';

const source = readDocument(
  '20260817-1930-yt-example-messaging',
  fixture('source-youtube'),
);
const note = readDocument('idempotency-keys', fixture('note-derived'));
const aliased = readDocument('eda-primer', fixture('note-aliases'));

describe('parseLinkTarget', () => {
  it('parses a bare name', () => {
    expect(parseLinkTarget('Event-driven architecture')).toEqual({
      name: 'Event-driven architecture',
      fragment: null,
      display: null,
    });
  });

  it('parses wikilink display text, fragments, paths, and extensions', () => {
    expect(parseLinkTarget('[[notes/Event-driven.md#Tradeoffs|EDA]]')).toEqual({
      name: 'Event-driven',
      fragment: 'Tradeoffs',
      display: 'EDA',
    });
  });

  it('parses a block reference fragment', () => {
    expect(parseLinkTarget('[[Note#^abc123]]').fragment).toBe('^abc123');
  });
});

describe('provenance resolves by stable ID', () => {
  const index = indexDocuments([source, note, aliased]);

  it('resolves a derived_from edge to its origin', () => {
    const [first] = note.frontmatter.derivedFrom;
    expect(index.resolveId(first as string)).toBe(source);
  });

  it('returns null for an ID no document claims', () => {
    expect(index.resolveId('20260101-0000-missing')).toBeNull();
  });

  it('reports duplicate IDs instead of picking one', () => {
    const twin = readDocument('copy-of-source', fixture('source-youtube'));
    const withTwin = indexDocuments([source, twin]);
    expect(withTwin.duplicateIds).toEqual([
      '20260817-1930-yt-example-messaging',
    ]);
    expect(withTwin.resolveId('20260817-1930-yt-example-messaging')).toBeNull();
  });

  it('survives a rename, because the ID is not the filename', () => {
    const renamed = readDocument('renamed-file', source.text);
    const index = indexDocuments([renamed, note]);
    expect(index.resolveId('20260817-1930-yt-example-messaging')).toBe(renamed);
  });
});

describe('name resolution fallback order', () => {
  const index = indexDocuments([source, note, aliased]);

  it('matches the document name first, case- and space-insensitively', () => {
    const result = index.resolveName('[[  Idempotency-Keys  ]]');
    expect(result).toMatchObject({ status: 'resolved', matchedBy: 'name' });
  });

  it('falls back to the H1 title when no name matches', () => {
    const result = index.resolveName('Event-Driven Architecture');
    expect(result).toMatchObject({ status: 'resolved', matchedBy: 'h1' });
    if (result.status === 'resolved') expect(result.document).toBe(aliased);
  });

  it('falls back to a declared alias last', () => {
    const result = index.resolveName('[[EDA]]');
    expect(result).toMatchObject({ status: 'resolved', matchedBy: 'alias' });
    if (result.status === 'resolved') expect(result.document).toBe(aliased);
  });

  it('resolves an NFD filename against an NFC link, as macOS requires', () => {
    // The same name in both Unicode forms: decomposed, as an APFS filename
    // yields it, and composed, as an editor writes it.
    const decomposed = 'Cafe\u0301 Notes';
    const composed = 'Caf\u00e9 Notes';
    expect(decomposed).not.toBe(composed);

    const doc = readDocument(decomposed, '# Unrelated heading\n');
    const result = indexDocuments([doc]).resolveName(`[[${composed}]]`);
    expect(result).toMatchObject({ status: 'resolved', matchedBy: 'name' });
    expect(normalizeName(decomposed)).toBe(normalizeName(composed));
  });

  it('reports unresolved rather than guessing', () => {
    expect(index.resolveName('[[Nothing Here]]')).toEqual({
      status: 'unresolved',
    });
  });

  it('reports ambiguity instead of falling through to a weaker tier', () => {
    const twin = readDocument('eda-primer', fixture('note-derived'));
    const result = indexDocuments([aliased, twin]).resolveName('eda-primer');
    expect(result).toMatchObject({ status: 'ambiguous', matchedBy: 'name' });
    if (result.status === 'ambiguous') {
      expect(result.documents).toHaveLength(2);
    }
  });

  it('prefers a name match over another document H1 of the same text', () => {
    const named = readDocument('Event-Driven Architecture', '# Something else');
    const index = indexDocuments([aliased, named]);
    const result = index.resolveName('Event-Driven Architecture');
    expect(result).toMatchObject({ status: 'resolved', matchedBy: 'name' });
    if (result.status === 'resolved') expect(result.document).toBe(named);
  });

  it('resolves an about entry through the same path as a body wikilink', () => {
    const [firstAbout] = source.frontmatter.about;
    const eda = readDocument(
      'Event-driven architecture',
      '# Event-driven architecture\n',
    );
    const result = indexDocuments([eda]).resolveName(firstAbout as string);
    expect(result).toMatchObject({ status: 'resolved', matchedBy: 'name' });
  });
});
