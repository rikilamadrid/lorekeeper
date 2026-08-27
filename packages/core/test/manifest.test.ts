import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildManifest,
  detectDrift,
  isManifestHash,
  isOwned,
  MANIFEST_HASH_ALGORITHM,
  MANIFEST_PATH,
  MANIFEST_VERSION,
  type Manifest,
  parseManifest,
  serializeManifest,
} from '../src/manifest.js';

/** A real SHA-256 — of the string "hello" — so the fixtures are the right shape. */
const HELLO_SHA256 =
  '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';

/**
 * Stand-in hashes. Core names the algorithm and never runs it — computing one
 * needs a platform, and core is consumed by the docs site as well as the CLI —
 * so these tests supply well-formed hashes and assert what the format does
 * with them.
 */
function hashOf(content: string): string {
  let digits = '';
  for (const character of content) {
    digits += character.codePointAt(0)?.toString(16).padStart(4, '0') ?? '0000';
  }
  return `${digits}${'0'.repeat(64)}`.slice(0, 64);
}

function entry(path: string, content: string) {
  return { path, sha256: hashOf(content) };
}

function manifestOf(...files: readonly { path: string; sha256: string }[]) {
  const result = buildManifest({
    toolkitVersion: '0.0.0',
    createdAt: '2026-08-27T10:00:00.000Z',
    files,
  });
  if (!result.ok) {
    throw new Error(`fixture manifest refused: ${result.refusal.reason}`);
  }
  return result.manifest;
}

describe('the hash contract', () => {
  it('names SHA-256, so a writer and a later reader cannot disagree', () => {
    expect(MANIFEST_HASH_ALGORITHM).toBe('sha256');
  });

  it('accepts lowercase hex of SHA-256 length and nothing else', () => {
    expect(isManifestHash(HELLO_SHA256)).toBe(true);
    expect(isManifestHash(HELLO_SHA256.toUpperCase())).toBe(false);
    expect(isManifestHash(HELLO_SHA256.slice(0, 63))).toBe(false);
    expect(isManifestHash(`${HELLO_SHA256}0`)).toBe(false);
    expect(isManifestHash('')).toBe(false);
    expect(isManifestHash('z'.repeat(64))).toBe(false);
  });

  it('runs no hashing itself, so core stays free of a platform', () => {
    const source = readFileSync(
      join(import.meta.dirname, '..', 'src', 'manifest.ts'),
      'utf8',
    );

    expect(source).not.toContain('node:crypto');
    expect(source).not.toContain('createHash');
  });
});

describe('buildManifest', () => {
  it('records the format version and the caller-supplied provenance', () => {
    const manifest = manifestOf(entry('README.md', 'hello'));

    expect(manifest.manifestVersion).toBe(MANIFEST_VERSION);
    expect(manifest.toolkitVersion).toBe('0.0.0');
    expect(manifest.createdAt).toBe('2026-08-27T10:00:00.000Z');
    expect(manifest.files).toEqual([
      { path: 'README.md', sha256: hashOf('hello') },
    ]);
  });

  it('orders files by path so the same input serializes identically', () => {
    const one = manifestOf(
      entry('notes/README.md', 'n'),
      entry('README.md', 'r'),
      entry('inbox/README.md', 'i'),
    );
    const other = manifestOf(
      entry('README.md', 'r'),
      entry('inbox/README.md', 'i'),
      entry('notes/README.md', 'n'),
    );

    expect(one.files.map((f) => f.path)).toEqual([
      'README.md',
      'inbox/README.md',
      'notes/README.md',
    ]);
    expect(serializeManifest(one)).toBe(serializeManifest(other));
  });

  it.each([
    ['/etc/passwd', 'path-absolute'],
    ['C:/notes/x.md', 'path-absolute'],
    ['../outside.md', 'path-escapes-brain'],
    ['notes/../../outside.md', 'path-escapes-brain'],
    ['', 'path-empty'],
    ['./notes/x.md', 'path-not-normalized'],
    ['notes//x.md', 'path-not-normalized'],
    ['notes\\x.md', 'path-not-normalized'],
    [' notes/x.md', 'path-not-normalized'],
  ])('refuses the ambiguous path %j', (path, code) => {
    const result = buildManifest({
      toolkitVersion: '0.0.0',
      createdAt: '2026-08-27T10:00:00.000Z',
      files: [{ path, sha256: HELLO_SHA256 }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal.code).toBe(code);
    }
  });

  it('refuses to claim the same path twice', () => {
    const result = buildManifest({
      toolkitVersion: '0.0.0',
      createdAt: '2026-08-27T10:00:00.000Z',
      files: [entry('README.md', 'a'), entry('README.md', 'b')],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal.code).toBe('path-duplicated');
      expect(result.refusal.reason).toContain('README.md');
    }
  });

  it('refuses a hash that is not lowercase hex SHA-256', () => {
    for (const sha256 of [
      HELLO_SHA256.toUpperCase(),
      'abc',
      `${HELLO_SHA256}0`,
    ]) {
      const result = buildManifest({
        toolkitVersion: '0.0.0',
        createdAt: '2026-08-27T10:00:00.000Z',
        files: [{ path: 'README.md', sha256 }],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.refusal.code).toBe('hash-malformed');
      }
    }
  });
});

describe('serializeManifest and parseManifest', () => {
  it('round-trips a manifest unchanged', () => {
    const manifest = manifestOf(
      entry('README.md', 'r'),
      entry('sources/README.md', 's'),
    );
    const read = parseManifest(serializeManifest(manifest));

    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.manifest).toEqual(manifest);
    }
  });

  it('writes human-readable JSON ending in a newline', () => {
    const text = serializeManifest(manifestOf(entry('README.md', 'r')));

    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('\n  "files": [');
  });

  it.each([
    ['not json at all', 'not-json'],
    ['[]', 'not-an-object'],
    ['"a string"', 'not-an-object'],
    [
      '{"manifestVersion": 99, "toolkitVersion": "0.0.0", "createdAt": "x", "files": []}',
      'version-unsupported',
    ],
    ['{"manifestVersion": 1, "createdAt": "x", "files": []}', 'field-missing'],
    [
      '{"manifestVersion": 1, "toolkitVersion": "0.0.0", "createdAt": "x"}',
      'field-missing',
    ],
    [
      '{"manifestVersion": 1, "toolkitVersion": 3, "createdAt": "x", "files": []}',
      'field-malformed',
    ],
    [
      '{"manifestVersion": 1, "toolkitVersion": "0.0.0", "createdAt": "x", "files": {}}',
      'field-malformed',
    ],
    [
      '{"manifestVersion": 1, "toolkitVersion": "0.0.0", "createdAt": "x", "files": [{"path": "a.md"}]}',
      'field-malformed',
    ],
  ])('refuses %j rather than guessing at ownership', (text, code) => {
    const result = parseManifest(text);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal.code).toBe(code);
    }
  });

  it('refuses a manifest whose entry path escapes the brain', () => {
    const result = parseManifest(
      `{"manifestVersion": 1, "toolkitVersion": "0.0.0", "createdAt": "x", "files": [{"path": "../../.bashrc", "sha256": "${HELLO_SHA256}"}]}`,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal.code).toBe('path-escapes-brain');
    }
  });
});

describe('isOwned', () => {
  const manifest: Manifest = manifestOf(
    entry('README.md', 'r'),
    entry('notes/README.md', 'n'),
  );

  it('reports the files the toolkit wrote as owned', () => {
    expect(isOwned(manifest, 'README.md')).toBe(true);
    expect(isOwned(manifest, 'notes/README.md')).toBe(true);
  });

  it('treats every unlisted path as the user\u2019s, including near misses', () => {
    expect(isOwned(manifest, 'notes/my-note.md')).toBe(false);
    expect(isOwned(manifest, 'readme.md')).toBe(false);
    expect(isOwned(manifest, './README.md')).toBe(false);
    expect(isOwned(manifest, 'notes/')).toBe(false);
  });
});

describe('detectDrift', () => {
  const manifest = manifestOf(
    entry('README.md', 'original'),
    entry('notes/README.md', 'notes original'),
  );

  it('reports an untouched file as unchanged', () => {
    const drift = detectDrift(
      manifest,
      new Map([
        ['README.md', hashOf('original')],
        ['notes/README.md', hashOf('notes original')],
      ]),
    );

    expect(drift).toEqual([
      { path: 'README.md', state: 'unchanged' },
      { path: 'notes/README.md', state: 'unchanged' },
    ]);
  });

  it('reports an edited file as modified and a deleted one as missing', () => {
    const drift = detectDrift(
      manifest,
      new Map([
        ['README.md', hashOf('the user added a line')],
        ['notes/README.md', null],
      ]),
    );

    expect(drift).toEqual([
      { path: 'README.md', state: 'modified' },
      { path: 'notes/README.md', state: 'missing' },
    ]);
  });

  it('treats an unobserved owned file as missing rather than unchanged', () => {
    const drift = detectDrift(manifest, new Map());

    expect(drift.every((d) => d.state === 'missing')).toBe(true);
  });

  it('says nothing about files the manifest does not claim', () => {
    const drift = detectDrift(
      manifest,
      new Map([
        ['README.md', hashOf('original')],
        ['notes/README.md', hashOf('notes original')],
        ['notes/a-users-private-note.md', hashOf('anything')],
        ['inbox/another.md', hashOf('anything')],
      ]),
    );

    expect(drift).toHaveLength(2);
    expect(drift.map((d) => d.path)).not.toContain(
      'notes/a-users-private-note.md',
    );
  });
});

describe('MANIFEST_PATH', () => {
  it('is dot-prefixed so Obsidian never surfaces it as a note', () => {
    expect(MANIFEST_PATH).toBe('.lorekeeper/manifest.json');
    expect(MANIFEST_PATH.startsWith('.')).toBe(true);
  });
});
