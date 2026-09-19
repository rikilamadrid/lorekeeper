#!/usr/bin/env node
/**
 * Generate the Lorekeeper token CSS and the measured contrast record from
 * `brand/tokens/tokens.json`.
 *
 *   node brand/tokens/build.mjs           write the generated files
 *   node brand/tokens/build.mjs --check   fail if they are stale or a pair
 *                                         misses its WCAG 2.1 AA requirement
 *
 * Two outputs, one source. `tokens.json` is the only file anyone edits; the
 * CSS is what a framework consumes and `brand/CONTRAST.md` is the evidence
 * that the palette was measured rather than asserted. Nothing here reaches the
 * network, reads a credential, or imports a dependency.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrastRatio, formatRatio, meets, REQUIREMENT } from './contrast.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BRAND = join(HERE, '..');
const SOURCE = join(HERE, 'tokens.json');
const CSS_OUT = join(HERE, 'tokens.css');
const CONTRAST_OUT = join(BRAND, 'CONTRAST.md');

const VARIANTS = ['light', 'dark'];

/** @returns {import('node:fs').PathLike extends never ? never : any} */
function readTokens() {
  return JSON.parse(readFileSync(SOURCE, 'utf8'));
}

/**
 * @param {Record<string, unknown>} tokens
 * @param {string} variant
 * @param {string} name
 * @returns {string}
 */
function colorValue(tokens, variant, name) {
  const entry = tokens.color[variant]?.[name];
  if (entry === undefined) {
    throw new Error(`no colour "${name}" in the ${variant} variant`);
  }
  return entry.value;
}

/**
 * @param {Record<string, unknown>} tokens
 * @param {string} variant
 * @param {string} indent
 * @returns {string}
 */
function colorBlock(tokens, variant, indent) {
  const prefix = tokens.prefix;
  const lines = [`${indent}color-scheme: ${variant};`];
  for (const [name, entry] of Object.entries(tokens.color[variant])) {
    lines.push(`${indent}--${prefix}-${name}: ${entry.value.toLowerCase()};`);
  }
  return lines.join('\n');
}

/**
 * @param {Record<string, unknown>} tokens
 * @returns {string}
 */
function renderCss(tokens) {
  const p = tokens.prefix;
  const t = tokens.typography;
  const base = [
    `  --${p}-display: ${t.display.value};`,
    `  --${p}-sans: ${t.sans.value};`,
    `  --${p}-mono: ${t.mono.value};`,
    '',
    ...Object.entries(t.scale).map(
      ([name, value]) =>
        `  --${p}-text-${name.replace('step-', '')}: ${value};`,
    ),
    '',
    ...Object.entries(t.leading).map(
      ([name, value]) => `  --${p}-leading-${name}: ${value};`,
    ),
    ...Object.entries(t.tracking).map(
      ([name, value]) => `  --${p}-tracking-${name}: ${value};`,
    ),
    ...Object.entries(t.weight).map(
      ([name, value]) => `  --${p}-weight-${name}: ${value};`,
    ),
    `  --${p}-measure: ${t.measure};`,
    '',
    ...Object.entries(tokens.space).map(
      ([name, value]) => `  --${p}-space-${name}: ${value};`,
    ),
    '',
    ...Object.entries(tokens.radius).map(
      ([name, value]) => `  --${p}-radius-${name}: ${value};`,
    ),
  ].join('\n');

  return `/*
 * Lorekeeper identity tokens — GENERATED, do not edit.
 *
 * Source:    brand/tokens/tokens.json
 * Regenerate: node brand/tokens/build.mjs
 * Contrast:   brand/CONTRAST.md, measured by brand/tokens/contrast.mjs
 *
 * Light is the written default so a consumer that sets nothing still gets a
 * readable page. The system preference is followed unless the document opts
 * out with data-${p}-theme="light", and an explicit data-${p}-theme="dark"
 * wins over both because it sits on the element.
 */

:root {
${colorBlock(tokens, 'light', '  ')}

${base}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-${p}-theme="light"]) {
${colorBlock(tokens, 'dark', '    ')}
  }
}

:root[data-${p}-theme="dark"] {
${colorBlock(tokens, 'dark', '  ')}
}
`;
}

/**
 * @param {Record<string, unknown>} tokens
 * @returns {{ variant: string, foreground: string, background: string,
 *             use: string, required: number | null, ratio: number,
 *             passes: boolean }[]}
 */
function measure(tokens) {
  const rows = [];
  for (const variant of VARIANTS) {
    for (const pair of tokens.pairs) {
      const fg = colorValue(tokens, variant, pair.foreground);
      const bg = colorValue(tokens, variant, pair.background);
      const ratio = contrastRatio(fg, bg);
      const required = REQUIREMENT[pair.use] ?? null;
      rows.push({
        variant,
        foreground: pair.foreground,
        background: pair.background,
        foregroundValue: fg,
        backgroundValue: bg,
        use: pair.use,
        required,
        ratio,
        passes: required === null ? true : meets(ratio, pair.use),
      });
    }
  }
  return rows;
}

/**
 * @param {ReturnType<typeof measure>} rows
 * @param {string} variant
 * @param {boolean} decorative
 * @returns {string}
 */
function table(rows, variant, decorative) {
  const wanted = rows.filter(
    (row) => row.variant === variant && (row.required === null) === decorative,
  );
  const head = decorative
    ? '| Foreground | Background | Measured |\n| --- | --- | --- |'
    : '| Foreground | Background | Use | Requires | Measured | Result |\n| --- | --- | --- | --- | --- | --- |';
  const body = wanted.map((row) => {
    const fg = `\`--lk-${row.foreground}\` \`${row.foregroundValue}\``;
    const bg = `\`--lk-${row.background}\` \`${row.backgroundValue}\``;
    if (decorative) {
      return `| ${fg} | ${bg} | ${formatRatio(row.ratio)}:1 |`;
    }
    const verdict = row.passes ? 'pass' : 'FAIL';
    return `| ${fg} | ${bg} | ${row.use} | ${row.required}:1 | ${formatRatio(row.ratio)}:1 | ${verdict} |`;
  });
  return [head, ...body].join('\n');
}

/**
 * @param {ReturnType<typeof measure>} rows
 * @returns {string}
 */
function renderContrast(rows) {
  const failures = rows.filter((row) => !row.passes).length;
  return `# Contrast

GENERATED, do not edit. Source: \`brand/tokens/tokens.json\`. Regenerate with
\`node brand/tokens/build.mjs\`, or check without writing with
\`npm run brand:check\`.

Every ratio below was computed by \`brand/tokens/contrast.mjs\`, which
implements the WCAG 2.1 definitions of relative luminance and contrast ratio
and nothing else. Ratios are rounded **toward zero** at two decimals, so a
published figure never reads higher than what was measured.

WCAG 2.1 AA asks for 4.5:1 for body text and 3:1 for non-text interface
boundaries and focus indicators. Pairs are listed by role, in both variants.
A pair that failed would have been changed or removed rather than published
with a caveat; the check below is what enforces that.

- Pairs measured: ${rows.length}
- Failing: ${failures}

## Light

${table(rows, 'light', false)}

## Dark

${table(rows, 'dark', false)}

## Decorative hairlines

\`--lk-line\` is a decorative rule. It carries no information on its own and is
never the only signal that something is separate, disabled, or selected; a
boundary that must be perceivable uses \`--lk-line-strong\`, which is measured
against the 3:1 requirement above. These values are recorded for completeness,
not held to a requirement.

### Light

${table(rows, 'light', true)}

### Dark

${table(rows, 'dark', true)}
`;
}

function main() {
  const check = process.argv.includes('--check');
  const tokens = readTokens();
  const rows = measure(tokens);
  const css = renderCss(tokens);
  const contrast = renderContrast(rows);

  const failures = rows.filter((row) => !row.passes);
  for (const row of failures) {
    process.stderr.write(
      `FAIL ${row.variant}: ${row.foreground} on ${row.background} ` +
        `is ${formatRatio(row.ratio)}:1, ${row.use} needs ${row.required}:1\n`,
    );
  }

  if (!check) {
    writeFileSync(CSS_OUT, css);
    writeFileSync(CONTRAST_OUT, contrast);
    process.stdout.write(
      `wrote brand/tokens/tokens.css and brand/CONTRAST.md ` +
        `(${rows.length} pairs measured, ${failures.length} failing)\n`,
    );
    if (failures.length > 0) {
      process.exitCode = 1;
    }
    return;
  }

  let stale = 0;
  for (const [path, expected] of [
    ['brand/tokens/tokens.css', { file: CSS_OUT, text: css }],
    ['brand/CONTRAST.md', { file: CONTRAST_OUT, text: contrast }],
  ]) {
    let actual = '';
    try {
      actual = readFileSync(expected.file, 'utf8');
    } catch {
      actual = '';
    }
    if (actual !== expected.text) {
      stale += 1;
      process.stderr.write(`STALE ${path}: run node brand/tokens/build.mjs\n`);
    }
  }

  if (failures.length > 0 || stale > 0) {
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `brand tokens check clean: ${rows.length} pairs measured, ` +
      'every text and UI pair at WCAG 2.1 AA or better\n',
  );
}

main();
