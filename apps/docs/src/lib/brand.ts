/**
 * Identity files read from `brand/`, the source of truth. Nothing here holds
 * a colour, a size or a path of its own: it reads what Feature 09 shipped.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The repository's brand/ directory. npm workspaces run the site from
 * apps/docs and the root test run from the repository root; both find it.
 */
export const BRAND =
  [
    resolve(process.cwd(), 'brand'),
    resolve(process.cwd(), '..', '..', 'brand'),
  ].find((dir) => existsSync(resolve(dir, 'tokens', 'tokens.json'))) ??
  resolve(process.cwd(), '..', '..', 'brand');

/** An SVG file for inlining: the XML comment block and outer whitespace removed. */
export function inlineSvg(relative: string): string {
  return readFileSync(resolve(BRAND, relative), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
}

/**
 * Make an inlined SVG's `<style>` apply to that SVG alone.
 *
 * Inside an HTML page an SVG's `<style>` is a document-wide stylesheet. The
 * three diagrams share class names (`.lk-d-code-gold` is 12px in one and 11px
 * in another), so two on one page would restyle each other. Every rule is
 * prefixed with `scope`.
 *
 * The `svg:root` blocks are dropped: they carry the palette for a diagram
 * opened on its own, they match nothing once inlined, and the page's
 * `--lk-*` tokens — which follow the environment lever — are what apply.
 */
export function scopeSvgStyle(svg: string, scope: string): string {
  return svg.replace(/<style>([\s\S]*?)<\/style>/g, (_, css: string) => {
    const standalone = css
      .replace(/@media[^{]*\{\s*svg:root\s*\{[^}]*\}\s*\}/g, '')
      .replace(/svg:root\s*\{[^}]*\}/g, '');
    const scoped = standalone.replace(
      /(^|\})(\s*)([^{}@]+?)(\s*)\{/g,
      (_m, close: string, lead: string, selectors: string, gap: string) =>
        `${close}${lead}${selectors
          .split(',')
          .map((s) => `${scope} ${s.trim()}`)
          .join(', ')}${gap}{`,
    );
    return `<style>${scoped}</style>`;
  });
}

interface Tokens {
  color: Record<'light' | 'dark', Record<string, { value: string }>>;
}

/** The page grounds, for the one place a literal colour is required: theme-color. */
export function pageGrounds(): { light: string; dark: string } {
  const tokens = JSON.parse(
    readFileSync(resolve(BRAND, 'tokens', 'tokens.json'), 'utf8'),
  ) as Tokens;
  return {
    light: tokens.color.light.page?.value ?? '',
    dark: tokens.color.dark.page?.value ?? '',
  };
}
