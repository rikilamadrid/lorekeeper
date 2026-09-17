/**
 * Ranking spans against a query, deterministically and with no vendor.
 *
 * BM25 over the span's own text, plus a separately weighted BM25 over a
 * metadata document built from title, heading trail, anchor, tags, aliases,
 * `about`, and folder. Prototype `retrieval-v0` measured this shape over 2,249
 * spans of real Markdown and it was approved for v0.1 on that evidence; the
 * parameters below were fixed before any question was run and were never tuned
 * against a failing one. They are decisions, not knobs.
 *
 * Metadata is weighted rather than concatenated into the text. A note titled
 * "Retry policy" should answer a question about retry policies even when the
 * body never repeats its own title, but a title is a handful of words and
 * merging it into the body would let it dominate a long section's term
 * frequencies.
 *
 * Nothing here reads `type`, and `about` enters only as ordinary terms among
 * others: the frozen contract is that retrieval correctness does not depend on
 * either.
 *
 * There is no relevance floor. A score is a ranking signal and says nothing
 * about whether the answer exists, so this module never withholds a result and
 * never reports absence.
 */

import type { Span } from './spans.js';

/** BM25 term-frequency saturation. Fixed in advance; see the module note. */
export const BM25_K1 = 1.2;
/** BM25 length normalization. Fixed in advance; see the module note. */
export const BM25_B = 0.75;
/** How much the metadata document contributes relative to span text. */
export const METADATA_WEIGHT = 0.6;

/**
 * Words carrying no retrieval signal, in the two languages this project is
 * written and thought in.
 *
 * No stemming and no lemmatization, deliberately. The prototype isolated
 * vocabulary mismatch as a measurable failure category rather than papering
 * over it, and multi-wording fusion — `05.2` — is the answer it found.
 */
const STOP_WORDS = new Set(
  (
    'a an the and or but if then of to in on for with without at by from as is are was were be been being ' +
    'it its this that these those i you he she they we my your our not no do does did can could should would will just ' +
    'de la el los las un una y o pero si en con por para del al que se es son ser lo su sus como mas'
  ).split(' '),
);

/**
 * A query or document reduced to comparable terms.
 *
 * Accents are folded so that a note written with them answers a query typed
 * without them. Single characters are dropped: they are punctuation noise more
 * often than they are words.
 */
export function tokenize(text: string): readonly string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .split(/[^\p{Letter}\p{Number}]+/u)
    .filter((term) => term.length > 1 && !STOP_WORDS.has(term));
}

/** The terms a span is matched on, alongside the span itself. */
interface PreparedSpan {
  readonly span: Span;
  readonly body: TermCounts;
  readonly meta: TermCounts;
}

interface TermCounts {
  readonly counts: ReadonlyMap<string, number>;
  readonly length: number;
}

interface Statistics {
  readonly documentFrequency: ReadonlyMap<string, number>;
  readonly count: number;
  readonly averageLength: number;
}

/**
 * Spans prepared for querying.
 *
 * Built once and queried many times, because `05.2` will run several wordings
 * against one index and re-reading the vault per wording would be the same work
 * done three times.
 *
 * Held in memory for the life of a command and never written to disk. An index
 * file inside a brain would be a file the toolkit owns, and ownership is the
 * manifest's to assert; nothing here writes anything.
 */
export interface SpanIndex {
  readonly spans: readonly PreparedSpan[];
  readonly bodyStatistics: Statistics;
  readonly metaStatistics: Statistics;
}

/** One ranked span, with the score that ranked it. */
export interface SearchResult {
  readonly span: Span;
  readonly score: number;
}

/** Prepare spans for querying. Pure: the caller has already read the files. */
export function buildSpanIndex(spans: readonly Span[]): SpanIndex {
  const prepared = spans.map((span) => ({
    span,
    body: count(tokenize(span.text)),
    meta: count(tokenize(metadataDocument(span))),
  }));

  return {
    spans: prepared,
    bodyStatistics: statistics(prepared.map((entry) => entry.body)),
    metaStatistics: statistics(prepared.map((entry) => entry.meta)),
  };
}

/**
 * The spans matching this query, best first.
 *
 * Ties break on path and then on line, so that a vault holding the same content
 * twice reports the same order every run. A result list that reshuffled between
 * identical runs would make every downstream comparison untrustworthy.
 *
 * Spans scoring zero share no term with the query and are dropped as unmatched,
 * which is not a relevance judgement: a matched span is never withheld for
 * scoring low.
 */
export function searchSpans(
  index: SpanIndex,
  query: string,
  limit: number,
): readonly SearchResult[] {
  const terms = tokenize(query);
  if (terms.length === 0) {
    return [];
  }

  const results: SearchResult[] = [];
  for (const entry of index.spans) {
    const score =
      bm25(entry.body, index.bodyStatistics, terms) +
      METADATA_WEIGHT * bm25(entry.meta, index.metaStatistics, terms);
    if (score > 0) {
      results.push({ span: entry.span, score });
    }
  }

  results.sort(
    (left, right) =>
      right.score - left.score ||
      (left.span.path < right.span.path
        ? -1
        : left.span.path > right.span.path
          ? 1
          : 0) ||
      left.span.startLine - right.span.startLine,
  );

  return limit >= 0 ? results.slice(0, limit) : results;
}

/**
 * What a span is about, as distinct from what it says.
 *
 * The anchor and the trail are included because a heading is the author's own
 * summary of the lines beneath it, and a question is often phrased in exactly
 * those words.
 */
function metadataDocument(span: Span): string {
  return [
    span.meta.title,
    ...span.meta.trail,
    span.anchor ?? '',
    ...span.meta.tags,
    ...span.meta.aliases,
    ...span.meta.about,
    ...span.meta.folder,
  ].join(' ');
}

function count(terms: readonly string[]): TermCounts {
  const counts = new Map<string, number>();
  for (const term of terms) {
    counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  return { counts, length: terms.length };
}

function statistics(documents: readonly TermCounts[]): Statistics {
  const documentFrequency = new Map<string, number>();
  let total = 0;
  for (const document of documents) {
    total += document.length;
    for (const term of document.counts.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }
  return {
    documentFrequency,
    count: documents.length,
    averageLength: documents.length === 0 ? 0 : total / documents.length,
  };
}

function bm25(
  document: TermCounts,
  corpus: Statistics,
  terms: readonly string[],
): number {
  if (corpus.averageLength === 0) {
    return 0;
  }

  let score = 0;
  for (const term of terms) {
    const frequency = document.counts.get(term);
    if (frequency === undefined) {
      continue;
    }
    const matching = corpus.documentFrequency.get(term) ?? 0;
    const idf = Math.log(
      1 + (corpus.count - matching + 0.5) / (matching + 0.5),
    );
    const normalized =
      BM25_K1 *
      (1 - BM25_B + (BM25_B * document.length) / corpus.averageLength);
    score += (idf * (frequency * (BM25_K1 + 1))) / (frequency + normalized);
  }
  return score;
}
