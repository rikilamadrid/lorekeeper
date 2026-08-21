import { PRODUCT_NAME, TAGLINE } from '@lorekeeper/core';

/**
 * Feature 01 ships the binary, not the command surface. Subcommands are
 * deliberately absent: the command vocabulary below `lore` is still an open
 * decision, and inventing one here would quietly settle it.
 */
export function usage(version: string): string {
  return [
    `${PRODUCT_NAME} ${version}`,
    TAGLINE,
    '',
    'Usage:',
    '  lore --help       Show this message',
    '  lore --version    Print the version',
    '',
    'No subcommands yet. Capture, search, and init arrive in later features.',
    'Lorekeeper runs offline and takes no credentials.',
  ].join('\n');
}
