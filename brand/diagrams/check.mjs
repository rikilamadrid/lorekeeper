#!/usr/bin/env node
/**
 * Check the Lorekeeper how-it-works diagrams against the token source.
 *
 *   node brand/diagrams/check.mjs
 *
 * The diagrams are hand-authored SVG, so nothing regenerates them and nothing
 * stops a colour, a token name, or a missing text alternative from drifting in
 * by hand. This is what stops it. It reads `brand/tokens/tokens.json` — the one
 * place the palette is defined — and fails if a diagram disagrees with it.
 *
 * What it verifies, per diagram:
 *
 *   1. Every colour literal lives in the `<style>` block and nowhere else. No
 *      element carries a `fill`, `stroke`, or `style` attribute, so a colour
 *      cannot be written directly onto a shape.
 *   2. Every literal in that block is a value the token source defines.
 *   3. Every `var(--lk-NAME, FALLBACK)` names a token the source defines, and
 *      the fallback is that token's *light* value — so a diagram inlined into
 *      an unthemed page still renders in the approved palette.
 *   4. The `svg:root` block declares the light value of every token the file
 *      uses, and the `prefers-color-scheme: dark` block declares the dark value
 *      of the same set. Neither block may declare a token the file never uses.
 *   5. The file carries a text alternative: `role="img"`, an `aria-labelledby`
 *      naming a `<title>` and a `<desc>` that both exist, and a `<desc>` long
 *      enough to describe the diagram rather than name it.
 *   6. Nothing reaches outside the file — no script, no external reference, no
 *      raster image. The diagrams are vector and offline, like the CLI.
 *
 * And across the set: every id is unique, so several diagrams can be inlined
 * into one page without colliding.
 *
 * It does not check layout or legibility. Those were verified by rendering each
 * diagram in both variants and looking at them; see `brand/diagrams.md`.
 *
 * Nothing here reaches the network, reads a credential, or imports a
 * dependency.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOKENS = join(HERE, '..', 'tokens', 'tokens.json');

/** A `<desc>` shorter than this is naming the diagram, not describing it. */
const MIN_DESCRIPTION = 200;

/** @type {string[]} */
const failures = [];

/**
 * @param {string} file
 * @param {string} message
 */
function fail(file, message) {
  failures.push(`${file}: ${message}`);
}

/** @returns {{ colors: Record<string, {light: string, dark: string}>, fonts: Record<string, string> }} */
function readTokens() {
  const tokens = JSON.parse(readFileSync(TOKENS, 'utf8'));
  /** @type {Record<string, {light: string, dark: string}>} */
  const colors = {};
  for (const [name, entry] of Object.entries(tokens.color.light)) {
    colors[name] = { light: entry.value, dark: tokens.color.dark[name]?.value };
  }
  /** @type {Record<string, string>} */
  const fonts = {};
  for (const name of ['display', 'sans', 'mono']) {
    fonts[name] = tokens.typography[name].value;
  }
  return { colors, fonts };
}

/**
 * Collapse runs of whitespace so a declaration wrapped across lines compares
 * equal to the same declaration on one line.
 *
 * @param {string} value
 * @returns {string}
 */
function normalize(value) {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * The first `svg:root { ... }` declaration block in a slice of CSS.
 *
 * @param {string} css
 * @returns {string | null}
 */
function svgRootBlock(css) {
  const start = css.indexOf('svg:root');
  if (start === -1) return null;
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  if (open === -1 || close === -1) return null;
  return css.slice(open + 1, close);
}

/**
 * @param {string} block
 * @returns {Record<string, string>}
 */
function customProperties(block) {
  /** @type {Record<string, string>} */
  const declared = {};
  for (const match of block.matchAll(/--lk-([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    declared[match[1]] = normalize(match[2]);
  }
  return declared;
}

/**
 * @param {string} name
 * @param {string} svg
 * @param {ReturnType<typeof readTokens>} tokens
 * @returns {string[]} the ids this file defines
 */
function checkDiagram(name, svg, tokens) {
  const styleOpen = svg.indexOf('<style>');
  const styleClose = svg.indexOf('</style>');
  if (styleOpen === -1 || styleClose === -1) {
    fail(name, 'has no <style> block, so it cannot carry the palette');
    return [];
  }
  const style = svg.slice(styleOpen + '<style>'.length, styleClose);
  const outside = svg.slice(0, styleOpen) + svg.slice(styleClose);

  // 1. Colour lives in the style block and nowhere else.
  for (const attribute of ['fill', 'stroke', 'style']) {
    if (new RegExp(`\\s${attribute}\\s*=`).test(outside)) {
      fail(
        name,
        `carries a "${attribute}" attribute on an element; style the shape with a class so the palette stays in one place`,
      );
    }
  }

  // 2 and 3. Every literal, and every var() fallback, comes from the source.
  const known = new Set();
  for (const entry of Object.values(tokens.colors)) {
    known.add(entry.light.toLowerCase());
    known.add(entry.dark.toLowerCase());
  }
  for (const match of style.matchAll(
    /#(?:[0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})(?![0-9A-Za-z])/g,
  )) {
    if (!known.has(match[0].toLowerCase())) {
      fail(
        name,
        `uses the colour ${match[0]}, which the token source does not define`,
      );
    }
  }

  /** @type {Set<string>} */
  const referenced = new Set();
  for (const match of svg.matchAll(/var\(--lk-([a-z0-9-]+)\s*,\s*([^)]*)\)/g)) {
    const token = match[1];
    const fallback = normalize(match[2]);
    referenced.add(token);
    if (tokens.colors[token]) {
      if (fallback.toLowerCase() !== tokens.colors[token].light.toLowerCase()) {
        fail(
          name,
          `falls back to "${fallback}" for --lk-${token}, but the light value is ${tokens.colors[token].light}`,
        );
      }
    } else if (tokens.fonts[token]) {
      if (fallback !== normalize(tokens.fonts[token])) {
        fail(
          name,
          `falls back to a type stack for --lk-${token} that is not the one in the token source`,
        );
      }
    } else {
      fail(
        name,
        `references --lk-${token}, which the token source does not define`,
      );
    }
  }
  if (/var\(--lk-[a-z0-9-]+\)/.test(svg)) {
    fail(
      name,
      'references a token with no fallback; inlined into an unthemed page that colour would not resolve',
    );
  }

  // 4. Both variants are declared, for exactly the colour tokens in use.
  const mediaAt = style.indexOf('@media');
  if (mediaAt === -1) {
    fail(
      name,
      'has no prefers-color-scheme block, so it cannot render its dark variant standing alone',
    );
    return [];
  }
  const lightBlock = svgRootBlock(style.slice(0, mediaAt));
  const darkBlock = svgRootBlock(style.slice(mediaAt));
  if (lightBlock === null || darkBlock === null) {
    fail(name, 'is missing an svg:root block in one of its two variants');
    return [];
  }
  const light = customProperties(lightBlock);
  const dark = customProperties(darkBlock);
  const usedColors = [...referenced]
    .filter((token) => tokens.colors[token])
    .sort();

  for (const [variant, declared, key] of [
    ['light', light, 'light'],
    ['dark', dark, 'dark'],
  ]) {
    const names = Object.keys(declared).sort();
    const missing = usedColors.filter((token) => !names.includes(token));
    const extra = names.filter((token) => !usedColors.includes(token));
    for (const token of missing) {
      fail(name, `uses --lk-${token} but never declares its ${variant} value`);
    }
    for (const token of extra) {
      fail(
        name,
        `declares a ${variant} value for --lk-${token} but never uses it`,
      );
    }
    for (const token of names) {
      const expected = tokens.colors[token]?.[key];
      if (
        expected &&
        declared[token].toLowerCase() !== expected.toLowerCase()
      ) {
        fail(
          name,
          `declares --lk-${token} as ${declared[token]} in ${variant}, but the token source says ${expected}`,
        );
      }
    }
  }

  // 5. A text alternative a reader who cannot see the diagram can use.
  if (!/\srole="img"/.test(svg)) {
    fail(name, 'does not declare role="img"');
  }
  const labelledBy = /\saria-labelledby="([^"]+)"/.exec(svg);
  if (labelledBy === null) {
    fail(
      name,
      'has no aria-labelledby, so its title and description are not announced',
    );
  } else {
    for (const id of labelledBy[1].split(/\s+/)) {
      if (!new RegExp(`id="${id}"`).test(svg)) {
        fail(
          name,
          `points aria-labelledby at "${id}", which no element carries`,
        );
      }
    }
  }
  const title = /<title[^>]*>([\s\S]*?)<\/title>/.exec(svg);
  const desc = /<desc[^>]*>([\s\S]*?)<\/desc>/.exec(svg);
  if (title === null) {
    fail(name, 'has no <title>');
  }
  if (desc === null) {
    fail(name, 'has no <desc>, so it carries no text alternative');
  } else if (normalize(desc[1]).length < MIN_DESCRIPTION) {
    fail(
      name,
      `has a <desc> of ${normalize(desc[1]).length} characters; a text alternative must describe the diagram, not name it`,
    );
  }

  // 6. Nothing reaches outside the file.
  for (const [pattern, why] of [
    [/<script/, 'contains a script'],
    [/<image/, 'embeds a raster image; the diagrams are vector'],
    [/xlink:href|\shref\s*=/, 'references something outside itself'],
    [/url\((["']?)(?:https?:)?\/\//, 'loads a remote resource'],
  ]) {
    if (pattern.test(svg)) {
      fail(name, why);
    }
  }

  return [...svg.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
}

const tokens = readTokens();
const diagrams = readdirSync(HERE)
  .filter((file) => file.endsWith('.svg'))
  .sort();

if (diagrams.length === 0) {
  console.error('No diagrams found in brand/diagrams.');
  process.exit(1);
}

/** @type {Map<string, string>} */
const idOwners = new Map();
for (const file of diagrams) {
  const svg = readFileSync(join(HERE, file), 'utf8');
  for (const id of checkDiagram(file, svg, tokens)) {
    const owner = idOwners.get(id);
    if (owner !== undefined) {
      failures.push(
        `${file}: reuses the id "${id}", already defined by ${owner}`,
      );
    } else {
      idOwners.set(id, file);
    }
  }
}

if (failures.length > 0) {
  console.error(`brand/diagrams: ${failures.length} problem(s).\n`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  console.error(
    '\nThe palette is brand/tokens/tokens.json. Fix the diagram, not the check.',
  );
  process.exit(1);
}

console.log(
  `brand/diagrams: ${diagrams.length} diagrams, ${idOwners.size} unique ids, every colour from brand/tokens/tokens.json, every diagram carrying a text alternative.`,
);
