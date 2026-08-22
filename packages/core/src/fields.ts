/**
 * The typed read view over a parsed frontmatter mapping.
 *
 * This layer recognizes field *names*. It does not constrain their values.
 * `type`, `kind`, and `about` are PROVISIONAL vocabulary in v0.1 and their
 * value sets are deliberately unfrozen, so nothing here validates or enumerates
 * them. Validation, with findings and severities, is a separate concern.
 *
 * Two invariants the frozen contract depends on:
 *
 * - Unrecognized fields are never dropped. They stay in
 *   {@link LoreFrontmatter.unrecognized}, and the untouched parse stays in
 *   {@link LoreFrontmatter.data}, so schema evolution is additive-only and a
 *   later mutation has everything it needs to preserve them.
 * - Absence is absence. A missing `derived_from` means unknown or unrecorded,
 *   never original authorship, so this module reports `[]` and attaches no
 *   further meaning to it.
 */

/** Frontmatter field names this version of the contract recognizes. */
export const RECOGNIZED_FIELDS = [
  'id',
  'type',
  'kind',
  'url',
  'created',
  'updated',
  'tags',
  'aliases',
  'derived_from',
  'about',
] as const;

export type RecognizedField = (typeof RECOGNIZED_FIELDS)[number];

export interface LoreFrontmatter {
  /**
   * Stable identifier. Sources carry one; ordinary notes do not, and their
   * absence is not a defect.
   */
  readonly id: string | null;
  /** Browsing ergonomics only. Retrieval correctness must not depend on it. */
  readonly type: string | null;
  /** Free string, unvalidated in v0.1. */
  readonly kind: string | null;
  /** Origin URL of a source artifact, as the author wrote it. */
  readonly url: string | null;
  /**
   * Timestamps as written. Never a `Date`: parsing to one and back is what
   * silently rewrote an author's local offset to UTC in prototype `schema-v0`.
   */
  readonly created: string | null;
  readonly updated: string | null;
  readonly tags: readonly string[];
  /** Declared alternate names, used as the last link-resolution fallback. */
  readonly aliases: readonly string[];
  /**
   * Stable source IDs this artifact was derived from. The edge points from the
   * derived artifact to its origin; the inverse edge is never stored.
   */
  readonly derivedFrom: readonly string[];
  /**
   * PROVISIONAL. Additive structural aboutness, never a mirror of body
   * wikilinks. Values are raw as written, wikilink syntax included.
   */
  readonly about: readonly string[];
  /** Every field this contract version does not recognize, preserved as-is. */
  readonly unrecognized: Readonly<Record<string, unknown>>;
  /** The full parsed mapping, unfiltered and uncoerced. */
  readonly data: Readonly<Record<string, unknown>>;
}

export const EMPTY_FRONTMATTER: LoreFrontmatter = {
  id: null,
  type: null,
  kind: null,
  url: null,
  created: null,
  updated: null,
  tags: [],
  aliases: [],
  derivedFrom: [],
  about: [],
  unrecognized: {},
  data: {},
};

const recognized = new Set<string>(RECOGNIZED_FIELDS);

/** Build the typed read view. Never throws; unusable values become `null`/`[]`. */
export function toFrontmatter(
  data: Readonly<Record<string, unknown>>,
): LoreFrontmatter {
  const unrecognized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!recognized.has(key)) unrecognized[key] = value;
  }

  return {
    id: asString(data.id),
    type: asString(data.type),
    kind: asString(data.kind),
    url: asString(data.url),
    created: asString(data.created),
    updated: asString(data.updated),
    tags: asStringList(data.tags),
    aliases: asStringList(data.aliases),
    derivedFrom: asStringList(data.derived_from),
    about: asStringList(data.about),
    unrecognized,
    data,
  };
}

/**
 * A scalar the contract reads as text.
 *
 * Numbers and booleans are stringified because YAML resolves bare values like
 * `20260817` and `true` for the author, and an ID or kind written without
 * quotes is still the text the author typed.
 */
function asString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

/** A list field. A lone scalar is a one-item list; unusable items are dropped. */
function asStringList(value: unknown): readonly string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const item of value) {
      const text = asString(item);
      if (text !== null) out.push(text);
    }
    return out;
  }
  const single = asString(value);
  return single === null ? [] : [single];
}
