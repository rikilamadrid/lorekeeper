import { describe, expect, it } from 'vitest';
import { readDocument } from '../src/document.js';
import { MAX_SPAN_LINES, spansOf } from '../src/spans.js';

const note = (body: string) => readDocument('note', body);

describe('spansOf', () => {
  it('splits a document at its headings and names each span by one', () => {
    const spans = spansOf(
      note(
        [
          '# Retry policy',
          '',
          'Retries are bounded.',
          '',
          '## Backoff',
          '',
          'Exponential, with jitter.',
        ].join('\n'),
      ),
      'notes/retry.md',
    );

    expect(spans.map((span) => span.anchor)).toEqual([
      'Retry policy',
      'Backoff',
    ]);
    expect(spans[0]?.text).toBe('Retries are bounded.');
    expect(spans[1]?.text).toBe('Exponential, with jitter.');
  });

  it('reports 1-based line numbers a reader can open in an editor', () => {
    const spans = spansOf(
      note(['# Title', '', 'First body line.'].join('\n')),
      'notes/a.md',
    );
    // "First body line." is line 3 of the file.
    expect(spans[0]?.startLine).toBe(3);
    expect(spans[0]?.endLine).toBe(3);
  });

  it('counts frontmatter lines, so a line number means what the gutter means', () => {
    const text = [
      '---',
      'tags:',
      '  - retry',
      '---',
      '# Retry policy',
      '',
      'Bounded and jittered.',
    ].join('\n');
    const spans = spansOf(note(text), 'notes/retry.md');

    expect(spans[0]?.startLine).toBe(7);
    expect(text.split('\n')[6]).toBe('Bounded and jittered.');
  });

  it('gives a span under no heading a null anchor rather than an invented one', () => {
    const spans = spansOf(
      note(['Loose opening thought.', '', '# Later'].join('\n')),
      'inbox/loose.md',
    );

    expect(spans[0]?.anchor).toBeNull();
    expect(spans[0]?.text).toBe('Loose opening thought.');
  });

  it('carries the enclosing headings as a trail, excluding its own anchor', () => {
    const spans = spansOf(
      note(
        [
          '# Architecture',
          '',
          '## Storage',
          '',
          '### Retention',
          '',
          'Kept for thirty days.',
        ].join('\n'),
      ),
      'notes/arch.md',
    );

    const deepest = spans.at(-1);
    expect(deepest?.anchor).toBe('Retention');
    expect(deepest?.meta.trail).toEqual(['Architecture', 'Storage']);
  });

  it('indexes a file with no frontmatter as ordinary knowledge', () => {
    const spans = spansOf(
      note(['# Plain note', '', 'No frontmatter anywhere.'].join('\n')),
      'vault/plain.md',
    );

    expect(spans).toHaveLength(1);
    expect(spans[0]?.text).toBe('No frontmatter anywhere.');
    expect(spans[0]?.meta.title).toBe('Plain note');
  });

  it('indexes a file whose frontmatter cannot be parsed', () => {
    const document = note(
      ['---', 'tags: [unclosed', '---', '', 'Still worth finding.'].join('\n'),
    );
    const spans = spansOf(document, 'vault/broken.md');

    expect(document.parseError).not.toBeNull();
    expect(spans.map((span) => span.text)).toContain('Still worth finding.');
  });

  it('prefers a declared title, then the H1, then the document name', () => {
    const declared = spansOf(
      note(
        ['---', 'title: Declared', '---', '# Heading', '', 'Body.'].join('\n'),
      ),
      'a.md',
    );
    expect(declared[0]?.meta.title).toBe('Declared');

    const heading = spansOf(
      note(['# Heading', '', 'Body.'].join('\n')),
      'a.md',
    );
    expect(heading[0]?.meta.title).toBe('Heading');

    const bare = spansOf(note('Body with no heading.'), 'a.md');
    expect(bare[0]?.meta.title).toBe('note');
  });

  it('reads the folder from the path it was given and nothing else from it', () => {
    const spans = spansOf(note('Body.'), 'knowledge/patterns/a.md');
    expect(spans[0]?.meta.folder).toEqual(['knowledge', 'patterns']);
    expect(spans[0]?.path).toBe('knowledge/patterns/a.md');
  });

  it('divides a section longer than the cap, at a blank line', () => {
    const paragraph = Array.from(
      { length: MAX_SPAN_LINES + 10 },
      (_, index) => `line ${index}`,
    );
    const body = ['# Long', '', ...paragraph, '', ...paragraph].join('\n');
    const spans = spansOf(note(body), 'notes/long.md');

    expect(spans.length).toBeGreaterThan(1);
    for (const span of spans) {
      expect(span.anchor).toBe('Long');
    }
  });

  it('leaves a long section whole when the author left no blank line in it', () => {
    const body = [
      '# Dense',
      '',
      ...Array.from({ length: MAX_SPAN_LINES + 5 }, (_, i) => `line ${i}`),
    ].join('\n');
    const spans = spansOf(note(body), 'notes/dense.md');

    expect(spans).toHaveLength(1);
  });

  it('reports line ranges that address the span text in the file', () => {
    const text = [
      '# One',
      '',
      'First.',
      '',
      '## Two',
      '',
      'Second line A.',
      'Second line B.',
    ].join('\n');
    const lines = text.split('\n');

    for (const span of spansOf(note(text), 'notes/x.md')) {
      const addressed = lines
        .slice(span.startLine - 1, span.endLine)
        .join('\n');
      expect(addressed).toBe(span.text);
    }
  });

  it('yields nothing for a document with no content to address', () => {
    expect(spansOf(note(''), 'empty.md')).toEqual([]);
    expect(spansOf(note('\n\n   \n'), 'blank.md')).toEqual([]);
  });
});
