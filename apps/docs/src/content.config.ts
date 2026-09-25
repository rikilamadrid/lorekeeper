/**
 * Feature 09's copy, consumed rather than rewritten.
 *
 * `brand/*.md` is the source for the narrative, the quickstart, the agent demo
 * and the measured proof. This loader splits each file at its `##` headings so
 * a page can place one section where it belongs, and renders each section with
 * Astro's own Markdown pipeline. The words are never edited here: a change to
 * the copy is a change to `brand/`, and the next build carries it.
 */

import { defineCollection } from 'astro:content';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Loader } from 'astro/loaders';
import { BRAND } from './lib/brand';
import { focusablePre, sections, slug } from './lib/sections';

const FILES = [
  'narrative',
  'quickstart',
  'agent-integration',
  'proof',
] as const;

/**
 * Render a section, with every code block reachable from the keyboard: a
 * `<pre>` scrolls sideways when a line is long (WCAG 2.1.1). The words are
 * untouched; only the element gains `tabindex`.
 */
async function render(
  renderMarkdown: (
    text: string,
  ) => Promise<{ html: string; metadata?: unknown }>,
  text: string,
) {
  const rendered = await renderMarkdown(text);
  return { ...rendered, html: focusablePre(rendered.html) };
}

const brandLoader: Loader = {
  name: 'lorekeeper-brand-copy',
  async load({ store, renderMarkdown, generateDigest, watcher }) {
    store.clear();
    for (const file of FILES) {
      const path = resolve(BRAND, `${file}.md`);
      watcher?.add(path);
      for (const { heading, body } of sections(readFileSync(path, 'utf8'))) {
        // The first paragraph, kept apart so a page may set it as its title
        // and render the rest beneath it — the same words, placed, not edited.
        const [lead = '', ...rest] = body.split(/\n\s*\n/);
        store.set({
          id: `${file}/${slug(heading)}`,
          data: {
            file: `brand/${file}.md`,
            heading,
            lead: lead.trim(),
            restHtml: (await render(renderMarkdown, rest.join('\n\n'))).html,
          },
          body,
          rendered: (await render(renderMarkdown, body)) as Awaited<
            ReturnType<typeof renderMarkdown>
          >,
          digest: generateDigest(body),
        });
      }
    }
  },
};

export const collections = {
  brand: defineCollection({ loader: brandLoader }),
};
