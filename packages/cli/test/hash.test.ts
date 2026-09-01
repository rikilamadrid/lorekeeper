import {
  MANIFEST_HASH_ALGORITHM,
  URL_ID_HASH_ALGORITHM,
} from '@lorekeeper/core';
import { describe, expect, it } from 'vitest';
import { hashBytes, hashText } from '../src/hash.js';

/** Published SHA-256 vectors, so this asserts the algorithm and not itself. */
const VECTORS: readonly (readonly [string, string])[] = [
  ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ['hello', '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'],
  ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
];

describe('hashing', () => {
  it('implements the algorithm the manifest format names', () => {
    expect(MANIFEST_HASH_ALGORITHM).toBe('sha256');
    for (const [text, digest] of VECTORS) {
      expect(hashText(text)).toBe(digest);
    }
  });

  /**
   * `sourceIdFor` takes the hash function rather than reaching for one, so the
   * algorithm core names for URL identity and the one this package supplies
   * are held in step here, exactly as the manifest's is.
   */
  it('implements the algorithm URL identity names', () => {
    expect(URL_ID_HASH_ALGORITHM).toBe('sha256');
    expect(hashText('')).toBe(VECTORS[0]?.[1]);
  });

  it('hashes bytes and text identically for the same content', () => {
    expect(hashBytes(new TextEncoder().encode('hello'))).toBe(
      hashText('hello'),
    );
  });

  it('separates content that differs by a single byte', () => {
    expect(hashText('note\n')).not.toBe(hashText('note'));
    expect(hashText('a')).not.toBe(hashText('b'));
  });
});
