import { describe, expect, it } from 'vitest';
import { readDocument } from '../src/document.js';
import {
  countBySeverity,
  type ValidationTarget,
  validateDocument,
  validateDocuments,
} from '../src/validate.js';
import { fixture } from './fixtures.js';

function target(file: string, text: string): ValidationTarget {
  return { file, document: readDocument(file.replace(/\.md$/, ''), text) };
}

const codes = (findings: readonly { code: string }[]) =>
  findings.map((finding) => finding.code);

describe('validateDocument', () => {
  it('reports nothing for a well-formed source', () => {
    expect(
      validateDocument(target('sources/talk.md', fixture('source-youtube'))),
    ).toEqual([]);
  });

  it('reports nothing for a file with no frontmatter at all', () => {
    const found = validateDocument(
      target('notes/plain.md', fixture('plain-no-frontmatter')),
    );
    expect(found).toEqual([]);
  });

  it('does not treat a missing id or missing derived_from as a defect', () => {
    const found = validateDocument(
      target('notes/derived.md', fixture('note-derived')),
    );
    expect(found).toEqual([]);
  });

  it('does not report unrecognized fields', () => {
    expect(
      validateDocument(target('notes/x.md', fixture('note-unknown-fields'))),
    ).toEqual([]);
  });

  it('reports an unreadable block once, with file, field, and reason', () => {
    const [finding, ...rest] = validateDocument(
      target('notes/broken.md', fixture('broken-yaml')),
    );
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({
      file: 'notes/broken.md',
      field: null,
      code: 'frontmatter-unreadable',
      severity: 'error',
    });
    expect(finding?.reason).toContain('frontmatter could not be read');
  });

  it('reports a duplicated key as a warning naming that key', () => {
    const found = validateDocument(
      target('notes/dup.md', '---\nid: a\nid: b\n---\n\nbody\n'),
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      field: 'id',
      code: 'duplicate-key',
      severity: 'warning',
    });
  });

  it('reports a scalar field that is not text', () => {
    const found = validateDocument(
      target('notes/x.md', '---\nid:\n  nested: true\n---\n'),
    );
    expect(codes(found)).toEqual(['field-not-text']);
  });

  it('reports list entries that were dropped as unreadable', () => {
    const found = validateDocument(
      target('notes/x.md', '---\nderived_from:\n  - ok-id\n  - {a: 1}\n---\n'),
    );
    expect(codes(found)).toEqual(['list-item-unreadable']);
    expect(found[0]?.reason).toContain('1 of 2');
  });

  it('reports a list field written as a mapping instead of dropping it', () => {
    const found = validateDocument(
      target('notes/x.md', '---\nderived_from:\n  src-1: true\n---\n'),
    );
    expect(codes(found)).toEqual(['field-not-list']);
    expect(found[0]).toMatchObject({
      field: 'derived_from',
      severity: 'warning',
    });
  });

  it('reports every list field the contract cannot read', () => {
    const found = validateDocument(
      target('notes/x.md', '---\ntags:\n  a: 1\nabout:\n  b: 2\n---\n'),
    );
    expect(codes(found)).toEqual(['field-not-list', 'field-not-list']);
    expect(found.map((f) => f.field)).toEqual(['tags', 'about']);
  });

  it('accepts a lone scalar as a one-item list without complaint', () => {
    expect(
      validateDocument(target('notes/x.md', '---\ntags: solo\n---\n')),
    ).toEqual([]);
  });

  it('does not report an empty list', () => {
    expect(
      validateDocument(target('notes/x.md', '---\nderived_from: []\n---\n')),
    ).toEqual([]);
  });

  it('reports a blank provenance entry as its own defect', () => {
    const found = validateDocument(
      target('notes/x.md', '---\nderived_from: ["", "  "]\n---\n'),
    );
    expect(codes(found)).toEqual(['derived-from-blank']);
    expect(found[0]?.severity).toBe('error');
    expect(found[0]?.reason).not.toContain('``');
  });

  it('reports a blank id', () => {
    const found = validateDocument(
      target('notes/x.md', '---\nid: "  "\n---\n'),
    );
    expect(codes(found)).toEqual(['id-blank']);
    expect(found[0]?.severity).toBe('error');
  });

  it('reports a derived_from edge pointing at its own id', () => {
    const found = validateDocument(
      target('notes/x.md', '---\nid: self-1\nderived_from: [self-1]\n---\n'),
    );
    expect(codes(found)).toEqual(['derived-from-self']);
    expect(found[0]?.severity).toBe('error');
  });

  it('never reads a type value to decide whether a file is well formed', () => {
    const invented = target('notes/x.md', '---\ntype: whatever-i-want\n---\n');
    const source = target('sources/x.md', '---\ntype: source\n---\n');
    expect(validateDocument(invented)).toEqual([]);
    // A `type: source` without an id is not reported: `type` values are
    // unfrozen, and a rule keyed on one would quietly freeze this one.
    expect(validateDocument(source)).toEqual([]);
  });

  it('reports no file content in the reason for unreadable frontmatter', () => {
    // The delimiters enclose a line the author means as body, so the parser
    // fails on prose. Its own message would quote that line back.
    const found = validateDocument(
      target(
        'notes/x.md',
        '---\ntype: note\ntags: [unclosed\n' +
          'Private prose the author would not paste into an issue.\n' +
          '---\n\nbody\n',
      ),
    );
    expect(codes(found)).toEqual(['frontmatter-unreadable']);
    expect(found[0]?.reason).not.toContain('Private prose');
    expect(found[0]?.reason).not.toContain('unclosed');
  });
});

describe('validateDocuments', () => {
  const source = target(
    'sources/talk.md',
    '---\nid: src-1\ntype: source\n---\n\n# A talk\n',
  );
  const note = target(
    'notes/derived.md',
    '---\ntype: note\nderived_from: [src-1]\n---\n\nbody\n',
  );

  it('reports nothing when every edge resolves', () => {
    expect(validateDocuments([source, note])).toEqual([]);
  });

  it('reports a derived_from edge no file claims', () => {
    const orphan = target(
      'notes/orphan.md',
      '---\nderived_from: [src-missing]\n---\n',
    );
    const found = validateDocuments([source, orphan]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      file: 'notes/orphan.md',
      field: 'derived_from',
      code: 'derived-from-unresolved',
      severity: 'warning',
    });
    expect(found[0]?.reason).toContain('src-missing');
  });

  it('reports a duplicated id against every file that claims it', () => {
    const twin = target('sources/copy.md', '---\nid: src-1\n---\n');
    const found = validateDocuments([source, twin]);
    expect(codes(found)).toEqual(['duplicate-id', 'duplicate-id']);
    expect(found.map((finding) => finding.file)).toEqual([
      'sources/talk.md',
      'sources/copy.md',
    ]);
  });

  it('does not also report an edge as unresolved when its id is duplicated', () => {
    const twin = target('sources/copy.md', '---\nid: src-1\n---\n');
    const found = validateDocuments([source, twin, note]);
    expect(codes(found)).not.toContain('derived-from-unresolved');
  });

  it('does not report a self-edge twice', () => {
    const selfish = target(
      'notes/x.md',
      '---\nid: self-1\nderived_from: [self-1]\n---\n',
    );
    expect(codes(validateDocuments([selfish]))).toEqual(['derived-from-self']);
  });

  it('does not also report a blank entry as unresolved', () => {
    const found = validateDocuments([
      target('notes/x.md', '---\nderived_from: [""]\n---\n'),
    ]);
    expect(codes(found)).toEqual(['derived-from-blank']);
  });

  it('matches ids that are canonically equal in different Unicode forms', () => {
    const decomposed = 'cafe\u0301-1';
    const composed = 'caf\u00e9-1';
    const source = target('s.md', `---\nid: ${decomposed}\n---\n`);
    const note = target('n.md', `---\nderived_from: [${composed}]\n---\n`);
    expect(validateDocuments([source, note])).toEqual([]);
  });

  it('detects a duplicate id across Unicode forms and quotes it as written', () => {
    const source = target('s.md', '---\nid: cafe\u0301-1\n---\n');
    const twin = target('t.md', '---\nid: caf\u00e9-1\n---\n');
    const found = validateDocuments([source, twin]);
    expect(codes(found)).toEqual(['duplicate-id', 'duplicate-id']);
    // The finding quotes each file's own text, not a normalized rewrite.
    expect(found[0]?.reason).toContain('cafe\u0301-1');
  });

  it('does not fold case when comparing ids', () => {
    const source = target('s.md', '---\nid: Src-1\n---\n');
    const note = target('n.md', '---\nderived_from: [src-1]\n---\n');
    expect(codes(validateDocuments([source, note]))).toEqual([
      'derived-from-unresolved',
    ]);
  });

  it('keeps about findings informational, never higher', () => {
    const aboutish = target(
      'notes/x.md',
      '---\nabout: ["[[Nothing Here]]"]\n---\n',
    );
    const found = validateDocuments([aboutish]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      field: 'about',
      code: 'about-unresolved',
      severity: 'info',
    });
  });

  it('reports an ambiguous about target as informational', () => {
    const one = target('a/eda.md', '---\naliases: [EDA]\n---\n');
    const two = target('b/eda.md', '---\naliases: [EDA]\n---\n');
    const pointer = target('notes/x.md', '---\nabout: ["[[EDA]]"]\n---\n');
    const found = validateDocuments([one, two, pointer]);
    expect(codes(found)).toEqual(['about-ambiguous']);
    expect(found[0]?.severity).toBe('info');
  });

  it('resolves an about target through the H1 fallback without complaint', () => {
    const entity = target('entities/eda.md', '---\n---\n\n# Event-Driven\n');
    const pointer = target(
      'notes/x.md',
      '---\nabout: ["[[Event-Driven]]"]\n---\n',
    );
    expect(validateDocuments([entity, pointer])).toEqual([]);
  });

  it('orders findings per document first, then across documents', () => {
    const dup = target('notes/dup.md', '---\nid: src-1\nid: src-1\n---\n');
    const found = validateDocuments([source, dup]);
    expect(codes(found)).toEqual([
      'duplicate-key',
      'duplicate-id',
      'duplicate-id',
    ]);
  });

  it('never mutates the documents it validates', () => {
    const text = fixture('source-youtube');
    const one = target('sources/talk.md', text);
    validateDocuments([one, note]);
    expect(one.document.text).toBe(text);
  });
});

describe('countBySeverity', () => {
  it('counts every severity, including the ones with no findings', () => {
    const found = validateDocuments([
      target('a.md', '---\nid: x\nid: x\n---\n'),
      target('b.md', '---\nabout: ["[[Missing]]"]\n---\n'),
    ]);
    expect(countBySeverity(found)).toEqual({ error: 0, warning: 1, info: 1 });
  });
});
