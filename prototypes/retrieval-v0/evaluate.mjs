// Retrieval-usefulness evaluation harness. PROTOTYPE — evidence only.
//
// PRIVACY: reads a vault OUTSIDE this repository, never copies it, and by
// default emits NO note content. Excerpts require an explicit --quote flag.
//
// Usage:
//   node evaluate.mjs --vault <path> --questions <file.json> [--out <file>] [--quote]
//
// Question file: [{ id, question, kind, expect: [{file, anchor?}],
//                   expectText?: ["regex"], variants?: ["alternate wording"] }]
// `expect` empty  => the vault is asserted NOT to contain the answer.
import fs from 'node:fs';
import { buildIndex } from './index.mjs';
import { makeSearcher, fusedSearch } from './search.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; };
const args = n => process.argv.reduce((a, v, i) => (v === '--' + n ? [...a, process.argv[i + 1]] : a), []);
const flag = n => process.argv.includes('--' + n);

const vaults = args('vault'); const qfile = arg('questions');
if (!vaults.length || !qfile) { console.error('need --vault (repeatable) and --questions'); process.exit(1); }

const index = buildIndex(...vaults);
const search = makeSearcher(index);
const questions = JSON.parse(fs.readFileSync(qfile, 'utf8'));

const norm = s => s.toLowerCase().replace(/\\/g, '/');
function relevant(span, q) {
  const byFile = (q.expect || []).some(e =>
    norm(span.rel).includes(norm(e.file)) &&
    (!e.anchor || norm([span.anchor, ...(span.trail || [])].join(' ')).includes(norm(e.anchor))));
  const byText = (q.expectText || []).some(rx => new RegExp(rx, 'i').test(span.text));
  return byFile || byText;
}

const firstHit = (results, q) => {
  const i = results.findIndex(r => relevant(r.span, q));
  return i === -1 ? null : i + 1;
};

const rows = questions.map(q => {
  const base = search(q.question, 5);
  const variants = [q.question, ...(q.variants || [])];
  const exp = variants.length > 1 ? fusedSearch(search, variants, 5) : base;
  const hasEvidence = Boolean((q.expect || []).length || (q.expectText || []).length);
  const bytes = base.reduce((n, r) => n + Buffer.byteLength(r.span.text), 0);
  const hitRank = firstHit(base, q);
  const wholeFileBytes = base.reduce((n, r) => {
    try { return n + fs.statSync(r.span.path).size; } catch { return n; }
  }, 0);
  return {
    id: q.id, kind: q.kind || 'unspecified', hasEvidence,
    rank: hitRank, expandedRank: firstHit(exp, q),
    top1: hitRank === 1, top3: hitRank !== null && hitRank <= 3, top5: hitRank !== null,
    returnedBytes: bytes, wholeFileBytes,
    topSpan: base[0] ? { loc: `${base[0].span.rel}#L${base[0].span.start}-${base[0].span.end}`,
                         chars: base[0].span.text.length,
                         excerpt: flag('quote') ? base[0].span.text.slice(0, 300) : undefined } : null,
    expansionHelps: hitRank === null ? firstHit(exp, q) !== null
                    : (firstHit(exp, q) !== null && firstHit(exp, q) < hitRank),
  };
});

const answerable = rows.filter(r => r.hasEvidence);
const pct = (n, d) => d ? `${n}/${d} (${Math.round(100 * n / d)}%)` : 'n/a';
const sum = (a, f) => a.reduce((n, x) => n + f(x), 0);

const report = {
  generated: new Date().toISOString(),
  corpora: [...new Set(index.notes.map(n => n.corpus))],
  vault: { files: index.notes.length, spans: index.spans.length,
           withFrontmatter: index.notes.filter(n => n.meta.hasFrontmatter).length,
           words: sum(index.notes, n => n.body.split(/\s+/).filter(Boolean).length) },
  questions: { total: rows.length, answerable: answerable.length },
  retrieval: {
    top1: pct(answerable.filter(r => r.top1).length, answerable.length),
    top3: pct(answerable.filter(r => r.top3).length, answerable.length),
    top5: pct(answerable.filter(r => r.top5).length, answerable.length),
    missed: answerable.filter(r => r.rank === null).map(r => r.id),
  },
  expansion: {
    helped: rows.filter(r => r.expansionHelps).map(r => r.id),
    rescuedFromMiss: rows.filter(r => r.rank === null && r.expandedRank !== null).map(r => r.id),
  },
  byKind: Object.fromEntries([...new Set(rows.map(r => r.kind))].map(k => {
    const g = answerable.filter(r => r.kind === k);
    return [k, { n: g.length, top3: pct(g.filter(r => r.top3).length, g.length) }];
  })),
  contextEconomy: {
    spanBytesReturned: sum(rows, r => r.returnedBytes),
    wholeFileBytesForSameHits: sum(rows, r => r.wholeFileBytes),
  },
  rows,
};

const out = arg('out');
const text = JSON.stringify(report, null, 2);
if (out) { fs.writeFileSync(out, text); console.error('wrote ' + out); }
console.log(text.slice(0, 4000));
