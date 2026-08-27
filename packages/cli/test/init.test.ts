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
import { join, relative, resolve, sep } from 'node:path';
import {
  MANIFEST_PATH,
  MANIFEST_VERSION,
  parseManifest,
  readDocument,
  validateDocuments,
} from '@lorekeeper/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashBytes } from '../src/hash.js';
import { init } from '../src/init.js';
import { run } from '../src/run.js';
import { STARTER_FILES, STARTER_FOLDERS } from '../src/starter.js';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

/** Collects what the command writes, so assertions look at real output. */
function capture() {
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
  sandbox = mkdtempSync(join(tmpdir(), 'lore-init-'));
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

function initInto(target: string, extra: Parameters<typeof init>[2] = {}) {
  const c = capture();
  const code = init([target], c.streams, {
    now: () => new Date('2026-08-27T10:00:00.000Z'),
    ...extra,
  });
  return { code, out: c.out(), err: c.err() };
}

describe('init into an empty target', () => {
  it('creates the folder set and the starter files', () => {
    const target = join(sandbox, 'brain');
    const result = initInto(target);

    expect(result.code).toBe(0);
    expect(result.err).toBe('');

    for (const folder of STARTER_FOLDERS) {
      expect(readdirSync(join(target, folder))).toContain('README.md');
    }
    expect(walk(target)).toEqual(
      [...STARTER_FILES.map((f) => f.path), MANIFEST_PATH].sort(),
    );
  });

  it('creates no numbered folder, no archive/, and no system/', () => {
    const target = join(sandbox, 'brain');
    initInto(target);

    const folders = readdirSync(target, { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .map((item) => item.name);

    expect(folders.sort()).toEqual(['.lorekeeper', ...STARTER_FOLDERS].sort());
    expect(folders).not.toContain('archive');
    expect(folders).not.toContain('system');
    expect(folders.some((name) => /^\d/.test(name))).toBe(false);
  });

  it('records every generated file in the manifest, and nothing else', () => {
    const target = join(sandbox, 'brain');
    initInto(target);

    const read = parseManifest(
      readFileSync(join(target, MANIFEST_PATH), 'utf8'),
    );
    expect(read.ok).toBe(true);
    if (!read.ok) return;

    const onDisk = walk(target).filter((path) => path !== MANIFEST_PATH);
    expect(read.manifest.files.map((f) => f.path)).toEqual(onDisk);
    expect(read.manifest.manifestVersion).toBe(MANIFEST_VERSION);
    expect(read.manifest.createdAt).toBe('2026-08-27T10:00:00.000Z');
    expect(read.manifest.toolkitVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('records the hash of the bytes actually on disk', () => {
    const target = join(sandbox, 'brain');
    initInto(target);

    const read = parseManifest(
      readFileSync(join(target, MANIFEST_PATH), 'utf8'),
    );
    if (!read.ok) throw new Error(read.refusal.reason);

    for (const entry of read.manifest.files) {
      expect(entry.sha256).toBe(
        hashBytes(readFileSync(join(target, entry.path))),
      );
    }
  });

  it('produces a tree that validates under the frontmatter contract', () => {
    const target = join(sandbox, 'brain');
    initInto(target);

    const markdown = walk(target).filter((path) => path.endsWith('.md'));
    const findings = validateDocuments(
      markdown.map((path) => ({
        file: path,
        document: readDocument(
          path.replace(/^.*\//, '').replace(/\.md$/, ''),
          readFileSync(join(target, path), 'utf8'),
        ),
      })),
    );

    expect(findings.filter((f) => f.severity !== 'info')).toEqual([]);
  });

  it('reads sensibly with no tooling installed', () => {
    const target = join(sandbox, 'brain');
    initInto(target);

    const readme = readFileSync(join(target, 'README.md'), 'utf8');
    for (const folder of STARTER_FOLDERS) {
      expect(readme).toContain(`${folder}/`);
    }
    expect(readme).toContain(MANIFEST_PATH);

    for (const path of walk(target).filter((p) => p.endsWith('.md'))) {
      expect(readFileSync(join(target, path), 'utf8')).toMatch(/^# \S/m);
    }
  });

  it('reports where the brain is and what was written', () => {
    const target = join(sandbox, 'brain');
    const result = initInto(target);

    expect(result.out).toContain(target);
    expect(result.out).toContain(MANIFEST_PATH);
    expect(result.out).toContain(`${STARTER_FILES.length} starter files`);
  });

  it('resolves a relative target against the working directory', () => {
    const result = initInto('brain', { cwd: sandbox });

    expect(result.code).toBe(0);
    expect(readdirSync(join(sandbox, 'brain'))).toContain('README.md');
  });

  it('uses an existing empty directory rather than requiring a new one', () => {
    const target = join(sandbox, 'brain');
    mkdirSync(target);

    expect(initInto(target).code).toBe(0);
    expect(readdirSync(target)).toContain('notes');
  });

  it('writes byte-identical content on two independent runs', () => {
    const one = join(sandbox, 'one');
    const other = join(sandbox, 'other');
    initInto(one);
    initInto(other);

    for (const path of walk(one)) {
      expect(readFileSync(join(other, path), 'utf8')).toBe(
        readFileSync(join(one, path), 'utf8'),
      );
    }
  });
});

describe('init refusals', () => {
  it('refuses a target inside the toolkit repository, writing nothing', () => {
    const target = join(REPO_ROOT, 'tmp-brain-should-never-exist');
    const result = initInto(target);

    expect(result.code).toBe(1);
    expect(result.err).toContain('refusing to initialize inside');
    expect(result.err).toContain(REPO_ROOT);
    expect(readdirSync(REPO_ROOT)).not.toContain(
      'tmp-brain-should-never-exist',
    );
  });

  it('refuses the toolkit repository root itself', () => {
    expect(initInto(REPO_ROOT).code).toBe(1);
  });

  it('sees through a symlink pointing into the toolkit repository', () => {
    const link = join(sandbox, 'link');
    symlinkSync(join(REPO_ROOT, 'packages'), link);

    const result = initInto(join(link, 'brain'));

    expect(result.code).toBe(1);
    expect(result.err).toContain('refusing to initialize inside');
  });

  it('initializes normally when no toolkit checkout is present', () => {
    const result = initInto(join(sandbox, 'brain'), {
      toolkitRepoRoot: null,
      now: () => new Date('2026-08-27T10:00:00.000Z'),
    });

    expect(result.code).toBe(0);
  });

  it('refuses a non-empty target and writes nothing into it', () => {
    const target = join(sandbox, 'vault');
    mkdirSync(target);
    writeFileSync(join(target, 'my-note.md'), 'mine\n');

    const result = initInto(target);

    expect(result.code).toBe(1);
    expect(result.err).toContain('not empty');
    expect(result.err).toContain('Nothing was written');
    expect(walk(target)).toEqual(['my-note.md']);
    expect(readFileSync(join(target, 'my-note.md'), 'utf8')).toBe('mine\n');
  });

  it('refuses a target that is a file', () => {
    const target = join(sandbox, 'notes.md');
    writeFileSync(target, 'mine\n');

    const result = initInto(target);

    expect(result.code).toBe(1);
    expect(result.err).toContain('not a directory');
    expect(readFileSync(target, 'utf8')).toBe('mine\n');
  });

  it('reports an inaccessible target without throwing a stack trace', () => {
    const target = join(sandbox, 'inaccessible');
    mkdirSync(target);
    chmodSync(target, 0o000);

    const result = (() => {
      try {
        return initInto(target);
      } finally {
        chmodSync(target, 0o700);
      }
    })();

    expect(result.code).toBe(1);
    expect(result.err).toMatch(/^lore init: .*EACCES/);
    expect(result.err).not.toContain('\n    at ');
    expect(readdirSync(target)).toEqual([]);
  });

  it('asks for a target when none was given', () => {
    const c = capture();
    const code = init([], c.streams);

    expect(code).toBe(2);
    expect(c.err()).toContain('lore init <target>');
  });

  it('refuses more than one target', () => {
    const c = capture();
    const code = init(['a', 'b'], c.streams);

    expect(code).toBe(2);
    expect(c.err()).toContain('"b"');
  });
});

describe('the init path', () => {
  it('is reachable as a subcommand of lore', () => {
    const c = capture();
    const target = join(sandbox, 'brain');

    expect(run(['init', target], c.streams)).toBe(0);
    expect(readdirSync(target)).toContain('README.md');
  });

  it('imports no network module anywhere in the toolkit', () => {
    const sources = [
      join(REPO_ROOT, 'packages', 'cli', 'src'),
      join(REPO_ROOT, 'packages', 'core', 'src'),
    ].flatMap((directory) =>
      walk(directory)
        .filter((path) => path.endsWith('.ts'))
        .map((path) => join(directory, path)),
    );

    expect(sources.length).toBeGreaterThan(0);

    const network =
      /\bnode:(https?|net|tls|dgram|dns|http2)\b|\bfrom '(https?|net|tls|dgram|dns|http2)'|\bfetch\(|XMLHttpRequest|WebSocket|undici|axios/;

    for (const file of sources) {
      expect({
        file: relative(REPO_ROOT, file),
        matched: network.exec(readFileSync(file, 'utf8'))?.[0] ?? null,
      }).toEqual({ file: relative(REPO_ROOT, file), matched: null });
    }
  });
});

describe('the sandbox itself', () => {
  it('is outside the toolkit repository, so these tests prove something', () => {
    expect(sandbox.startsWith(REPO_ROOT + sep)).toBe(false);
  });
});
