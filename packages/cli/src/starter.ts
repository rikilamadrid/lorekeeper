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

/**
 * The agent-facing integration artifact.
 *
 * `AGENTS.md` at the brain root, deliberately. Retrieval that never fires
 * delivers nothing, and an agent only runs `lore` if something already in its
 * context says to — so the artifact has to sit where a coding agent looks
 * without being told. `AGENTS.md` is the convention that is read across agent
 * environments rather than by one vendor, which is also why a path under
 * `.lorekeeper/` was rejected: it would satisfy the requirement and be found by
 * nothing.
 *
 * The brain root is a path in someone's vault, so the ordinary starter rules
 * decide what happens when it is taken. A vault that already has its own
 * `AGENTS.md` keeps it byte for byte: the exclusive write fails, init reports
 * the path as occupied, and nothing claims it. Automatic discovery is simply
 * unavailable in that case, and merging into a file the toolkit does not own is
 * not something this command may do. An existing brain picks the artifact up on
 * the next `lore init`, as a starter path that is missing and unowned.
 *
 * The command below is real and runnable rather than a sketch, and a test
 * extracts it from this text and runs it through the CLI, so instructions that
 * stop working fail the build instead of quietly misleading an agent. That is
 * also why no path is interpolated: this content is static, so two runs of the
 * same toolkit produce byte-identical files, and the example says what to
 * substitute instead.
 */
const AGENTS_ARTIFACT = `# Agent instructions for this brain

This directory is a Lorekeeper brain: plain Markdown files the owner wrote and
owns. A command-line tool called \`lore\` searches them and returns the
individual passages that answer a question, rather than whole files.

## When to search it

Search before answering anything that depends on what this person has written,
decided, or collected — their projects, their notes, their sources, their
earlier decisions. Search again whenever an answer would otherwise rest on a
guess about their situation.

## How to search it

Run this from the directory holding this file:

\`\`\`
lore search . "how do I rotate the TLS certificate" "certificate renewal steps" "cert expiry runbook" --json
\`\`\`

Replace \`.\` with the path to this directory if you are working elsewhere, and
replace the quoted text with your own wordings. Add \`--limit <n>\` to change how
many results come back.

Give several wordings of one question in a single call, each in its own quotes.
This is not an optimization. The same question asked three ways retrieves what
any one phrasing misses, and the ranked lists are fused into a single result
list for you. A single wording returns a materially worse answer.

## What comes back

Each result is one passage, not a file, and carries five fields:

- \`path\` — the file it came from, relative to this directory
- \`anchor\` — the heading it sits under, or \`null\` when it sits under none
- \`startLine\` and \`endLine\` — the lines it occupies, counting from 1
- \`score\` — how that passage ranked for your wordings
- \`text\` — the passage itself

Read \`text\` first: it is the evidence. Open the whole file only when the
passage is not enough, because reading whole notes is the cost this tool exists
to avoid.

## What a score cannot tell you

A score ranks passages against each other. It never establishes that something
is absent from this brain.

Treat results as evidence to weigh rather than as an answer. If they do not
settle the question, search again in different words. If they still do not, say
the evidence here is insufficient. Never report that this brain lacks something
because a score looked low.
`;

/** Every file init writes, apart from the manifest itself. */
export const STARTER_FILES: readonly StarterFile[] = [
  { path: 'README.md', content: ROOT_README },
  { path: 'AGENTS.md', content: AGENTS_ARTIFACT },
  ...FOLDER_READMES,
];
