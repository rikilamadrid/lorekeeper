#!/usr/bin/env node
/**
 * Generate every derived visual asset from the approved vector mark.
 *
 *   node brand/assets/build.mjs           write the generated files
 *   node brand/assets/build.mjs --check   fail if any of them is stale
 *
 * Two sources, and only two: the vector logos in `brand/logo/` supply every
 * outline, and `brand/tokens/tokens.json` supplies every colour. Nothing here
 * is drawn by hand and no hex value is typed into this file, so a favicon
 * cannot drift from the mark and a generated asset cannot carry a colour the
 * palette does not define. Rasterising, PNG encoding, and the icon container
 * are written out in this directory rather than taken from a dependency: the
 * v0.1 boundary is an offline, dependency-free repository, and the byte-exact
 * reproducibility `--check` asserts is only true of a compressor that cannot
 * change underneath us. See `brand/assets/README.md`.
 *
 * Every raster is opaque and sits on `--lk-page`, one of the three grounds
 * `brand/IDENTITY.md` measures the two-colour mark against. A PNG cannot
 * follow the reader's colour scheme, and a transparent mark dropped on an
 * unknown ground is an unmeasured pairing; the two SVG favicons are the ones
 * that adapt, and they carry an explicit ink per variant rather than
 * inheriting one they would not find.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeIco } from './ico.mjs';
import { encodePng } from './png.mjs';
import { render } from './raster.mjs';
import { parsePaint, readSvg } from './svg.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BRAND = join(HERE, '..');
const LOGO = join(BRAND, 'logo');

const tokens = JSON.parse(
  readFileSync(join(BRAND, 'tokens/tokens.json'), 'utf8'),
);

/**
 * The generated set. `fraction` is how much of the canvas the source's own
 * viewBox is scaled to occupy, which is how each asset gets the breathing
 * room its context expects.
 */
const RASTERS = [
  // Favicons are the one place to spend every pixel: the mark's box already
  // clears its ink by 6 units on each side, and at 16px that is all the
  // padding there is room for.
  { file: 'favicon-16.png', source: 'mark.svg', size: 16, fraction: 1 },
  { file: 'favicon-32.png', source: 'mark.svg', size: 32, fraction: 1 },
  { file: 'favicon-48.png', source: 'mark.svg', size: 48, fraction: 1 },
  // Home-screen and installed-app icons are shown large and are rounded or
  // cropped by the platform, so the mark sits back from the edge.
  {
    file: 'apple-touch-icon.png',
    source: 'mark.svg',
    size: 180,
    fraction: 0.84,
  },
  { file: 'icon-192.png', source: 'mark.svg', size: 192, fraction: 0.84 },
  { file: 'icon-512.png', source: 'mark.svg', size: 512, fraction: 0.84 },
  // A maskable icon may be cropped to any shape inside a circle of 80% of the
  // canvas. The mark is drawn well inside that circle so no mask can clip it.
  {
    file: 'icon-maskable-512.png',
    source: 'mark.svg',
    size: 512,
    fraction: 0.72,
  },
];

/** GitHub's repository social preview: 1280x640, shown at half that or less. */
const SOCIAL = {
  file: 'social-preview.png',
  source: 'lockup-horizontal.svg',
  width: 1280,
  height: 640,
  fraction: 0.6875,
};

const FAVICON_SVGS = [
  {
    file: 'favicon.svg',
    source: 'mark.svg',
    summary:
      'The two-colour mark, inked per colour scheme rather than inherited.',
  },
  {
    file: 'favicon-mono.svg',
    source: 'mark-mono.svg',
    summary:
      'The one-colour mark for single-ink contexts, inked per colour scheme.',
  },
];

/**
 * @param {string} name a custom property name as written in a logo file
 * @returns {string} the token name without the palette's prefix
 */
function tokenName(name) {
  const prefix = `${tokens.prefix}-`;
  if (!name.startsWith(prefix)) {
    throw new Error(`"--${name}" is not a ${tokens.prefix} token`);
  }
  return name.slice(prefix.length);
}

/**
 * @param {string} variant
 * @param {string} name
 * @returns {string}
 */
function tokenValue(variant, name) {
  const entry = tokens.color[variant]?.[name];
  if (entry === undefined) {
    throw new Error(`no colour "${name}" in the ${variant} variant`);
  }
  return entry.value.toLowerCase();
}

/**
 * Resolve one paint reference against the token source.
 *
 * A literal fallback inside a `var()` is checked rather than used: if a logo
 * file's fallback ever stops matching the light palette, that is drift between
 * two files that both claim to state the same colour, and it fails here.
 *
 * `currentColor` has no value to inherit in a generated asset -- a favicon is
 * always an independent document -- so it resolves to the variant's `ink`,
 * explicitly. That is the rule `brand/IDENTITY.md` states for anything derived
 * from `mark-mono.svg`, and this is where it is kept.
 *
 * @param {object} paint
 * @param {string} variant
 * @returns {{ name: string, value: string }}
 */
function resolvePaint(paint, variant) {
  if (paint.kind === 'token') {
    const name = tokenName(paint.token);
    if (paint.fallback !== null) {
      const light = tokenValue('light', name);
      if (paint.fallback.toLowerCase() !== light) {
        throw new Error(
          `a logo file falls back to ${paint.fallback} for --${paint.token}, ` +
            `but the token source says ${light}`,
        );
      }
    }
    return { name, value: tokenValue(variant, name) };
  }
  if (paint.kind === 'current') {
    return { name: 'ink', value: tokenValue(variant, 'ink') };
  }
  if (paint.kind === 'literal') {
    const match = Object.entries(tokens.color[variant]).find(
      ([, entry]) => entry.value.toLowerCase() === paint.value.toLowerCase(),
    );
    if (match === undefined) {
      throw new Error(
        `the literal colour ${paint.value} is not in the token source`,
      );
    }
    return { name: match[0], value: match[1].value.toLowerCase() };
  }
  throw new Error('a shape asked for the colour of "none"');
}

/**
 * @param {string} hex
 * @returns {[number, number, number]}
 */
function rgbOf(hex) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * @param {string} source a file name in brand/logo
 * @returns {string}
 */
function logoSource(source) {
  return readFileSync(join(LOGO, source), 'utf8');
}

/**
 * Rasterise a logo onto an opaque ground.
 *
 * @param {{ source: string, width: number, height: number, fraction: number,
 *           variant: string }} request
 * @returns {Uint8Array} PNG bytes
 */
function rasterise({ source, width, height, fraction, variant }) {
  const { viewBox, shapes } = readSvg(logoSource(source));
  const scale = (width * fraction) / viewBox.width;
  const rgb = render({
    shapes,
    width,
    height,
    scale,
    offsetX: (width - viewBox.width * scale) / 2 - viewBox.x * scale,
    offsetY: (height - viewBox.height * scale) / 2 - viewBox.y * scale,
    background: rgbOf(tokenValue(variant, 'page')),
    colorOf: (paint) => rgbOf(resolvePaint(paint, variant).value),
  });
  return encodePng({ width, height, rgb });
}

/**
 * Derive a favicon SVG from a logo source.
 *
 * The geometry is carried across verbatim -- the same attributes, in the same
 * order, as the file `09.1` approved. Only the paint changes: each reference
 * becomes a class, and the classes are declared twice, once for each colour
 * scheme. That is what makes these files self-sufficient. A favicon is loaded
 * as a document of its own, with no page around it to supply a custom
 * property or a `currentColor`, so a value it does not state is a value it
 * does not have.
 *
 * @param {{ file: string, source: string, summary: string }} request
 * @returns {string}
 */
function deriveFaviconSvg({ source, summary }) {
  const text = logoSource(source).replace(/[ \t]*<!--[\s\S]*?-->\n?/g, '');
  const lines = text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  /** @type {Map<string, { property: string, token: string }>} */
  const rules = new Map();
  const painted = lines.map((line) => {
    if (!/^\s*<(circle|ellipse|path)\b/.test(line)) {
      return line;
    }
    const classes = [];
    const stripped = line.replace(
      /\s(fill|stroke)="(var\([^)]*\)|currentColor)"/g,
      (_match, property, value) => {
        const { name } = resolvePaint(parsePaint(value), 'light');
        const className = `${name}-${property}`;
        classes.push(className);
        rules.set(className, { property, token: name });
        return '';
      },
    );
    if (classes.length === 0) {
      return line;
    }
    return stripped.replace(/^(\s*<[a-z]+)/, `$1 class="${classes.join(' ')}"`);
  });

  const declarations = (variant, indent) =>
    [...rules.entries()]
      .map(
        ([className, rule]) =>
          `${indent}.${className} { ${rule.property}: ` +
          `${tokenValue(variant, rule.token)}; }`,
      )
      .join('\n');

  const style = [
    '  <style>',
    declarations('light', '    '),
    '    @media (prefers-color-scheme: dark) {',
    declarations('dark', '      '),
    '    }',
    '  </style>',
  ].join('\n');

  const notice = [
    '<!--',
    `  ${summary}`,
    '',
    `  GENERATED, do not edit. Source: brand/logo/${source} for the`,
    '  geometry and brand/tokens/tokens.json for the colour.',
    '  Regenerate with: node brand/assets/build.mjs',
    '-->',
  ].join('\n');

  const opening = painted.findIndex((line) => line.includes('</title>'));
  const body = [
    ...painted.slice(0, opening + 1),
    style,
    ...painted.slice(opening + 1),
  ];
  return `${notice}\n${body.join('\n')}\n`;
}

/**
 * Every hex value in a generated SVG must be one the token source defines.
 * The build already reads its colours from tokens only, so this asserts the
 * output rather than the intent -- the claim is about the file that ships.
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
  for (const found of svg.match(/#[0-9a-fA-F]{3,8}/g) ?? []) {
    if (!known.has(found.toLowerCase())) {
      throw new Error(`${file} carries ${found}, which is not a palette value`);
    }
  }
}

/**
 * @returns {{ path: string, bytes: Uint8Array }[]}
 */
function generate() {
  /** @type {{ path: string, bytes: Uint8Array }[]} */
  const artifacts = [];
  const encoder = new TextEncoder();

  for (const favicon of FAVICON_SVGS) {
    const svg = deriveFaviconSvg(favicon);
    auditColors(favicon.file, svg);
    artifacts.push({ path: favicon.file, bytes: encoder.encode(svg) });
  }

  /** @type {{ size: number, png: Uint8Array }[]} */
  const icoEntries = [];
  for (const icon of RASTERS) {
    const png = rasterise({
      source: icon.source,
      width: icon.size,
      height: icon.size,
      fraction: icon.fraction,
      variant: 'light',
    });
    artifacts.push({ path: icon.file, bytes: png });
    if (icon.file.startsWith('favicon-')) {
      icoEntries.push({ size: icon.size, png });
    }
  }
  artifacts.push({ path: 'favicon.ico', bytes: encodeIco(icoEntries) });

  artifacts.push({
    path: SOCIAL.file,
    bytes: rasterise({
      source: SOCIAL.source,
      width: SOCIAL.width,
      height: SOCIAL.height,
      fraction: SOCIAL.fraction,
      variant: 'light',
    }),
  });

  return artifacts;
}

function main() {
  const check = process.argv.includes('--check');
  const artifacts = generate();

  if (!check) {
    for (const artifact of artifacts) {
      writeFileSync(join(HERE, artifact.path), artifact.bytes);
    }
    process.stdout.write(
      `wrote ${artifacts.length} assets to brand/assets/ from ` +
        'brand/logo/ and brand/tokens/tokens.json\n',
    );
    return;
  }

  let stale = 0;
  for (const artifact of artifacts) {
    let actual = null;
    try {
      actual = readFileSync(join(HERE, artifact.path));
    } catch {
      actual = null;
    }
    const same =
      actual !== null &&
      actual.length === artifact.bytes.length &&
      actual.every((byte, index) => byte === artifact.bytes[index]);
    if (!same) {
      stale += 1;
      process.stderr.write(
        `STALE brand/assets/${artifact.path}: run node brand/assets/build.mjs\n`,
      );
    }
  }

  if (stale > 0) {
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `brand assets check clean: ${artifacts.length} assets reproduce ` +
      'byte for byte from the vector sources\n',
  );
}

main();
