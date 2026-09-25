import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inlineSvg, scopeSvgStyle } from '../src/lib/brand.js';
import { DEMO_WORDINGS } from '../src/lib/demo.js';
import { OFFLINE, PAGES, pageFor } from '../src/lib/nav.js';
import { focusablePre, sections, slug } from '../src/lib/sections.js';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const PAGES_DIR = resolve(import.meta.dirname, '..', 'src', 'pages');

describe('the page list', () => {
  it('is exactly the twelve items the docs feature fixes, each with a page file', () => {
    expect(PAGES.map((p) => p.title)).toEqual([
      'Thesis',
      'Concepts',
      'Installation',
      'Quick start',
      'Knowledge structure',
      'Capture',
      'Retrieval',
      'Existing vaults',
      'Agent integration',
      'Provenance',
      'CLI reference',
      'Troubleshooting',
    ]);
    const files = new Set(readdirSync(PAGES_DIR));
    for (const { href } of PAGES) {
      const file =
        href === '/' ? 'index.astro' : `${href.replaceAll('/', '')}.astro`;
      expect(files.has(file), file).toBe(true);
    }
  });

  it('keeps the offline page out of the index', () => {
    expect(PAGES.some((p) => p.href === OFFLINE.href)).toBe(false);
    expect(pageFor(OFFLINE.href)).toBe(OFFLINE);
    expect(() => pageFor('/nowhere/')).toThrow();
  });
});

describe('the brand copy loader', () => {
  it('splits at ## outside fences and drops the preamble', () => {
    const text =
      '# T\npreamble\n## One\na\n```\n## not a heading\n```\n## Two\nb\n';
    expect(sections(text)).toEqual([
      { heading: 'One', body: 'a\n```\n## not a heading\n```' },
      { heading: 'Two', body: 'b' },
    ]);
    expect(slug('Where v0.1 stops')).toBe('where-v0-1-stops');
  });

  it('finds every brand section a page names', () => {
    const ids = new Set<string>();
    for (const file of [
      'narrative',
      'quickstart',
      'agent-integration',
      'proof',
    ]) {
      const text = readFileSync(join(ROOT, 'brand', `${file}.md`), 'utf8');
      for (const { heading } of sections(text))
        ids.add(`${file}/${slug(heading)}`);
    }
    for (const page of readdirSync(PAGES_DIR).filter((f) =>
      f.endsWith('.astro'),
    )) {
      const source = readFileSync(join(PAGES_DIR, page), 'utf8');
      for (const [, id] of source.matchAll(/BrandSection id="([^"]+)"/g)) {
        expect(ids.has(id ?? ''), `${page}: ${id}`).toBe(true);
      }
    }
  });
});

describe('code blocks', () => {
  it('are reachable from the keyboard, once', () => {
    expect(focusablePre('<pre class="a"><code>x</code></pre>')).toBe(
      '<pre tabindex="0" class="a"><code>x</code></pre>',
    );
    expect(focusablePre('<pre tabindex="0">x</pre>')).toBe(
      '<pre tabindex="0">x</pre>',
    );
  });
});

describe('inlined diagrams', () => {
  it('scope every rule to their own figure and drop the standalone palette', () => {
    const svg = scopeSvgStyle(inlineSvg('diagrams/retrieval-path.svg'), '.d');
    const css = /<style>([\s\S]*?)<\/style>/.exec(svg)?.[1] ?? '';
    expect(css).not.toContain('svg:root');
    const selectors = [...css.matchAll(/([^{}]+)\{/g)].map((m) =>
      (m[1] ?? '').trim(),
    );
    expect(selectors.length).toBeGreaterThan(5);
    for (const s of selectors)
      for (const part of s.split(','))
        expect(part.trim().startsWith('.d ')).toBe(true);
  });
});

describe('the retrieval examples', () => {
  it('ask the agent demo’s own wordings', () => {
    const demo = readFileSync(
      join(ROOT, 'brand', 'demo', 'agent-demo.mjs'),
      'utf8',
    );
    for (const wording of DEMO_WORDINGS) expect(demo).toContain(`'${wording}'`);
  });
});

/**
 * The theme bridge, held to Lorekeeper's own tokens role by role.
 *
 * `theme:check` proves the bridge equals the Wonder Wagon package; this proves
 * the bridge means what tokens.json means, and it needs no sibling checkout,
 * so it also runs wherever the site builds.
 */
describe('the Wonder Wagon theme bridge', () => {
  const STYLES = resolve(import.meta.dirname, '..', 'src', 'styles');
  const bridge = readFileSync(
    join(STYLES, 'wonder-wagon-lorekeeper.css'),
    'utf8',
  );
  const tokens = JSON.parse(
    readFileSync(join(ROOT, 'brand', 'tokens', 'tokens.json'), 'utf8'),
  ) as {
    color: Record<'light' | 'dark', Record<string, { value: string }>>;
  };
  const token = (scheme: 'light' | 'dark', name: string) =>
    tokens.color[scheme][name]?.value.toUpperCase();

  function block(selector: string): Record<string, string> {
    const at = bridge.indexOf(selector);
    expect(at, selector).toBeGreaterThan(-1);
    const body = bridge.slice(
      bridge.indexOf('{', at) + 1,
      bridge.indexOf('}', at),
    );
    return Object.fromEntries(
      [...body.matchAll(/(--ww-[a-z-]+):\s*([^;]+);/g)].map((m) => [
        m[1],
        (m[2] ?? '').trim().toUpperCase(),
      ]),
    );
  }
  const day = block(':root, [data-ww-env="day"]');
  const night = block('[data-ww-env="night"]');
  const auto = block('[data-ww-env="auto"]');

  it('restates Lorekeeper’s own values for every role the site draws', () => {
    expect(day['--ww-accent']).toBe(token('light', 'accent'));
    expect(night['--ww-accent']).toBe(token('dark', 'accent'));
    expect(day['--ww-accent-ink']).toBe(token('light', 'accent-ink'));
    expect(night['--ww-accent-ink']).toBe(token('dark', 'accent-ink'));
    expect(day['--ww-signal']).toBe(token('light', 'gold'));
    expect(night['--ww-signal']).toBe(token('dark', 'gold'));
    expect(day['--ww-link']).toBe(token('light', 'accent'));
    expect(night['--ww-link']).toBe(token('dark', 'accent'));
  });

  it('keeps enamel and the readable accent as two roles at night', () => {
    expect(night['--ww-m-enamel']).toBe('#5D64C3');
    expect(night['--ww-accent']).toBe('#99A2F0');
    expect(night['--ww-m-enamel']).not.toBe(night['--ww-accent']);
  });

  it('gives the system-dark environment exactly the night values', () => {
    expect(auto).toEqual(night);
  });

  it('is the only way a --ww-* value reaches the page, and only for the family chrome', () => {
    const site = readFileSync(join(STYLES, 'site.css'), 'utf8');
    const used = new Set(
      [...site.matchAll(/var\((--ww-[a-z-]+)\)/g)].map((m) => m[1]),
    );
    expect([...used].sort()).toEqual([
      '--ww-accent',
      '--ww-accent-ink',
      '--ww-signal',
    ]);
  });

  it('leaves no colour literal in the site’s own sources', () => {
    const files = [
      'styles/site.css',
      'layouts/Base.astro',
      ...readdirSync(join(PAGES_DIR, '..', 'components')).map(
        (f) => `components/${f}`,
      ),
    ];
    for (const file of files) {
      const text = readFileSync(resolve(PAGES_DIR, '..', file), 'utf8');
      expect(
        text.match(/(?<![&\w])#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])/g),
        file,
      ).toBeNull();
    }
  });
});
