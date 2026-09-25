import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';

/**
 * The public URL is not known until the Vercel project exists, so it is read
 * from the environment rather than written down: SITE_URL when set, else the
 * production domain Vercel exposes to every build. Local builds have neither,
 * and then canonical and Open Graph URLs are simply left out.
 */
const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const site =
  process.env.SITE_URL ??
  (productionHost ? `https://${productionHost}` : undefined);

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  ...(site ? { site } : {}),
  output: 'static',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  // Code is set in ink, one colour, as the reading room sets everything; a
  // syntax theme would bring a palette the tokens do not define.
  markdown: { syntaxHighlight: false },
  vite: {
    // brand/ is the identity source; the site reads it, it does not copy it.
    server: { fs: { allow: [repositoryRoot] } },
    // Icons stay files: a favicon or manifest icon inlined as a data URI
    // cannot be cached, fetched by the browser's installer, or served offline.
    build: { assetsInlineLimit: 0 },
  },
});
