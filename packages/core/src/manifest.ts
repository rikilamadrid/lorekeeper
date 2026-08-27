/**
 * The managed manifest: the record of which files in a brain the toolkit owns.
 *
 * Ownership is the only question this format answers. It is not an inventory of
 * the vault, and a file's absence from it is a positive statement that the file
 * belongs to the user — not missing information. Everything the toolkit did not
 * write stays outside it, permanently.
 *
 * This module is filesystem-free, like the rest of `packages/core`, and free of
 * any runtime API at all: core is consumed by the documentation site as well as
 * the CLI, so it holds the contract while `packages/cli` holds every `fs` call
 * and the hashing that needs a platform to run on. What lives here is the
 * shape of the record and the rules that keep it unambiguous.
 *
 * Drift is a question about content, so an entry records a content hash and
 * nothing else. Modification time and size change when a vault is synced,
 * checked out, or copied, without a byte of content moving, and an ownership
 * record that reports drift on a `git clone` teaches its reader to ignore it.
 */

/** Where the manifest lives inside a brain. Dot-prefixed, so Obsidian ignores it. */
export const MANIFEST_PATH = '.lorekeeper/manifest.json';

/**
 * The format's own version, bumped only when an older reader could
 * misinterpret a newer file. A reader that does not recognize a version must
 * refuse rather than guess at ownership.
 */
export const MANIFEST_VERSION = 1;

/** One toolkit-owned file. */
export interface ManifestEntry {
  /** Brain-relative POSIX path. Never absolute, never escaping the brain. */
  readonly path: string;
  /** Lowercase hex SHA-256 of the bytes the toolkit wrote. */
  readonly sha256: string;
}

export interface Manifest {
  readonly manifestVersion: number;
  /** The `lore` version that wrote this manifest, for diagnosis. */
  readonly toolkitVersion: string;
  /** ISO 8601 instant the manifest was written. */
  readonly createdAt: string;
  /** Owned files, ordered by path so the file is stable across runs. */
  readonly files: readonly ManifestEntry[];
}

/** What the caller supplies to build a manifest. */
export interface ManifestInput {
  readonly toolkitVersion: string;
  readonly createdAt: string;
  readonly files: readonly ManifestEntry[];
}

/** Why a manifest could not be built or read. Codes are safe to match on. */
export type ManifestRefusalCode =
  | 'path-empty'
  | 'path-absolute'
  | 'path-escapes-brain'
  | 'path-not-normalized'
  | 'path-duplicated'
  | 'hash-malformed'
  | 'not-json'
  | 'not-an-object'
  | 'version-unsupported'
  | 'field-missing'
  | 'field-malformed';

export interface ManifestRefusal {
  readonly code: ManifestRefusalCode;
  /** One sentence a human can act on. Names paths and fields, never content. */
  readonly reason: string;
}

/** Either a manifest or the reason there is none. Nothing here throws. */
export type ManifestResult =
  | { readonly ok: true; readonly manifest: Manifest }
  | { readonly ok: false; readonly refusal: ManifestRefusal };

/**
 * The hash the format uses, named here so the writer and every later reader
 * agree on it: SHA-256 over the file's bytes, lowercase hex.
 */
export const MANIFEST_HASH_ALGORITHM = 'sha256';

const HEX_SHA256 = /^[0-9a-f]{64}$/;

/** Whether a string is a well-formed manifest hash. */
export function isManifestHash(value: string): boolean {
  return HEX_SHA256.test(value);
}

/**
 * Build a manifest from entries the caller has already written.
 *
 * Rejects anything that would make ownership ambiguous: a path that is
 * absolute, escapes the brain, is not already normalized, or is claimed twice.
 * An ownership record with an ambiguous path is worse than none, because a
 * later update would act on it.
 */
export function buildManifest(input: ManifestInput): ManifestResult {
  const seen = new Set<string>();

  for (const entry of input.files) {
    const refusal = checkPath(entry.path);
    if (refusal !== null) {
      return { ok: false, refusal };
    }
    if (seen.has(entry.path)) {
      return {
        ok: false,
        refusal: {
          code: 'path-duplicated',
          reason: `"${entry.path}" is claimed more than once.`,
        },
      };
    }
    seen.add(entry.path);

    if (!isManifestHash(entry.sha256)) {
      return {
        ok: false,
        refusal: {
          code: 'hash-malformed',
          reason: `"${entry.path}" carries a hash that is not lowercase hex SHA-256.`,
        },
      };
    }
  }

  const files = [...input.files].sort((a, b) => (a.path < b.path ? -1 : 1));

  return {
    ok: true,
    manifest: {
      manifestVersion: MANIFEST_VERSION,
      toolkitVersion: input.toolkitVersion,
      createdAt: input.createdAt,
      files,
    },
  };
}

function checkPath(path: string): ManifestRefusal | null {
  if (path === '') {
    return { code: 'path-empty', reason: 'An owned path cannot be empty.' };
  }
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) {
    return {
      code: 'path-absolute',
      reason: `"${path}" is absolute; owned paths are relative to the brain.`,
    };
  }
  const segments = path.split('/');
  if (segments.includes('..')) {
    return {
      code: 'path-escapes-brain',
      reason: `"${path}" points outside the brain.`,
    };
  }
  if (
    path.includes('\\') ||
    path.includes('//') ||
    segments.includes('.') ||
    segments.includes('') ||
    path !== path.trim()
  ) {
    return {
      code: 'path-not-normalized',
      reason: `"${path}" is not a normalized POSIX relative path.`,
    };
  }
  return null;
}

/**
 * Serialize a manifest for writing.
 *
 * Indented and newline-terminated: a file recording what a tool owns inside
 * someone's notes should be readable by the person who owns them, and should
 * diff cleanly under whatever syncs their vault.
 */
export function serializeManifest(manifest: Manifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * Read a manifest the toolkit previously wrote.
 *
 * Every failure is a refusal, never a guess. This file decides whether a later
 * write may touch a user's note, so an unreadable or unrecognized one must stop
 * the caller rather than degrade into "owns nothing" — which would look exactly
 * like a brain the toolkit is free to overwrite.
 */
export function parseManifest(text: string): ManifestResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      refusal: {
        code: 'not-json',
        reason: `The manifest is not valid JSON: ${(error as Error).message}`,
      },
    };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      refusal: {
        code: 'not-an-object',
        reason: 'The manifest is not a JSON object.',
      },
    };
  }

  const record = parsed as Record<string, unknown>;

  if (record.manifestVersion !== MANIFEST_VERSION) {
    return {
      ok: false,
      refusal: {
        code: 'version-unsupported',
        reason: `Unsupported manifestVersion ${JSON.stringify(record.manifestVersion)}; this toolkit reads ${MANIFEST_VERSION}.`,
      },
    };
  }

  for (const field of ['toolkitVersion', 'createdAt'] as const) {
    if (!(field in record)) {
      return {
        ok: false,
        refusal: {
          code: 'field-missing',
          reason: `The manifest has no "${field}" field.`,
        },
      };
    }
    if (typeof record[field] !== 'string') {
      return {
        ok: false,
        refusal: {
          code: 'field-malformed',
          reason: `The manifest's "${field}" is not a string.`,
        },
      };
    }
  }

  if (!('files' in record)) {
    return {
      ok: false,
      refusal: {
        code: 'field-missing',
        reason: 'The manifest has no "files" field.',
      },
    };
  }
  if (!Array.isArray(record.files)) {
    return {
      ok: false,
      refusal: {
        code: 'field-malformed',
        reason: 'The manifest\'s "files" is not an array.',
      },
    };
  }

  const files: ManifestEntry[] = [];
  for (const raw of record.files) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return {
        ok: false,
        refusal: {
          code: 'field-malformed',
          reason: 'A "files" entry is not an object.',
        },
      };
    }
    const entry = raw as Record<string, unknown>;
    if (typeof entry.path !== 'string' || typeof entry.sha256 !== 'string') {
      return {
        ok: false,
        refusal: {
          code: 'field-malformed',
          reason: 'A "files" entry is missing a string "path" or "sha256".',
        },
      };
    }
    files.push({ path: entry.path, sha256: entry.sha256 });
  }

  return buildManifest({
    toolkitVersion: record.toolkitVersion as string,
    createdAt: record.createdAt as string,
    files,
  });
}

/**
 * Whether the toolkit owns this brain-relative path.
 *
 * Absence is user ownership. Callers ask this before any write that is not
 * additive, and a `false` means the file is the user's, full stop.
 */
export function isOwned(manifest: Manifest, path: string): boolean {
  return manifest.files.some((entry) => entry.path === path);
}

/** What became of one owned file since the toolkit wrote it. */
export type DriftState = 'unchanged' | 'modified' | 'missing';

export interface DriftEntry {
  readonly path: string;
  readonly state: DriftState;
}

/**
 * Compare a manifest against the hashes a caller observed on disk.
 *
 * `observed` maps brain-relative path to content hash, with `null` for a file
 * that is gone. Paths the manifest does not claim are ignored however many
 * there are: this reports on owned files only, because the rest are not the
 * toolkit's to have an opinion about.
 *
 * Reporting is all this does. Repairing drift is Feature 06's concern, and
 * nothing here decides what a caller should do about what it finds.
 */
export function detectDrift(
  manifest: Manifest,
  observed: ReadonlyMap<string, string | null>,
): readonly DriftEntry[] {
  return manifest.files.map((entry) => {
    const hash = observed.get(entry.path);
    if (hash === undefined || hash === null) {
      return { path: entry.path, state: 'missing' as const };
    }
    return {
      path: entry.path,
      state:
        hash === entry.sha256 ? ('unchanged' as const) : ('modified' as const),
    };
  });
}
