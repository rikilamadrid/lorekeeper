import { describe, expect, it } from 'vitest';
import { run } from '../src/run.js';

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
    expect(run(['search'], c.streams)).toBe(1);
  });
});
