/**
 * The manifest's content hash, computed.
 *
 * `packages/core` names the algorithm and validates the shape of the result;
 * running it needs a platform, and platform access lives in this package. Keep
 * the two in step: this file must implement whatever
 * {@link MANIFEST_HASH_ALGORITHM} names, and a test asserts that it does.
 */

import { createHash } from 'node:crypto';
import { MANIFEST_HASH_ALGORITHM } from '@lorekeeper/core';

/** Lowercase hex hash of the given bytes. */
export function hashBytes(bytes: Uint8Array): string {
  return createHash(MANIFEST_HASH_ALGORITHM).update(bytes).digest('hex');
}

/** Convenience over {@link hashBytes} for content held as text. */
export function hashText(text: string): string {
  return hashBytes(new TextEncoder().encode(text));
}
