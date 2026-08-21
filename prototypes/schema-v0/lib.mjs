// Lorekeeper schema probe — PROTOTYPE. Evidence only, not production code.
// Zero dependencies on purpose: the point is to test whether frontmatter can be
// mutated surgically without an object round-trip.
import fs from 'node:fs';
import path from 'node:path';

export function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out.sort();
}

// --- frontmatter: split without parsing -------------------------------------
export function split(text) {
  // No frontmatter, or an unterminated block: the whole file is body. `post`
  // must be empty or reassembly duplicates the file. Found by hostile fixture.
  if (!text.startsWith('---\n')) return { fmRaw: '', body: text, pre: '', post: '' };
  const end = text.indexOf('\n---\n', 3);
  if (end === -1) return { fmRaw: '', body: text, pre: '', post: '' };
  const fmRaw = text.slice(4, end + 1);         // inner lines, trailing \n
  const body = text.slice(end + 5);
  return { fmRaw, body, pre: '---\n', post: '---\n' };
}

// Flat parser: scalars, inline arrays, block arrays. Keeps order + raw lines.
export function parseFlat(fmRaw) {
  const entries = [];
  const lines = fmRaw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!m) continue;
    const [, key, rest] = m;
    let value;
    if (rest === '') {
      const items = [];
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) {
        items.push(unquote(lines[++i].replace(/^\s*-\s+/, '').trim()));
      }
      value = items.length ? items : '';
    } else if (rest.startsWith('[')) {
      value = rest.replace(/^\[|\]$/g, '').split(',').map(s => unquote(s.trim())).filter(Boolean);
    } else {
      value = unquote(rest.trim());
    }
    entries.push({ key, value, line: i });
  }
  const obj = {};
  for (const e of entries) obj[e.key] = e.value;
  return { entries, obj };
}
const unquote = s => s.replace(/^['"]|['"]$/g, '');

// --- surgical mutation: rewrite ONLY the target key's line ------------------
export function setField(fmRaw, key, literal) {
  const lines = fmRaw.split('\n');
  const idx = lines.findIndex(l => new RegExp(`^${key}:`).test(l));
  if (idx === -1) {
    // append after the last non-empty, non-comment field line
    let last = lines.length - 1;
    while (last >= 0 && lines[last].trim() === '') last--;
    lines.splice(last + 1, 0, `${key}: ${literal}`);
  } else {
    lines[idx] = `${key}: ${literal}`;
  }
  return lines.join('\n');
}

export const arrayLiteral = a => `[${a.join(', ')}]`;

export function readNote(p) {
  const text = fs.readFileSync(p, 'utf8');
  const s = split(text);
  const { obj, entries } = s.fmRaw ? parseFlat(s.fmRaw) : { obj: {}, entries: [] };
  return { path: p, text, ...s, fm: obj, entries };
}

export function reassemble(n, fmRaw = n.fmRaw) {
  // Adding frontmatter to a file that had none must materialise the delimiters.
  if (fmRaw && !n.pre) return '---\n' + fmRaw + '---\n\n' + n.body;
  return n.pre + fmRaw + n.post + n.body;
}

// --- naive object round-trip: what parse-to-object + re-dump costs ----------
// Mirrors js-yaml dump(load(x)) behaviour: comments dropped, inline arrays
// become block style, ISO timestamps become Date objects re-emitted as UTC Z,
// quoting normalised.
export function naiveRoundTrip(fmRaw) {
  const { entries } = parseFlat(fmRaw);
  const out = [];
  for (const { key, value } of entries) {
    if (Array.isArray(value)) {
      out.push(`${key}:`);
      for (const v of value) out.push(`  - ${v}`);
    } else if (/^\d{4}-\d{2}-\d{2}T[\d:]+[-+]\d{2}:\d{2}$/.test(value)) {
      out.push(`${key}: ${new Date(value).toISOString().replace('.000Z', '.000Z')}`);
    } else {
      out.push(`${key}: ${value}`);
    }
  }
  return out.join('\n') + '\n';
}

export function lineDiff(a, b) {
  const A = a.split('\n'), B = b.split('\n');
  const out = [];
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    if (A[i] !== B[i]) {
      if (A[i] !== undefined) out.push(`  - ${A[i]}`);
      if (B[i] !== undefined) out.push(`  + ${B[i]}`);
    }
  }
  return out;
}

// --- locations: file + heading anchor ---------------------------------------
export function locations(n) {
  const lines = n.body.split('\n');
  const locs = [];
  let cur = { anchor: null, start: 0, lines: [] };
  lines.forEach((l, i) => {
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h && h[1].length >= 2) {
      if (cur.lines.join('').trim()) locs.push({ ...cur, end: i - 1 });
      cur = { anchor: h[2].trim(), start: i, lines: [] };
    } else cur.lines.push(l);
  });
  if (cur.lines.join('').trim()) locs.push({ ...cur, end: lines.length - 1 });
  return locs.map(l => ({
    path: n.path, anchor: l.anchor, start: l.start, end: l.end,
    text: l.lines.join('\n').trim(),
  }));
}

export const wikilinks = s => [...s.matchAll(/\[\[([^\]|#]+)/g)].map(m => m[1].trim());

// --- URL normalisation ------------------------------------------------------
const DROP = /^(utm_|si$|t$|fbclid$|gclid$|ref$|ref_src$|feature$|_hsenc$|mc_cid$)/;
export function normalizeUrl(raw) {
  let u;
  try { u = new URL(raw.trim()); } catch { return raw.trim().toLowerCase(); }
  u.protocol = 'https:';
  u.hash = '';
  u.hostname = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, '');
  // Domain identity rules. Generic param filtering is NOT enough: `list`,
  // `index`, and `ab_channel` are not tracking params but do not change which
  // video the URL identifies.
  if (u.hostname === 'youtu.be' || u.hostname === 'youtube.com') {
    const id = u.hostname === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v');
    if (id) {
      u.hostname = 'youtube.com'; u.pathname = '/watch';
      u.search = ''; u.searchParams.set('v', id);
      return u.toString();
    }
  }
  const keep = [...u.searchParams.entries()].filter(([k]) => !DROP.test(k));
  u.search = '';
  for (const [k, v] of keep.sort()) u.searchParams.append(k, v);
  if (u.pathname !== '/' && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
  return u.toString().replace(/\/$/, '');
}
