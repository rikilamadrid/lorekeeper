/**
 * Measure what the agent artifact's workflow costs a caller in context.
 *
 * Run with `npm run bench:context`. It generates the same synthetic corpus the
 * timing benchmark uses, runs exactly the call `AGENTS.md` prescribes — several
 * quoted wordings, `--json`, the default limit — and compares what came back
 * against what reading whole notes would have cost.
 *
 * Bytes are the proxy for token cost, and they are labelled as one wherever the
 * number is recorded. Counting real tokens needs a tokenizer, which is a
 * dependency and a vendor coupling, and the CLI ships offline with neither. A
 * proxy stated as a proxy is honest; a vendored count would not be portable.
 *
 * The baseline is deliberately generous to the naive approach: it charges only
 * for the files the returned spans actually came from, as though an agent had
 * already known which ones to open. Without span retrieval it would not have
 * known, so the saving recorded here is a floor rather than a best case.
 *
 * Nothing is tuned. The corpus, the seed, and the wordings are the ones Feature
 * 05 already measured, and improving the ratio by changing them would be
 * measuring a different vault and calling it this one.
 */

import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { arch, cpus, platform, release, tmpdir } from 'node:os';
import { join } from 'node:path';
import { search } from '../search.js';
import { generateCorpus } from './corpus.js';
import { type ContextCost, costOf } from './cost.js';
import { NOTES, SEED, WORDINGS } from './parameters.js';

/**
 * The limit the sensitivity check uses.
 *
 * The prescribed call carries no `--limit`, so the default is the result that
 * matters. A second, deeper reading exists only so the ratio is not read from a
 * single point; it is not a target.
 */
const DEEPER_LIMIT = 20;

function ratio(baseline: number, cost: number): string {
  return cost === 0 ? 'n/a' : `${(baseline / cost).toFixed(1)}x`;
}

const root = mkdtempSync(join(tmpdir(), 'lore-context-'));
try {
  const corpus = generateCorpus(root, { count: NOTES, seed: SEED });

  const measure = (limit?: number): ContextCost => {
    const out: string[] = [];
    const args = [
      root,
      ...WORDINGS,
      '--json',
      ...(limit === undefined ? [] : ['--limit', String(limit)]),
    ];
    search(args, {
      out: (text) => out.push(text),
      err: () => {},
    });
    return costOf(out.join(''), (path) => statSync(join(root, path)).size);
  };

  const prescribed = measure();
  const deeper = measure(DEEPER_LIMIT);

  const cpu = cpus()[0]?.model ?? 'unknown cpu';
  const rows: [string, string][] = [
    ['notes', String(corpus.files)],
    ['corpus bytes', String(corpus.bytes)],
    ['average note bytes', String(Math.round(corpus.bytes / corpus.files))],
    ['wordings', String(WORDINGS.length)],
    ['', ''],
    ['— prescribed call, default limit —', ''],
    ['results', String(prescribed.results)],
    ['distinct files behind them', String(prescribed.files)],
    ['whole notes, baseline', `${prescribed.wholeNoteBytes} bytes`],
    ['JSON payload received', `${prescribed.payloadBytes} bytes`],
    ['span text within it', `${prescribed.textBytes} bytes`],
    [
      'saving, payload vs whole notes',
      ratio(prescribed.wholeNoteBytes, prescribed.payloadBytes),
    ],
    [
      'saving, span text vs whole notes',
      ratio(prescribed.wholeNoteBytes, prescribed.textBytes),
    ],
    ['', ''],
    [`— sensitivity check, --limit ${DEEPER_LIMIT} —`, ''],
    ['results', String(deeper.results)],
    ['distinct files behind them', String(deeper.files)],
    ['whole notes, baseline', `${deeper.wholeNoteBytes} bytes`],
    ['JSON payload received', `${deeper.payloadBytes} bytes`],
    ['span text within it', `${deeper.textBytes} bytes`],
    [
      'saving, payload vs whole notes',
      ratio(deeper.wholeNoteBytes, deeper.payloadBytes),
    ],
    [
      'saving, span text vs whole notes',
      ratio(deeper.wholeNoteBytes, deeper.textBytes),
    ],
    ['', ''],
    ['node', process.version],
    ['machine', `${cpu}; ${platform()} ${release()} ${arch()}`],
    ['seed', String(SEED)],
    ['proxy', 'bytes, not a literal token count'],
  ];

  const width = Math.max(...rows.map(([label]) => label.length));
  for (const [label, value] of rows) {
    process.stdout.write(
      value === '' ? `${label}\n` : `${label.padEnd(width)}  ${value}\n`,
    );
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
