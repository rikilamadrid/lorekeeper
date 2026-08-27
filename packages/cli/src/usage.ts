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
    '  lore init <dir>   Create a brain in an empty directory',
    '  lore --help       Show this message',
    '  lore --version    Print the version',
    '',
    'Capture and search arrive in later features.',
    'Lorekeeper runs offline and takes no credentials.',
  ].join('\n');
}
