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
