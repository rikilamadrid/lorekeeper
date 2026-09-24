/**
 * Every decorated byte the CLI can print, decided once from what the process
 * observed.
 *
 * Colour is a courtesy to a person at a terminal and nothing else. It never
 * carries meaning a reader would lose without it, and nothing a script reads
 * passes through here: `--version`, `--json`, and every piped, `NO_COLOR`, or
 * `TERM=dumb` run keep exactly the bytes they had before this module existed.
 *
 * The module is pure — it reads the `{ env, isTTY }` it is given and touches no
 * global — so the one place that observes the process stays `cli.ts`. The
 * accent and the serial come from `identity.ts`, which is generated; see
 * `brand/terminal/build.mjs`.
 */

import { BRAND, SERIAL } from './identity.js';

export type TerminalEnvironment = Readonly<Record<string, string | undefined>>;

export type ColorDepth = 0 | 4 | 8 | 24;

const RESET = '\u001B[0m';
const DIM = '\u001B[2m';

/**
 * May this run print colour? A sequence of refusals ending in the default.
 * `FORCE_COLOR=0` and `NO_COLOR` win, `TERM=dumb` is the terminal saying what
 * it is, `FORCE_COLOR` otherwise turns colour on without a TTY, and failing all
 * of those, colour is on exactly when output is a terminal.
 */
export function detectColor(env: TerminalEnvironment, isTTY: boolean): boolean {
  if (env.FORCE_COLOR === '0') return false;
  if (env.NO_COLOR !== undefined) return false;
  if (env.TERM === 'dumb') return false;
  if (env.FORCE_COLOR !== undefined) return true;
  return isTTY;
}

/** 0, 4, 8, or 24 bits, from what the environment volunteers. Nothing is probed. */
export function detectColorDepth(
  env: TerminalEnvironment,
  color: boolean,
): ColorDepth {
  if (!color) return 0;
  if (env.FORCE_COLOR === '3') return 24;
  if (env.FORCE_COLOR === '2') return 8;
  if (/^(truecolor|24bit)$/i.test(env.COLORTERM ?? '')) return 24;
  if (/-direct$/i.test(env.TERM ?? '')) return 24;
  if (/256color/i.test(env.TERM ?? '')) return 8;
  return 4;
}

export interface Paint {
  readonly color: boolean;
  readonly depth: ColorDepth;
  /** The product's name in its accent, at whatever depth the terminal claimed. */
  name(text: string): string;
  /**
   * The serial, dimmed, or `''` when colour is off. It is identity, not
   * information, so a run that must keep its old bytes simply does not get it.
   */
  serial(): string;
}

export function createPaint(env: TerminalEnvironment, isTTY: boolean): Paint {
  const color = detectColor(env, isTTY);
  const depth = detectColorDepth(env, color);
  const accent =
    depth === 24 ? BRAND.truecolor : depth === 8 ? BRAND.ansi256 : BRAND.ansi16;
  const wrap = (open: string) => (text: string) =>
    color ? `${open}${text}${RESET}` : text;
  const dim = wrap(DIM);

  return Object.freeze({
    color,
    depth,
    name: wrap(accent),
    serial: () => (color ? dim(SERIAL) : ''),
  });
}

/** What every caller that did not observe a terminal gets: no byte added. */
export const PLAIN: Paint = createPaint({}, false);
