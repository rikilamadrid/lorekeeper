// Lorekeeper schema probe — PROTOTYPE. Evidence only.
import fs from 'node:fs';
import path from 'node:path';
import * as L from './lib.mjs';

const VAULT = 'vault';
const files = L.walk(VAULT);
const notes = files.map(L.readNote);
const H = t => console.log(`\n${'='.repeat(72)}\n${t}\n${'='.repeat(72)}`);

// T1 — surgical round-trip identity
H('T1  ROUND-TRIP: read -> parse -> reassemble  (must be byte-identical)');
let bad = 0;
for (const n of notes) if (L.reassemble(n) !== n.text) { bad++; console.log('  MISMATCH', n.path); }
console.log(`  ${notes.length} files, ${bad} byte differences`);

// T2 — what an object round-trip costs
H('T2  NAIVE OBJECT ROUND-TRIP (parse to object, re-dump) — damage report');
let damaged = 0;
for (const n of notes) {
  if (!n.fmRaw) continue;
  const rt = L.naiveRoundTrip(n.fmRaw);
  if (rt !== n.fmRaw) {
    damaged++;
    if (damaged <= 2) {
      console.log(`\n  ${n.path}`);
      for (const l of L.lineDiff(n.fmRaw, rt).slice(0, 14)) console.log('  ' + l);
    }
  }
}
console.log(`\n  ${damaged}/${notes.filter(n=>n.fmRaw).length} files altered by an object round-trip`);

// T3 — deterministic provenance mutation
H('T3  DETERMINISTIC PROVENANCE WRITE  (link --from, no LLM, no re-dump)');
const WORK = '/private/tmp/claude-501/-Users-ricardolamadrid-Workspace-second-brain-starter-prototype/abb4d0fc-f0ef-496c-8c7c-f2bce1764198/scratchpad/work';
fs.rmSync(WORK, { recursive: true, force: true });
fs.cpSync(VAULT, WORK, { recursive: true });

function link(file, fromIds) {
  const n = L.readNote(file);
  const cur = Array.isArray(n.fm.derived_from) ? n.fm.derived_from
            : n.fm.derived_from ? [n.fm.derived_from] : [];
  const next = [...new Set([...cur, ...fromIds])];
  const fmRaw = L.setField(n.fmRaw, 'derived_from', L.arrayLiteral(next));
  fs.writeFileSync(file, L.reassemble(n, fmRaw));
  return { before: n.text, after: fs.readFileSync(file, 'utf8') };
}
for (const [f, ids] of [
  [`${WORK}/notes/why-our-retries-doubled-charges.md`, ['20260818-0810-pragmatic-engineer-queues']], // add to a note with none
  [`${WORK}/notes/event-driven-tradeoffs.md`, ['20260818-0810-pragmatic-engineer-queues']],          // extend existing
]) {
  const { before, after } = link(f, ids);
  console.log(`\n  ${path.basename(f)}`);
  for (const l of L.lineDiff(before, after)) console.log('  ' + l);
}
console.log('\n  (idempotency check — re-running the same link)');
const idem = link(`${WORK}/notes/event-driven-tradeoffs.md`, ['20260818-0810-pragmatic-engineer-queues']);
console.log(`  changed on second run: ${idem.before !== idem.after}`);

// T4 — how much frontmatter must a human write
H('T4  HAND-WRITING BURDEN');
const fieldUse = {};
for (const n of notes) for (const k of Object.keys(n.fm)) fieldUse[k] = (fieldUse[k] || 0) + 1;
console.log('  field        files  %');
for (const [k, c] of Object.entries(fieldUse).sort((a, b) => b[1] - a[1]))
  console.log(`  ${k.padEnd(12)} ${String(c).padStart(4)}  ${Math.round(c / notes.length * 100)}%`);
const counts = notes.map(n => Object.keys(n.fm).length);
console.log(`\n  fields per file: min ${Math.min(...counts)}, median ${counts.sort((a,b)=>a-b)[Math.floor(counts.length/2)]}, max ${Math.max(...counts)}`);

// T5 — is `about` a mirror of body wikilinks?
H('T5  IS `about` ADDITIVE OR A MIRROR OF BODY WIKILINKS?');
let mirror = 0, additive = 0, absentButLinked = 0;
for (const n of notes) {
  const declared = (n.fm.about || []).map(s => s.replace(/\[\[|\]\]/g, ''));
  const inBody = new Set(L.wikilinks(n.body));
  if (!declared.length) { if (inBody.size) absentButLinked++; continue; }
  const extra = declared.filter(d => !inBody.has(d));
  const dup = declared.filter(d => inBody.has(d));
  console.log(`  ${path.basename(n.path).padEnd(38)} declared=[${declared}] additive=[${extra}] mirrored=[${dup}]`);
  if (extra.length) additive++; else mirror++;
}
console.log(`\n  files where about adds something: ${additive}`);
console.log(`  files where about only mirrors prose: ${mirror}`);
console.log(`  files with body wikilinks and no about: ${absentButLinked}`);

// T6 — URL normalisation / dedup
H('T6  URL NORMALISATION');
const variants = [
  'https://www.youtube.com/watch?v=aQb3Q9nCsK4',
  'https://youtu.be/aQb3Q9nCsK4?si=Kd8fj2LqP&t=1180&utm_source=newsletter',
  'http://m.youtube.com/watch?v=aQb3Q9nCsK4&feature=share',
  'https://www.youtube.com/watch?v=aQb3Q9nCsK4&list=PLabc123',
  'https://newsletter.pragmaticengineer.com/p/queues-in-production',
  'https://newsletter.pragmaticengineer.com/p/queues-in-production/?utm_campaign=post#reader',
];
const groups = {};
for (const v of variants) { const k = L.normalizeUrl(v); (groups[k] ||= []).push(v); }
for (const [k, vs] of Object.entries(groups)) {
  console.log(`\n  -> ${k}`);
  for (const v of vs) console.log(`     ${v}`);
}
const srcUrls = notes.filter(n => n.fm.url).map(n => [n.path, L.normalizeUrl(n.fm.url)]);
const byUrl = {};
for (const [p, u] of srcUrls) (byUrl[u] ||= []).push(path.basename(p));
console.log('\n  duplicate sources detected in vault:');
for (const [u, ps] of Object.entries(byUrl)) if (ps.length > 1) console.log(`    ${u}\n      ${ps.join('\n      ')}`);

// T7 — location index
H('T7  LOCATION INDEX (file + heading anchor)');
const index = notes.flatMap(L.locations);
console.log(`  ${notes.length} files -> ${index.length} locations`);
for (const l of index.filter(l => l.path.includes('daily')))
  console.log(`    ${path.basename(l.path)}#${l.anchor}  (lines ${l.start}-${l.end}, ${l.text.length}b)`);

// T8 — retrieval returns spans, not files
H('T8  RETRIEVAL: SPAN vs WHOLE-FILE COST');
function search(q, k = 3) {
  const terms = q.toLowerCase().split(/\s+/);
  return index.map(l => {
    const hay = (l.text + ' ' + (l.anchor || '')).toLowerCase();
    return { l, score: terms.reduce((s, t) => s + (hay.split(t).length - 1), 0) };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
}
for (const q of ['idempotency key retry', 'agent context retrieval paragraph', 'standup async']) {
  const hits = search(q);
  const span = hits.reduce((s, h) => s + h.l.text.length, 0);
  const whole = [...new Set(hits.map(h => h.l.path))].reduce((s, p) => s + fs.statSync(p).size, 0);
  console.log(`\n  "${q}"`);
  for (const h of hits) console.log(`    ${h.l.path}${h.l.anchor ? '#' + h.l.anchor : ''}  score=${h.score}`);
  console.log(`    returned ${span}b as spans vs ${whole}b as whole files  (${Math.round(100 - span / whole * 100)}% saved)`);
}

// T9 — survival of moves and renames
H('T9  MOVE / RENAME SURVIVAL');
fs.renameSync(`${WORK}/notes/observability-gaps.md`, `${WORK}/notes/correlation-ids-and-blind-spots.md`);
fs.mkdirSync(`${WORK}/notes/archive`, { recursive: true });
fs.renameSync(`${WORK}/entities/pathfinder.md`, `${WORK}/entities/pathfinder-workflow-kit.md`);
const after = L.walk(WORK).map(L.readNote);
const byId = Object.fromEntries(after.filter(n => n.fm.id).map(n => [n.fm.id, n.path]));
const byBase = Object.fromEntries(after.map(n => [path.basename(n.path, '.md').toLowerCase(), n.path]));
const byH1 = Object.fromEntries(after.map(n => {
  const h = n.body.match(/^#\s+(.+)$/m); return h ? [h[1].trim().toLowerCase(), n.path] : [null, null];
}).filter(([k]) => k));
let dOk = 0, dBad = 0, aOk = 0, aBad = 0, aH1 = 0;
for (const n of after) {
  for (const id of (n.fm.derived_from || [])) (byId[id] ? dOk++ : dBad++);
  for (const a of (n.fm.about || [])) {
    const name = a.replace(/\[\[|\]\]/g, '').toLowerCase();
    if (byBase[name.replace(/\s+/g, '-')] || byBase[name]) aOk++;
    else if (byH1[name]) { aBad++; aH1++; } else aBad++;
  }
}
console.log(`  renamed: notes/observability-gaps.md, entities/pathfinder.md`);
console.log(`  derived_from edges (ID-resolved):     ${dOk} resolved, ${dBad} broken`);
console.log(`  about edges (name-resolved):          ${aOk} resolved, ${aBad} broken`);
console.log(`  of the broken, recoverable via H1/alias: ${aH1}`);
