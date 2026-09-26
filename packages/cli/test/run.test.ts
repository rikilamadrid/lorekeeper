import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from '../src/run.js';
import { createPaint } from '../src/terminal.js';

/** Collects what `run` writes so assertions can look at real output. */
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

describe('run', () => {
  it('prints the version and nothing else for --version', () => {
    const c = capture();
    const code = run(['--version'], c.streams);

    expect(code).toBe(0);
    expect(c.out().trim()).toMatch(/^\d+\.\d+\.\d+/);
    expect(c.err()).toBe('');
  });

  it('prints usage for --help, bare invocation, and -h alike', () => {
    const help = capture();
    const bare = capture();
    const short = capture();

    expect(run(['--help'], help.streams)).toBe(0);
    expect(run([], bare.streams)).toBe(0);
    expect(run(['-h'], short.streams)).toBe(0);

    expect(help.out()).toContain('Usage:');
    expect(bare.out()).toBe(help.out());
    expect(short.out()).toBe(help.out());
  });

  it('reports an unknown argument on stderr and exits non-zero', () => {
    const c = capture();
    const code = run(['--bogus'], c.streams);

    expect(code).toBe(1);
    expect(c.out()).toBe('');
    expect(c.err()).toContain('--bogus');
    expect(c.err()).toContain('lore --help');
  });

  it('does not treat an unshipped subcommand as a silent success', () => {
    const c = capture();
    // `search` ships as of Feature 05; `update` does not yet.
    expect(run(['update'], c.streams)).toBe(1);
  });

  it('dispatches search, and lets it report its own usage error', () => {
    const c = capture();
    // Exit 2 is a call that was understood and malformed, which is a different
    // answer from exit 1's "there is no such command".
    expect(run(['search'], c.streams)).toBe(2);
    expect(c.err()).toContain('lore search');
  });

  it('bookends a successful interactive init with the approved identity', () => {
    const root = mkdtempSync(join(tmpdir(), 'lore-identity-'));
    const c = capture();
    try {
      const code = run(
        ['init', join(root, 'brain')],
        c.streams,
        createPaint({ LANG: 'en_US.UTF-8', COLORTERM: 'truecolor' }, true, 100),
      );
      expect(code).toBe(0);
      expect(c.out().match(/L O R E K E E P E R/g)).toHaveLength(2);
      expect(c.out()).toContain('✦');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('puts the narrow one-line identity on its own lines around init', () => {
    const root = mkdtempSync(join(tmpdir(), 'lore-identity-'));
    const c = capture();
    try {
      const code = run(
        ['init', join(root, 'brain')],
        c.streams,
        createPaint({ LANG: 'en_US.UTF-8', COLORTERM: 'truecolor' }, true, 40),
      );
      expect(code).toBe(0);
      expect(c.out()).not.toContain('✦');
      const lines = c.out().split('\n');
      expect(lines[0]).toContain('L O R E K E E P E R');
      expect(lines[1]).toMatch(/^Initialized a brain at /);
      expect(lines.at(-2)).toContain('L O R E K E E P E R');
      expect(lines.at(-1)).toBe('');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps failed init output byte-identical at an interactive terminal', () => {
    const plain = capture();
    const painted = capture();
    const paint = createPaint(
      { LANG: 'en_US.UTF-8', COLORTERM: 'truecolor' },
      true,
      100,
    );

    expect(run(['init'], plain.streams)).toBe(2);
    expect(run(['init'], painted.streams, paint)).toBe(2);
    expect(painted.out()).toBe(plain.out());
    expect(painted.err()).toBe(plain.err());
  });
});
