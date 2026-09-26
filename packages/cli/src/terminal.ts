/**
 * Every decorated byte the CLI can print, decided once from what the process
 * observed.
 *
 * Colour is a courtesy to a person at a terminal and nothing else. It never
 * carries meaning a reader would lose without it. Contract and machine output
 * stay byte-exact; `NO_COLOR` removes escapes while retaining the mark's form,
 * and `WW_ASCII=1` independently selects its ASCII geometry.
 *
 * The module is pure — it reads the `{ env, isTTY }` it is given and touches no
 * global — so the one place that observes the process stays `cli.ts`. The
 * accent and the serial come from `identity.ts`, which is generated; see
 * `brand/terminal/build.mjs`.
 */

import { detectTerminal, PAINTS, renderCliIdentity } from './identity.js';

export type TerminalEnvironment = Readonly<Record<string, string | undefined>>;

export type ColorDepth = 0 | 4 | 8 | 24;

const RESET = '\u001B[0m';

export interface Paint {
  readonly color: boolean;
  readonly depth: ColorDepth;
  /** The product's name in its accent, at whatever depth the terminal claimed. */
  name(text: string): string;
  /** Render shared-family identity, or `''` for contract/machine output. */
  identity(version: string, form?: 'block' | 'line'): string;
}

export function createPaint(
  env: TerminalEnvironment,
  isTTY: boolean,
  columns?: number,
  platform?: string,
): Paint {
  const caps = detectTerminal({
    env,
    isTTY,
    ...(columns === undefined ? {} : { columns }),
    ...(platform === undefined ? {} : { platform }),
  });
  const color = caps.tier !== 'contract' && caps.depth !== 0;
  const depth = color ? caps.depth : 0;
  const accent =
    depth === 24
      ? PAINTS.accent.truecolor
      : depth === 8
        ? PAINTS.accent.ansi256
        : PAINTS.accent.ansi16;
  const wrap = (open: string) => (text: string) =>
    color ? `${open}${text}${RESET}` : text;
  return Object.freeze({
    color,
    depth,
    name: wrap(accent),
    identity: (version: string, form: 'block' | 'line' = 'block') =>
      renderCliIdentity({ version, caps, form }),
  });
}

/** What every caller that did not observe a terminal gets: no byte added. */
export const PLAIN: Paint = createPaint({}, false);
