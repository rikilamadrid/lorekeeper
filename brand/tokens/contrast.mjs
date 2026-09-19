/**
 * WCAG 2.1 relative luminance and contrast ratio, implemented from the
 * specification and nothing else.
 *
 *   https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 *   https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 *
 * This file exists so the ratios recorded in `brand/CONTRAST.md` are measured
 * rather than asserted, and so anyone with Node can recompute them without
 * installing anything. It is pure arithmetic: no dependency, no I/O, no colour
 * library whose rounding we would have to trust.
 */

const HEX = /^#[0-9a-f]{6}$/i;

/** WCAG 2.1 minimum ratios, by what the pair is used for. */
export const REQUIREMENT = {
  /** Body text and any text below 18.66px bold / 24px regular. */
  text: 4.5,
  /** Large text: 18.66px bold or 24px regular and above. */
  'large-text': 3,
  /** Non-text: interface boundaries, focus indicators, meaningful graphics. */
  ui: 3,
};

/**
 * @param {string} hex a six-digit `#rrggbb` colour
 * @returns {[number, number, number]} channels in 0..255
 */
export function parseHex(hex) {
  if (typeof hex !== 'string' || !HEX.test(hex)) {
    throw new TypeError(`expected a #rrggbb colour, received ${String(hex)}`);
  }
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * @param {string} hex a six-digit `#rrggbb` colour
 * @returns {number} relative luminance in 0..1
 */
export function relativeLuminance(hex) {
  const [r, g, b] = parseHex(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * @param {string} a a six-digit `#rrggbb` colour
 * @param {string} b a six-digit `#rrggbb` colour
 * @returns {number} contrast ratio in 1..21
 */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Round toward zero at two decimals, so a recorded ratio never reads higher
 * than the ratio that was measured. A pair sitting at 4.497 must not be
 * published as 4.50 against a 4.5 requirement.
 *
 * @param {number} ratio
 * @returns {string}
 */
export function formatRatio(ratio) {
  return (Math.floor(ratio * 100) / 100).toFixed(2);
}

/**
 * @param {number} ratio
 * @param {keyof typeof REQUIREMENT} use
 * @returns {boolean}
 */
export function meets(ratio, use) {
  const required = REQUIREMENT[use];
  if (required === undefined) {
    throw new TypeError(`unknown contrast use ${String(use)}`);
  }
  return Math.floor(ratio * 100) / 100 >= required;
}
