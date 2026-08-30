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
import { readVersion } from './version.js';

/** The folder a capture lands in. Named here because capture writes nowhere else. */
const INBOX = 'inbox';

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

    const inbox = join(target, INBOX);
    if (leavesBrain(inbox, brain)) {
      streams.err(
        `lore capture: ${INBOX} in ${target} resolves outside that directory, so nothing was written there.\n`,
      );
      return 1;
    }
    if (exists(inbox) && !isDirectory(inbox)) {
      streams.err(
        `lore capture: ${inbox} is not a directory, so a capture cannot be written into it. Nothing was written.\n`,
      );
      streams.err(
        `Move or rename whatever is at that path, then capture again.\n`,
      );
      return 1;
    }
    try {
      mkdirSync(inbox, { recursive: true });
    } catch (error) {
      streams.err(
        `lore capture: ${inbox} could not be created: ${explain(error)}. Nothing was written.\n`,
      );
      streams.err(`Make sure ${target} is a directory you can write to.\n`);
      return 1;
    }

    const written = write(target, brain, item, options);
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
        `To let Lorekeeper manage it, make ${join(target, dirname(MANIFEST_PATH))} writable and capture again; this one stays where it is either way.\n`,
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
  | { readonly ok: false; readonly reason: string };

/**
 * Claim the written capture, reporting a failure rather than raising one.
 *
 * `claim` refuses a manifest it cannot build and *throws* when it cannot write
 * one — a read-only `.lorekeeper/` being the ordinary way that happens. Both
 * are the same event from the caller's side, and both have to reach the branch
 * that knows a file is already on disk. Letting the throw travel to the outer
 * catch is what turned a recoverable outcome into a bare `EACCES` with no
 * mention of the capture it had just written.
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
    return claimed.ok ? { ok: true } : { ok: false, reason: claimed.reason };
  } catch (error) {
    return { ok: false, reason: explain(error) };
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
  item: string,
  options: CaptureOptions,
): WriteResult {
  const at = options.now?.() ?? new Date();
  const created = localTimestamp(at);
  const base = `${stamp(at)}-${slug(item)}`;

  for (let attempt = 1; attempt <= MAX_NAME_ATTEMPTS; attempt += 1) {
    const id = attempt === 1 ? base : `${base}-${attempt}`;
    const relative = `${INBOX}/${id}.md`;
    const path = join(target, relative);
    if (leavesBrain(path, brain)) {
      // Something under this name points out of the brain. It is not ours to
      // write through, and the next candidate name is a different file.
      continue;
    }
    const content = document(id, created, item);
    try {
      writeFileSync(path, content, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      if (isOccupied(error)) {
        continue;
      }
      return {
        ok: false,
        reason: `${path} could not be written: ${explain(error)}. Nothing was written.`,
        remedy: `Make sure ${join(target, INBOX)} is a directory you can write to, then capture again.\n`,
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
    reason: `no unused name was free in ${INBOX}/ after ${MAX_NAME_ATTEMPTS} tries. Nothing was written.`,
    remedy: `Every candidate name for this second is taken. Capture again in a moment.\n`,
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
