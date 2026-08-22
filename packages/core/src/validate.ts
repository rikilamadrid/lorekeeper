/**
 * Validation over documents that have already been read.
 *
 * Validation reports; it never repairs. Nothing here rewrites, normalizes, or
 * reformats a file, and nothing here decides what a caller should do about a
 * finding. How strict a `doctor`-style command may be, and what it exits with,
 * is an open decision that this module deliberately does not settle: it ships
 * severities and leaves the policy to whoever consumes them.
 *
 * Two contract rules constrain what may be checked at all:
 *
 * - `type` is browsing ergonomics and its values are unfrozen, so no rule here
 *   reads a `type` value to decide whether a file is well formed.
 * - `about` is provisional, so its findings are informational only. Nothing may
 *   be made to depend on it.
 *
 * Findings name fields, IDs, and files — never body text. A validation report
 * should be safe to paste into an issue without leaking what someone wrote.
 */

import type { LoreDocument } from './document.js';
import { indexDocuments, normalizeId, parseLinkTarget } from './links.js';

/**
 * How much a finding matters.
 *
 * - `error` — the file's own contract is broken; something machine-readable
 *   cannot be read or is self-contradictory.
 * - `warning` — readable, but an edge or field will not behave as written.
 * - `info` — worth knowing, and never a defect on its own. Provisional
 *   vocabulary reports at this level and no higher.
 */
export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  /** The file the finding belongs to, as the caller named it. */
  readonly file: string;
  /** The frontmatter field at fault, or `null` when it is the whole block. */
  readonly field: string | null;
  /** A stable identifier for this kind of finding. Safe to match on. */
  readonly code: FindingCode;
  readonly severity: Severity;
  /** One sentence a human can act on. Never contains body text. */
  readonly reason: string;
}

export type FindingCode =
  | 'frontmatter-unreadable'
  | 'duplicate-key'
  | 'field-not-text'
  | 'field-not-list'
  | 'list-item-unreadable'
  | 'id-blank'
  | 'derived-from-blank'
  | 'derived-from-self'
  | 'duplicate-id'
  | 'derived-from-unresolved'
  | 'about-unresolved'
  | 'about-ambiguous';

/** A document paired with the name a report should use for it. */
export interface ValidationTarget {
  /**
   * How findings name this file — conventionally its path. Reads derive no
   * meaning from a path, so only the caller knows what to call it.
   */
  readonly file: string;
  readonly document: LoreDocument;
}

/** Recognized fields whose value the contract reads as a single scalar. */
const SCALAR_FIELDS = [
  ['id', 'id'],
  ['type', 'type'],
  ['kind', 'kind'],
  ['url', 'url'],
  ['created', 'created'],
  ['updated', 'updated'],
] as const;

/** Recognized fields whose value the contract reads as a list of scalars. */
const LIST_FIELDS = [
  ['tags', 'tags'],
  ['aliases', 'aliases'],
  ['derived_from', 'derivedFrom'],
  ['about', 'about'],
] as const;

/**
 * Validate one document in isolation.
 *
 * Edge resolution needs the whole set, so unresolved and duplicated edges are
 * reported by {@link validateDocuments} instead.
 */
export function validateDocument(target: ValidationTarget): readonly Finding[] {
  const { file, document } = target;
  const { frontmatter } = document;
  const findings: Finding[] = [];

  if (document.parseError !== null) {
    findings.push({
      file,
      field: null,
      code: 'frontmatter-unreadable',
      severity: 'error',
      reason: `frontmatter could not be read as a mapping: ${document.parseError}`,
    });
    // Every field-level rule below would report noise about fields that were
    // never parsed, so the block-level finding stands alone.
    return findings;
  }

  for (const key of document.duplicateKeys) {
    findings.push({
      file,
      field: key,
      code: 'duplicate-key',
      severity: 'warning',
      reason: `\`${key}\` is declared more than once; the last value is the one that takes effect`,
    });
  }

  for (const [key, typed] of SCALAR_FIELDS) {
    if (frontmatter[typed] === null && frontmatter.data[key] != null) {
      findings.push({
        file,
        field: key,
        code: 'field-not-text',
        severity: 'warning',
        reason: `\`${key}\` is not a single text value, so it was not read`,
      });
    }
  }

  for (const [key, typed] of LIST_FIELDS) {
    const raw = frontmatter.data[key];
    if (raw === null || raw === undefined) continue;

    if (!Array.isArray(raw)) {
      // A lone scalar is a one-item list and reads fine. Anything else — a
      // mapping, most likely, since the contract is flat and someone nested it
      // — produces an empty list, and saying nothing would lose the field in
      // silence. Reported, not repaired: only the author knows what they meant.
      if (frontmatter[typed].length === 0) {
        findings.push({
          file,
          field: key,
          code: 'field-not-list',
          severity: 'warning',
          reason: `\`${key}\` is not text or a list of text, so it was not read`,
        });
      }
      continue;
    }

    const dropped = raw.length - frontmatter[typed].length;
    if (dropped > 0) {
      findings.push({
        file,
        field: key,
        code: 'list-item-unreadable',
        severity: 'warning',
        reason: `${dropped} of ${raw.length} \`${key}\` entries are not text and were not read`,
      });
    }
  }

  if (frontmatter.id !== null && frontmatter.id.trim() === '') {
    findings.push({
      file,
      field: 'id',
      code: 'id-blank',
      severity: 'error',
      reason: '`id` is blank, so nothing can point at this file',
    });
  }

  if (frontmatter.derivedFrom.some((edge) => normalizeId(edge) === '')) {
    findings.push({
      file,
      field: 'derived_from',
      code: 'derived-from-blank',
      severity: 'error',
      reason:
        '`derived_from` holds a blank entry; remove it or give it the source id it meant',
    });
  }

  const written = frontmatter.id?.trim();
  const id = frontmatter.id === null ? '' : normalizeId(frontmatter.id);
  if (id !== '' && frontmatter.derivedFrom.some((e) => normalizeId(e) === id)) {
    findings.push({
      file,
      field: 'derived_from',
      code: 'derived-from-self',
      severity: 'error',
      reason: `\`derived_from\` points at this file's own id \`${written}\``,
    });
  }

  return findings;
}

/**
 * Validate a set of documents, including the edges between them.
 *
 * Findings arrive in a deterministic order: every per-document finding in
 * target order, then every cross-document finding in target order.
 */
export function validateDocuments(
  targets: readonly ValidationTarget[],
): readonly Finding[] {
  const findings: Finding[] = [];
  for (const target of targets) findings.push(...validateDocument(target));

  const index = indexDocuments(targets.map((target) => target.document));
  const duplicated = new Set(index.duplicateIds.map(normalizeId));

  for (const { file, document } of targets) {
    const written = document.frontmatter.id?.trim();
    const id =
      document.frontmatter.id === null
        ? null
        : normalizeId(document.frontmatter.id);
    if (id !== null && duplicated.has(id)) {
      findings.push({
        file,
        field: 'id',
        code: 'duplicate-id',
        severity: 'error',
        reason: `id \`${written}\` is claimed by more than one file, so edges to it resolve to nothing`,
      });
    }

    for (const edge of document.frontmatter.derivedFrom) {
      const target = normalizeId(edge);
      // Blank and self edges are already reported per-document; not twice.
      if (target === '' || target === id) continue;
      if (index.resolveId(edge) === null && !duplicated.has(target)) {
        findings.push({
          file,
          field: 'derived_from',
          code: 'derived-from-unresolved',
          severity: 'warning',
          reason: `no file in this set claims the source id \`${edge}\``,
        });
      }
    }

    // `about` is PROVISIONAL. Its findings stay informational, and no
    // correctness claim anywhere may rest on them.
    for (const entry of document.frontmatter.about) {
      const target = parseLinkTarget(entry);
      if (target.name === '') continue;
      const resolution = index.resolveName(target.name);
      if (resolution.status === 'unresolved') {
        findings.push({
          file,
          field: 'about',
          code: 'about-unresolved',
          severity: 'info',
          reason: `\`about\` names \`${target.name}\`, which no file in this set answers to`,
        });
      } else if (resolution.status === 'ambiguous') {
        findings.push({
          file,
          field: 'about',
          code: 'about-ambiguous',
          severity: 'info',
          reason: `\`about\` names \`${target.name}\`, which ${resolution.documents.length} files answer to by ${resolution.matchedBy}`,
        });
      }
    }
  }

  return findings;
}

/** Count findings by severity. A convenience for reporting, not a policy. */
export function countBySeverity(
  findings: readonly Finding[],
): Record<Severity, number> {
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  return counts;
}
