import { describe, expect, it } from 'vitest';
import {
  buildSpanIndex,
  METADATA_WEIGHT,
  searchSpans,
  tokenize,
} from '../src/retrieval.js';
import type { Span } from '../src/spans.js';

const span = (
  overrides: Partial<Span> & Pick<Span, 'path' | 'text'>,
): Span => ({
  anchor: null,
  startLine: 1,
  endLine: 1,
  meta: {
    title: 'Untitled',
    trail: [],
    tags: [],
    aliases: [],
    about: [],
    folder: [],
  },
  ...overrides,
});

describe('tokenize', () => {
  it('folds accents so a note written with them answers a query without', () => {
    expect(tokenize('Sincronización')).toEqual(tokenize('sincronizacion'));
  });

  it('drops stop words and single characters', () => {
    expect(tokenize('the a retry of it')).toEqual(['retry']);
  });

  it('keeps numbers, which carry as much signal as words', () => {
    expect(tokenize('HTTP 429 backoff')).toEqual(['http', '429', 'backoff']);
  });
});

describe('searchSpans', () => {
  it('ranks the span that answers the question first', () => {
    const index = buildSpanIndex([
      span({ path: 'a.md', text: 'Kubernetes ingress controllers and TLS.' }),
      span({
        path: 'b.md',
        text: 'Retries use exponential backoff with jitter, capped at five attempts.',
      }),
      span({ path: 'c.md', text: 'Weekly review notes and errands.' }),
    ]);

    const [best] = searchSpans(index, 'exponential backoff jitter', 5);
    expect(best?.span.path).toBe('b.md');
  });

  it('ranks on metadata a body never repeats', () => {
    const index = buildSpanIndex([
      span({
        path: 'retry.md',
        text: 'Capped at five attempts, doubling each time.',
        meta: {
          title: 'Retry policy',
          trail: [],
          tags: ['resilience'],
          aliases: [],
          about: [],
          folder: [],
        },
      }),
      span({ path: 'other.md', text: 'Unrelated prose about gardening.' }),
    ]);

    const [best] = searchSpans(index, 'retry policy', 5);
    expect(best?.span.path).toBe('retry.md');
  });

  it('weights metadata below span text rather than merging the two', () => {
    const index = buildSpanIndex([
      span({ path: 'body.md', text: 'widget widget widget' }),
      span({
        path: 'meta.md',
        text: 'Nothing relevant here at all.',
        meta: {
          title: 'widget',
          trail: [],
          tags: [],
          aliases: [],
          about: [],
          folder: [],
        },
      }),
    ]);

    const results = searchSpans(index, 'widget', 5);
    expect(results[0]?.span.path).toBe('body.md');
    expect(METADATA_WEIGHT).toBeLessThan(1);
  });

  it('does not rank on type, which is not a retrieval primitive', () => {
    const withType = buildSpanIndex([
      span({ path: 'a.md', text: 'A note about queues.' }),
    ]);
    const [result] = searchSpans(withType, 'queues', 5);
    // `type` is not part of a span at all, so it cannot reach ranking.
    expect(result?.span.meta).not.toHaveProperty('type');
  });

  it('returns low-scoring matches rather than withholding them', () => {
    const index = buildSpanIndex([
      span({ path: 'a.md', text: 'queues' }),
      ...Array.from({ length: 50 }, (_, i) =>
        span({ path: `filler-${i}.md`, text: 'queues queues queues' }),
      ),
    ]);

    const results = searchSpans(index, 'queues', -1);
    expect(results).toHaveLength(51);
    expect(results.at(-1)?.score).toBeGreaterThan(0);
  });

  it('orders ties by path and then line, so two runs agree', () => {
    const spans = [
      span({ path: 'b.md', text: 'identical text', startLine: 9, endLine: 9 }),
      span({ path: 'a.md', text: 'identical text', startLine: 5, endLine: 5 }),
      span({ path: 'a.md', text: 'identical text', startLine: 1, endLine: 1 }),
    ];
    const results = searchSpans(buildSpanIndex(spans), 'identical text', 5);

    expect(
      results.map((result) => `${result.span.path}:${result.span.startLine}`),
    ).toEqual(['a.md:1', 'a.md:5', 'b.md:9']);
  });

  it('returns nothing for a query of only stop words', () => {
    const index = buildSpanIndex([span({ path: 'a.md', text: 'anything' })]);
    expect(searchSpans(index, 'the and of', 5)).toEqual([]);
  });

  it('searches an empty index without inventing a result', () => {
    expect(searchSpans(buildSpanIndex([]), 'anything', 5)).toEqual([]);
  });

  it('honours the limit', () => {
    const index = buildSpanIndex(
      Array.from({ length: 10 }, (_, i) =>
        span({ path: `${i}.md`, text: 'queues and topics' }),
      ),
    );
    expect(searchSpans(index, 'queues', 3)).toHaveLength(3);
  });
});
