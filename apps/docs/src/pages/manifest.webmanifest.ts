/**
 * The web app manifest. Icons are Feature 09's, reserved in
 * brand/assets/README.md for this manifest; the two colours are the page
 * grounds from tokens.json. Nothing here is a value of its own.
 */

import type { APIRoute } from 'astro';
import icon192 from '../../../../brand/assets/icon-192.png?url';
import icon512 from '../../../../brand/assets/icon-512.png?url';
import maskable512 from '../../../../brand/assets/icon-maskable-512.png?url';
import { pageGrounds } from '../lib/brand';
import { PAGES } from '../lib/nav';

export const GET: APIRoute = () => {
  const grounds = pageGrounds();
  const manifest = {
    name: 'Lorekeeper',
    short_name: 'Lorekeeper',
    description: PAGES[0]?.summary,
    lang: 'en',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: grounds.light,
    theme_color: grounds.light,
    icons: [
      { src: icon192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: icon512, sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: maskable512,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
  return new Response(`${JSON.stringify(manifest, null, 2)}\n`, {
    headers: { 'Content-Type': 'application/manifest+json' },
  });
};
