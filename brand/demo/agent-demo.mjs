/**
 * The agent integration demo: an agent asking one question three ways.
 *
 * Run it with `npm run demo:agent` from the repository root. It builds nothing
 * itself beyond what that script builds, and it changes nothing in the
 * repository — the brain it searches is created in a temporary directory and
 * removed again.
 *
 * Every `lore` call below goes through the built binary at
 * `packages/cli/dist/cli.js`, as a process, with the same arguments the
 * documentation shows. Nothing imports the CLI's internals. A command that
 * stopped working would fail this demo rather than quietly keep reading well
 * on a page.
 *
 * The output is deterministic. The vault is static bytes, retrieval is
 * deterministic, and the one thing that varies between runs — the temporary
 * directory's name — is printed as `<brain>` so that two runs on two machines
 * print the same text. That is why the transcript in `agent-integration.md`
 * can be compared against a fresh run instead of taken on trust.
 *
 * The demo also checks itself. If fusing three wordings stops promoting the
 * note that answers the question, this exits non-zero and says so, rather than
 * printing a story about a behavior that is no longer there.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VAULT_FILES } from './vault.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const binary = join(repoRoot, 'packages', 'cli', 'dist', 'cli.js');

/** The question, asked three ways, exactly as the agent artifact instructs. */
const WORDINGS = [
  'nightly export failed',
  'run stopped partway and reported success',
  'consumer lease renewal committed offset',
];

/** The note that actually answers the question. Asserted, not assumed. */
const EXPECTED_PATH = 'notes/consumer-leases.md';

const brain = mkdtempSync(join(tmpdir(), 'lore-demo-'));
let failure = null;

try {
  heading('1. A synthetic vault, written by this repository');
  for (const file of VAULT_FILES) {
    const target = join(brain, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.content, 'utf8');
  }
  say(`${VAULT_FILES.length} invented Markdown files, written to <brain>.`);
  say('Static bytes. No clock, no personal content, no real vault.');

  heading('2. `lore init` adopts it');
  say('$ lore init <brain>');
  say('');
  echo(lore(['init', brain]));
  say('The notes above were already there and were left alone. Init added the');
  say('starter files it owns, and `AGENTS.md` is the one that matters here:');
  say('it is what tells a coding agent this directory is searchable and how.');

  heading('3. The agent asks once, in one wording');
  say(`$ lore search <brain> "${WORDINGS[0]}" --json`);
  say('');
  const single = json(lore(['search', brain, WORDINGS[0], '--json']));
  for (const result of single.results) {
    say(`  ${address(result)}`);
  }
  say('');
  say(`Top result: ${single.results[0].path}`);
  say('That is the note about the nightly export. It says when the export');
  say('runs and how to restart it. It does not say why a run stops.');

  heading('4. The agent asks again, three ways, in one call');
  say(
    `$ lore search <brain> ${WORDINGS.map((w) => `"${w}"`).join(' ')} --json`,
  );
  say('');
  const fused = json(lore(['search', brain, ...WORDINGS, '--json']));
  for (const result of fused.results) {
    say(`  ${address(result)}`);
  }
  say('');
  const winner = fused.results[0];
  say(`Top result: ${winner.path}`);
  say('The answering note never uses the words "nightly" or "export", so the');
  say('first wording could not reach it. The third one could, and the ranked');
  say('lists are fused into the one list above.');

  heading('5. What the agent received, in full, for that top result');
  say(JSON.stringify(winner, null, 2));

  heading('6. What the agent does with it');
  say('It reads `text` as the evidence, and cites `path`, `anchor`, and the');
  say('line range so the person can open exactly that passage:');
  say('');
  say(
    `  A run can stop partway and still report success — see ${address(winner)}.`,
  );
  say('');
  say('It did not read a whole note to get there, and it did not need one.');
  say('');
  say('And what it must not conclude: nothing here proves the vault is silent');
  say('on a question. A score ranks passages against each other. If the');
  say('evidence does not settle the question, the agent searches again in');
  say('other words, or says the evidence is insufficient.');

  if (winner.path !== EXPECTED_PATH) {
    failure =
      `Fusing three wordings put ${winner.path} first, not ${EXPECTED_PATH}. ` +
      'The demo describes a behavior it no longer shows.';
  }
} finally {
  rmSync(brain, { recursive: true, force: true });
}

if (failure !== null) {
  process.stderr.write(`\ndemo: ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    '\nThe temporary brain has been removed. The demo wrote nothing outside it.\n',
  );
}

/** Run the built binary and return its stdout, with the brain path redacted. */
function lore(args) {
  try {
    return redact(
      execFileSync(process.execPath, [binary, ...args], {
        encoding: 'utf8',
      }),
    );
  } catch (error) {
    if (error.code === 'ENOENT') {
      process.stderr.write(
        `demo: ${binary} is missing. Run \`npm run build\` first.\n`,
      );
      process.exit(1);
    }
    throw error;
  }
}

function json(text) {
  return JSON.parse(text);
}

/**
 * The temporary directory is the one thing that differs between two runs, and
 * it appears in init's report and in the JSON payload's `brain` field.
 */
function redact(text) {
  return text.split(brain).join('<brain>');
}

function address(result) {
  const anchor = result.anchor === null ? '' : `#${result.anchor}`;
  return `${result.path}${anchor}:${result.startLine}-${result.endLine}`;
}

function heading(text) {
  process.stdout.write(`\n${text}\n${'-'.repeat(text.length)}\n\n`);
}

function say(text) {
  process.stdout.write(text === '' ? '\n' : `${text}\n`);
}

function echo(text) {
  process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
}
