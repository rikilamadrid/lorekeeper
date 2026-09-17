/**
 * `lore search` — ranked, span-level retrieval over a directory of Markdown.
 *
 * The brain is named explicitly, as every command that touches one does. A
 * relative path resolves from the process's working directory.
 *
 * Unlike `capture`, this command does not require the directory to be a
 * Lorekeeper brain. Searching only reads, and the managed manifest exists to
 * say which files the toolkit *owns* — a question that has no bearing on which
 * files it may read. Refusing to search a vault because nobody had run `init`
 * on it would be migration by another route: it would make adoption a
 * precondition for the one command that proves adoption works.
 *
 * Nothing here writes. Not to the user's notes, and not to an index either —
 * the index lives in memory for the life of the process. An index file would be
 * a file inside someone's vault that the toolkit owns, and creating owned files
 * is `init`'s business under the manifest, not a side effect of a read command.
 */

import { realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  buildSpanIndex,
  readDocument,
  type SearchResult,
  type Span,
  searchSpans,
  spansOf,
} from '@lorekeeper/core';
import { isDirectory } from './brain.js';
import type { Streams } from './run.js';
import { walkMarkdown } from './walk.js';

/** How many results are printed when the caller does not say. */
const DEFAULT_LIMIT = 5;

const USAGE = '  lore search <brain> "<query>" [--limit <n>] [--json]\n';

export interface SearchOptions {
  /** Where a relative brain path resolves from. Defaults to the process's cwd. */
  readonly cwd?: string;
}

export function search(
  args: readonly string[],
  streams: Streams,
  options: SearchOptions = {},
): number {
  const parsed = parseArguments(args);
  if (!parsed.ok) {
    streams.err(`lore search: ${parsed.reason}\n`);
    streams.err(USAGE);
    return 2;
  }

  const cwd = options.cwd ?? process.cwd();
  const target = resolve(cwd, parsed.brain);

  try {
    if (!isDirectory(target)) {
      streams.err(
        `lore search: ${target} is not a directory, so there is nothing to search.\n`,
      );
      streams.err(USAGE);
      return 1;
    }
    const brain = realpathSync(target);

    const spans: Span[] = [];
    const walk = walkMarkdown(target, brain, (file) => {
      // A file whose frontmatter will not parse is still knowledge worth
      // retrieving. `readDocument` never throws, and reports a `parseError`
      // this command has no reason to act on.
      const document = readDocument(file.name, file.text);
      spans.push(...spansOf(document, file.relative));
      return 'continue';
    });

    const index = buildSpanIndex(spans);
    const results = searchSpans(index, parsed.query, parsed.limit);

    if (parsed.json) {
      streams.out(
        `${renderJson(target, parsed.query, results, walk.exhausted)}\n`,
      );
    } else {
      renderText(streams, target, results, walk.exhausted);
    }
    return 0;
  } catch (error) {
    streams.err(
      `lore search: ${target} could not be searched: ${message(error)}\n`,
    );
    return 1;
  }
}

interface ParsedArguments {
  readonly ok: true;
  readonly brain: string;
  readonly query: string;
  readonly limit: number;
  readonly json: boolean;
}

type ParseResult =
  | ParsedArguments
  | { readonly ok: false; readonly reason: string };

function parseArguments(args: readonly string[]): ParseResult {
  let brain: string | undefined;
  const queryParts: string[] = [];
  let limit = DEFAULT_LIMIT;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) {
      continue;
    }

    if (argument === '--json') {
      json = true;
      continue;
    }

    if (argument === '--limit') {
      const value = args[index + 1];
      if (value === undefined) {
        return { ok: false, reason: '--limit needs a number.' };
      }
      const parsedLimit = Number(value);
      if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
        return {
          ok: false,
          reason: `--limit needs a whole number of at least 1, not "${value}".`,
        };
      }
      limit = parsedLimit;
      index += 1;
      continue;
    }

    if (argument.startsWith('--')) {
      return { ok: false, reason: `unknown option "${argument}".` };
    }

    if (brain === undefined) {
      brain = argument;
      continue;
    }
    queryParts.push(argument);
  }

  if (brain === undefined || queryParts.length === 0) {
    return { ok: false, reason: 'name the brain and what to search for.' };
  }
  // Unquoted text arrives as several arguments. Joining is safe here in a way
  // it is not for `capture`, because a query is matched on its words and never
  // written to a file, so the exact spacing someone typed changes nothing.
  const query = queryParts.join(' ');
  if (query.trim() === '') {
    return { ok: false, reason: 'there is nothing to search for.' };
  }

  return { ok: true, brain, query, limit, json };
}

/**
 * The human-readable form.
 *
 * A result's first line is its address and score; the span text follows,
 * indented so a reader can tell evidence from location at a glance. The address
 * is `path#anchor:start-end`, or `path:start-end` where there is no heading to
 * name.
 */
function renderText(
  streams: Streams,
  target: string,
  results: readonly SearchResult[],
  exhausted: boolean,
): void {
  if (exhausted) {
    streams.err(
      `lore search: ${target} holds more files than one search reads, so this ranking covers only part of it.\n`,
    );
  }

  if (results.length === 0) {
    // Deliberately not "nothing found". No term in the query appears in this
    // vault, which is a fact about wording; it is not a verdict about whether
    // the knowledge is there.
    streams.out('No span shares a word with that query.\n');
    streams.out(
      'Try other wordings — that is what makes this kind of search work.\n',
    );
    return;
  }

  results.forEach((result, position) => {
    if (position > 0) {
      streams.out('\n');
    }
    streams.out(`${address(result.span)}  score ${result.score.toFixed(3)}\n`);
    streams.out(`${join(target, result.span.path)}\n`);
    for (const line of result.span.text.split('\n')) {
      streams.out(line === '' ? '\n' : `    ${line}\n`);
    }
  });
}

function address(span: Span): string {
  const anchor = span.anchor === null ? '' : `#${span.anchor}`;
  return `${span.path}${anchor}:${span.startLine}-${span.endLine}`;
}

/**
 * The machine-readable form, which is a contract from this ticket forward.
 *
 * Feature 07 instructs agents to call this, so its shape is not a printing
 * detail: every result carries path, anchor, line range, score, and the span
 * text, because a caller cannot assess evidence it cannot see. `anchor` is
 * `null` rather than absent when a span sits under no heading, so a consumer
 * reads one shape and never two.
 *
 * `exhausted` is reported rather than swallowed. A ranking over part of a vault
 * is a different claim from a ranking over all of it.
 */
function renderJson(
  target: string,
  query: string,
  results: readonly SearchResult[],
  exhausted: boolean,
): string {
  return JSON.stringify(
    {
      query,
      brain: target,
      exhausted,
      count: results.length,
      results: results.map((result) => ({
        path: result.span.path,
        anchor: result.span.anchor,
        startLine: result.span.startLine,
        endLine: result.span.endLine,
        score: result.score,
        text: result.span.text,
      })),
    },
    null,
    2,
  );
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
