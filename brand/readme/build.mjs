#!/usr/bin/env node
/**
 * Generate the README's header pair and its terminal specimen.
 *
 *   node brand/readme/build.mjs            write the generated files
 *   node brand/readme/build.mjs --check    fail if any of them is stale
 *   node brand/readme/build.mjs --capture  re-record lore --help from a pty
 *
 * Three sources, and only three. `brand/logo/lockup-horizontal.svg` supplies
 * the lockup, carried across unchanged and scaled 1.5x. `brand/tokens/tokens.json`
 * supplies every colour and every type stack. `brand/readme/lore-help.pty` is
 * the byte stream `lore --help` wrote to a real truecolour pseudo-terminal, as
 * `script` recorded it; the specimen is drawn from those bytes, not retyped.
 * No hex value is typed into this file, and every colour in the output is
 * audited against the token source.
 *
 * Text stays live `<text>` in the token stacks: no typeface is outlined or
 * shipped (`brand/IDENTITY.md`). The wordmark is the drawn one from the lockup.
 *
 * `--check` also proves the recording is still true: it runs the built binary
 * with `FORCE_COLOR=3`, which writes the same bytes the pty received less the
 * terminal's carriage returns, and fails if the help text or its colour has
 * changed since the recording. Build first (`npm run build`). `--capture`
 * needs a real `script` and re-records the fixture; run it, then the build.
 *
 * Nothing here reaches the network, reads a credential, or imports a
 * dependency.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BRAND = join(HERE, '..');
const ROOT = join(BRAND, '..');
// The bundled file npm ships, so the specimen shows the bytes users install.
const CLI = join(ROOT, 'packages/cli/dist/lore.js');
const FIXTURE = join(HERE, 'lore-help.pty');

const tokens = JSON.parse(
  readFileSync(join(BRAND, 'tokens/tokens.json'), 'utf8'),
);
const type = tokens.typography;

/**
 * The thesis the header sets, read from its source rather than restated: the
 * first paragraph of brand/narrative.md § The thesis, two sentences, one per
 * line. A change to the narrative reaches the header at the next build, and
 * `--check` reports the header stale until it does.
 */
const THESIS = (() => {
  const narrative = readFileSync(join(BRAND, 'narrative.md'), 'utf8');
  const section = /^## The thesis\n+([^\n]+(?:\n[^\n]+)*)/m.exec(narrative);
  if (section === null) throw new Error('brand/narrative.md has no thesis');
  const line = section[1].replace(/\s+/g, ' ').trim();
  const sentences = line.split(/(?<=\.) /);
  if (sentences.length !== 2) {
    throw new Error(
      `the thesis must be two sentences to set on two lines: ${line}`,
    );
  }
  return { line, sentences };
})();

/** The terminal a README reader is shown: 24-bit, 256-colour, dark. */
/** Control characters, spelled out so no regular expression has to hold one. */
const ESC = '\u001B';
const SCRIPT_EOF = /^\^D/;
const SGR_SPLIT = new RegExp(`(${ESC}\\[[0-9;]*m)`);
const SGR = new RegExp(`^${ESC}\\[([0-9;]*)m$`);

const TERMINAL_ENV = {
  TERM: 'xterm-256color',
  COLORTERM: 'truecolor',
};

/**
 * @param {'light' | 'dark'} variant
 * @param {string} name
 * @returns {string}
 */
function color(variant, name) {
  const entry = tokens.color[variant]?.[name];
  if (entry === undefined) {
    throw new Error(`no colour "${name}" in the ${variant} variant`);
  }
  return entry.value.toLowerCase();
}

/** @param {string} text */
function escapeXml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/**
 * The lockup's drawing, inked for one variant.
 *
 * Every paint in the lockup is a `var(--lk-NAME, FALLBACK)`. The fallback is
 * checked against the light token rather than used, exactly as the favicon
 * build does, so the two files cannot silently disagree about a colour.
 *
 * @param {'light' | 'dark'} variant
 * @returns {string[]} the drawing's lines, without the root element
 */
function lockupDrawing(variant) {
  const source = readFileSync(
    join(BRAND, 'logo/lockup-horizontal.svg'),
    'utf8',
  ).replace(/[ \t]*<!--[\s\S]*?-->\n?/g, '');
  const lines = source.split('\n').filter((line) => line.trim().length > 0);
  const start = lines.findIndex((line) => line.includes('</title>')) + 1;
  const end = lines.findIndex((line) => line.startsWith('</svg>'));
  return lines.slice(start, end).map((line) =>
    line.replace(
      /var\(--lk-([a-z0-9-]+), (#[0-9a-fA-F]{6})\)/g,
      (_match, name, fallback) => {
        if (fallback.toLowerCase() !== color('light', name)) {
          throw new Error(
            `the lockup falls back to ${fallback} for --lk-${name}, ` +
              `but the token source says ${color('light', name)}`,
          );
        }
        return color(variant, name);
      },
    ),
  );
}

/** The lockup's box, from its own root element. */
const LOCKUP = (() => {
  const source = readFileSync(
    join(BRAND, 'logo/lockup-horizontal.svg'),
    'utf8',
  );
  const match = /viewBox="0 0 ([0-9.]+) ([0-9.]+)"/.exec(source);
  if (match === null) throw new Error('the lockup has no viewBox');
  return { width: Number(match[1]), height: Number(match[2]) };
})();

/**
 * Header geometry, in the header's own 1200x240 units. The lockup is drawn at
 * 1.5x: mark 96, so its clear space is 48 on every side, and nothing below
 * sits inside it.
 */
const HEADER = {
  width: 1200,
  height: 240,
  scale: 1.5,
  lockupX: 72,
  ruleX: 644,
  textX: 692,
  rightX: 1128,
};

/** @param {'light' | 'dark'} variant */
function header(variant) {
  const h = HEADER;
  const lockupHeight = LOCKUP.height * h.scale;
  const lockupWidth = LOCKUP.width * h.scale;
  const lockupY = (h.height - lockupHeight) / 2;
  const clear = lockupHeight / 2;
  if (h.ruleX - (h.lockupX + lockupWidth) < clear || lockupY < clear) {
    throw new Error('something sits inside the lockup clear space');
  }
  const name = variant === 'light' ? 'day' : 'night';
  const drawing = lockupDrawing(variant).map((line) => `    ${line}`);
  return `<!--
  README header, ${name}: the shipped horizontal lockup at 1.5x on the page ground,
  the thesis, and the accession plate.

  GENERATED, do not edit. Sources: brand/logo/lockup-horizontal.svg for the
  lockup, brand/tokens/tokens.json (${tokens.version}) for colour and type,
  brand/narrative.md for the thesis.
  Regenerate with: npm run brand:readme
-->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${h.width} ${h.height}" width="${h.width}" height="${h.height}" role="img" aria-labelledby="lk-readme-${name}-title lk-readme-${name}-desc">
  <title id="lk-readme-${name}-title">Lorekeeper</title>
  <desc id="lk-readme-${name}-desc">The Lorekeeper lockup, a gold four-point star held in ${variant === 'light' ? 'an indigo' : 'a periwinkle'} ring beside the wordmark LOREKEEPER, on ${variant === 'light' ? 'warm parchment' : 'night blue-black'}. Beside it, after a thin rule, the line: ${THESIS.line} Bottom right, the accession plate: LK-047, a Wonder Wagon tool.</desc>
  <style>
    .page { fill: ${color(variant, 'page')}; }
    .rule { stroke: ${color(variant, 'line')}; }
    .thesis { fill: ${color(variant, 'ink')}; font-family: ${type.display.value}; font-size: 32px; letter-spacing: ${type.tracking.display}; }
    .plate { fill: ${color(variant, 'gold')}; font-family: ${type.sans.value}; font-size: 16px; font-weight: ${type.weight.heading}; letter-spacing: ${type.tracking.wordmark}; }
  </style>
  <rect class="page" width="${h.width}" height="${h.height}"/>
  <g transform="translate(${h.lockupX} ${lockupY}) scale(${h.scale})">
${drawing.join('\n')}
  </g>
  <line class="rule" x1="${h.ruleX + 0.5}" y1="${lockupY}" x2="${h.ruleX + 0.5}" y2="${lockupY + lockupHeight}" stroke-width="1.5"/>
  <text class="thesis" x="${h.textX}" y="108">${THESIS.sentences[0]}</text>
  <text class="thesis" x="${h.textX}" y="150">${THESIS.sentences[1]}</text>
  <text class="plate" x="${h.rightX}" y="204" text-anchor="end">LK-047 · A WONDER WAGON TOOL</text>
</svg>
`;
}

/**
 * Strip what `script` adds on macOS (a leading `^D` and two backspaces) and
 * the pty's carriage returns, leaving the bytes the program wrote.
 *
 * @param {string} recorded
 */
function programBytes(recorded) {
  const eof = SCRIPT_EOF.test(recorded)
    ? 2
    : recorded.startsWith('\u0004')
      ? 1
      : 0;
  const body =
    eof > 0 && recorded.slice(eof, eof + 2) === '\b\b'
      ? recorded.slice(eof + 2)
      : recorded;
  return body.replaceAll('\r', '');
}

/**
 * Split captured output into lines of styled runs. Only the SGR codes the CLI
 * can emit are interpreted, and anything else fails, so a new code cannot be
 * rendered wrongly by omission.
 *
 * @param {string} text
 * @returns {{ text: string, fg: string | null, dim: boolean }[][]}
 */
function styledLines(text) {
  /** @type {{ text: string, fg: string | null, dim: boolean }[][]} */
  const lines = [[]];
  let style = { fg: null, dim: false };
  for (const part of text.split(SGR_SPLIT)) {
    const code = SGR.exec(part);
    if (code === null) {
      const pieces = part.split('\n');
      pieces.forEach((piece, index) => {
        if (index > 0) lines.push([]);
        if (piece.length > 0) lines.at(-1)?.push({ text: piece, ...style });
      });
      continue;
    }
    const numbers = code[1].split(';').map(Number);
    if (numbers[0] === 0 || code[1] === '') style = { fg: null, dim: false };
    else if (numbers[0] === 2) style = { ...style, dim: true };
    else if (numbers[0] === 38 && numbers[1] === 2 && numbers.length === 5) {
      const hex = `#${numbers
        .slice(2)
        .map((n) => n.toString(16).padStart(2, '0'))
        .join('')}`;
      style = { ...style, fg: hex };
    } else throw new Error(`lore --help emitted an unexpected SGR: ${code[1]}`);
  }
  while (lines.length > 0 && lines.at(-1)?.length === 0) lines.pop();
  return lines;
}

/**
 * The specimen: the recorded bytes on the dark page. A truecolour code is
 * drawn as the colour it names, which must be a palette value; the terminal's
 * default foreground is drawn as `ink`, and SGR 2 (dim) as `muted` — the
 * palette's own dimmed text — rather than as an unmeasured opacity.
 */
function terminal() {
  const bytes = programBytes(readFileSync(FIXTURE, 'latin1'));
  const lines = styledLines(Buffer.from(bytes, 'latin1').toString('utf8'));
  const palette = Object.entries(tokens.color.dark);
  const classFor = (/** @type {string | null} */ fg, dim) => {
    if (fg !== null) {
      const match = palette.find(
        ([, entry]) => entry.value.toLowerCase() === fg,
      );
      if (match === undefined) {
        throw new Error(`lore --help paints ${fg}, not a dark palette value`);
      }
      return match[0];
    }
    return dim ? 'muted' : 'ink';
  };
  const used = new Set(['ink']);
  const size = 14;
  const leading = 20;
  const pad = 28;
  const width = 720;
  const height = pad * 2 + lines.length * leading - (leading - size);
  const rows = lines.map((runs, index) => {
    const y = pad + size + index * leading - 3;
    const spans = runs
      .map((run) => {
        const name = classFor(run.fg, run.dim);
        used.add(name);
        return name === 'ink'
          ? escapeXml(run.text)
          : `<tspan class="${name}">${escapeXml(run.text)}</tspan>`;
      })
      .join('');
    return `  <text x="${pad}" y="${y}" xml:space="preserve">${spans}</text>`;
  });
  const plain = lines
    .map((runs) => runs.map((run) => run.text).join(''))
    .join('\n');
  const rules = [...used]
    .filter((name) => name !== 'ink')
    .sort()
    .map((name) => `    .${name} { fill: ${color('dark', name)}; }`);
  return `<!--
  The lore help screen, as a truecolour terminal shows it.

  GENERATED, do not edit. Sources: brand/readme/lore-help.pty, the bytes the
  built binary wrote to a real pty (TERM=xterm-256color COLORTERM=truecolor),
  and brand/tokens/tokens.json (${tokens.version}) for the ground and type.
  Regenerate with: npm run brand:readme
-->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="lk-help-title lk-help-desc">
  <title id="lk-help-title">lore --help in a truecolour terminal</title>
  <desc id="lk-help-desc">The output of lore --help on a dark terminal. The product name Lorekeeper is in periwinkle and the closing serial LK-047 is dimmed; every other line is the terminal's plain text. The full output reads:
${escapeXml(plain)}</desc>
  <style>
    .ground { fill: ${color('dark', 'page')}; stroke: ${color('dark', 'line')}; }
    text { fill: ${color('dark', 'ink')}; font-family: ${type.mono.value}; font-size: ${size}px; white-space: pre; }
${rules.join('\n')}
  </style>
  <rect class="ground" x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="${Number.parseFloat(tokens.radius.md)}"/>
${rows.join('\n')}
</svg>
`;
}

/**
 * An XML comment may not contain a double hyphen; a generated file that holds
 * one is not well-formed and renders as an error.
 *
 * @param {string} file
 * @param {string} svg
 */
function auditComments(file, svg) {
  for (const comment of svg.match(/<!--([\s\S]*?)-->/g) ?? []) {
    if (comment.slice(4, -3).includes('--')) {
      throw new Error(`${file} has a comment containing "--"`);
    }
  }
}

/**
 * Every hex value in a generated file must be one the token source defines.
 *
 * @param {string} file
 * @param {string} svg
 */
function auditColors(file, svg) {
  const known = new Set(
    Object.values(tokens.color).flatMap((variant) =>
      Object.values(variant).map((entry) => entry.value.toLowerCase()),
    ),
  );
  for (const found of svg.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) {
    if (!known.has(found.toLowerCase())) {
      throw new Error(`${file} carries ${found}, which is not a palette value`);
    }
  }
}

function generate() {
  const files = [
    { path: 'header-day.svg', text: header('light') },
    { path: 'header-night.svg', text: header('dark') },
    { path: 'terminal-help.svg', text: terminal() },
  ];
  for (const file of files) {
    auditColors(file.path, file.text);
    auditComments(file.path, file.text);
  }
  return files;
}

function capture() {
  const command = ['node', CLI, '--help'];
  const args =
    process.platform === 'darwin'
      ? ['-q', FIXTURE, ...command]
      : ['-q', '-e', '-c', command.join(' '), FIXTURE];
  execFileSync('script', args, {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...TERMINAL_ENV },
    stdio: 'ignore',
  });
  process.stdout.write('recorded lore --help to brand/readme/lore-help.pty\n');
}

/** @returns {string[]} why the recording no longer matches the binary */
function recordingDrift() {
  if (!existsSync(CLI)) {
    return ['packages/cli/dist/lore.js is missing: run npm run build first'];
  }
  const live = execFileSync(process.execPath, [CLI, '--help'], {
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      ...TERMINAL_ENV,
      FORCE_COLOR: '3',
    },
    encoding: 'latin1',
  });
  const recorded = programBytes(readFileSync(FIXTURE, 'latin1'));
  return live === recorded
    ? []
    : [
        'brand/readme/lore-help.pty no longer matches lore --help: ' +
          'run npm run build, then node brand/readme/build.mjs --capture, ' +
          'then npm run brand:readme',
      ];
}

function main() {
  if (process.argv.includes('--capture')) {
    capture();
    return;
  }
  const files = generate();
  if (!process.argv.includes('--check')) {
    for (const file of files) writeFileSync(join(HERE, file.path), file.text);
    process.stdout.write(
      `wrote ${files.length} files to brand/readme/ from brand/logo/, ` +
        'brand/tokens/tokens.json and the lore --help recording\n',
    );
    return;
  }
  const problems = recordingDrift();
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const alt =
    /<img src="brand\/readme\/header-day\.svg"[^>]*alt="([^"]*)"/.exec(readme);
  if (alt === null || !alt[1].includes(THESIS.line)) {
    problems.push(
      'README.md: the header image alt text does not carry the thesis from brand/narrative.md',
    );
  }
  for (const file of files) {
    const path = join(HERE, file.path);
    if (!existsSync(path) || readFileSync(path, 'utf8') !== file.text) {
      problems.push(
        `STALE brand/readme/${file.path}: run npm run brand:readme`,
      );
    }
  }
  if (problems.length > 0) {
    for (const problem of problems) process.stderr.write(`${problem}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `brand readme check clean: ${files.length} files reproduce, ` +
      'and the lore --help recording matches the built binary\n',
  );
}

main();
