// Deterministic lexical + metadata-aware span retrieval. PROTOTYPE.
// Zero LLM calls, zero embeddings, zero network — the architecture under test.
//
// Scoring is BM25 over span body text plus a separately-weighted BM25 over a
// metadata document (title, heading trail, tags, aliases, folder). Parameters
// are fixed in advance and are NOT tuned per question.

const K1 = 1.2, B = 0.75;
const META_WEIGHT = 0.6;   // metadata field boost
const STOP = new Set(('a an the and or but if then of to in on for with without at by from as is are was were be been being '
  + 'it its this that these those i you he she they we my your our not no do does did can could should would will just '
  + 'de la el los las un una y o pero si en con por para del al que se es son ser lo su sus como más').split(' '));

export function tokenize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // fold accents
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 1 && !STOP.has(t));
}

const metaDoc = s => [
  s.title, ...(s.trail || []), s.anchor || '',
  ...(s.meta?.tags || []), ...(s.meta?.aliases || []),
  ...(s.meta?.about || []), ...(s.meta?.folder || []),
].join(' ');

function corpus(docs) {
  const df = new Map(); let total = 0;
  const prepared = docs.map(tokens => {
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    total += tokens.length;
    return { tf, len: tokens.length };
  });
  return { prepared, df, N: docs.length, avg: total / (docs.length || 1) };
}

function bm25(c, i, qterms) {
  const { tf, len } = c.prepared[i];
  let score = 0;
  for (const q of qterms) {
    const f = tf.get(q); if (!f) continue;
    const n = c.df.get(q) || 0;
    const idf = Math.log(1 + (c.N - n + 0.5) / (n + 0.5));
    score += idf * (f * (K1 + 1)) / (f + K1 * (1 - B + B * len / c.avg));
  }
  return score;
}

export function makeSearcher(index) {
  const body = corpus(index.spans.map(s => tokenize(s.text)));
  const meta = corpus(index.spans.map(s => tokenize(metaDoc(s))));
  return function search(query, limit = 5) {
    const q = tokenize(query);
    if (!q.length) return [];
    const scored = index.spans.map((s, i) => ({
      span: s,
      score: bm25(body, i, q) + META_WEIGHT * bm25(meta, i, q),
    })).filter(r => r.score > 0);
    scored.sort((a, b) => b.score - a.score
      || a.span.rel.localeCompare(b.span.rel) || a.span.start - b.span.start);
    return scored.slice(0, limit);
  };
}

// Agent-side query expansion is simulated as issuing several deterministic
// query wordings and fusing the ranked lists (reciprocal rank fusion).
// Lorekeeper itself still performs no LLM call; the AGENT supplies the wordings.
export function fusedSearch(search, queries, limit = 5) {
  const acc = new Map();
  for (const q of queries) {
    search(q, 20).forEach((r, rank) => {
      const key = `${r.span.rel}#${r.span.start}`;
      const prev = acc.get(key) || { span: r.span, score: 0 };
      prev.score += 1 / (60 + rank + 1);   // RRF, k=60
      acc.set(key, prev);
    });
  }
  return [...acc.values()].sort((a, b) => b.score - a.score
    || a.span.rel.localeCompare(b.span.rel)).slice(0, limit);
}
