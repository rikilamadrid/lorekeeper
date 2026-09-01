/**
 * Shared contracts for Lorekeeper.
 *
 * The frontmatter contract: locate a frontmatter block without disturbing it,
 * read it into a typed view that preserves unrecognized fields, resolve the two
 * kinds of edge the frozen v0.1 contract defines, report findings about what
 * was read, and mutate provenance without rewriting a byte nobody asked to
 * change.
 *
 * Alongside it, the managed manifest: which files in a brain the toolkit owns,
 * and whether they still hold the bytes it wrote. Ownership metadata, not an
 * inventory — absence from it is a positive statement of user ownership.
 *
 * And URL identity: the normalized form of a source's origin URL, and the
 * stable ID derived from it, under per-domain rules rather than a blocklist.
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
  buildManifest,
  type DriftEntry,
  type DriftState,
  detectDrift,
  isManifestHash,
  isOwned,
  MANIFEST_HASH_ALGORITHM,
  MANIFEST_PATH,
  MANIFEST_VERSION,
  type Manifest,
  type ManifestEntry,
  type ManifestInput,
  type ManifestRefusal,
  type ManifestRefusalCode,
  type ManifestResult,
  parseManifest,
  serializeManifest,
} from './manifest.js';
export {
  type NormalizedUrl,
  type NormalizeResult,
  normalizeUrl,
  type SourceIdResult,
  sourceIdFor,
  URL_ID_DIGEST_LENGTH,
  URL_ID_HASH_ALGORITHM,
  type UrlRefusal,
  type UrlRefusalCode,
  type UrlRule,
} from './url.js';
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
