import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {
  existsSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tolerateClosedPipe } from '../src/pipe.js';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const CLI = join(REPO_ROOT, 'packages', 'cli', 'dist', 'lore.js');

function errno(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`write ${code}`), { code });
}

describe('tolerateClosedPipe', () => {
  it('ignores EPIPE', () => {
    const stream = new EventEmitter();
    tolerateClosedPipe(stream);
    expect(() => stream.emit('error', errno('EPIPE'))).not.toThrow();
  });

  it('rethrows every other stream error unchanged', () => {
    for (const error of [errno('EIO'), errno('EBADF'), new Error('boom')]) {
      const stream = new EventEmitter();
      tolerateClosedPipe(stream);
      expect(() => stream.emit('error', error)).toThrow(error);
    }
  });
});

/**
 * Run the built binary with stdout or stderr already closed by the reader, so
 * every write to it fails with EPIPE. Nothing races: the read end is gone
 * before the child writes a byte.
 */
function withClosed(
  which: 'stdout' | 'stderr',
  args: string[],
  cwd: string,
): Promise<{ code: number | null; signal: string | null; other: string }> {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd,
      env: { PATH: process.env.PATH ?? '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child[which].destroy();
    let other = '';
    child[which === 'stdout' ? 'stderr' : 'stdout'].on('data', (chunk) => {
      other += chunk;
    });
    child.on('error', fail);
    child.on('close', (code, signal) => done({ code, signal, other }));
  });
}

/** Run a shell pipeline and report `lore`'s own exit status and stderr. */
function pipeline(command: string, cwd: string) {
  const result = spawnSync(
    'bash',
    ['-c', `${command}; echo "status=\${PIPESTATUS[0]}" >&3`],
    {
      cwd,
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '' },
      stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
    },
  );
  const status = /status=(\d+)/.exec(String(result.output[3]))?.[1];
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    status: Number(status),
  };
}

describe('the built binary when the reader closes its output', () => {
  let root: string;
  const lore = `"${process.execPath}" "${CLI}"`;

  beforeAll(() => {
    execFileSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'pipe' });
    root = realpathSync(mkdtempSync(join(tmpdir(), 'lore-pipe-')));
    writeFileSync(join(root, 'afile'), 'not a directory');
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('finishes init and exits 0 with no stack trace when stdout is closed', async () => {
    const result = await withClosed('stdout', ['init', 'closed-brain'], root);
    expect(result).toEqual({ code: 0, signal: null, other: '' });
    expect(
      existsSync(join(root, 'closed-brain', '.lorekeeper', 'manifest.json')),
    ).toBe(true);
  });

  it('exits 0 for --help when stdout is closed', async () => {
    expect(await withClosed('stdout', ['--help'], root)).toEqual({
      code: 0,
      signal: null,
      other: '',
    });
  });

  it('keeps a refused init at exit 1 with its message when stdout is closed', async () => {
    const result = await withClosed('stdout', ['init', 'afile'], root);
    expect(result.code).toBe(1);
    expect(result.other).toBe(
      `lore init: ${join(root, 'afile')} is not a directory.\n`,
    );
  });

  it('keeps a usage error at exit 2 when stderr is closed', async () => {
    const result = await withClosed('stderr', ['search'], root);
    expect(result).toEqual({ code: 2, signal: null, other: '' });
  });

  it('handles `lore init … | head -1`', () => {
    const result = pipeline(`${lore} init head-brain | head -1`, root);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(
      `Initialized a brain at ${join(root, 'head-brain')}\n`,
    );
  });

  it('handles `lore --help | head -1`', () => {
    const result = pipeline(`${lore} --help | head -1`, root);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toMatch(/^Lorekeeper \d+\.\d+\.\d+\n$/);
  });

  it('passes JSON to a reader that reads everything, byte for byte', () => {
    const direct = spawnSync(
      process.execPath,
      [CLI, 'search', root, 'directory', '--json'],
      {
        encoding: 'utf8',
        env: { PATH: process.env.PATH ?? '' },
      },
    );
    const piped = pipeline(
      `${lore} search "${root}" directory --json | cat`,
      root,
    );
    expect(direct.status).toBe(0);
    expect(piped.status).toBe(0);
    expect(piped.stderr).toBe('');
    expect(piped.stdout).toBe(direct.stdout);
    expect(JSON.parse(piped.stdout).query).toBe('directory');
  });
});
