import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateCorpus } from '../src/bench/corpus.js';
import { hashBytes } from '../src/hash.js';

const roots: string[] = [];

function fresh(): string {
  const root = mkdtempSync(join(tmpdir(), 'lore-corpus-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

/** Every file under `root`, by relative path, with its content hash. */
function fingerprint(root: string, prefix = ''): Map<string, string> {
  const seen = new Map<string, string>();
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      for (const [key, value] of fingerprint(path, relative)) {
        seen.set(key, value);
      }
    } else {
      seen.set(relative, hashBytes(readFileSync(path)));
    }
  }
  return seen;
}

describe('generateCorpus', () => {
  it('writes the same files with the same bytes for the same seed', () => {
    const a = fresh();
    const b = fresh();
    const first = generateCorpus(a, { count: 60, seed: 7 });
    const second = generateCorpus(b, { count: 60, seed: 7 });

    expect(second).toEqual(first);
    expect(fingerprint(b)).toEqual(fingerprint(a));
    expect(fingerprint(a).size).toBe(60);
  });

  it('writes a different corpus for a different seed', () => {
    const a = fresh();
    const b = fresh();
    generateCorpus(a, { count: 20, seed: 1 });
    generateCorpus(b, { count: 20, seed: 2 });

    expect(fingerprint(b)).not.toEqual(fingerprint(a));
  });

  it('exercises the shapes retrieval has to handle', () => {
    const root = fresh();
    const summary = generateCorpus(root, { count: 300, seed: 3 });
    const texts = [...fingerprint(root).keys()].map((relative) =>
      readFileSync(join(root, relative), 'utf8'),
    );

    // With frontmatter, without, and unparseable — all three appear.
    expect(texts.some((t) => t.startsWith('---\ntitle:'))).toBe(true);
    expect(texts.some((t) => t.startsWith('# '))).toBe(true);
    expect(texts.some((t) => t.includes('tags: [unclosed'))).toBe(true);
    expect(summary.duplicatedParagraphs).toBeGreaterThan(0);
    // Every note has a heading to anchor its spans.
    for (const text of texts) {
      expect(text).toMatch(/^# /m);
    }
  });
});
