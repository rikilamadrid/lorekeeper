/**
 * Measure what `lore search` costs on a vault of a few thousand notes.
 *
 * Run with `npm run bench:search`. It writes a deterministic synthetic corpus
 * to a temporary directory, times the pipeline the command actually runs, prints
 * the numbers with the machine that produced them, and removes the corpus. The
 * repository never holds thousands of generated files.
 *
 * This is a measurement, not a test. A timing assertion in the test suite would
 * fail on a slow runner and pass on a fast one while saying nothing about the
 * architecture; the number belongs in the Feature's verification, recorded with
 * the machine, where a reader can weigh it.
 *
 * What is timed is the shipped path and nothing else: the same walk, reader,
 * splitter, index, ranking, fusion, and suppression the command calls, plus the
 * command itself end to end, so that a change to any of them shows up here.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { arch, cpus, platform, release, tmpdir, totalmem } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  buildSpanIndex,
  fuseRankings,
  readDocument,
  type Span,
  searchSpans,
  spansOf,
  suppressDuplicates,
} from '@lorekeeper/core';
import { search } from '../search.js';
import { walkMarkdown } from '../walk.js';
import { generateCorpus } from './corpus.js';

const NOTES = 3_000;
const SEED = 20260917;
/** Query repetitions; the median is reported so one GC pause does not decide. */
const REPEATS = 20;

const SINGLE = 'retry backoff jitter';
const WORDINGS = [
  'retry backoff jitter',
  'queue consumer timeout',
  'certificate rotation expiry',
];

function median(samples: readonly number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function timed<T>(work: () => T): { result: T; ms: number } {
  const start = performance.now();
  const result = work();
  return { result, ms: performance.now() - start };
}

function repeat(work: () => void): number {
  const samples: number[] = [];
  for (let i = 0; i < REPEATS; i += 1) {
    samples.push(timed(work).ms);
  }
  return median(samples);
}

const root = mkdtempSync(join(tmpdir(), 'lore-bench-'));
try {
  const generated = timed(() =>
    generateCorpus(root, { count: NOTES, seed: SEED }),
  );

  // Phase 1: walk, read, and split. This is the disk-bound part.
  const spans: Span[] = [];
  const split = timed(() => {
    walkMarkdown(root, root, (file) => {
      spans.push(...spansOf(readDocument(file.name, file.text), file.relative));
      return 'continue';
    });
  });

  // Phase 2: term statistics.
  const indexed = timed(() => buildSpanIndex(spans));
  const index = indexed.result;

  // Phase 3: queries against the built index.
  const single = repeat(() => {
    searchSpans(index, SINGLE, -1);
  });
  const fused = repeat(() => {
    suppressDuplicates(
      fuseRankings(WORDINGS.map((w) => searchSpans(index, w, -1))),
    );
  });

  // End to end: the command as an agent would call it, JSON to nowhere.
  const sink = { out: () => {}, err: () => {} };
  const command = repeat(() => {
    search([root, ...WORDINGS, '--json'], sink);
  });

  const cpu = cpus()[0]?.model ?? 'unknown cpu';
  const rows: [string, string][] = [
    ['notes', String(generated.result.files)],
    ['spans', String(spans.length)],
    ['corpus bytes', String(generated.result.bytes)],
    ['duplicated paragraphs', String(generated.result.duplicatedParagraphs)],
    ['generate corpus', `${generated.ms.toFixed(0)} ms`],
    ['walk + read + split', `${split.ms.toFixed(0)} ms`],
    ['build index', `${indexed.ms.toFixed(0)} ms`],
    ['query, one wording (median)', `${single.toFixed(1)} ms`],
    ['query, three fused (median)', `${fused.toFixed(1)} ms`],
    [
      'lore search end to end, three wordings (median)',
      `${command.toFixed(0)} ms`,
    ],
    ['node', process.version],
    ['machine', `${cpu}; ${platform()} ${release()} ${arch()}`],
    ['memory', `${Math.round(totalmem() / 1024 ** 3)} GiB`],
    ['repeats', String(REPEATS)],
    ['seed', String(SEED)],
  ];
  const width = Math.max(...rows.map(([label]) => label.length));
  for (const [label, value] of rows) {
    process.stdout.write(`${label.padEnd(width)}  ${value}\n`);
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
