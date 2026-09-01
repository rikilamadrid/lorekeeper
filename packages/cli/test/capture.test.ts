import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  MANIFEST_PATH,
  parseManifest,
  readDocument,
  validateDocument,
} from '@lorekeeper/core';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { capture } from '../src/capture.js';
import { hashBytes } from '../src/hash.js';
import { init } from '../src/init.js';
import { run } from '../src/run.js';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

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

let sandbox: string;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'lore-capture-'));
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

/** Every file under `root`, as brain-relative POSIX paths. */
function walk(root: string, prefix = ''): string[] {
  const found: string[] = [];
  for (const item of readdirSync(root, { withFileTypes: true })) {
    const path = prefix === '' ? item.name : `${prefix}/${item.name}`;
    if (item.isDirectory()) {
      found.push(...walk(join(root, item.name), path));
    } else {
      found.push(path);
    }
  }
  return found.sort();
}

/** Every file under `root`, mapped to the hash of its bytes. */
function hashTree(root: string): Record<string, string> {
  return Object.fromEntries(
    walk(root).map((path) => [path, hashBytes(readFileSync(join(root, path)))]),
  );
}

/** A real brain, made the only way a user could make one. */
function brainAt(name: string): string {
  const target = join(sandbox, name);
  const c = streams();
  const code = init([target], c.streams, {
    now: () => new Date('2026-08-27T10:00:00.000Z'),
    toolkitRepoRoot: null,
  });
  if (code !== 0) throw new Error(c.err());
  return target;
}

const NOON = new Date(2026, 7, 29, 12, 30, 15);

function captureInto(
  brain: string,
  item: string,
  extra: Parameters<typeof capture>[2] = {},
) {
  const c = streams();
  const code = capture([brain, item], c.streams, {
    now: () => NOON,
    ...extra,
  });
  return { code, out: c.out(), err: c.err() };
}

/** The one file capture added under `inbox/`, relative to the brain. */
function inboxItems(brain: string): string[] {
  return walk(brain).filter(
    (path) => path.startsWith('inbox/') && path !== 'inbox/README.md',
  );
}

/** The paths the manifest at `brain` claims. */
function claimed(brain: string): string[] {
  const read = parseManifest(readFileSync(join(brain, MANIFEST_PATH), 'utf8'));
  if (!read.ok) throw new Error(read.refusal.reason);
  return read.manifest.files.map((file) => file.path);
}

describe('capture into a brain', () => {
  it('writes one inbox item and reports where it went', () => {
    const brain = brainAt('brain');
    const result = captureInto(brain, 'Retry logic may be double-charging');

    expect(result.code).toBe(0);
    expect(result.err).toBe('');

    const items = inboxItems(brain);
    expect(items).toEqual([
      'inbox/20260829-123015-retry-logic-may-be-double-charging.md',
    ]);
    expect(result.out).toContain(join(brain, items[0] as string));
  });

  it('leaves an item a human can read and grep with no tooling', () => {
    const brain = brainAt('brain');
    captureInto(brain, 'Retry logic may be double-charging');

    const path = join(brain, inboxItems(brain)[0] as string);
    const text = readFileSync(path, 'utf8');

    expect(text).toBe(
      [
        '---',
        'id: 20260829-123015-retry-logic-may-be-double-charging',
        `created: ${text.split('\n')[2]?.slice('created: '.length)}`,
        '---',
        '',
        'Retry logic may be double-charging',
        '',
      ].join('\n'),
    );

    // The subject is findable by the words the user typed, with grep alone.
    const grep = spawnSync('grep', ['-r', 'double-charging', brain], {
      encoding: 'utf8',
    });
    expect(grep.status).toBe(0);
    expect(grep.stdout).toContain(path);
  });

  it('writes a created timestamp that keeps the local offset', () => {
    const brain = brainAt('brain');
    captureInto(brain, 'a thought');

    const document = readDocument(
      'x',
      readFileSync(join(brain, inboxItems(brain)[0] as string), 'utf8'),
    );

    expect(document.frontmatter.created).toMatch(
      /^2026-08-29T12:30:15[+-]\d{2}:\d{2}$/,
    );
    expect(document.frontmatter.created).not.toContain('Z');
  });

  it('gives the file the same name as the id inside it', () => {
    const brain = brainAt('brain');
    captureInto(brain, 'a thought');

    const path = inboxItems(brain)[0] as string;
    const document = readDocument('x', readFileSync(join(brain, path), 'utf8'));

    expect(`inbox/${document.frontmatter.id}.md`).toBe(path);
  });

  it('writes a file that validates under the frontmatter contract', () => {
    const brain = brainAt('brain');
    captureInto(brain, 'Retry logic may be double-charging');

    const path = inboxItems(brain)[0] as string;
    const findings = validateDocument({
      file: path,
      document: readDocument(path, readFileSync(join(brain, path), 'utf8')),
    });

    expect(findings).toEqual([]);
  });

  it('claims the item in the manifest without disturbing init’s record', () => {
    const brain = brainAt('brain');
    const before = parseManifest(
      readFileSync(join(brain, MANIFEST_PATH), 'utf8'),
    );
    if (!before.ok) throw new Error(before.refusal.reason);

    captureInto(brain, 'a thought');

    const after = parseManifest(
      readFileSync(join(brain, MANIFEST_PATH), 'utf8'),
    );
    if (!after.ok) throw new Error(after.refusal.reason);

    const item = inboxItems(brain)[0] as string;
    expect(after.manifest.files.map((f) => f.path)).toEqual(
      [...before.manifest.files.map((f) => f.path), item].sort(),
    );
    expect(after.manifest.createdAt).toBe(before.manifest.createdAt);
    expect(after.manifest.toolkitVersion).toBe(before.manifest.toolkitVersion);
  });

  it('records the hash of the bytes actually on disk', () => {
    const brain = brainAt('brain');
    captureInto(brain, 'a thought');

    const read = parseManifest(
      readFileSync(join(brain, MANIFEST_PATH), 'utf8'),
    );
    if (!read.ok) throw new Error(read.refusal.reason);

    const item = inboxItems(brain)[0] as string;
    const entry = read.manifest.files.find((f) => f.path === item);
    expect(entry?.sha256).toBe(hashBytes(readFileSync(join(brain, item))));
  });

  it('touches nothing else in the brain', () => {
    const brain = brainAt('brain');
    const before = hashTree(brain);
    captureInto(brain, 'a thought');

    const after = hashTree(brain);
    const changed = Object.keys(after).filter(
      (path) => after[path] !== before[path],
    );
    expect(changed.sort()).toEqual(
      [MANIFEST_PATH, inboxItems(brain)[0] as string].sort(),
    );
  });
});

describe('capture names files that cannot collide', () => {
  it('keeps both captures when two land in the same second', () => {
    const brain = brainAt('brain');

    expect(captureInto(brain, 'the same subject').code).toBe(0);
    expect(captureInto(brain, 'the same subject').code).toBe(0);
    expect(captureInto(brain, 'the same subject').code).toBe(0);

    expect(inboxItems(brain)).toEqual([
      'inbox/20260829-123015-the-same-subject-2.md',
      'inbox/20260829-123015-the-same-subject-3.md',
      'inbox/20260829-123015-the-same-subject.md',
    ]);
    expect(claimed(brain)).toContain(
      'inbox/20260829-123015-the-same-subject-3.md',
    );
  });

  it('never overwrites a file the user already put in the inbox', () => {
    const brain = brainAt('brain');
    const occupied = join(
      brain,
      'inbox',
      '20260829-123015-the-same-subject.md',
    );
    writeFileSync(occupied, 'mine, written by hand\n');

    expect(captureInto(brain, 'the same subject').code).toBe(0);

    expect(readFileSync(occupied, 'utf8')).toBe('mine, written by hand\n');
    expect(claimed(brain)).not.toContain(
      'inbox/20260829-123015-the-same-subject.md',
    );
  });

  it('keeps letters from any script in the name', () => {
    const brain = brainAt('brain');
    captureInto(brain, 'Añadir índice a la búsqueda');

    expect(inboxItems(brain)).toEqual([
      'inbox/20260829-123015-añadir-índice-a-la-búsqueda.md',
    ]);
  });

  it('names a capture made only of symbols by its timestamp', () => {
    const brain = brainAt('brain');
    captureInto(brain, '!!! ??? ***');

    expect(inboxItems(brain)).toEqual(['inbox/20260829-123015-capture.md']);
  });

  it('cuts a long subject at a word boundary and keeps the full text', () => {
    const brain = brainAt('brain');
    const item =
      'the payment provider might have already committed the charge before the timeout fired';
    captureInto(brain, item);

    const path = inboxItems(brain)[0] as string;
    expect(path.length).toBeLessThan('inbox/20260829-123015-'.length + 52);
    expect(path).not.toMatch(/-\.md$/);
    expect(readFileSync(join(brain, path), 'utf8')).toContain(item);
  });
});

describe('capture refuses without writing', () => {
  it('refuses a directory that is not a brain, byte for byte', () => {
    const vault = join(sandbox, 'not-a-brain');
    mkdirSync(join(vault, 'inbox'), { recursive: true });
    writeFileSync(join(vault, 'inbox', 'mine.md'), 'my note\n');
    const before = hashTree(vault);

    const result = captureInto(vault, 'a thought');

    expect(result.code).toBe(1);
    expect(result.out).toBe('');
    expect(result.err).toContain(MANIFEST_PATH);
    expect(result.err).toContain('Nothing was written');
    expect(result.err).toContain('lore init');
    expect(hashTree(vault)).toEqual(before);
    expect(walk(vault)).toEqual(['inbox/mine.md']);
  });

  it('refuses a corrupt manifest, byte for byte', () => {
    const brain = brainAt('brain');
    writeFileSync(join(brain, MANIFEST_PATH), '{ not json');
    const before = hashTree(brain);

    const result = captureInto(brain, 'a thought');

    expect(result.code).toBe(1);
    expect(result.out).toBe('');
    expect(result.err).toContain('cannot be used');
    expect(result.err).toContain('Nothing was written');
    expect(hashTree(brain)).toEqual(before);
    expect(inboxItems(brain)).toEqual([]);
  });

  it('refuses a manifest it cannot read, byte for byte', () => {
    const brain = brainAt('brain');
    chmodSync(join(brain, MANIFEST_PATH), 0o000);

    const result = (() => {
      try {
        return captureInto(brain, 'a thought');
      } finally {
        chmodSync(join(brain, MANIFEST_PATH), 0o600);
      }
    })();

    expect(result.code).toBe(1);
    expect(result.err).toContain('cannot be read');
    expect(result.err).toContain('Nothing was written');
    expect(inboxItems(brain)).toEqual([]);
  });

  it('refuses a target that does not exist', () => {
    const result = captureInto(join(sandbox, 'nowhere'), 'a thought');

    expect(result.code).toBe(1);
    expect(result.err).toContain('is not a directory');
    expect(result.err).toContain('Nothing was written');
  });

  it('refuses an inbox that points outside the brain', () => {
    const brain = brainAt('brain');
    const outside = join(sandbox, 'elsewhere');
    mkdirSync(outside);
    rmSync(join(brain, 'inbox'), { recursive: true });
    symlinkSync(outside, join(brain, 'inbox'));

    const result = captureInto(brain, 'a thought');

    expect(result.code).toBe(1);
    expect(result.err).toContain('resolves outside');
    expect(walk(outside)).toEqual([]);
  });

  it('refuses missing and extra arguments with usage, not a stack', () => {
    const brain = brainAt('brain');

    const none = streams();
    expect(capture([], none.streams)).toBe(2);
    expect(none.err()).toContain('lore capture <brain> <item>');

    const noItem = streams();
    expect(capture([brain], noItem.streams)).toBe(2);

    const extra = streams();
    expect(capture([brain, 'two', 'words'], extra.streams)).toBe(2);
    expect(extra.err()).toContain('Quote the text');

    const blank = streams();
    expect(capture([brain, '   '], blank.streams)).toBe(2);
    expect(blank.err()).toContain('nothing to capture');

    expect(inboxItems(brain)).toEqual([]);
  });
});

describe('capture through run', () => {
  it('is dispatched by name and is no longer an unknown argument', () => {
    const brain = brainAt('brain');
    const c = streams();

    const code = run(['capture', brain, 'dispatched by run'], c.streams);

    expect(code).toBe(0);
    expect(inboxItems(brain)).toHaveLength(1);
  });

  it('is listed in --help', () => {
    const c = streams();
    run(['--help'], c.streams);

    expect(c.out()).toContain('lore capture <brain> <item>');
    expect(c.out()).toContain('inbox/');
  });
});

/** The files capture added under `sources/`, relative to the brain. */
function sourceFiles(brain: string): string[] {
  return walk(brain).filter(
    (path) => path.startsWith('sources/') && path !== 'sources/README.md',
  );
}

const VIDEO = 'https://www.youtube.com/watch?v=aQb3Q9nCsK4';

describe('capturing a URL as a source', () => {
  it('writes it to sources/ with its origin URL and stable ID', () => {
    const brain = brainAt('brain');
    const result = captureInto(brain, VIDEO);

    expect(result.code).toBe(0);
    expect(result.err).toBe('');
    expect(sourceFiles(brain)).toEqual(['sources/yt-aQb3Q9nCsK4.md']);
    expect(inboxItems(brain)).toEqual([]);

    const path = join(brain, 'sources', 'yt-aQb3Q9nCsK4.md');
    const document = readDocument('yt-aQb3Q9nCsK4', readFileSync(path, 'utf8'));

    expect(document.frontmatter.id).toBe('yt-aQb3Q9nCsK4');
    expect(document.frontmatter.url).toBe(VIDEO);
    // The offset is the writer's own, so only the local wall clock is fixed.
    expect(document.frontmatter.created).toMatch(/^2026-08-29T12:30:15[+-]/);
    expect(document.body.trim()).toBe(VIDEO);
    expect(validateDocument({ file: path, document })).toEqual([]);
    expect(claimed(brain)).toContain('sources/yt-aQb3Q9nCsK4.md');
  });

  it('stores the URL as the user wrote it, not the normalized form', () => {
    const brain = brainAt('brain');
    const asTyped = 'https://youtu.be/aQb3Q9nCsK4?list=PL9&index=4';
    captureInto(brain, asTyped);

    const path = join(brain, 'sources', 'yt-aQb3Q9nCsK4.md');
    const document = readDocument('x', readFileSync(path, 'utf8'));

    expect(document.frontmatter.url).toBe(asTyped);
    expect(document.frontmatter.id).toBe('yt-aQb3Q9nCsK4');
  });

  it('gives a URL with no domain rule a generic ID', () => {
    const brain = brainAt('brain');
    const result = captureInto(brain, 'https://example.com/page');

    expect(result.code).toBe(0);
    expect(sourceFiles(brain)).toEqual(['sources/url-3641c5f2274c.md']);
  });

  it('keeps writing an ordinary thought to the inbox', () => {
    const brain = brainAt('brain');
    captureInto(brain, 'the retry worry from the walk');

    expect(sourceFiles(brain)).toEqual([]);
    expect(inboxItems(brain)).toHaveLength(1);
  });

  /**
   * `URL` parses this as scheme `javascript:` with an opaque path. A capture
   * command that answered a typed thought with a scheme complaint would be
   * broken in the way users never forgive, so whitespace settles it first.
   */
  it('treats text that merely parses as a URL as the thought it is', () => {
    const brain = brainAt('brain');
    const result = captureInto(brain, 'javascript: the good parts, revisited');

    expect(result.code).toBe(0);
    expect(sourceFiles(brain)).toEqual([]);
    expect(inboxItems(brain)).toHaveLength(1);
  });

  it('refuses a bare URL whose scheme a source cannot have', () => {
    const brain = brainAt('brain');
    const before = hashTree(brain);
    const result = captureInto(brain, 'mailto:someone@example.com');

    expect(result.code).toBe(1);
    expect(result.err).toContain('http or https');
    expect(hashTree(brain)).toEqual(before);
  });

  it('never puts credentials from a refused URL into its own message', () => {
    const brain = brainAt('brain');
    const result = captureInto(brain, 'ftp://user:hunter2@example.com/paper');

    expect(result.code).toBe(1);
    expect(result.err).not.toContain('hunter2');
    expect(result.err).toContain('<redacted>');
  });
});

describe('capturing the same source twice', () => {
  it('reports the existing file and writes nothing', () => {
    const brain = brainAt('brain');
    expect(captureInto(brain, VIDEO).code).toBe(0);
    const after = hashTree(brain);

    const second = captureInto(brain, 'https://youtu.be/aQb3Q9nCsK4?list=PL9');

    expect(second.code).toBe(0);
    expect(second.err).toBe('');
    expect(second.out).toContain(join(brain, 'sources', 'yt-aQb3Q9nCsK4.md'));
    expect(second.out).toContain('yt-aQb3Q9nCsK4');
    expect(second.out).toContain('Nothing was written.');

    expect(sourceFiles(brain)).toEqual(['sources/yt-aQb3Q9nCsK4.md']);
    // Byte for byte, including the manifest: a duplicate changes nothing.
    expect(hashTree(brain)).toEqual(after);
  });

  it('collapses five variants of one video onto one file', () => {
    const brain = brainAt('brain');
    for (const variant of [
      VIDEO,
      'https://youtu.be/aQb3Q9nCsK4',
      'https://m.youtube.com/watch?v=aQb3Q9nCsK4&list=PL9&index=4',
      'https://www.youtube.com/embed/aQb3Q9nCsK4',
      'https://music.youtube.com/watch?v=aQb3Q9nCsK4&t=90',
    ]) {
      expect(captureInto(brain, variant).code).toBe(0);
    }

    expect(sourceFiles(brain)).toEqual(['sources/yt-aQb3Q9nCsK4.md']);
    expect(
      claimed(brain).filter(
        (path) => path.startsWith('sources/') && path !== 'sources/README.md',
      ),
    ).toEqual(['sources/yt-aQb3Q9nCsK4.md']);
  });

  it('keeps a URL whose ?page=2 is meaningful distinct', () => {
    const brain = brainAt('brain');
    captureInto(brain, 'https://example.com/page');
    captureInto(brain, 'https://example.com/page?page=2');

    expect(sourceFiles(brain)).toHaveLength(2);
  });

  /**
   * The duplicate decides on the `id` in the frontmatter and on nothing else.
   * A user is free to rename a source or move it out of `sources/`; it is the
   * same source afterwards, and capturing its URL again must still say so.
   */
  it('finds the source wherever the user has since filed it', () => {
    const brain = brainAt('brain');
    captureInto(brain, VIDEO);

    const original = join(brain, 'sources', 'yt-aQb3Q9nCsK4.md');
    const moved = join(brain, 'knowledge', 'hohpe-on-messaging.md');
    mkdirSync(join(brain, 'knowledge'), { recursive: true });
    writeFileSync(moved, readFileSync(original, 'utf8'));
    rmSync(original);

    const second = captureInto(brain, VIDEO);

    expect(second.code).toBe(0);
    expect(second.out).toContain(moved);
    expect(sourceFiles(brain)).toEqual([]);
  });

  it('is not fooled by a filename that merely looks like the ID', () => {
    const brain = brainAt('brain');
    mkdirSync(join(brain, 'sources'), { recursive: true });
    writeFileSync(
      join(brain, 'sources', 'yt-aQb3Q9nCsK4.md'),
      '# notes I made before I had the tool\n',
    );

    const result = captureInto(brain, VIDEO);

    expect(result.code).toBe(0);
    // The user's file is untouched and unclaimed; the source took another name.
    expect(
      readFileSync(join(brain, 'sources', 'yt-aQb3Q9nCsK4.md'), 'utf8'),
    ).toBe('# notes I made before I had the tool\n');
    expect(sourceFiles(brain)).toContain('sources/yt-aQb3Q9nCsK4-2.md');
    const document = readDocument(
      'x',
      readFileSync(join(brain, 'sources', 'yt-aQb3Q9nCsK4-2.md'), 'utf8'),
    );
    expect(document.frontmatter.id).toBe('yt-aQb3Q9nCsK4');
  });

  it('keeps scanning past a file it cannot parse', () => {
    const brain = brainAt('brain');
    captureInto(brain, VIDEO);
    writeFileSync(join(brain, 'inbox', 'broken.md'), '---\n: : :\n---\nx\n');

    const second = captureInto(brain, VIDEO);

    expect(second.code).toBe(0);
    expect(second.out).toContain('Nothing was written.');
    expect(sourceFiles(brain)).toEqual(['sources/yt-aQb3Q9nCsK4.md']);
  });

  it('makes no network call while identifying a URL', () => {
    // Nothing in capture can reach the network: `packages/core` compiles
    // without `fetch`, and this package's URL path only parses and hashes. The
    // observable guarantee is that identifying a URL touches no socket, which
    // a capture completing against an unroutable host demonstrates.
    const brain = brainAt('brain');
    const result = captureInto(brain, 'https://192.0.2.1/paper');

    expect(result.code).toBe(0);
    expect(sourceFiles(brain)).toHaveLength(1);
  });
});

/**
 * The tester's medium finding. A source path is deterministic, so deleting the
 * file and capturing its URL again writes to exactly the path the manifest
 * already claims. Appending that claim made the run fail on its own path and
 * left the manifest describing bytes that no longer existed.
 */
describe('recapturing a source whose file was deleted', () => {
  it('restores the managed path and succeeds', () => {
    const brain = brainAt('brain');
    expect(captureInto(brain, VIDEO).code).toBe(0);

    rmSync(join(brain, 'sources', 'yt-aQb3Q9nCsK4.md'));

    const again = captureInto(brain, VIDEO);

    expect(again.code).toBe(0);
    expect(again.err).toBe('');
    // The same deterministic path, not a suffixed one.
    expect(sourceFiles(brain)).toEqual(['sources/yt-aQb3Q9nCsK4.md']);
    expect(again.out).toContain(join(brain, 'sources', 'yt-aQb3Q9nCsK4.md'));
  });

  it('leaves the manifest agreeing with the file it just wrote', () => {
    const brain = brainAt('brain');
    captureInto(brain, VIDEO);
    rmSync(join(brain, 'sources', 'yt-aQb3Q9nCsK4.md'));
    // A later second, so the restored file's `created` really differs.
    captureInto(brain, VIDEO, { now: () => new Date(2026, 7, 29, 14, 0, 0) });

    const read = parseManifest(
      readFileSync(join(brain, MANIFEST_PATH), 'utf8'),
    );
    if (!read.ok) throw new Error(read.refusal.reason);

    const claims = read.manifest.files.filter(
      (file) => file.path === 'sources/yt-aQb3Q9nCsK4.md',
    );
    // Claimed exactly once: the entry was refreshed, not duplicated.
    expect(claims).toHaveLength(1);
    expect(claims[0]?.sha256).toBe(
      hashBytes(readFileSync(join(brain, 'sources', 'yt-aQb3Q9nCsK4.md'))),
    );
  });

  it('leaves no temporary file or partial manifest behind', () => {
    const brain = brainAt('brain');
    captureInto(brain, VIDEO);
    rmSync(join(brain, 'sources', 'yt-aQb3Q9nCsK4.md'));
    captureInto(brain, VIDEO);

    expect(readdirSync(join(brain, '.lorekeeper'))).toEqual(['manifest.json']);
    expect(
      parseManifest(readFileSync(join(brain, MANIFEST_PATH), 'utf8')).ok,
    ).toBe(true);
  });

  it('still refuses to overwrite a file the user put at that path', () => {
    const brain = brainAt('brain');
    captureInto(brain, VIDEO);
    rmSync(join(brain, 'sources', 'yt-aQb3Q9nCsK4.md'));
    writeFileSync(join(brain, 'sources', 'yt-aQb3Q9nCsK4.md'), '# mine now\n');

    const again = captureInto(brain, VIDEO);

    expect(again.code).toBe(0);
    expect(
      readFileSync(join(brain, 'sources', 'yt-aQb3Q9nCsK4.md'), 'utf8'),
    ).toBe('# mine now\n');
    expect(sourceFiles(brain)).toContain('sources/yt-aQb3Q9nCsK4-2.md');
  });
});

describe('a URL carrying a control character', () => {
  // Not whitespace, so `identify` lets it through, and the WHATWG parser
  // accepts it. Written raw it would be an invalid YAML 1.2 double-quoted
  // scalar in a file the user keeps.
  const CONTROL = `https://example.com/${String.fromCharCode(1)}x`;

  it('escapes it in the frontmatter rather than writing it raw', () => {
    const brain = brainAt('brain');
    expect(captureInto(brain, CONTROL).code).toBe(0);

    const path = join(brain, sourceFiles(brain)[0] as string);
    const text = readFileSync(path, 'utf8');
    const frontmatter = text.slice(0, text.indexOf('\n---\n', 4));

    expect(frontmatter).toContain('\\x01');
    // The scalar is the part that has to be valid YAML, so it is the part that
    // must not hold the raw byte. The body below it is Markdown, and it keeps
    // the URL exactly as the user typed it.
    expect(frontmatter).not.toContain(String.fromCharCode(1));
    expect(text).toContain(CONTROL);
  });

  it('reads back as the URL that was captured, and validates', () => {
    const brain = brainAt('brain');
    captureInto(brain, CONTROL);

    const path = join(brain, sourceFiles(brain)[0] as string);
    const document = readDocument('x', readFileSync(path, 'utf8'));

    expect(document.parseError).toBe(null);
    expect(document.frontmatter.url).toBe(CONTROL);
    expect(validateDocument({ file: path, document })).toEqual([]);
  });
});

describe('the built capture binary', () => {
  const cli = join(REPO_ROOT, 'packages', 'cli', 'dist', 'cli.js');

  beforeAll(() => {
    execFileSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'pipe' });
  });

  it('captures an item findable with grep and nothing else', () => {
    const brain = join(sandbox, 'built-brain');
    const created = spawnSync(process.execPath, [cli, 'init', brain], {
      encoding: 'utf8',
    });
    expect(created.status).toBe(0);

    const result = spawnSync(
      process.execPath,
      [cli, 'capture', brain, 'the idempotency worry from the walk'],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');

    const grep = spawnSync('grep', ['-rl', 'idempotency worry', brain], {
      encoding: 'utf8',
    });
    expect(grep.status).toBe(0);
    expect(grep.stdout.trim().split('\n')).toHaveLength(1);
    expect(grep.stdout).toContain(`${join(brain, 'inbox')}/`);
    expect(result.stdout).toContain(grep.stdout.trim());
  });

  it('captures a URL once and reports the second as a duplicate', () => {
    const brain = join(sandbox, 'built-source-brain');
    expect(
      spawnSync(process.execPath, [cli, 'init', brain], { encoding: 'utf8' })
        .status,
    ).toBe(0);

    const first = spawnSync(
      process.execPath,
      [cli, 'capture', brain, 'https://www.youtube.com/watch?v=aQb3Q9nCsK4'],
      { encoding: 'utf8' },
    );
    expect(first.status).toBe(0);
    expect(first.stderr).toBe('');
    expect(first.stdout).toContain(join(brain, 'sources', 'yt-aQb3Q9nCsK4.md'));

    const after = hashTree(brain);

    const second = spawnSync(
      process.execPath,
      [
        cli,
        'capture',
        brain,
        'https://m.youtube.com/watch?v=aQb3Q9nCsK4&list=PL9&index=4',
      ],
      { encoding: 'utf8' },
    );
    expect(second.status).toBe(0);
    expect(second.stderr).toBe('');
    expect(second.stdout).toContain('Already captured as');
    expect(second.stdout).toContain(
      join(brain, 'sources', 'yt-aQb3Q9nCsK4.md'),
    );

    // The brain is byte-for-byte what it was before the duplicate run.
    expect(hashTree(brain)).toEqual(after);

    const grep = spawnSync(
      'grep',
      ['-rl', '--include=*.md', 'aQb3Q9nCsK4', brain],
      { encoding: 'utf8' },
    );
    expect(grep.status).toBe(0);
    expect(grep.stdout.trim().split('\n')).toEqual([
      join(brain, 'sources', 'yt-aQb3Q9nCsK4.md'),
    ]);
  });

  /**
   * The tester's medium finding, end to end and through the real binary:
   * capture, delete the file, capture the same URL. The manifest and the file
   * must agree afterwards, and `lore init` must not report a file the toolkit
   * itself just restored as modified.
   */
  it('restores a deleted source and leaves init reporting no drift', () => {
    const brain = join(sandbox, 'built-restore-brain');
    const url = 'https://www.youtube.com/watch?v=aQb3Q9nCsK4';
    const source = join(brain, 'sources', 'yt-aQb3Q9nCsK4.md');

    expect(
      spawnSync(process.execPath, [cli, 'init', brain], { encoding: 'utf8' })
        .status,
    ).toBe(0);
    expect(
      spawnSync(process.execPath, [cli, 'capture', brain, url], {
        encoding: 'utf8',
      }).status,
    ).toBe(0);

    rmSync(source);

    const again = spawnSync(process.execPath, [cli, 'capture', brain, url], {
      encoding: 'utf8',
    });
    expect(again.status).toBe(0);
    expect(again.stderr).toBe('');
    expect(again.stdout).toContain(source);

    // The manifest claims that path exactly once, with the hash of the bytes
    // that are actually there.
    const read = parseManifest(
      readFileSync(join(brain, MANIFEST_PATH), 'utf8'),
    );
    if (!read.ok) throw new Error(read.refusal.reason);
    const claims = read.manifest.files.filter(
      (file) => file.path === 'sources/yt-aQb3Q9nCsK4.md',
    );
    expect(claims).toHaveLength(1);
    expect(claims[0]?.sha256).toBe(hashBytes(readFileSync(source)));

    // Nothing partial is left where the manifest is rewritten.
    expect(readdirSync(join(brain, '.lorekeeper'))).toEqual(['manifest.json']);

    const reinit = spawnSync(process.execPath, [cli, 'init', brain], {
      encoding: 'utf8',
    });
    expect(reinit.status).toBe(0);
    expect(reinit.stdout).toContain('unchanged: sources/yt-aQb3Q9nCsK4.md');
    expect(reinit.stdout).not.toContain('modified: sources/yt-aQb3Q9nCsK4.md');
  });

  it('exits non-zero against a directory that is not a brain', () => {
    const vault = join(sandbox, 'built-vault');
    mkdirSync(vault);
    writeFileSync(join(vault, 'note.md'), 'my note\n');
    const before = hashTree(vault);

    const result = spawnSync(
      process.execPath,
      [cli, 'capture', vault, 'a thought'],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(hashTree(vault)).toEqual(before);
  });
});

/**
 * Node's own failure messages name the syscall and the errno — `EACCES:
 * permission denied, open '…'`. `init` already refuses to speak that way, and
 * a second command that writes into someone's notes has no reason to either.
 *
 * This is stricter than a literal word list: it catches any of the errno codes
 * capture can meet and the `syscall 'path'` shape Node appends, while leaving
 * ordinary English like "too many files are open" alone.
 */
const ERRNO_LEAK =
  /\b(?:EACCES|EEXIST|EISDIR|ENOTDIR|ENOENT|EPERM|EROFS|ENOSPC|ELOOP|EMFILE|ENFILE|ENAMETOOLONG)\b|errno|(?:open|mkdir|unlink|rename|stat|lstat) '/;

describe('capture explains a filesystem failure instead of leaking it', () => {
  it('refuses an inbox that is a file, not a directory', () => {
    const brain = brainAt('brain');
    rmSync(join(brain, 'inbox'), { recursive: true });
    writeFileSync(join(brain, 'inbox'), 'not a directory\n');

    const result = captureInto(brain, 'a thought');

    expect(result.code).toBe(1);
    expect(result.out).toBe('');
    expect(result.err).not.toMatch(ERRNO_LEAK);
    expect(result.err).toContain('is not a directory');
    expect(result.err).toContain('Nothing was written');
    expect(result.err).toContain('capture again');
    expect(readFileSync(join(brain, 'inbox'), 'utf8')).toBe(
      'not a directory\n',
    );
  });

  it('refuses an inbox it cannot write into', () => {
    const brain = brainAt('brain');
    chmodSync(join(brain, 'inbox'), 0o500);

    const result = (() => {
      try {
        return captureInto(brain, 'a thought');
      } finally {
        chmodSync(join(brain, 'inbox'), 0o700);
      }
    })();

    expect(result.code).toBe(1);
    expect(result.out).toBe('');
    expect(result.err).not.toMatch(ERRNO_LEAK);
    expect(result.err).toContain('permission was denied');
    expect(result.err).toContain('Nothing was written');
    expect(result.err).toContain(join(brain, 'inbox'));
    expect(inboxItems(brain)).toEqual([]);
  });

  it('refuses a brain it cannot create the inbox in', () => {
    const brain = brainAt('brain');
    rmSync(join(brain, 'inbox'), { recursive: true });
    chmodSync(brain, 0o500);

    const result = (() => {
      try {
        return captureInto(brain, 'a thought');
      } finally {
        chmodSync(brain, 0o700);
      }
    })();

    expect(result.code).toBe(1);
    expect(result.out).toBe('');
    expect(result.err).not.toMatch(ERRNO_LEAK);
    expect(result.err).toContain('could not be created');
    expect(result.err).toContain('permission was denied');
    expect(result.err).toContain('Nothing was written');
  });

  it('leaks no errno through the built binary either', () => {
    const brain = brainAt('brain');
    rmSync(join(brain, 'inbox'), { recursive: true });
    writeFileSync(join(brain, 'inbox'), 'not a directory\n');

    const cli = join(REPO_ROOT, 'packages', 'cli', 'dist', 'cli.js');
    const result = spawnSync(
      process.execPath,
      [cli, 'capture', brain, 'a thought'],
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).not.toMatch(ERRNO_LEAK);
    expect(result.stderr).not.toMatch(/\bat .*\.js:\d+/);
  });
});

describe('capture that could not be recorded', () => {
  /** Make the manifest unwritable, capture, and put the permissions back. */
  function captureWithUnwritableManifest(brain: string) {
    chmodSync(join(brain, '.lorekeeper'), 0o500);
    try {
      return captureInto(brain, 'a thought');
    } finally {
      chmodSync(join(brain, '.lorekeeper'), 0o700);
    }
  }

  it('keeps the capture and says so, naming the file it wrote', () => {
    const brain = brainAt('brain');

    const result = captureWithUnwritableManifest(brain);

    expect(result.code).toBe(1);

    const items = inboxItems(brain);
    expect(items).toEqual(['inbox/20260829-123015-a-thought.md']);

    const path = join(brain, items[0] as string);
    expect(result.err).toContain(path);
    expect(result.err).toContain('was written');
    expect(result.err).toContain(MANIFEST_PATH);
    expect(result.err).toContain('could not be updated');
    // The remedy names the directory, because claiming rewrites the manifest
    // through a temporary file created next to it.
    expect(result.err).toContain(`make ${join(brain, '.lorekeeper')} writable`);
    expect(result.err).not.toMatch(ERRNO_LEAK);
  });

  /**
   * The permissions remedy belongs to a write failure and to nothing else, so
   * this asserts it is reached by the failure it describes. The other branch —
   * a manifest that is writable and refused what it was asked to record — is
   * defensive: `parseManifest` rejects everything `buildManifest` would, and
   * `claim` no longer builds a duplicate path, so no input to `capture` is
   * known to reach it. It is kept because a wrong remedy is worse than none.
   */
  it('names permissions only because permissions are what failed', () => {
    const brain = brainAt('brain');

    const result = captureWithUnwritableManifest(brain);

    expect(result.code).toBe(1);
    expect(result.err).toContain(`make ${join(brain, '.lorekeeper')} writable`);
    expect(result.err).not.toContain('what it says is the problem');
  });

  it('leaves the capture readable and intact on disk', () => {
    const brain = brainAt('brain');
    captureWithUnwritableManifest(brain);

    const path = join(brain, inboxItems(brain)[0] as string);
    const document = readDocument('x', readFileSync(path, 'utf8'));

    expect(document.body.trim()).toBe('a thought');
    expect(document.frontmatter.id).toBe('20260829-123015-a-thought');
    expect(validateDocument({ file: path, document })).toEqual([]);
  });

  it('leaves the file unclaimed, so nothing will ever rewrite it', () => {
    const brain = brainAt('brain');
    const before = claimed(brain);

    captureWithUnwritableManifest(brain);

    expect(claimed(brain)).toEqual(before);
    expect(claimed(brain)).not.toContain(inboxItems(brain)[0]);
  });

  it('leaves no temporary manifest behind', () => {
    const brain = brainAt('brain');
    captureWithUnwritableManifest(brain);

    expect(readdirSync(join(brain, '.lorekeeper'))).toEqual(['manifest.json']);
  });

  it('captures normally once the manifest is writable again', () => {
    const brain = brainAt('brain');
    captureWithUnwritableManifest(brain);

    const second = captureInto(brain, 'a thought');

    expect(second.code).toBe(0);
    // The first capture is still the user's; only the second one is claimed.
    expect(claimed(brain)).toContain('inbox/20260829-123015-a-thought-2.md');
    expect(claimed(brain)).not.toContain('inbox/20260829-123015-a-thought.md');
  });
});
