import { PRODUCT_NAME, TAGLINE } from '@lorekeeper/core';

/**
 * The command vocabulary below `lore` is still an open decision, so this lists
 * only what a Feature has actually delivered. Nothing is named here in
 * anticipation of shipping it.
 */
export function usage(version: string): string {
  return [
    `${PRODUCT_NAME} ${version}`,
    TAGLINE,
    '',
    'Usage:',
    '  lore init <dir>              Create a brain, or adopt an existing vault',
    '  lore capture <brain> <item>  Write a thought or a URL into that brain',
    '  lore --help                  Show this message',
    '  lore --version               Print the version',
    '',
    'A captured thought lands in inbox/ as YYYYMMDD-HHMMSS-subject.md, with the',
    'same name as its id. Two captures in one second never collide: the second',
    'one takes the next free -2, -3 suffix.',
    '',
    'A captured URL lands in sources/ instead, named for the stable source id it',
    'carries. URLs that name the same thing are one source, so capturing one you',
    'already have reports the file that holds it and writes nothing. The URL is',
    'identified, never visited.',
    '',
    'Search arrives in a later feature.',
    'Lorekeeper runs offline and takes no credentials.',
  ].join('\n');
}
