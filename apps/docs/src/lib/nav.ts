/**
 * The site's twelve pages, in reading order.
 *
 * The list is the content scope `context/features/08-docs-pwa.md` fixes —
 * nothing beyond it — and each page says whether its copy is consumed from
 * Feature 09's `brand/*.md` or authored here from the shipped product. No page
 * is both, which is how "none authored twice" stays checkable.
 */

export type Origin = 'consumed' | 'authored';

export interface Page {
  readonly href: string;
  readonly title: string;
  /** One line, used for the page's meta description and the index. */
  readonly summary: string;
  readonly group: 'Begin' | 'Use' | 'Reference';
  readonly origin: Origin;
}

export const PAGES: readonly Page[] = [
  {
    href: '/',
    title: 'Thesis',
    summary:
      'You already wrote it down. Find the passage that answers. Why Lorekeeper exists.',
    group: 'Begin',
    origin: 'consumed',
  },
  {
    href: '/concepts/',
    title: 'Concepts',
    summary:
      'Plain files you own, deterministic retrieval, and the agent you already use.',
    group: 'Begin',
    origin: 'consumed',
  },
  {
    href: '/install/',
    title: 'Installation',
    summary: 'What Lorekeeper needs, and how to put lore on your PATH.',
    group: 'Begin',
    origin: 'consumed',
  },
  {
    href: '/quickstart/',
    title: 'Quick start',
    summary: 'From nothing to a working lore search in about five minutes.',
    group: 'Begin',
    origin: 'consumed',
  },
  {
    href: '/knowledge-structure/',
    title: 'Knowledge structure',
    summary:
      'Folders, frontmatter, and the manifest that says which files are yours.',
    group: 'Use',
    origin: 'authored',
  },
  {
    href: '/capture/',
    title: 'Capture',
    summary: 'Filing a thought or a URL so it is still worth finding later.',
    group: 'Use',
    origin: 'authored',
  },
  {
    href: '/retrieval/',
    title: 'Retrieval',
    summary:
      'Spans, several wordings, fused rankings, and what a score cannot say.',
    group: 'Use',
    origin: 'authored',
  },
  {
    href: '/adoption/',
    title: 'Existing vaults',
    summary: 'Adopting a Markdown or Obsidian vault without migrating it.',
    group: 'Use',
    origin: 'authored',
  },
  {
    href: '/agents/',
    title: 'Agent integration',
    summary: 'The AGENTS.md that makes a coding agent search before it asks.',
    group: 'Use',
    origin: 'authored',
  },
  {
    href: '/provenance/',
    title: 'Provenance',
    summary:
      'Where a note came from, who owns each file, and why edges point back.',
    group: 'Reference',
    origin: 'authored',
  },
  {
    href: '/cli/',
    title: 'CLI reference',
    summary: 'Every lore command and flag, read from the built binary.',
    group: 'Reference',
    origin: 'authored',
  },
  {
    href: '/troubleshooting/',
    title: 'Troubleshooting',
    summary: 'What each refusal means, and what to do about it.',
    group: 'Reference',
    origin: 'authored',
  },
];

export const GROUPS = ['Begin', 'Use', 'Reference'] as const;

/**
 * The page the service worker serves for an address it never cached. It is
 * not content, so it is not in the index or the pager.
 */
export const OFFLINE: Page = {
  href: '/offline/',
  title: 'Not saved for offline reading',
  summary:
    'This page was not saved on this device, and there is no connection.',
  group: 'Reference',
  origin: 'authored',
};

export function pageFor(href: string): Page {
  if (href === OFFLINE.href) return OFFLINE;
  const page = PAGES.find((p) => p.href === href);
  if (!page) throw new Error(`No page is registered at ${href}`);
  return page;
}

export const REPOSITORY = 'https://github.com/rikilamadrid/lorekeeper';
export const FAMILY = 'https://github.com/rikilamadrid/wonder-wagon-ui';
