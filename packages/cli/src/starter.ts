/**
 * The content `lore init` writes into a new brain.
 *
 * Static text, deliberately. Nothing here is templated with a timestamp, a
 * username, or a version, so two runs of the same toolkit produce byte-identical
 * files and a manifest hash means what it says.
 *
 * The folders carry epistemic role and nothing else: no numbers, no `archive/`,
 * no `system/`. Meaning lives in frontmatter, so this layout is a browsing
 * convenience the user is free to change — which is exactly why the starter
 * text says so rather than presenting the folders as structure to obey.
 *
 * The starter files carry no frontmatter. They are documentation about the
 * brain, not knowledge inside it, and a `type` on them would invent vocabulary
 * that v0.1 has deliberately left unfrozen.
 */

export interface StarterFile {
  /** Brain-relative POSIX path. */
  readonly path: string;
  readonly content: string;
}

/** Folders the brain is created with, in the order they are explained. */
export const STARTER_FOLDERS: readonly string[] = [
  'inbox',
  'daily',
  'notes',
  'sources',
  'entities',
];

const ROOT_README = `# Your brain

Plain Markdown files that you own. Every one of them is readable without any
tool installed, including this one, and nothing here depends on a network, an
account, or an AI provider.

## The folders

- \`inbox/\` — things you captured and have not processed yet. An unprocessed
  capture is still useful: it says where it came from and when.
- \`daily/\` — dated entries. One file per day, if you want them.
- \`notes/\` — what you have worked out. Synthesized, in your own words.
- \`sources/\` — external things you took in: an article, a video, a talk. The
  raw artifact and where it came from.
- \`entities/\` — the projects, areas, and people your notes keep referring to.

The folders are a browsing convenience. Meaning lives in each file's
frontmatter, not in its path, so you can reorganize them without breaking
anything.

## Who owns what

\`.lorekeeper/manifest.json\` lists the files this toolkit wrote. Everything
else in this directory is yours. Files that are not in that list are never
rewritten, moved, or reformatted by \`lore\` — including any notes that were
here before it was.

If you edit one of the toolkit's own files, \`lore\` will tell you it changed
and leave your version alone.
`;

const FOLDER_READMES: readonly StarterFile[] = [
  {
    path: 'inbox/README.md',
    content: `# inbox

Things you captured and have not processed yet.

Whatever lands here should make sense on its own — what it is, and when it
arrived — so that a file you never get around to processing is still worth
finding later.

Nothing expires. An item stays here until you decide where it belongs.
`,
  },
  {
    path: 'daily/README.md',
    content: `# daily

Dated entries, one file per day.

What happened, what you were thinking about, what you want to remember. A
daily entry is a place to write before you know what the note is.

Nothing requires you to keep one.
`,
  },
  {
    path: 'notes/README.md',
    content: `# notes

What you have worked out, written in your own words.

A note is yours even when it came from somewhere: record what it was derived
from and the trail back to the original stays readable. A note with no recorded
origin simply means the origin is unknown or unrecorded — never that the
thought was necessarily your own.
`,
  },
  {
    path: 'sources/README.md',
    content: `# sources

External things you took in: an article, a video, a talk, a conversation.

A source keeps the raw material and where it came from — a stable identifier
and the URL — so that a note derived from it can point back here and still
resolve after the file is renamed.

Keep these close to what the source actually said. What you make of it belongs
in \`notes/\`.
`,
  },
  {
    path: 'entities/README.md',
    content: `# entities

The projects, areas, and people your notes keep referring to.

An entity is a thing worth naming once so that everything else can point at it.
It does not need to be long; often a couple of lines and a name is the whole
value.
`,
  },
];

/** Every file init writes, apart from the manifest itself. */
export const STARTER_FILES: readonly StarterFile[] = [
  { path: 'README.md', content: ROOT_README },
  ...FOLDER_READMES,
];
