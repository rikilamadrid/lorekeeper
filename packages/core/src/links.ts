/**
 * Resolving the two kinds of edge Lorekeeper stores.
 *
 * They are deliberately different mechanisms, not one chain:
 *
 * - **Provenance** (`derived_from`) resolves by stable source ID. It is
 *   immutable historical fact and survives renames.
 * - **Aboutness** (`about`, body wikilinks) resolves by name. It is mutable
 *   judgment, and names are fragile, so name resolution has a documented
 *   fallback.
 *
 * ## Name resolution fallback order
 *
 * 1. **Document name** — the identifier the caller gave the document,
 *    conventionally its filename without the extension.
 * 2. **H1 title** — the first `# Title` in the body.
 * 3. **Declared alias** — an entry in the document's `aliases` frontmatter.
 *
 * The first tier with any match decides the outcome. A tier that matches more
 * than one document reports `ambiguous` rather than falling through: two
 * documents answering to one name is a conflict to surface, not a reason to
 * try a weaker signal.
 *
 * Comparison is case-insensitive, ignores surrounding whitespace, collapses
 * internal runs of whitespace, and normalizes Unicode to NFC. That last step
 * matters on macOS: a name taken from an APFS filename arrives decomposed
 * (NFD), while the same name typed into an editor is composed (NFC), and
 * without normalization an accented title is unreachable by its own name. Renaming remains the fragile operation; prototype
 * `schema-v0` measured 2 of 4 name edges breaking on rename against 8 of 8 ID
 * edges surviving, with every break recoverable through this fallback.
 */

import type { LoreDocument } from './document.js';

/** One parsed link target. */
export interface LinkTarget {
  /** The document name being addressed, with any path, extension, and fragment removed. */
  readonly name: string;
  /** The `#heading` or `#^block` fragment, without its leading `#`. */
  readonly fragment: string | null;
  /** The `|display` text, when the link declared one. */
  readonly display: string | null;
}

export type NameResolution =
  | {
      readonly status: 'resolved';
      readonly document: LoreDocument;
      readonly matchedBy: 'name' | 'h1' | 'alias';
    }
  | {
      readonly status: 'ambiguous';
      readonly matchedBy: 'name' | 'h1' | 'alias';
      readonly documents: readonly LoreDocument[];
    }
  | { readonly status: 'unresolved' };

export interface DocumentIndex {
  /** Resolve a provenance edge by stable source ID. */
  resolveId(id: string): LoreDocument | null;
  /** Resolve a name-based link through the documented fallback order. */
  resolveName(name: string): NameResolution;
  /**
   * IDs claimed by more than one document, as first written. Comparison is by
   * {@link normalizeId}, so two spellings of the same canonical id collide.
   * Ordinary notes have no ID at all.
   */
  readonly duplicateIds: readonly string[];
}

const WIKILINK = /^\[\[([\s\S]*)\]\]$/;

/**
 * Parse one link target.
 *
 * Accepts both `[[Wikilink]]` form and a bare name, because `about` entries are
 * written by hand and appear both ways in the wild.
 */
export function parseLinkTarget(raw: string): LinkTarget {
  const wikilink = WIKILINK.exec(raw.trim());
  let inner = wikilink ? (wikilink[1] as string) : raw.trim();

  let display: string | null = null;
  const pipe = inner.indexOf('|');
  if (pipe !== -1) {
    display = inner.slice(pipe + 1).trim();
    inner = inner.slice(0, pipe);
  }

  let fragment: string | null = null;
  const hash = inner.indexOf('#');
  if (hash !== -1) {
    fragment = inner.slice(hash + 1).trim();
    inner = inner.slice(0, hash);
  }

  let name = inner.trim();
  const slash = name.lastIndexOf('/');
  if (slash !== -1) name = name.slice(slash + 1);
  if (name.toLowerCase().endsWith('.md')) name = name.slice(0, -3);

  return {
    name: name.trim(),
    fragment: fragment === null || fragment === '' ? null : fragment,
    display: display === null || display === '' ? null : display,
  };
}

/** The comparison key for name-based resolution. */
export function normalizeName(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * The comparison key for ID-based resolution.
 *
 * Unicode form is normalized for the same reason names are: canonically
 * equivalent text must compare equal, or one file's id and another file's edge
 * to it look unrelated. Case is *not* folded — an ID is an exact token, and two
 * ids differing only in case are two ids.
 *
 * This is a comparison key, never a value to store. The id as the author wrote
 * it is what stays in the file and what findings quote back.
 */
export function normalizeId(id: string): string {
  return id.normalize('NFC').trim();
}

/** Build a resolver over a set of documents. */
export function indexDocuments(
  documents: readonly LoreDocument[],
): DocumentIndex {
  // Keyed by comparison form, holding the id as first written so reports quote
  // the author's own text back to them.
  const byId = new Map<
    string,
    { written: string; documents: LoreDocument[] }
  >();
  const byName = new Map<string, LoreDocument[]>();
  const byH1 = new Map<string, LoreDocument[]>();
  const byAlias = new Map<string, LoreDocument[]>();

  for (const document of documents) {
    const { id, aliases } = document.frontmatter;
    if (id !== null && normalizeId(id) !== '') {
      const key = normalizeId(id);
      const existing = byId.get(key);
      if (existing) existing.documents.push(document);
      else byId.set(key, { written: id.trim(), documents: [document] });
    }
    push(byName, normalizeName(document.name), document);
    if (document.h1 !== null) push(byH1, normalizeName(document.h1), document);
    for (const alias of aliases) {
      if (alias.trim() !== '') push(byAlias, normalizeName(alias), document);
    }
  }

  const duplicateIds = [...byId.values()]
    .filter((entry) => entry.documents.length > 1)
    .map((entry) => entry.written);

  const tiers = [
    { matchedBy: 'name', map: byName },
    { matchedBy: 'h1', map: byH1 },
    { matchedBy: 'alias', map: byAlias },
  ] as const;

  return {
    duplicateIds,

    resolveId(id) {
      const matches = byId.get(normalizeId(id))?.documents;
      // A duplicated ID is reported through `duplicateIds`; resolving one of
      // two claimants arbitrarily would hide the conflict inside an edge.
      if (matches?.length !== 1) return null;
      return matches[0] as LoreDocument;
    },

    resolveName(name) {
      const key = normalizeName(parseLinkTarget(name).name);
      if (key === '') return { status: 'unresolved' };

      for (const { matchedBy, map } of tiers) {
        const matches = map.get(key);
        if (!matches || matches.length === 0) continue;
        if (matches.length > 1) {
          return { status: 'ambiguous', matchedBy, documents: matches };
        }
        return {
          status: 'resolved',
          document: matches[0] as LoreDocument,
          matchedBy,
        };
      }
      return { status: 'unresolved' };
    },
  };
}

function push(
  map: Map<string, LoreDocument[]>,
  key: string,
  document: LoreDocument,
): void {
  const existing = map.get(key);
  if (existing) existing.push(document);
  else map.set(key, [document]);
}
