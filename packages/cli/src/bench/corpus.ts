/**
 * A synthetic vault of a few thousand notes, the same every time.
 *
 * This exists so that the performance target — retrieval stays interactive on
 * a vault of a few thousand notes — can be a measured number rather than a
 * claim. Two runs of the benchmark have to measure the same corpus, so every
 * choice below flows from one seed through one small generator, and nothing is
 * read from the clock, the environment, or a real vault.
 *
 * Every byte is invented. The vocabulary is a fixed list of ordinary words,
 * the names are counters, and no file here resembles anyone's notes. Both
 * repository boundaries hold: no private content, and nothing read from a
 * brain the toolkit did not just write.
 *
 * The shape is the one the retrieval tests use, so what is measured is what
 * ships: ATX headings, a mix of files with frontmatter and without, a few whose
 * frontmatter will not parse, and a share of paragraphs copied into a second
 * folder so duplicate suppression has something to suppress.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface CorpusOptions {
  /** How many notes to write. */
  readonly count: number;
  /** The seed every choice derives from. */
  readonly seed: number;
}

export interface CorpusSummary {
  readonly files: number;
  readonly bytes: number;
  /** One paragraph copied into several files, so suppression is exercised. */
  readonly duplicatedParagraphs: number;
}

/** Ordinary words, so term statistics look like prose rather than noise. */
const WORDS = (
  'retry backoff jitter queue topic message broker consumer producer offset ' +
  'partition replica leader follower quorum election timeout heartbeat lease ' +
  'cache eviction warm cold miss hit ratio latency throughput budget ' +
  'ingress egress proxy edge certificate rotation expiry renewal handshake ' +
  'schema migration column index constraint transaction isolation snapshot ' +
  'garden compost tomato pepper water mulch shade trellis prune harvest ' +
  'recipe oven simmer whisk fold season rest slice serve leftover ' +
  'meeting agenda decision owner deadline blocker follow review retro ' +
  'ledger invoice receipt budget forecast variance audit approval vendor ' +
  'library shelf catalogue loan return renew reserve author edition volume'
).split(' ');

const FOLDERS = ['notes', 'projects', 'archive', 'inbox', 'reference'];
const TAGS = ['ops', 'garden', 'kitchen', 'finance', 'reading', 'work'];

/** How many spaces separate two lines of prose. Fixed so byte counts are stable. */
const LINE_WORDS = 12;

/**
 * Write `count` notes under `root`, deterministically.
 *
 * The same `seed` and `count` write byte-identical files in the same paths
 * every run, on every machine. `root` must exist.
 */
export function generateCorpus(
  root: string,
  options: CorpusOptions,
): CorpusSummary {
  const random = mulberry32(options.seed);
  const pick = <T>(items: readonly T[]): T =>
    items[Math.floor(random() * items.length)] as T;
  const words = (n: number): string =>
    Array.from({ length: n }, () => pick(WORDS)).join(' ');
  const sentence = (): string => {
    const text = words(6 + Math.floor(random() * 10));
    return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
  };
  const paragraph = (): string => {
    const count = 2 + Math.floor(random() * 4);
    const lines: string[] = [];
    let current: string[] = [];
    for (let i = 0; i < count; i += 1) {
      for (const word of sentence().split(' ')) {
        current.push(word);
        if (current.length >= LINE_WORDS) {
          lines.push(current.join(' '));
          current = [];
        }
      }
    }
    if (current.length > 0) lines.push(current.join(' '));
    return lines.join('\n');
  };

  const reusable: string[] = [];
  let bytes = 0;
  let duplicated = 0;

  for (let n = 0; n < options.count; n += 1) {
    const folder = pick(FOLDERS);
    const name = `note-${String(n).padStart(5, '0')}`;
    const path = join(root, folder, `${name}.md`);
    const title = `${capitalize(pick(WORDS))} ${pick(WORDS)} ${n}`;

    const parts: string[] = [];
    const roll = random();
    if (roll < 0.3) {
      parts.push(
        '---',
        `title: ${title}`,
        'tags:',
        `  - ${pick(TAGS)}`,
        `aliases:`,
        `  - ${pick(WORDS)} ${pick(WORDS)}`,
        '---',
      );
    } else if (roll < 0.33) {
      // Frontmatter that will not parse. Still knowledge, still indexed.
      parts.push('---', 'tags: [unclosed', '---');
    }

    parts.push(`# ${title}`, '', paragraph());
    const sections = 1 + Math.floor(random() * 4);
    for (let s = 0; s < sections; s += 1) {
      parts.push('', `## ${capitalize(pick(WORDS))} ${pick(WORDS)}`, '');
      if (reusable.length > 0 && random() < 0.12) {
        parts.push(pick(reusable));
        duplicated += 1;
      } else {
        const fresh = paragraph();
        parts.push(fresh);
        if (reusable.length < 200 && random() < 0.2) reusable.push(fresh);
      }
    }
    parts.push('');

    const text = parts.join('\n');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, 'utf8');
    bytes += Buffer.byteLength(text, 'utf8');
  }

  return { files: options.count, bytes, duplicatedParagraphs: duplicated };
}

function capitalize(word: string): string {
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}

/**
 * A small, well-known 32-bit generator. Chosen because it is a few lines,
 * needs no dependency, and is the same on every JavaScript engine — `Math`
 * arithmetic on 32-bit integers is fully specified, where `Math.random` is not
 * seedable at all.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
