/**
 * URL identity: the normalized form of a URL, and the stable ID a source
 * carries because of it.
 *
 * Two URLs that name the same thing must produce one source, or provenance
 * splits and dedup silently stops working. Getting there is not a matter of
 * stripping known tracking parameters: prototype `schema-v0` found that a
 * generic blocklist left `&list=` and `&index=` in place — neither is a
 * tracking parameter, and neither changes which video is identified — while a
 * blocklist aggressive enough to catch them also ate `?page=2`, which does
 * change which page is meant. Identity is a per-domain question, so the answer
 * is a per-domain rule.
 *
 * One rule ships in v0.1, for YouTube, and the shape is deliberately open for
 * more. Everything else is normalized generically and conservatively: the
 * generic path corrects only what is safe to correct everywhere, because a
 * generic rule that guesses merges two of the user's sources into one, and that
 * is not a mistake a later run can find.
 *
 * This module is filesystem-free and free of any platform runtime API, like the
 * rest of `packages/core`. That includes hashing, which is why
 * {@link sourceIdFor} takes the hash function rather than reaching for one:
 * core states what a source ID is, and `packages/cli` supplies the platform
 * capability. `URL` and `URLSearchParams` are the sole ambient globals this
 * package can see, declared narrowly in `url-globals.d.ts` so that reaching for
 * a URL parser does not also hand core `fetch`.
 *
 * KNOWN LIMITATION, for whoever adds the second rule: a source ID is stable
 * only while the rule that minted it keeps speaking for the URL. A URL that is
 * `url-<digest>` today becomes `<prefix>-<key>` the day a domain rule claims
 * it, and provenance edges written against the old ID will not resolve — which
 * the FROZEN contract that edges resolve by stable source ID does not permit
 * anyone to shrug at. Adding a rule is therefore a migration, not an
 * extension. Nothing here versions the rule set yet; ticket 04.4 decides the
 * policy, and until it does, do not add a second rule.
 */

/** Which identity rule spoke for a URL. */
export type UrlRule = 'youtube' | 'generic';

/** A URL reduced to the form that decides its identity. */
export interface NormalizedUrl {
  /** The normalized URL, serialized. Two equal strings are the same source. */
  readonly url: string;
  /** The rule that produced it. */
  readonly rule: UrlRule;
  /**
   * The rule's own identifying key, when it has one that is injective within
   * the domain — a YouTube video ID, for instance. `null` under the generic
   * rule, where nothing short of the whole URL identifies the resource.
   */
  readonly key: string | null;
}

/** Why a URL has no identity. Codes are safe to match on. */
export type UrlRefusalCode =
  | 'not-a-url'
  | 'scheme-unsupported'
  | 'digest-malformed'
  | 'digest-failed';

export interface UrlRefusal {
  readonly code: UrlRefusalCode;
  /** One sentence a human can act on. Names the input, never invents a fix. */
  readonly reason: string;
}

/** Either a normalized URL or the reason there is none. Nothing here throws. */
export type NormalizeResult =
  | { readonly ok: true; readonly normalized: NormalizedUrl }
  | { readonly ok: false; readonly refusal: UrlRefusal };

/** Either a source ID or the reason there is none. Nothing here throws. */
export type SourceIdResult =
  | {
      readonly ok: true;
      readonly id: string;
      readonly normalized: NormalizedUrl;
    }
  | { readonly ok: false; readonly refusal: UrlRefusal };

/**
 * The schemes a source URL may use. A source is something a person can go back
 * and read; `mailto:`, `file:`, and `javascript:` are not that, and giving one
 * an ID would put an unreachable origin in the provenance graph.
 */
const SUPPORTED_SCHEMES = new Set(['http:', 'https:']);

/** Hosts the YouTube rule speaks for. */
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

/** The short-link host, where the video ID is the path. */
const YOUTUBE_SHORT_HOSTS = new Set(['youtu.be', 'www.youtu.be']);

/** Path prefixes that carry a video ID as their next segment. */
const YOUTUBE_ID_PREFIXES = ['shorts', 'embed', 'live', 'v'];

/** A YouTube video ID: eleven characters from the URL-safe alphabet. */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** The canonical form every YouTube variant collapses to. */
const YOUTUBE_CANONICAL = 'https://www.youtube.com/watch?v=';

/**
 * The prefix a rule's IDs carry, so an ID says which rule minted it. A second
 * domain rule adds its own here rather than teaching {@link sourceIdFor} about
 * itself.
 */
const RULE_PREFIX: Readonly<Record<UrlRule, string>> = {
  youtube: 'yt',
  generic: 'url',
};

/**
 * The hash a generic source ID is a slice of, named here so core and the
 * package that supplies the platform capability agree on it: SHA-256 over the
 * normalized URL, lowercase hex. `packages/cli` implements it in `hash.ts`,
 * and a test holds the two in step.
 *
 * Changing this value, or changing what {@link sourceIdFor} feeds it, re-IDs
 * every `url-` source already written to a user's disk and breaks every
 * provenance edge pointing at one. A golden literal-ID test exists so that
 * cannot happen green.
 */
export const URL_ID_HASH_ALGORITHM = 'sha256';

/**
 * How many digest characters a generic source ID carries. Part of the ID
 * contract for the same reason the algorithm is: changing it re-IDs every
 * `url-` source.
 */
export const URL_ID_DIGEST_LENGTH = 12;

/** A lowercase hex digest long enough to slice an ID from. */
const HEX_DIGEST = /^[0-9a-f]+$/;

/**
 * Reduce a URL to the form that decides its identity.
 *
 * The generic path corrects only what is safe everywhere: the scheme and host
 * are lowercased and a default port dropped by `URL` itself, a trailing slash
 * on a non-root path is removed, and query parameters are sorted so their order
 * stops mattering.
 *
 * The fragment is dropped when it is a document anchor — `#section` addresses a
 * place inside a document, not a different document — and kept when it is
 * path-shaped, meaning it begins with `/`. A hash-routed application puts the
 * whole location there: `https://app.example.com/#/notes/5` and `.../#/notes/6`
 * are two different pages, and dropping the fragment would collapse every page
 * of such a site into a single source, reporting the second capture as a
 * duplicate of the first. That is exactly the mistake this module refuses to
 * make elsewhere — a generic rule that guesses merges two of the user's sources
 * into one — so it is not made here either. The cost is the other direction:
 * a site that hash-routes *and* uses anchors keeps `#/notes/5#intro` as its own
 * source. Splitting one source in two is recoverable; merging two into one is
 * not, and that asymmetry is what decides the default.
 *
 * Credentials in the authority — `https://user:pass@example.com/x` — are
 * dropped with the rest of the userinfo, so they never decide identity and
 * never reach a provenance graph the user greps. That URL and the same one
 * without them are one source, which is the right answer: a password is not
 * part of what a document is.
 *
 * Beyond those, the generic path strips nothing. No parameter blocklist, and no
 * `www.` collapsing: `www.example.com` and `example.com` usually serve the same
 * site, but "usually" is how two distinct sources become one, and a domain that
 * wants them merged can say so in a rule.
 */
export function normalizeUrl(raw: string): NormalizeResult {
  const trimmed = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      refusal: {
        code: 'not-a-url',
        reason: `${describe(trimmed)} is not a URL. A source URL needs a scheme, as in https://example.com/page.`,
      },
    };
  }

  if (!SUPPORTED_SCHEMES.has(parsed.protocol)) {
    return {
      ok: false,
      refusal: {
        code: 'scheme-unsupported',
        reason: `${describe(trimmed)} uses the ${parsed.protocol} scheme. A source URL must be http or https.`,
      },
    };
  }

  const video = youtubeVideoId(parsed);
  if (video !== null) {
    return {
      ok: true,
      normalized: {
        url: `${YOUTUBE_CANONICAL}${video}`,
        rule: 'youtube',
        key: video,
      },
    };
  }

  return {
    ok: true,
    normalized: { url: generic(parsed), rule: 'generic', key: null },
  };
}

/**
 * The stable source ID for a URL, or the reason it has none.
 *
 * Where a rule identifies the resource injectively, the ID says so and stays
 * readable: a YouTube video is `yt-` and its video ID, which is the same string
 * a person would recognize in the URL bar. Where nothing but the whole URL
 * identifies it, the ID is `url-` and a slice of the digest of the normalized
 * form — unreadable, but collision-safe, which a slug of host and path is not.
 *
 * `hash` must return a lowercase hex digest; `hashText` in `packages/cli` is
 * the one this project passes. A digest of the wrong shape is refused rather
 * than sliced into an ID that only looks like one, and a `hash` that throws is
 * refused rather than allowed to escape: "nothing here throws" is a contract
 * this function owes its callers even when the function it was handed does not
 * keep it.
 */
export function sourceIdFor(
  raw: string,
  hash: (text: string) => string,
): SourceIdResult {
  const result = normalizeUrl(raw);
  if (!result.ok) {
    return result;
  }

  const { normalized } = result;
  if (normalized.key !== null) {
    return {
      ok: true,
      id: `${RULE_PREFIX[normalized.rule]}-${normalized.key}`,
      normalized,
    };
  }

  let digest: unknown;
  try {
    digest = hash(normalized.url);
  } catch (error) {
    return {
      ok: false,
      refusal: {
        code: 'digest-failed',
        reason: `The hash function threw ${describe(messageOf(error))} for a URL it was asked to digest.`,
      },
    };
  }

  if (
    typeof digest !== 'string' ||
    !HEX_DIGEST.test(digest) ||
    digest.length < URL_ID_DIGEST_LENGTH
  ) {
    return {
      ok: false,
      refusal: {
        code: 'digest-malformed',
        reason: `The hash function returned ${describe(String(digest))}, which is not a lowercase hex digest of at least ${URL_ID_DIGEST_LENGTH} characters.`,
      },
    };
  }
  return {
    ok: true,
    id: `${RULE_PREFIX.generic}-${digest.slice(0, URL_ID_DIGEST_LENGTH)}`,
    normalized,
  };
}

/**
 * The video this URL identifies, or `null` when it identifies no video.
 *
 * A YouTube host that is not addressing a video — a channel, a playlist page,
 * the home page — falls through to the generic rule rather than being refused.
 * Those are real things a person captures, and the video rule simply has
 * nothing to say about them.
 *
 * Each form is matched on its exact segment count. `youtu.be/<id>/anything` is
 * not a video URL YouTube serves, so claiming it identifies `<id>` would be a
 * guess, and a guess here merges two of the user's sources. An unrecognized
 * shape falls through; it is never quietly rounded to the nearest video.
 */
function youtubeVideoId(url: URL): string | null {
  const segments = url.pathname.split('/').filter((segment) => segment !== '');

  if (YOUTUBE_SHORT_HOSTS.has(url.hostname)) {
    if (segments.length !== 1) {
      return null;
    }
    const [id] = segments;
    return id !== undefined && YOUTUBE_ID.test(id) ? id : null;
  }

  if (!YOUTUBE_HOSTS.has(url.hostname)) {
    return null;
  }

  if (segments.length === 1 && segments[0] === 'watch') {
    const id = url.searchParams.get('v');
    return id !== null && YOUTUBE_ID.test(id) ? id : null;
  }

  if (segments.length !== 2) {
    return null;
  }
  const [prefix, id] = segments;
  if (
    prefix !== undefined &&
    YOUTUBE_ID_PREFIXES.includes(prefix) &&
    id !== undefined &&
    YOUTUBE_ID.test(id)
  ) {
    return id;
  }
  return null;
}

/**
 * The generic normalized form: origin, tidied path, sorted query, and the
 * fragment only when it is path-shaped. See {@link normalizeUrl} for why a
 * route survives where an anchor does not.
 */
function generic(url: URL): string {
  const path =
    url.pathname.length > 1 && url.pathname.endsWith('/')
      ? url.pathname.slice(0, -1)
      : url.pathname;

  const query = new URLSearchParams(url.searchParams);
  query.sort();
  const search = query.toString();

  // `url.hash` carries its own leading `#`, and is `''` when there is none.
  const route = url.hash.startsWith('#/') ? url.hash : '';

  return `${url.origin}${path}${search === '' ? '' : `?${search}`}${route}`;
}

/** What a thrown value says, for a value that need not be an `Error`. */
function messageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : String(error);
}

/**
 * The userinfo component of an authority, with whatever follows `//` up to the
 * `@`. Matched textually rather than through `URL`, because the input that most
 * needs redacting is the one `URL` refused to parse.
 */
const USERINFO = /\/\/[^/?#@\s]*@/g;

/**
 * A value quoted for an error message, with credentials removed and long input
 * cut short.
 *
 * {@link normalizeUrl} drops userinfo so a password never decides identity and
 * never reaches a provenance graph the user greps. A refusal has to hold the
 * same line: these reasons are printed by the CLI, and a message is copied into
 * a terminal transcript, a bug report, or a screenshot far more readily than a
 * file is. `https://user:pass@example.com` is refused as
 * `"https://<redacted>@example.com"`.
 *
 * The whole userinfo goes, not just the password after the colon. A bare
 * username is still a credential half, and telling the user which account they
 * typed is not worth putting it in every log that catches this message.
 *
 * Redaction happens before the length cut, so a long URL cannot push the
 * credentials past the ellipsis and out of reach of the substitution.
 */
function describe(value: string): string {
  const safe = value.replace(USERINFO, '//<redacted>@');
  const shown = safe.length > 80 ? `${safe.slice(0, 77)}...` : safe;
  return shown === '' ? 'an empty string' : `"${shown}"`;
}
