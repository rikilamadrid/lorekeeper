/**
 * Shared contracts for Lorekeeper.
 *
 * The frontmatter contract: locate a frontmatter block without disturbing it,
 * read it into a typed view that preserves unrecognized fields, resolve the two
 * kinds of edge the frozen v0.1 contract defines, report findings about what
 * was read, and mutate provenance without rewriting a byte nobody asked to
 * change.
 *
 * Reads may parse freely; writes may not. Every mutation splices the exact span
 * `FrontmatterBlock` reports, so no file is ever re-serialized from a parsed
 * object. Validation still reports rather than repairs — a finding never
 * triggers a write.
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
  normalizeId,
  normalizeName,
  parseLinkTarget,
} from './links.js';
export {
  countBySeverity,
  type Finding,
  type FindingCode,
  type Severity,
  type ValidationTarget,
  validateDocument,
  validateDocuments,
} from './validate.js';
export {
  addDerivedFrom,
  applyEdits,
  type Edit,
  removeDerivedFrom,
  type WriteRefusal,
  type WriteRefusalCode,
  type WriteResult,
} from './write.js';
