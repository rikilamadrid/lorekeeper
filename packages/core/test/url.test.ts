import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  normalizeUrl,
  sourceIdFor,
  URL_ID_DIGEST_LENGTH,
  URL_ID_HASH_ALGORITHM,
} from '../src/url.js';

/**
 * A real SHA-256, the same one `packages/cli` passes in. Core never computes a
 * digest — that needs a platform, and core is consumed by the docs site too —
 * so the tests supply the function the way a caller does.
 */
const sha256 = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex');

/** The normalized URL, or a failure message that says which input broke. */
function normalized(raw: string): string {
  const result = normalizeUrl(raw);
  if (!result.ok) {
    throw new Error(`${raw} was refused: ${result.refusal.reason}`);
  }
  return result.normalized.url;
}

/** The source ID, or a failure message that says which input broke. */
function id(raw: string): string {
  const result = sourceIdFor(raw, sha256);
  if (!result.ok) {
    throw new Error(`${raw} was refused: ${result.refusal.reason}`);
  }
  return result.id;
}

describe('YouTube identity', () => {
  /**
   * The fixture the Feature's first acceptance criterion names. `&list=` and
   * `&index=` are the two that a generic tracking-parameter blocklist left
   * behind in prototype `schema-v0`, splitting one video into several sources.
   */
  const ONE_VIDEO = [
    'https://www.youtube.com/watch?v=aQb3Q9nCsK4',
    'https://www.youtube.com/watch?v=aQb3Q9nCsK4&list=PLh9mgdi4rNey&index=3',
    'https://youtu.be/aQb3Q9nCsK4',
    'https://m.youtube.com/watch?v=aQb3Q9nCsK4&t=42s',
    'http://youtube.com/watch?v=aQb3Q9nCsK4&feature=share&pp=ygUF',
  ];

  it('collapses five variants of one video to one normalized URL', () => {
    const forms = new Set(ONE_VIDEO.map(normalized));
    expect([...forms]).toEqual(['https://www.youtube.com/watch?v=aQb3Q9nCsK4']);
  });

  it('gives all five the same readable source ID', () => {
    const ids = new Set(ONE_VIDEO.map(id));
    expect([...ids]).toEqual(['yt-aQb3Q9nCsK4']);
  });

  it('keeps two different videos apart', () => {
    expect(id('https://youtu.be/aQb3Q9nCsK4')).not.toBe(
      id('https://youtu.be/bQb3Q9nCsK5'),
    );
  });

  it.each([
    ['shorts', 'https://www.youtube.com/shorts/aQb3Q9nCsK4'],
    ['embed', 'https://www.youtube.com/embed/aQb3Q9nCsK4?start=30'],
    ['live', 'https://www.youtube.com/live/aQb3Q9nCsK4'],
    ['nocookie embed', 'https://www.youtube-nocookie.com/embed/aQb3Q9nCsK4'],
    ['music', 'https://music.youtube.com/watch?v=aQb3Q9nCsK4&si=xyz'],
  ])('recognizes the video in a %s URL', (_form, url) => {
    expect(id(url)).toBe('yt-aQb3Q9nCsK4');
  });

  it('reports which rule spoke, and the key it identified', () => {
    const result = normalizeUrl('https://youtu.be/aQb3Q9nCsK4');
    expect(result.ok && result.normalized.rule).toBe('youtube');
    expect(result.ok && result.normalized.key).toBe('aQb3Q9nCsK4');
  });

  /**
   * A channel is a real thing to capture and the video rule has nothing to say
   * about it, so it falls through rather than being refused or given a video's
   * ID.
   */
  it.each([
    ['a channel', 'https://www.youtube.com/@someone'],
    ['a playlist page', 'https://www.youtube.com/playlist?list=PLh9mgdi4rNey'],
    ['the home page', 'https://www.youtube.com/'],
    ['a malformed video ID', 'https://www.youtube.com/watch?v=tooshort'],
  ])('falls through to the generic rule for %s', (_form, url) => {
    const result = normalizeUrl(url);
    expect(result.ok && result.normalized.rule).toBe('generic');
    expect(result.ok && result.normalized.key).toBeNull();
    expect(id(url).startsWith('url-')).toBe(true);
  });

  /**
   * None of these is a URL YouTube serves. Reading a video ID out of one would
   * be a guess, and a guess merges two of the user's sources into one — the
   * exact failure the per-domain rule exists to prevent. Each form is matched
   * on its exact segment count instead.
   */
  it.each([
    ['a short link with a trailing segment', 'https://youtu.be/aQb3Q9nCsK4/x'],
    [
      'an embed with a trailing segment',
      'https://www.youtube.com/embed/aQb3Q9nCsK4/x',
    ],
    [
      'a shorts link with a trailing segment',
      'https://www.youtube.com/shorts/aQb3Q9nCsK4/x',
    ],
    [
      'a watch path with a trailing segment',
      'https://www.youtube.com/watch/aQb3Q9nCsK4',
    ],
  ])('does not claim a video from %s', (_form, url) => {
    const result = normalizeUrl(url);
    expect(result.ok && result.normalized.rule).toBe('generic');
    expect(result.ok && result.normalized.key).toBeNull();
    expect(id(url).startsWith('url-')).toBe(true);
  });
});

describe('generic identity', () => {
  it('keeps a query parameter that carries meaning', () => {
    expect(normalized('https://blog.example.com/posts/x?page=2')).toBe(
      'https://blog.example.com/posts/x?page=2',
    );
  });

  it('keeps ?page=2 distinct from the same path without it', () => {
    expect(id('https://blog.example.com/posts/x?page=2')).not.toBe(
      id('https://blog.example.com/posts/x'),
    );
  });

  it('stops the order of query parameters from mattering', () => {
    expect(normalized('https://example.com/x?b=2&a=1')).toBe(
      normalized('https://example.com/x?a=1&b=2'),
    );
  });

  it('drops an anchor fragment, which addresses a place inside one document', () => {
    expect(normalized('https://example.com/x#section-3')).toBe(
      'https://example.com/x',
    );
  });

  /**
   * The decision recorded in {@link normalizeUrl}: a path-shaped fragment is
   * the location on a hash-routed site, not a place inside a document.
   * Dropping it would make every page of such a site one source, and report
   * the second page a user captured as a duplicate of the first.
   */
  it('keeps a path-shaped fragment, which is a hash-routed location', () => {
    expect(normalized('https://app.example.com/#/notes/5')).toBe(
      'https://app.example.com/#/notes/5',
    );
  });

  it('keeps two hash-routed pages of one app apart', () => {
    expect(id('https://app.example.com/#/notes/5')).not.toBe(
      id('https://app.example.com/#/notes/6'),
    );
  });

  it('still drops an anchor on a page that has a route as well', () => {
    expect(normalized('https://app.example.com/notes#intro')).toBe(
      'https://app.example.com/notes',
    );
  });

  it('removes a trailing slash from a path but not from the root', () => {
    expect(normalized('https://example.com/x/')).toBe('https://example.com/x');
    expect(normalized('https://example.com')).toBe('https://example.com/');
  });

  it('lowercases the host and drops a default port', () => {
    expect(normalized('HTTPS://Example.COM:443/x')).toBe(
      'https://example.com/x',
    );
  });

  it('keeps a non-default port, which addresses a different service', () => {
    expect(normalized('https://example.com:8443/x')).toBe(
      'https://example.com:8443/x',
    );
  });

  /**
   * `www.` collapsing is left to a domain rule. Usually the two serve the same
   * site, and "usually" is how two of the user's sources silently become one.
   */
  it('does not merge www. into the bare host', () => {
    expect(id('https://www.example.com/x')).not.toBe(
      id('https://example.com/x'),
    );
  });

  it('strips nothing else: no parameter blocklist lives here', () => {
    expect(normalized('https://example.com/x?utm_source=news&id=7')).toBe(
      'https://example.com/x?id=7&utm_source=news',
    );
  });

  /**
   * A password is not part of what a document is, and it has no business in a
   * provenance graph the user greps. The credentialed URL and the bare one are
   * one source.
   */
  it('drops credentials rather than letting them decide identity', () => {
    expect(normalized('https://user:pass@example.com/x')).toBe(
      'https://example.com/x',
    );
    expect(id('https://user:pass@example.com/x')).toBe(
      id('https://example.com/x'),
    );
  });

  it('is deterministic across calls', () => {
    expect(id('https://example.com/x?a=1')).toBe(
      id('https://example.com/x?a=1'),
    );
  });

  it('derives the ID from the normalized form, not the raw input', () => {
    expect(id('https://example.com/x/?b=2&a=1#frag')).toBe(
      id('https://example.com/x?a=1&b=2'),
    );
  });

  it('ignores surrounding whitespace', () => {
    expect(id('  https://example.com/x  ')).toBe(id('https://example.com/x'));
  });
});

describe('refusals', () => {
  it.each([
    ['empty', ''],
    ['a bare word', 'not a url'],
    ['a scheme-less host', 'example.com/x'],
  ])('refuses %s as not a URL', (_form, raw) => {
    const result = sourceIdFor(raw, sha256);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.refusal.code).toBe('not-a-url');
  });

  it.each([
    ['mailto:', 'mailto:someone@example.com'],
    ['file:', 'file:///Users/someone/notes.md'],
    ['javascript:', 'javascript:alert(1)'],
  ])('refuses the %s scheme', (_form, raw) => {
    const result = sourceIdFor(raw, sha256);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.refusal.code).toBe('scheme-unsupported');
  });

  it('refuses a digest that is not lowercase hex', () => {
    const result = sourceIdFor('https://example.com/x', () => 'NOT-A-DIGEST');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.refusal.code).toBe('digest-malformed');
  });

  it('refuses a digest too short to slice an ID from', () => {
    const result = sourceIdFor('https://example.com/x', () => 'abc123');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.refusal.code).toBe('digest-malformed');
  });

  it('never throws, whatever it is handed', () => {
    for (const raw of ['', '://', 'http://', 'https://[', '%%%']) {
      expect(() => sourceIdFor(raw, sha256)).not.toThrow();
    }
  });

  /**
   * The hash function is the one thing here that comes from outside, so it is
   * the one thing that can break the "nothing here throws" contract. It does
   * not get to.
   */
  it.each([
    [
      'an Error',
      () => {
        throw new Error('hash unavailable');
      },
    ],
    [
      'a string',
      () => {
        throw 'hash unavailable';
      },
    ],
    [
      'a null',
      () => {
        throw null;
      },
    ],
  ])(
    'refuses rather than propagating when the hash throws %s',
    (_form, hash) => {
      const result = sourceIdFor('https://example.com/x', hash as () => string);

      expect(result.ok).toBe(false);
      expect(!result.ok && result.refusal.code).toBe('digest-failed');
    },
  );

  it('does not let a hostile hash escape through the YouTube path either', () => {
    const result = sourceIdFor('https://youtu.be/aQb3Q9nCsK4', () => {
      throw new Error('never called');
    });

    expect(result.ok && result.id).toBe('yt-aQb3Q9nCsK4');
  });

  it('refuses a digest that is not a string at all', () => {
    const result = sourceIdFor(
      'https://example.com/x',
      (() => 12345) as unknown as (text: string) => string,
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.refusal.code).toBe('digest-malformed');
  });

  it('gives a reason a human can act on, without inventing a fix', () => {
    const result = sourceIdFor('mailto:someone@example.com', sha256);
    expect(!result.ok && result.refusal.reason).toContain('http or https');
  });

  /**
   * `normalizeUrl` drops credentials so a password never decides identity and
   * never reaches a provenance graph. A refusal is printed, copied into
   * transcripts, and pasted into bug reports, so it has to hold the same line.
   */
  it('never echoes credentials back in the reason it refuses', () => {
    for (const raw of [
      'ftp://user:hunter2@example.com/x',
      'not a url http://user:hunter2@example.com',
      'ssh://hunter2@example.com',
    ]) {
      const result = sourceIdFor(raw, sha256);
      expect(result.ok).toBe(false);
      const reason = !result.ok ? result.refusal.reason : '';
      expect(reason).not.toContain('hunter2');
      expect(reason).toContain('<redacted>');
    }
  });

  it('redacts before it truncates, so length cannot hide a credential', () => {
    const long = `ftp://user:hunter2@example.com/${'a'.repeat(400)}`;
    const result = sourceIdFor(long, sha256);
    expect(!result.ok && result.refusal.reason).not.toContain('hunter2');
  });
});

/**
 * The ID contract, pinned. A generic source ID is a slice of a digest, and the
 * digest and the slice length are as much a part of a user's file as the bytes
 * around them: change either and every `url-` source on disk is re-IDed, while
 * every provenance edge pointing at one stops resolving. Literal IDs are held
 * here so that change cannot pass green.
 */
describe('the generic source ID contract', () => {
  it('names the hash a source ID is a slice of', () => {
    expect(URL_ID_HASH_ALGORITHM).toBe('sha256');
    expect(URL_ID_DIGEST_LENGTH).toBe(12);
  });

  it.each([
    ['https://example.com/page', 'url-3641c5f2274c'],
    ['https://example.com/page?page=2', 'url-7fdba0ac3b6b'],
    ['https://app.example.com/#/notes/5', 'url-391b24be8b51'],
  ])('mints %s as %s, now and in every later version', (raw, expected) => {
    expect(id(raw)).toBe(expected);
  });

  it('carries the rule prefix and exactly the named digest length', () => {
    const minted = id('https://example.com/page');
    expect(minted.startsWith('url-')).toBe(true);
    expect(minted.length).toBe('url-'.length + URL_ID_DIGEST_LENGTH);
  });
});

/**
 * M1's guard. `packages/core` compiles with no ambient type packages and no
 * `dom`, so the compiler — not a review habit — is what stops a network call
 * being written here. `url-globals.d.ts` declares the two URL globals this
 * module needs, and nothing else. A lib or a `types` entry added to reach some
 * other global would bring `fetch` with it and silently retire that guard.
 */
describe('core compiles without a platform', () => {
  const tsconfig = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', 'tsconfig.json'), 'utf8'),
  ) as { compilerOptions?: { lib?: string[]; types?: string[] } };

  it('pulls in no ambient type packages', () => {
    expect(tsconfig.compilerOptions?.types).toEqual([]);
  });

  it('does not widen lib to reach a URL parser', () => {
    const lib = tsconfig.compilerOptions?.lib;
    expect(lib === undefined || !lib.includes('dom')).toBe(true);
  });

  it('declares only the URL globals it needs', () => {
    const source = readFileSync(
      join(import.meta.dirname, '..', 'src', 'url-globals.d.ts'),
      'utf8',
    );
    // Prose may name a global to explain why it is absent; declarations may not.
    const declared = source.replace(/\/\*[\s\S]*?\*\//g, '');

    expect(declared).toContain('var URL:');
    expect(declared).toContain('var URLSearchParams:');
    for (const global of ['fetch', 'XMLHttpRequest', 'WebSocket', 'process']) {
      expect(declared).not.toContain(global);
    }
  });
});
