import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashBytes } from '../src/hash.js';
import { run } from '../src/run.js';
import { search } from '../src/search.js';

/** Collects what the command writes, so assertions look at real output. */
function streams() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    streams: {
      out: (text: string) => {
        out.push(text);
      },
      err: (text: string) => {
        err.push(text);
      },
    },
    out: () => out.join(''),
    err: () => err.join(''),
  };
}

let vault: string;

/**
 * A synthetic corpus. Every byte of it is invented for this test — no private
 * content, no real notes, in this repository or its fixtures.
 */
const CORPUS: Record<string, string> = {
  'notes/retry.md': [
    '---',
    'type: note',
    'tags:',
    '  - resilience',
    'aliases:',
    '  - Backoff rules',
    '---',
    '# Retry policy',
    '',
    'Intro line about the policy.',
    '',
    '## Backoff',
    '',
    'Retries use exponential backoff with jitter, capped at five attempts.',
    'A failed attempt never retries immediately.',
  ].join('\n'),
  'notes/ingress.md': [
    '---',
    'type: note',
    '---',
    '# Ingress',
    '',
    'TLS termination happens at the edge proxy.',
  ].join('\n'),
  'plain.md': [
    '# Gardening',
    '',
    'Tomatoes want more water than peppers do.',
  ].join('\n'),
  'broken.md': [
    '---',
    'tags: [unclosed',
    '---',
    '',
    'Compost heats up when it is turned weekly.',
  ].join('\n'),
};

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), 'lore-search-'));
  for (const [relative, content] of Object.entries(CORPUS)) {
    const path = join(vault, relative);
    mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(path, content, 'utf8');
  }
});

afterEach(() => {
  rmSync(vault, { recursive: true, force: true });
});

/** Every file in the vault, by relative path, with its hash and mtime. */
function snapshot(directory: string, prefix = ''): Map<string, string> {
  const seen = new Map<string, string>();
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      for (const [key, value] of snapshot(path, relative)) {
        seen.set(key, value);
      }
      continue;
    }
    const stats = statSync(path);
    seen.set(relative, `${hashBytes(readFileSync(path))}:${stats.size}`);
  }
  return seen;
}

describe('lore search', () => {
  it('ranks the span that answers the query and shows its evidence', () => {
    const io = streams();
    const code = search([vault, 'exponential backoff jitter'], io.streams);

    expect(code).toBe(0);
    const output = io.out();
    expect(output).toContain('notes/retry.md#Backoff:');
    expect(output).toContain('exponential backoff with jitter');
  });

  it('addresses a result by path, anchor, and line range', () => {
    const io = streams();
    search([vault, 'exponential backoff jitter', '--json'], io.streams);
    const payload = JSON.parse(io.out());
    const [best] = payload.results;

    expect(best.path).toBe('notes/retry.md');
    expect(best.anchor).toBe('Backoff');
    expect(typeof best.score).toBe('number');
    expect(best.text).toContain('exponential backoff');

    const lines = CORPUS['notes/retry.md']?.split('\n') ?? [];
    expect(lines.slice(best.startLine - 1, best.endLine).join('\n')).toBe(
      best.text,
    );
  });

  it('carries every field on every result, so evidence can be assessed', () => {
    const io = streams();
    search(
      [vault, 'retries tomatoes compost tls', '--json', '--limit', '10'],
      io.streams,
    );
    const payload = JSON.parse(io.out());

    expect(payload.results.length).toBeGreaterThan(1);
    for (const result of payload.results) {
      expect(Object.keys(result).sort()).toEqual([
        'anchor',
        'endLine',
        'path',
        'score',
        'startLine',
        'text',
      ]);
      expect(result.text).not.toBe('');
    }
  });

  it('indexes a file with no frontmatter', () => {
    const io = streams();
    search([vault, 'tomatoes peppers', '--json'], io.streams);
    const payload = JSON.parse(io.out());

    expect(payload.results[0].path).toBe('plain.md');
  });

  it('indexes a file whose frontmatter cannot be parsed', () => {
    const io = streams();
    search([vault, 'compost turned weekly', '--json'], io.streams);
    const payload = JSON.parse(io.out());

    expect(payload.results[0].path).toBe('broken.md');
  });

  it('leaves every file in the vault byte-identical', () => {
    const before = snapshot(vault);
    search([vault, 'exponential backoff jitter'], streams().streams);
    search([vault, 'tomatoes'], streams().streams);

    expect(snapshot(vault)).toEqual(before);
  });

  it('writes no index file and creates nothing', () => {
    const before = [...snapshot(vault).keys()].sort();
    search([vault, 'retries'], streams().streams);

    expect([...snapshot(vault).keys()].sort()).toEqual(before);
    expect(readdirSync(vault).sort()).toEqual([
      'broken.md',
      'notes',
      'plain.md',
    ]);
  });

  it('searches a directory that lore init never touched', () => {
    // Adoption, not migration: reading requires no ownership record.
    const io = streams();
    const code = search([vault, 'tomatoes'], io.streams);

    expect(code).toBe(0);
    expect(io.err()).toBe('');
  });

  it('does not follow a symlink out of the vault', () => {
    const outside = mkdtempSync(join(tmpdir(), 'lore-outside-'));
    writeFileSync(
      join(outside, 'secret.md'),
      '# Secret\n\nUnmistakable outside content about zeppelins.\n',
      'utf8',
    );
    try {
      symlinkSync(outside, join(vault, 'linked'));
      const io = streams();
      search([vault, 'zeppelins', '--json'], io.streams);

      expect(JSON.parse(io.out()).results).toEqual([]);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('says nothing was matched without claiming the knowledge is absent', () => {
    const io = streams();
    const code = search([vault, 'zeppelins'], io.streams);

    expect(code).toBe(0);
    expect(io.out()).toContain('No span shares a word with that query.');
    expect(io.out()).toContain('other wordings');
    expect(io.out().toLowerCase()).not.toContain('not found');
  });

  it('refuses a call that names no query', () => {
    const io = streams();
    expect(search([vault], io.streams)).toBe(2);
    expect(io.err()).toContain('name the brain and what to search for');
  });

  it('refuses an unusable limit', () => {
    const io = streams();
    expect(search([vault, 'retries', '--limit', 'lots'], io.streams)).toBe(2);
    expect(io.err()).toContain('whole number');
  });

  it('refuses a directory that is not there', () => {
    const io = streams();
    const missing = join(vault, 'nowhere');
    expect(search([missing, 'retries'], io.streams)).toBe(1);
    expect(io.err()).toContain('is not a directory');
  });

  it('is reachable through the binary dispatch', () => {
    const io = streams();
    expect(run(['search', vault, 'tomatoes'], io.streams)).toBe(0);
    expect(io.out()).toContain('plain.md');
  });
});
