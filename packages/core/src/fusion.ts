/**
 * Several ranked lists made into one, and the one list rid of its duplicates.
 *
 * Lexical retrieval is credible in v0.1 only because the agent supplies the
 * semantics by issuing several wordings of one question. Prototype
 * `retrieval-v0` measured 56% top-3 on a single wording against 89% top-3 and
 * 94% top-5 on three wordings fused, and expansion rescued 7 of 8 misses — one
 * of which ranked 347th on a single query and 1st after fusion. Multi-wording
 * search is therefore a first-class capability, not an optimization, and this
 * module is where the wordings meet.
 *
 * Fusion is Reciprocal Rank Fusion, on rank rather than score. BM25 scores from
 * different wordings are not on one scale — a rare term inflates every score in
 * the list that used it — so summing them would let one wording out-shout the
 * others. Rank is comparable across lists; score is not.
 *
 * Both halves are pure. They take the lists `searchSpans` produces and return
 * one list of the same shape, so the machine-readable contract `05.1` fixed
 * passes through unchanged.
 */

import type { SearchResult } from './retrieval.js';
import { tokenize } from './retrieval.js';
import type { Span } from './spans.js';

/**
 * RRF's rank offset. Fixed in advance by the prototype and never tuned against
 * a failing question. A decision, not a knob.
 */
export const RRF_K = 60;

/**
 * How deep into each wording's ranked list fusion looks.
 *
 * The prototype fused the top 20 of each wording and measured its results on
 * exactly that depth, so that is the depth that carries the evidence. It is
 * deep enough to catch a span one wording buried and another surfaced, and
 * shallow enough that a wording sharing one common word with the whole vault
 * does not hand every span a consolation vote.
 */
export const FUSION_DEPTH = 20;

/**
 * One ranked list per wording, fused into one list, best first.
 *
 * Each span scores the sum over the lists it appears in of `1 / (k + rank)`,
 * with rank counted from 1. A span absent from a list contributes nothing for
 * it. Only the first {@link FUSION_DEPTH} entries of each list take part.
 *
 * The result's `score` is the fused score, because that is what ranked the
 * list. It is not a BM25 score and is not comparable to one; it is comparable
 * across invocations, which a BM25 score never was.
 *
 * Ties break on path and then on line, as `searchSpans` does, so two runs over
 * the same vault agree. A single list comes back in its own order, rescaled.
 */
export function fuseRankings(
  lists: readonly (readonly SearchResult[])[],
): readonly SearchResult[] {
  const fused = new Map<string, { span: Span; score: number }>();

  for (const list of lists) {
    list.slice(0, FUSION_DEPTH).forEach((result, position) => {
      const key = addressOf(result.span);
      const entry = fused.get(key) ?? { span: result.span, score: 0 };
      entry.score += 1 / (RRF_K + position + 1);
      fused.set(key, entry);
    });
  }

  return [...fused.values()].sort(byScoreThenAddress);
}

/**
 * The list with every duplicate span but one removed.
 *
 * What counts as a duplicate is exact equality of normalized text: the same
 * token sequence `tokenize` ranks on, so two copies that differ only in case,
 * accents, punctuation, or whitespace are one. This is the case the evidence
 * names — the prototype corpus held the same documents in two or three
 * directory trees, and a code block copied 23 times diluted its own IDF — and
 * nothing measured supports a looser rule. A similarity threshold would be a
 * parameter tuned against no question, so there is none.
 *
 * The survivor is the copy that ranks highest; among copies that tie, the
 * lexically smallest path and then the lowest line. The choice is stable across
 * runs because the input order already is, and it is the copy a caller would
 * have seen first anyway, so suppression only ever removes what came after.
 *
 * Nothing is removed for scoring low. A span is dropped here only because
 * another span with the same content already stands in the list.
 */
export function suppressDuplicates(
  results: readonly SearchResult[],
): readonly SearchResult[] {
  const seen = new Set<string>();
  const kept: SearchResult[] = [];

  for (const result of results) {
    const key = tokenize(result.span.text).join(' ');
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    kept.push(result);
  }

  return kept;
}

function addressOf(span: Span): string {
  return `${span.path}:${span.startLine}-${span.endLine}`;
}

function byScoreThenAddress(left: SearchResult, right: SearchResult): number {
  return (
    right.score - left.score ||
    (left.span.path < right.span.path
      ? -1
      : left.span.path > right.span.path
        ? 1
        : 0) ||
    left.span.startLine - right.span.startLine
  );
}
