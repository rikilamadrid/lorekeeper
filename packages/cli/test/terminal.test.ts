import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BRAND, SERIAL, SEVERITY } from '../src/identity.js';
import {
  createPaint,
  detectColor,
  detectColorDepth,
  PLAIN,
} from '../src/terminal.js';
import { usage } from '../src/usage.js';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const ESC = '\u001B';

describe('the generated identity', () => {
  it("is Lorekeeper's accent and the family serial, never a severity", () => {
    expect(SERIAL).toBe('LK-047');
    expect(BRAND.hex).toBe('#99A2F0');
    expect(BRAND.truecolor).toBe(`${ESC}[38;2;153;162;240m`);
    expect(BRAND.ansi256).toBe(`${ESC}[38;5;111m`);
    // Bright blue: not Forge's yellow floor and not any severity's colour.
    expect(BRAND.ansi16).toBe(`${ESC}[1m${ESC}[34m`);
    expect(SEVERITY).toEqual({
      ok: 'green',
      info: 'cyan',
      warn: 'yellow',
      bad: 'red',
    });
  });

  it('is current against its sources', () => {
    const result = spawnSync(
      process.execPath,
      [join(REPO_ROOT, 'brand', 'terminal', 'build.mjs'), '--check'],
      { encoding: 'utf8' },
    );
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });
});

describe('detectColor', () => {
  it('is a sequence of refusals ending in the TTY', () => {
    expect(detectColor({}, false)).toBe(false);
    expect(detectColor({}, true)).toBe(true);
    expect(detectColor({ NO_COLOR: '' }, true)).toBe(false);
    expect(detectColor({ FORCE_COLOR: '0' }, true)).toBe(false);
    expect(detectColor({ TERM: 'dumb' }, true)).toBe(false);
    expect(detectColor({ FORCE_COLOR: '1' }, false)).toBe(true);
    expect(detectColor({ NO_COLOR: '1', FORCE_COLOR: '3' }, true)).toBe(false);
  });

  it('takes its depth from what the terminal claims, and 0 when off', () => {
    expect(detectColorDepth({}, false)).toBe(0);
    expect(detectColorDepth({}, true)).toBe(4);
    expect(detectColorDepth({ TERM: 'xterm-256color' }, true)).toBe(8);
    expect(detectColorDepth({ COLORTERM: 'truecolor' }, true)).toBe(24);
    expect(detectColorDepth({ TERM: 'xterm-direct' }, true)).toBe(24);
    expect(detectColorDepth({ FORCE_COLOR: '2' }, true)).toBe(8);
  });
});

describe('paint', () => {
  it('adds no byte when colour is off', () => {
    expect(PLAIN.name('Lorekeeper')).toBe('Lorekeeper');
    expect(PLAIN.serial()).toBe('');
    expect(usage('1.2.3', PLAIN)).toBe(usage('1.2.3'));
    expect(usage('1.2.3')).not.toContain(ESC);
    expect(usage('1.2.3')).not.toContain(SERIAL);
  });

  it('paints the name at the depth the terminal claimed', () => {
    const at = (env: Record<string, string>) =>
      createPaint(env, true).name('Lorekeeper');
    expect(at({ COLORTERM: 'truecolor' })).toBe(
      `${BRAND.truecolor}Lorekeeper${ESC}[0m`,
    );
    expect(at({ TERM: 'xterm-256color' })).toBe(
      `${BRAND.ansi256}Lorekeeper${ESC}[0m`,
    );
    expect(at({ TERM: 'xterm' })).toBe(`${BRAND.ansi16}Lorekeeper${ESC}[0m`);
  });

  it('closes a coloured help with the serial and changes no other line', () => {
    const plain = usage('1.2.3').split('\n');
    const painted = usage(
      '1.2.3',
      createPaint({ COLORTERM: 'truecolor' }, true),
    ).split('\n');

    expect(painted[0]).toBe(`${BRAND.truecolor}Lorekeeper${ESC}[0m 1.2.3`);
    expect(painted.slice(1, plain.length)).toEqual(plain.slice(1));
    expect(painted.slice(plain.length)).toEqual([
      '',
      `${ESC}[2m${SERIAL}${ESC}[0m`,
    ]);
  });
});

describe('the built binary', () => {
  // The bundled file npm ships, so these cases run the bytes users install.
  const cli = join(REPO_ROOT, 'packages', 'cli', 'dist', 'lore.js');
  let brain: string;

  // A minimal environment, so nothing inherited from the developer's shell
  // decides colour: each case names the variables it means.
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

  it('prints no escape byte and no serial into a pipe', () => {
    const result = lore(['--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain(ESC);
    expect(result.stdout).not.toContain(SERIAL);
  });

  it('paints the name when colour is forced, and NO_COLOR outranks it', () => {
    const coloured = lore(['--help'], { FORCE_COLOR: '3' });
    expect(coloured.stdout.startsWith(`${BRAND.truecolor}Lorekeeper`)).toBe(
      true,
    );
    expect(coloured.stdout).toContain(SERIAL);

    const quiet = lore(['--help'], { FORCE_COLOR: '3', NO_COLOR: '1' });
    expect(quiet.stdout).toBe(lore(['--help']).stdout);
  });

  it('never paints what a script reads', () => {
    const forced = { FORCE_COLOR: '3', COLORTERM: 'truecolor' };

    const version = lore(['--version'], forced);
    expect(version.stdout).toBe(lore(['--version']).stdout);
    expect(version.stdout).not.toContain(ESC);

    const json = lore(['search', brain, 'lamp', '--json'], forced);
    expect(json.status).toBe(0);
    expect(json.stdout).toBe(lore(['search', brain, 'lamp', '--json']).stdout);
    expect(JSON.parse(json.stdout).count).toBe(1);

    const unknown = lore(['--bogus'], forced);
    expect(unknown.stderr).not.toContain(ESC);
  });
});
