/**
 * A synthetic vault for the adoption tests.
 *
 * Built in code rather than committed as files, for two reasons. Every byte is
 * visible here, so a test that claims nothing changed can be read against what
 * was actually there; and nothing depends on Git, npm packing, or an editor
 * preserving a `.trash/` directory or a binary attachment on the way in.
 *
 * The content is invented. No private or personal note enters this repository,
 * fixtures included.
 *
 * What it deliberately contains:
 *
 * - `.obsidian/` and `.trash/`, the directories Obsidian keeps for itself
 * - attachments and other non-Markdown files
 * - directories whose names collide with the starter folders
 * - `README.md`, a file occupying a starter path
 * - notes with no Lorekeeper frontmatter, hand-written YAML with a comment and
 *   a local time offset, CRLF line endings, and a missing trailing newline —
 *   the representation an object parse-then-re-dump would quietly destroy
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** A starter path the fixture occupies, so a collision is always exercised. */
export const COLLIDING_STARTER_PATH = 'README.md';

/** A small binary file: a PNG signature and nothing that is valid UTF-8. */
const ATTACHMENT_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x00, 0x01,
]);

const TEXT_FILES: ReadonlyArray<readonly [string, string]> = [
  [
    COLLIDING_STARTER_PATH,
    '# My vault\n\nMine, written by hand, and not to be touched.\n',
  ],
  ['.obsidian/app.json', '{\n  "alwaysUpdateLinks": true\n}\n'],
  ['.obsidian/workspace.json', '{\n  "main": {}\n}\n'],
  ['.obsidian/plugins/some-plugin/data.json', '{\n  "enabled": true\n}\n'],
  [
    '.trash/deleted-thought.md',
    '# Deleted\n\nStill on disk, still not ours.\n',
  ],
  [
    'notes/existing-thought.md',
    '# An existing thought\n\nNo frontmatter at all, and valid knowledge regardless.\n',
  ],
  [
    'notes/hand-written-frontmatter.md',
    [
      '---',
      'type: note # written by hand, comment and all',
      'created: 2026-08-21T09:02:00-05:00',
      'aliases: [one, two]',
      '---',
      '',
      '# Hand-written',
      '',
      'The offset, the inline array, and the comment are the author’s.',
      '',
    ].join('\n'),
  ],
  [
    'daily/2026-08-01.md',
    '# 2026-08-01\r\n\r\nCRLF, as some editors write.\r\n',
  ],
  ['sources/clipping.md', '# A clipping\n\nNo trailing newline follows this.'],
  ['attachments/notes.txt', 'plain text, not Markdown\n'],
  ['research/paper.bib', '@article{example, title={Example}}\n'],
];

const BINARY_FILES: ReadonlyArray<readonly [string, Uint8Array]> = [
  ['attachments/diagram.png', ATTACHMENT_BYTES],
];

/**
 * Materialize the fixture inside `root`, which is created if it does not exist.
 */
export function createAdoptionVault(root: string): void {
  mkdirSync(root, { recursive: true });

  for (const [path, content] of TEXT_FILES) {
    write(join(root, path), content);
  }
  for (const [path, bytes] of BINARY_FILES) {
    write(join(root, path), bytes);
  }
}

function write(path: string, content: string | Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
