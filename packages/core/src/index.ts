/**
 * Shared contracts for Lorekeeper.
 *
 * Feature 02 chunk 1 adds the read side of the frontmatter contract: locate a
 * frontmatter block without disturbing it, read it into a typed view that
 * preserves unrecognized fields, and resolve the two kinds of edge the frozen
 * v0.1 contract defines.
 *
 * Nothing here writes. Representation-preserving mutation arrives with the
 * write primitive; until then, `FrontmatterBlock` exists so that primitive has
 * an exact span to edit rather than an object to re-serialize.
 */

export const PRODUCT_NAME = 'Lorekeeper';

export const TAGLINE =
  'Pathfinder finds the way; Lorekeeper remembers the journey.';

export { type LoreDocument, readDocument } from './document.js';

export {
  EMPTY_FRONTMATTER,
  type LoreFrontmatter,
  RECOGNIZED_FIELDS,
  type RecognizedField,
  toFrontmatter,
} from './fields.js';
export {
  type FrontmatterBlock,
  type FrontmatterRead,
  readFrontmatter,
} from './frontmatter.js';

export {
  type DocumentIndex,
  indexDocuments,
  type LinkTarget,
  type NameResolution,
  normalizeName,
  parseLinkTarget,
} from './links.js';
