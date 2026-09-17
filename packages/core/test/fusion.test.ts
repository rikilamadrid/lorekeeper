import { describe, expect, it } from 'vitest';
import {
  FUSION_DEPTH,
  fuseRankings,
  RRF_K,
  suppressDuplicates,
} from '../src/fusion.js';
import {
  buildSpanIndex,
  type SearchResult,
  searchSpans,
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

const result = (path: string, score: number, text = path): SearchResult => ({
  span: span({ path, text }),
  score,
});

describe('fuseRankings', () => {
  it('scores a span by the sum of its reciprocal ranks', () => {
    const fused = fuseRankings([
      [result('a.md', 9), result('b.md', 8)],
      [result('b.md', 9), result('a.md', 8)],
    ]);

    const expected = 1 / (RRF_K + 1) + 1 / (RRF_K + 2);
    expect(fused).toHaveLength(2);
    for (const entry of fused) {
      expect(entry.score).toBeCloseTo(expected, 12);
    }
  });

  it('ranks a span two wordings agree on above one only a single wording found', () => {
    const fused = fuseRankings([
      [result('shared.md', 9), result('only-first.md', 8)],
      [result('shared.md', 9), result('only-second.md', 8)],
      [result('only-third.md', 9)],
    ]);

    expect(fused[0]?.span.path).toBe('shared.md');
  });

  it('rescues a span one wording buried when another surfaces it', () => {
    const buried = Array.from({ length: FUSION_DEPTH - 1 }, (_, i) =>
      result(`filler-${String(i).padStart(2, '0')}.md`, 100 - i),
    );
    const worst = [...buried, result('target.md', 1)];
    const best = [result('target.md', 9), result('filler-00.md', 8)];

    const fused = fuseRankings([worst, best]);
    const rankOfTarget = fused.findIndex((r) => r.span.path === 'target.md');
    const rankInWorst = worst.findIndex((r) => r.span.path === 'target.md');

    expect(rankOfTarget).toBeLessThan(rankInWorst);
    // Rank 1 plus rank 20 outranks rank 2 in a single list: the target climbs
    // above every filler the best wording did not also surface.
    const rankOfFiller01 = fused.findIndex(
      (r) => r.span.path === 'filler-01.md',
    );
    expect(rankOfTarget).toBeLessThan(rankOfFiller01);
    expect(rankOfTarget).toBeLessThanOrEqual(1);
  });

  it('looks no deeper than the fusion depth into any one list', () => {
    const long = Array.from({ length: FUSION_DEPTH + 5 }, (_, i) =>
      result(`r${String(i).padStart(2, '0')}.md`, 100 - i),
    );

    const fused = fuseRankings([long]);
    expect(fused).toHaveLength(FUSION_DEPTH);
    expect(fused.map((r) => r.span.path)).not.toContain('r24.md');
  });

  it('returns a single list in its own order, rescaled', () => {
    const list = [result('a.md', 9), result('b.md', 5), result('c.md', 1)];
    const fused = fuseRankings([list]);

    expect(fused.map((r) => r.span.path)).toEqual(['a.md', 'b.md', 'c.md']);
    expect(fused[0]?.score).toBeCloseTo(1 / (RRF_K + 1), 12);
  });

  it('keeps every low-scoring span rather than withholding it', () => {
    const fused = fuseRankings([
      [result('a.md', 0.0001), result('b.md', 0.00001)],
    ]);
    expect(fused).toHaveLength(2);
  });

  it('breaks ties on path and then line, so two runs agree', () => {
    const fused = fuseRankings([
      [result('b.md', 1)],
      [
        {
          span: span({ path: 'a.md', text: 'a', startLine: 7, endLine: 7 }),
          score: 1,
        },
      ],
      [
        {
          span: span({ path: 'a.md', text: 'a', startLine: 2, endLine: 2 }),
          score: 1,
        },
      ],
    ]);

    expect(fused.map((r) => `${r.span.path}:${r.span.startLine}`)).toEqual([
      'a.md:2',
      'a.md:7',
      'b.md:1',
    ]);
  });

  it('fuses nothing into nothing', () => {
    expect(fuseRankings([])).toEqual([]);
    expect(fuseRankings([[], []])).toEqual([]);
  });

  it('fuses real rankings from the index it will be used with', () => {
    const index = buildSpanIndex([
      span({
        path: 'retry.md',
        text: 'Retries back off exponentially with jitter.',
      }),
      span({ path: 'queue.md', text: 'Queues retry a failed message later.' }),
      span({ path: 'garden.md', text: 'Tomatoes want water.' }),
    ]);
    const fused = fuseRankings([
      searchSpans(index, 'exponential backoff', -1),
      searchSpans(index, 'retry jitter', -1),
      searchSpans(index, 'retries', -1),
    ]);

    expect(fused[0]?.span.path).toBe('retry.md');
    expect(fused.map((r) => r.span.path)).not.toContain('garden.md');
  });
});

describe('suppressDuplicates', () => {
  it('keeps one copy of content that appears in several files', () => {
    const copies = Array.from({ length: 5 }, (_, i) =>
      result(`tree-${i}/same.md`, 1, 'The same paragraph, copied.'),
    );

    const kept = suppressDuplicates([
      ...copies,
      result('other.md', 0.5, 'Different.'),
    ]);
    expect(kept.map((r) => r.span.path)).toEqual([
      'tree-0/same.md',
      'other.md',
    ]);
  });

  it('treats copies differing only in case, accents, punctuation, or spacing as one', () => {
    const kept = suppressDuplicates([
      result('a.md', 1, 'Sincronización: al final.'),
      result('b.md', 0.9, 'sincronizacion   al final'),
    ]);

    expect(kept).toHaveLength(1);
    expect(kept[0]?.span.path).toBe('a.md');
  });

  it('lets the best-ranked copy survive, whatever its path', () => {
    const kept = suppressDuplicates([
      result('z/late.md', 1, 'shared words here'),
      result('a/early.md', 0.5, 'shared words here'),
    ]);

    expect(kept[0]?.span.path).toBe('z/late.md');
  });

  it('removes nothing for scoring low', () => {
    const kept = suppressDuplicates([
      result('a.md', 1, 'one thing'),
      result('b.md', 0.000001, 'another thing'),
    ]);

    expect(kept).toHaveLength(2);
  });

  it('keeps spans that share words without being the same text', () => {
    const kept = suppressDuplicates([
      result('a.md', 1, 'retry with backoff'),
      result('b.md', 0.9, 'retry with backoff and jitter'),
    ]);

    expect(kept).toHaveLength(2);
  });
});
