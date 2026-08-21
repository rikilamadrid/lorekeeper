// Lorekeeper retrieval probe — PROTOTYPE. Evidence only, not production code.
// Builds a location/span index over an ARBITRARY Markdown vault, including
// notes with no Lorekeeper frontmatter (adoption, not migration).
import fs from 'node:fs';
import path from 'node:path';
import { split, parseFlat } from '../schema-v0/lib.mjs';

const SKIP_DIR = new Set(['.obsidian', '.trash', '.git', 'node_modules', '.smart-env']);

export function walkVault(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkVault(p));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out.sort();
}

// Max lines before a heading-delimited span is split further at a blank line.
// Fixed in advance; not tuned against the question set.
const MAX_SPAN_LINES = 40;

function subdivide(lines, startLine) {
  if (lines.length <= MAX_SPAN_LINES) return [{ start: startLine, lines }];
  const out = [];
  let cur = [], curStart = startLine;
  lines.forEach((l, i) => {
    cur.push(l);
    const atBreak = l.trim() === '' && cur.length >= MAX_SPAN_LINES / 2;
    if (atBreak && cur.length >= MAX_SPAN_LINES / 2) {
      out.push({ start: curStart, lines: cur });
      cur = []; curStart = startLine + i + 1;
    }
  });
  if (cur.join('').trim()) out.push({ start: curStart, lines: cur });
  return out.length ? out : [{ start: startLine, lines }];
}

// Heading-delimited spans (frozen location model), then size-bounded splitting
// so retrieval can return the smallest useful span rather than a whole file.
export function spansOf(note) {
  const lines = note.body.split('\n');
  const blocks = [];
  let cur = { anchor: null, start: 0, lines: [], trail: [] };
  lines.forEach((l, i) => {
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      if (cur.lines.join('').trim()) blocks.push({ ...cur, end: i - 1 });
      const depth = h[1].length;
      const trail = cur.trail.slice(0, depth - 1);
      trail[depth - 1] = h[2].trim();
      cur = { anchor: h[2].trim(), start: i, lines: [], trail };
    } else cur.lines.push(l);
  });
  if (cur.lines.join('').trim()) blocks.push({ ...cur, end: lines.length - 1 });

  const spans = [];
  for (const b of blocks) {
    for (const part of subdivide(b.lines, b.start + (b.anchor ? 1 : 0))) {
      const text = part.lines.join('\n').trim();
      if (!text) continue;
      spans.push({
        path: note.path,
        rel: note.rel,
        title: note.title,
        anchor: b.anchor,
        trail: (b.trail || []).filter(Boolean),
        start: part.start,
        end: part.start + part.lines.length - 1,
        text,
        meta: note.meta,
      });
    }
  }
  return spans;
}

export function readNoteLoose(p, root) {
  const raw = fs.readFileSync(p, 'utf8');
  const { fmRaw, body } = split(raw);
  const fm = fmRaw ? parseFlat(fmRaw).obj : {};
  const h1 = body.match(/^#\s+(.*)$/m);
  const rel = path.relative(root, p);
  const title = (fm.title || (h1 && h1[1]) || path.basename(p, '.md')).trim();
  const listy = v => (Array.isArray(v) ? v : v ? [v] : []);
  return {
    path: p, rel, body, title,
    meta: {
      title,
      aliases: listy(fm.aliases || fm.alias),
      tags: listy(fm.tags || fm.tag),
      type: fm.type || '', kind: fm.kind || '',
      about: listy(fm.about),
      folder: path.dirname(rel).split(path.sep).filter(s => s !== '.'),
      hasFrontmatter: Boolean(fmRaw),
    },
  };
}

// Accepts one or more corpus roots. `rel` is prefixed with the corpus name so
// locations stay unambiguous across corpora.
export function buildIndex(...roots) {
  const notes = roots.flatMap(root => {
    const label = path.basename(root);
    return walkVault(root).map(f => {
      const n = readNoteLoose(f, root);
      n.corpus = label;
      n.rel = `${label}/${n.rel}`;
      n.meta.corpus = label;
      return n;
    });
  });
  const spans = notes.flatMap(spansOf).map(s => ({ ...s, corpus: s.rel.split('/')[0] }));
  return { roots, notes, spans };
}
