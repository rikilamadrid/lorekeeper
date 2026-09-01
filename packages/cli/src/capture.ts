/**
 * `lore capture <brain> <item>` — write one thought into the inbox.
 *
 * The brain is named explicitly. There is no upward discovery from the working
 * directory, no configured default, and no implicit lookup of any other kind:
 * the caller says which directory it means, so nested brains need no rule.
 *
 * What lands in the inbox has to be worth finding before anything processes
 * it, which is the whole reason the format is this plain. Frontmatter carrying
 * an `id` and a `created`, a blank line, and the text as it was typed — no
 * index, no database, and nothing that has to be reconstituted by a tool. The
 * subject is in the filename, in the `id`, and in the body, so `grep -r` alone
 * finds it and `cat` alone reads it.
 *
 * Two things are deliberately absent. There is no `type`: that vocabulary is
 * unfrozen in v0.1, and stamping a provisional value onto every capture would
 * freeze it by accident. And there is no network call — capture does not fetch,
 * transcribe, or summarize whatever the text refers to.
 *
 * A captured URL is a source rather than an inbox item. It lands in `sources/`
 * carrying its origin `url` and, as its `id`, the stable source ID
 * `packages/core` mints from the normalized form. That ID is the whole point:
 * five YouTube URLs for one video are one source, and capturing a URL already
 * in the brain reports the file that holds it and writes nothing. The check is
 * on the ID in a file's frontmatter and never on a filename or a folder, so
 * reorganizing a vault cannot make a source look new. Identifying a URL is
 * still not visiting one — nothing here is fetched.
 *
 * What counts as a URL is decided narrowly, because guessing in either
 * direction loses something. An item carrying whitespace is text, so
 * `"javascript: the good parts"` — which `URL` will happily parse — stays the
 * thought it plainly is. A single unbroken token that parses as a URL is a URL,
 * and if its scheme is one a source cannot have, the run says so instead of
 * quietly filing `mailto:someone@example.com` in the inbox as prose. Anything
 * that is not a URL at all is text, and text is never refused: a capture
 * command that can reject a thought is a capture command people stop trusting.
 *
 * The timestamp keeps the writer's local offset. Reading an ISO timestamp into
 * a `Date` and back is what silently rewrote a local offset to UTC in prototype
 * `schema-v0`, and a thought recorded at 07:42 belongs at 07:42 — this mints
 * the offset rather than discarding it.
 *
 * Writing is additive, under the same rules `init` established and `brain.ts`
 * now holds. The ownership record is read and every ambiguity in it refused
 * before the first byte is written; the file is created with `wx`, so the
 * operating system, not a prior check, guarantees nothing is overwritten; and
 * the path is claimed only after the write that created it returned.
 *
 * Every failure below is reported, not raised. Two rules follow from that, and
 * both exist because a report is the only account a user gets of what a tool
 * did inside their notes:
 *
 * - A refusal says what failed and what to do about it, in words. Node's
 *   `EACCES: permission denied, open '…'` names the plumbing rather than the
 *   problem, so {@link explain} translates it and nothing here echoes a raw
 *   message.
 * - A capture that reached the disk is always reported as written, even when
 *   the run then fails. Claiming it can fail on its own — a read-only
 *   `.lorekeeper/` is the ordinary way — and the file stays exactly where it
 *   is, unclaimed and therefore the user's. What must never happen is that it
 *   exists and nobody is told.
 */

import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  MANIFEST_PATH,
  type Manifest,
  type ManifestEntry,
  sourceIdFor,
} from '@lorekeeper/core';
import {
  claim,
  exists,
  isDirectory,
  isOccupied,
  leavesBrain,
  readInstallationManifest,
} from './brain.js';
import { hashText } from './hash.js';
import type { Streams } from './run.js';
import { findSourceById } from './sources.js';
import { readVersion } from './version.js';

/** The folder a captured thought lands in. */
const INBOX = 'inbox';

/** The folder a captured URL lands in. Capture writes to these two and no others. */
const SOURCES = 'sources';

/**
 * How many names are tried before giving up on finding a free one.
 *
 * The suffix loop exists for the ordinary collision — two captures in the same
 * second, or the same second in two processes — not for a directory holding a
 * thousand captures of one subject in one second. A bound keeps a pathological
 * case a reported failure instead of a spin.
 */
const MAX_NAME_ATTEMPTS = 100;

/** The longest slug a filename carries, in characters, before it is cut. */
const MAX_SLUG_LENGTH = 48;

export interface CaptureOptions {
  /** Where a relative brain path resolves from. Defaults to the process's cwd. */
  readonly cwd?: string;
  /** The clock, injected so a test can assert an exact file. */
  readonly now?: () => Date;
}

export function capture(
  args: readonly string[],
  streams: Streams,
  options: CaptureOptions = {},
): number {
  const [rawBrain, item, ...rest] = args;
  if (rawBrain === undefined || item === undefined) {
    streams.err('lore capture: name the brain and what to capture.\n');
    streams.err('  lore capture <brain> <item>\n');
    return 2;
  }
  if (rest.length > 0) {
    // Unquoted text arrives here as several arguments, and joining them would
    // quietly rewrite the spacing someone typed. Say what to do instead.
    streams.err(`lore capture: unexpected argument "${rest[0]}".\n`);
    streams.err(
      'Quote the text you are capturing so it arrives as one item.\n',
    );
    streams.err('  lore capture <brain> "<item>"\n');
    return 2;
  }
  if (item.trim() === '') {
    streams.err('lore capture: there is nothing to capture.\n');
    streams.err('  lore capture <brain> "<item>"\n');
    return 2;
  }

  const cwd = options.cwd ?? process.cwd();
  const target = resolve(cwd, rawBrain);

  try {
    if (!isDirectory(target)) {
      streams.err(
        `lore capture: ${target} is not a directory, so there is no brain there. Nothing was written.\n`,
      );
      streams.err('  lore capture <brain> "<item>"\n');
      return 1;
    }
    const brain = realpathSync(target);

    const installation = readInstallationManifest(target, 'capturing again');
    if (!installation.ok) {
      streams.err(`lore capture: ${installation.reason}\n`);
      return 1;
    }
    if (installation.manifest === null) {
      streams.err(
        `lore capture: ${target} is not a Lorekeeper brain — it has no ${MANIFEST_PATH}. Nothing was written.\n`,
      );
      streams.err(`  lore init ${rawBrain}\n`);
      return 1;
    }

    const identity = identify(item);
    if (identity.kind === 'refused') {
      streams.err(`lore capture: ${identity.reason}\n`);
      streams.err(
        'Capture a source as an http or https URL, or capture what you want to say about it as text.\n',
      );
      return 1;
    }

    if (identity.kind === 'source') {
      // Asked before anything is created, so a duplicate leaves the brain
      // byte-for-byte as it was — no folder appears, no manifest is touched.
      const found = findSourceById(target, brain, identity.id);
      if (found.exhausted) {
        streams.err(
          `lore capture: ${target} holds too many files to check for an existing copy of ${identity.id}. Nothing was written.\n`,
        );
        streams.err(
          'Writing without that check could put a second copy of a source in your brain, which is the one thing this command must not do.\n',
        );
        return 1;
      }
      if (found.path !== null) {
        streams.out(`Already captured as ${join(target, found.path)}\n`);
        streams.out(`  id: ${identity.id}\n`);
        streams.out('Nothing was written.\n');
        return 0;
      }
    }

    const folder = identity.kind === 'source' ? SOURCES : INBOX;
    const directory = join(target, folder);
    if (leavesBrain(directory, brain)) {
      streams.err(
        `lore capture: ${folder} in ${target} resolves outside that directory, so nothing was written there.\n`,
      );
      return 1;
    }
    if (exists(directory) && !isDirectory(directory)) {
      streams.err(
        `lore capture: ${directory} is not a directory, so a capture cannot be written into it. Nothing was written.\n`,
      );
      streams.err(
        `Move or rename whatever is at that path, then capture again.\n`,
      );
      return 1;
    }
    try {
      mkdirSync(directory, { recursive: true });
    } catch (error) {
      streams.err(
        `lore capture: ${directory} could not be created: ${explain(error)}. Nothing was written.\n`,
      );
      streams.err(`Make sure ${target} is a directory you can write to.\n`);
      return 1;
    }

    const written = write(target, brain, identity, options);
    if (!written.ok) {
      streams.err(`lore capture: ${written.reason}\n`);
      streams.err(written.remedy);
      return 1;
    }

    const path = join(target, written.entry.path);
    const recorded = record(
      target,
      written.entry,
      installation.manifest,
      options,
    );
    if (!recorded.ok) {
      // The capture is on disk and stays there. An unclaimed file is the user's
      // permanently — absence from the manifest is a statement of ownership,
      // not a gap — so deleting it to make the run look clean would throw away
      // the one thing that mattered. Both halves get said instead, because a
      // user told only "permission denied" would never know a file exists.
      streams.err(
        `lore capture: your capture was written to ${path}, but ${MANIFEST_PATH} could not be updated: ${recorded.reason}.\n`,
      );
      streams.err(
        `The file is intact and is now yours — Lorekeeper has not recorded it as its own, and will never rewrite or move it.\n`,
      );
      streams.err(
        recorded.cause === 'filesystem'
          ? `To let Lorekeeper manage it, make ${join(target, dirname(MANIFEST_PATH))} writable and capture again; this one stays where it is either way.\n`
          : `${MANIFEST_PATH} is readable and writable; what it says is the problem. Nothing here will fix itself by capturing again.\n`,
      );
      return 1;
    }

    streams.out(`Captured to ${path}\n`);
    streams.out(`  id: ${written.id}\n`);
    return 0;
  } catch (error) {
    streams.err(
      `lore capture: could not capture into ${target}: ${explain(error)}.\n`,
    );
    return 1;
  }
}

type Recorded =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: string;
      /**
       * Which kind of failure this was. `filesystem` means the manifest could
       * not be written; `refusal` means it could, and what it would have said
       * was rejected.
       */
      readonly cause: 'filesystem' | 'refusal';
    };

/**
 * Claim the written capture, reporting a failure rather than raising one.
 *
 * `claim` refuses a manifest it cannot build and *throws* when it cannot write
 * one — a read-only `.lorekeeper/` being the ordinary way that happens. Both
 * are the same event from the caller's side, and both have to reach the branch
 * that knows a file is already on disk. Letting the throw travel to the outer
 * catch is what turned a recoverable outcome into a bare `EACCES` with no
 * mention of the capture it had just written.
 *
 * The two are still told apart, because the remedy differs and a wrong remedy
 * is worse than none. Only a write failure is fixed by making `.lorekeeper/`
 * writable; a refusal means the manifest was perfectly writable and its
 * *content* was the problem, and telling that user to check permissions sends
 * them to inspect something that is working.
 */
function record(
  target: string,
  entry: ManifestEntry,
  existing: Manifest,
  options: CaptureOptions,
): Recorded {
  try {
    const claimed = claim(target, [entry], existing, {
      toolkitVersion: readVersion(),
      now: options.now ?? (() => new Date()),
    });
    return claimed.ok
      ? { ok: true }
      : { ok: false, reason: claimed.reason, cause: 'refusal' };
  } catch (error) {
    return { ok: false, reason: explain(error), cause: 'filesystem' };
  }
}

/**
 * A filesystem failure in words the person who hit it can act on.
 *
 * Node's own message is the path plus a syscall and an errno — `EACCES:
 * permission denied, open '…'` — which names the plumbing rather than the
 * problem. The path is already in every message here, so what is left to add
 * is the cause, and the cause is what the user can actually do something
 * about.
 *
 * An unrecognized failure gets a plain sentence rather than a raw message.
 * There is a real cost to that: a rare errno arrives here with less detail
 * than Node had. It is paid deliberately, because the alternative is a promise
 * that holds for the codes listed below and quietly breaks for everything
 * else, and a refusal that leaks `ENOTEMPTY` at someone is not a refusal this
 * command should be making.
 */
function explain(error: unknown): string {
  switch ((error as NodeJS.ErrnoException | null)?.code) {
    case 'EACCES':
    case 'EPERM':
      return 'permission was denied';
    case 'EEXIST':
      return 'something already exists at that path';
    case 'ENOTDIR':
      return 'part of that path is a file, not a directory';
    case 'EISDIR':
      return 'that path is a directory';
    case 'ENOENT':
      return 'that path no longer exists';
    case 'EROFS':
      return 'the filesystem is read-only';
    case 'ENOSPC':
      return 'the disk is full';
    case 'EDQUOT':
      return 'the disk quota is exhausted';
    case 'ENAMETOOLONG':
      return 'the name is too long for this filesystem';
    case 'EMFILE':
    case 'ENFILE':
      return 'too many files are open';
    case 'ELOOP':
      return 'that path leads through a loop of symbolic links';
    default:
      return 'the filesystem refused the operation';
  }
}

/** What the captured item turned out to be, and so where it goes. */
type Identity =
  /** Not a URL. An ordinary thought, bound for the inbox. */
  | { readonly kind: 'text'; readonly item: string }
  /** A URL with a stable source ID, bound for `sources/`. */
  | { readonly kind: 'source'; readonly id: string; readonly url: string }
  /** Meant as a URL, but one a source cannot have. */
  | { readonly kind: 'refused'; readonly reason: string };

/**
 * Decide what was captured.
 *
 * The whitespace test comes first and is the whole reason this is not simply
 * `sourceIdFor`. `URL` parses `"javascript: the good parts"` — scheme
 * `javascript:`, the rest an opaque path — and a capture command that answered
 * a typed thought with "that scheme is unsupported" would be broken in the way
 * users never forgive. A URL someone pastes has no spaces in it, so requiring
 * a single unbroken token costs nothing real and settles the ambiguity in
 * favor of the thought.
 *
 * After that gate, core decides. `not-a-url` means it was text after all and
 * text is never refused. Every other refusal is reported, because the item was
 * unmistakably meant as a URL and silently filing it as prose would leave the
 * user with a source they believe they captured and cannot find.
 */
function identify(item: string): Identity {
  const trimmed = item.trim();
  if (/\s/u.test(trimmed)) {
    return { kind: 'text', item };
  }
  const result = sourceIdFor(trimmed, hashText);
  if (result.ok) {
    return { kind: 'source', id: result.id, url: trimmed };
  }
  if (result.refusal.code === 'not-a-url') {
    return { kind: 'text', item };
  }
  return { kind: 'refused', reason: result.refusal.reason };
}

type WriteResult =
  | { readonly ok: true; readonly entry: ManifestEntry; readonly id: string }
  | {
      readonly ok: false;
      readonly reason: string;
      /** What the user can do about it, as a whole line. */
      readonly remedy: string;
    };

/**
 * Create the capture under the first free name, or say why none could be.
 *
 * Every candidate is opened with `wx`, so the check and the claim on the name
 * are the same operation. Two processes capturing in the same second cannot
 * both win it, and neither can overwrite a file that was already there.
 *
 * A failure is returned rather than thrown. Nothing has been written when one
 * happens, and the caller is the only place that knows how to say so.
 */
function write(
  target: string,
  brain: string,
  identity: Exclude<Identity, { kind: 'refused' }>,
  options: CaptureOptions,
): WriteResult {
  const at = options.now?.() ?? new Date();
  const created = localTimestamp(at);
  const folder = identity.kind === 'source' ? SOURCES : INBOX;

  // An inbox item's identifier is its filename, so a suffixed name is a
  // different id. A source's identifier is the source ID, which the filename
  // reflects but does not decide: two files could never legitimately hold it,
  // and if a name is taken the id must not move with the name.
  const base =
    identity.kind === 'source'
      ? identity.id
      : `${stamp(at)}-${slug(identity.item)}`;

  for (let attempt = 1; attempt <= MAX_NAME_ATTEMPTS; attempt += 1) {
    const name = attempt === 1 ? base : `${base}-${attempt}`;
    const relative = `${folder}/${name}.md`;
    const path = join(target, relative);
    if (leavesBrain(path, brain)) {
      // Something under this name points out of the brain. It is not ours to
      // write through, and the next candidate name is a different file.
      continue;
    }
    const id = identity.kind === 'source' ? identity.id : name;
    const content =
      identity.kind === 'source'
        ? source(id, created, identity.url)
        : document(id, created, identity.item);
    try {
      writeFileSync(path, content, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      if (isOccupied(error)) {
        continue;
      }
      return {
        ok: false,
        reason: `${path} could not be written: ${explain(error)}. Nothing was written.`,
        remedy: `Make sure ${join(target, folder)} is a directory you can write to, then capture again.\n`,
      };
    }
    return {
      ok: true,
      entry: { path: relative, sha256: hashText(content) },
      id,
    };
  }
  return {
    ok: false,
    reason: `no unused name was free in ${folder}/ after ${MAX_NAME_ATTEMPTS} tries. Nothing was written.`,
    remedy: `Every candidate name for this capture is taken. Move or rename what is there, then capture again.\n`,
  };
}

/**
 * The captured file, byte for byte.
 *
 * `id` and `created` are written unquoted because both are plain YAML 1.2 core
 * scalars: a slug is not a number and a timestamp with an offset stays a
 * string, so what a reader gets back is the text written here. The captured
 * text is body, never frontmatter, so nothing in it can be read as YAML.
 */
function document(id: string, created: string, item: string): string {
  return `---\nid: ${id}\ncreated: ${created}\n---\n\n${item.trim()}\n`;
}

/**
 * A captured source, byte for byte.
 *
 * The file is composed here rather than through a `packages/core` mutation
 * operation, and that is the deliberate line: creating a file with its first
 * validated frontmatter is not mutating one. There is no existing span to
 * preserve, no unrecognized field to carry forward, and nothing a user wrote
 * that a re-serialization could quietly rewrite. Every later change to this
 * file's provenance or edges goes through the Feature 02 operations, which
 * exist precisely because by then there is something to lose.
 *
 * `id` is written unquoted — a source ID is a rule prefix and either a YouTube
 * video ID or a hex digest, so it is a plain YAML scalar under any reading.
 * `url` is quoted, unlike anything in {@link document}. It is arbitrary text
 * the user typed, and a trailing `:` or a stray `#` in a plain scalar is the
 * kind of thing that parses as something else on a machine that is not this
 * one. Quoting costs a byte of noise and removes the question.
 *
 * The URL is the body as well as the field, exactly as typed. Frontmatter is
 * the tool's account of the file; the body is the capture. Someone reading this
 * with `cat`, before any processing has happened, should see what they
 * captured, and `grep` for a URL should find the source of it either way.
 *
 * What is stored is the URL as written, never the normalized form. The
 * normalized URL decided the `id` and its job is done; the user's own URL is
 * the one that will still open the thing they meant, query parameters, session
 * markers, and all.
 */
function source(id: string, created: string, url: string): string {
  return `---\nid: ${id}\ncreated: ${created}\nurl: ${quote(url)}\n---\n\n${url}\n`;
}

/**
 * A YAML double-quoted scalar.
 *
 * `\` and `"` are escaped because the style gives them meaning. C0 control
 * characters are escaped because YAML 1.2 does not permit them raw in a
 * double-quoted scalar at all, and one can reach here: {@link identify} rules
 * out whitespace, but `\u0001` is not whitespace, and
 * `https://example.com/\u0001x` is a URL the WHATWG parser accepts. Writing it
 * raw produced a file this project's own parser happens to tolerate and a
 * stricter reader of the same vault would reject — which is precisely the kind
 * of file a plain-Markdown brain must not contain.
 *
 * The scan is one pass over code units rather than a chain of replacements.
 * That removes the question of whether a later replacement can rewrite an
 * escape an earlier one produced, and it keeps the control characters out of a
 * regular expression, where they are hard to read and the linter rightly
 * objects to them.
 */
function quote(value: string): string {
  let out = '';
  for (const character of value) {
    out += escaped(character);
  }
  return `"${out}"`;
}

/** One character as YAML 1.2 double-quoted style needs it written. */
function escaped(character: string): string {
  switch (character) {
    case '\\':
      return '\\\\';
    case '"':
      return '\\"';
    case '\u0000':
      return '\\0';
    case '\u0007':
      return '\\a';
    case '\b':
      return '\\b';
    case '\t':
      return '\\t';
    case '\n':
      return '\\n';
    case '\v':
      return '\\v';
    case '\f':
      return '\\f';
    case '\r':
      return '\\r';
    case '\u001b':
      return '\\e';
    default: {
      const code = character.codePointAt(0) ?? 0;
      // C0 and DEL are the ones YAML forbids raw. Everything else — every
      // letter, every percent-encoding, every non-ASCII character a URL may
      // carry — is written as it is.
      return code < 0x20 || code === 0x7f
        ? `\\x${code.toString(16).padStart(2, '0')}`
        : character;
    }
  }
}

/** `YYYYMMDD-HHMMSS` in the writer's own timezone, so files sort by their day. */
function stamp(at: Date): string {
  return [
    pad(at.getFullYear(), 4),
    pad(at.getMonth() + 1),
    pad(at.getDate()),
    '-',
    pad(at.getHours()),
    pad(at.getMinutes()),
    pad(at.getSeconds()),
  ].join('');
}

/** ISO 8601 keeping the writer's local offset, never normalized to UTC. */
function localTimestamp(at: Date): string {
  const offset = -at.getTimezoneOffset();
  const sign = offset < 0 ? '-' : '+';
  const magnitude = Math.abs(offset);
  const date = `${pad(at.getFullYear(), 4)}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
  return `${date}T${time}${sign}${pad(Math.floor(magnitude / 60))}:${pad(magnitude % 60)}`;
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/**
 * The subject, as a filename fragment.
 *
 * Letters and digits in any script survive; everything else becomes a
 * separator. Restricting this to ASCII would reduce a capture written in
 * Spanish or Japanese to nothing, and the point of putting the subject in the
 * name is that the user recognizes it in a directory listing.
 *
 * The cut is at a separator when there is one to cut at, so a truncated slug
 * ends on a whole word rather than mid-syllable.
 */
function slug(item: string): string {
  const words = item
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  if (words === '') {
    // Punctuation, emoji, or symbols alone. The timestamp still names the file.
    return 'capture';
  }
  if (words.length <= MAX_SLUG_LENGTH) {
    return words;
  }
  const cut = words.slice(0, MAX_SLUG_LENGTH);
  const boundary = cut.lastIndexOf('-');
  return boundary > 0 ? cut.slice(0, boundary) : cut;
}
