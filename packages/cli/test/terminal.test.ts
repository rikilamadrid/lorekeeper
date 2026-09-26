import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  detectTerminal,
  PAINTS,
  PRODUCT,
  renderCliIdentity,
  VALUES_HASH,
} from '../src/identity.js';
import { createPaint, PLAIN } from '../src/terminal.js';
import { usage } from '../src/usage.js';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const ESC = '\u001B';

describe('the generated identity', () => {
  it('carries Lorekeeper’s approved product-owned ring and star', () => {
    expect(PRODUCT.name).toBe('Lorekeeper');
    expect(PRODUCT.serial).toBe('LK-047');
    expect(PRODUCT.mark.rows).toHaveLength(5);
    expect(PRODUCT.mark.rows[2]?.expressive).toContainEqual({
      text: '✦',
      role: 'secondary',
    });
    expect(PAINTS.accent.hex).toBe('#99A2F0');
    expect(PAINTS.secondary?.hex).toBe('#E2B45C');
    expect(PAINTS.accent.truecolor).toBe(`${ESC}[38;2;153;162;240m`);
    expect(PAINTS.accent.ansi256).toBe(`${ESC}[38;5;111m`);
    expect(PAINTS.accent.ansi16).toBe(`${ESC}[1m${ESC}[34m`);
    expect(VALUES_HASH).toMatch(/^[0-9a-f]{8}$/);
  });

  it('is current against its generator', () => {
    const result = spawnSync(
      process.execPath,
      [join(REPO_ROOT, 'brand', 'terminal', 'build.mjs'), '--check'],
      { encoding: 'utf8' },
    );
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });
});

describe('terminal capabilities', () => {
  it('keeps the established colour refusal and depth policy', () => {
    const at = (env: Record<string, string>, isTTY = true) =>
      detectTerminal({ env, isTTY });
    expect(at({}, false).tier).toBe('contract');
    expect(at({}).depth).toBe(4);
    expect(at({ NO_COLOR: '' }).depth).toBe(0);
    expect(at({ FORCE_COLOR: '0' }).depth).toBe(0);
    expect(at({ TERM: 'dumb' }).depth).toBe(0);
    expect(at({ FORCE_COLOR: '1' }, false).depth).toBe(4);
    expect(at({ NO_COLOR: '1', FORCE_COLOR: '3' }).depth).toBe(0);
    expect(at({ TERM: 'xterm-256color' }).depth).toBe(8);
    expect(at({ COLORTERM: 'truecolor' }).depth).toBe(24);
  });

  it('keeps contract output suppressed even when colour is forced', () => {
    const caps = detectTerminal({
      env: { FORCE_COLOR: '3', LANG: 'en_US.UTF-8' },
      isTTY: false,
    });
    expect(renderCliIdentity({ version: '1.2.3', caps })).toBe('');
  });
});

describe('Lorekeeper rendering', () => {
  it('keeps piped help byte-compatible', () => {
    expect(PLAIN.name('Lorekeeper')).toBe('Lorekeeper');
    expect(PLAIN.identity('1.2.3')).toBe('');
    expect(usage('1.2.3', PLAIN)).toBe(usage('1.2.3'));
    expect(usage('1.2.3')).not.toContain(ESC);
    expect(usage('1.2.3')).not.toContain(PRODUCT.serial);
  });

  it('uses the shared line grammar in interactive help', () => {
    const line = usage(
      '1.2.3',
      createPaint({ LANG: 'en_US.UTF-8', COLORTERM: 'truecolor' }, true),
    ).split('\n')[0];
    expect(line).toBe(
      `${PAINTS.accent.truecolor}L O R E K E E P E R${ESC}[0m  ${ESC}[2mv1.2.3 · LK-047${ESC}[0m`,
    );
  });

  it('degrades the identity through 256 and 16 colours', () => {
    const at = (env: Record<string, string>) =>
      createPaint({ LANG: 'en_US.UTF-8', ...env }, true).identity(
        '1.2.3',
        'line',
      );
    expect(at({ TERM: 'xterm-256color' })).toContain(PAINTS.accent.ansi256);
    expect(at({ TERM: 'xterm' })).toContain(PAINTS.accent.ansi16);
  });

  it('renders periwinkle ring and gilt star in truecolour', () => {
    const paint = createPaint(
      { LANG: 'en_US.UTF-8', COLORTERM: 'truecolor' },
      true,
      100,
    );
    const block = paint.identity('1.2.3');
    expect(block.split('\n').filter(Boolean)).toHaveLength(5);
    expect(block).toContain(PAINTS.accent.truecolor);
    expect(block).toContain(PAINTS.secondary?.truecolor);
    expect(block).toContain('✦');
    expect(block).toContain('L O R E K E E P E R');
  });

  it('honours NO_COLOR without discarding Unicode', () => {
    const block = createPaint(
      { LANG: 'en_US.UTF-8', NO_COLOR: '1' },
      true,
      100,
    ).identity('1.2.3');
    expect(block).not.toContain(ESC);
    expect(block).toContain('╭───╮');
    expect(block).toContain('✦');
  });

  it('honours WW_ASCII independently of colour', () => {
    const block = createPaint(
      { LANG: 'en_US.UTF-8', COLORTERM: 'truecolor', WW_ASCII: '1' },
      true,
      100,
    ).identity('1.2.3');
    expect(block).toContain(PAINTS.accent.truecolor);
    expect(block).toContain('.---.');
    expect(block).toContain('*');
    expect(block).not.toContain('✦');
    expect(block).not.toContain('╭');
  });

  it('falls back to the line form in a narrow terminal', () => {
    const identity = createPaint(
      { LANG: 'en_US.UTF-8', COLORTERM: 'truecolor' },
      true,
      24,
    ).identity('1.2.3');
    expect(identity).toContain('L O R E K E E P E R');
    expect(identity).not.toContain('\n');
    expect(identity).not.toContain('✦');
  });
});

describe('the built binary', () => {
  const cli = join(REPO_ROOT, 'packages', 'cli', 'dist', 'lore.js');
  let brain: string;

  const lore = (args: string[], env: Record<string, string> = {}) =>
    spawnSync(process.execPath, [cli, ...args], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '', ...env },
    });

  beforeAll(() => {
    execFileSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'pipe' });
    brain = mkdtempSync(join(tmpdir(), 'lore-terminal-'));
    writeFileSync(join(brain, 'lamps.md'), '# Lamps\n\nA reading lamp.\n');
  });

  afterAll(() => {
    rmSync(brain, { recursive: true, force: true });
  });

  it('suppresses identity and escape bytes in pipes, even with FORCE_COLOR', () => {
    const baseline = lore(['--help']);
    const forced = lore(['--help'], { FORCE_COLOR: '3' });
    expect(baseline.status).toBe(0);
    expect(forced.stdout).toBe(baseline.stdout);
    expect(forced.stdout).not.toContain(ESC);
    expect(forced.stdout).not.toContain(PRODUCT.serial);
  });

  it('never decorates --version, JSON, or errors', () => {
    const forced = { FORCE_COLOR: '3', COLORTERM: 'truecolor' };
    expect(lore(['--version'], forced).stdout).toBe(lore(['--version']).stdout);

    const json = lore(['search', brain, 'lamp', '--json'], forced);
    expect(json.status).toBe(0);
    expect(json.stdout).toBe(lore(['search', brain, 'lamp', '--json']).stdout);
    expect(JSON.parse(json.stdout).count).toBe(1);
    expect(lore(['--bogus'], forced).stderr).not.toContain(ESC);
  });
});
