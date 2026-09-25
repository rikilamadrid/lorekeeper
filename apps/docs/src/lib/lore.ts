/**
 * The built `lore` binary, run at build time.
 *
 * Every command output this site prints is produced here, by the same binary a
 * user installs, rather than typed from memory. If the CLI's wording changes,
 * the next build of the site changes with it; if the binary is missing, the
 * build fails instead of publishing stale text.
 *
 * Runs happen in a throwaway directory that stands in for the reader's home,
 * so printed paths read `~/brain` rather than a build machine's temp path.
 */

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { VAULT_FILES } from '../../../../brand/demo/vault.mjs';

/** npm workspaces run scripts from the package directory. */
const ROOT = resolve(process.cwd(), '..', '..');
const BIN = join(ROOT, 'node_modules', '.bin', 'lore');

if (!existsSync(BIN)) {
  throw new Error(
    `The site reads its CLI output from the built binary, and ${BIN} does not exist. Run \`npm ci && npm run build\` at the repository root first.`,
  );
}

/**
 * A Vercel build publishes. It must not publish CLI output from an unreleased
 * binary: the version is read from the binary itself, never written here, and
 * `0.0.0` is the workspace placeholder that means "no release yet".
 */
if (process.env.VERCEL) {
  const version = spawnSync(BIN, ['--version'], {
    encoding: 'utf8',
  }).stdout.trim();
  if (version === '' || version === '0.0.0') {
    throw new Error(
      `Refusing a deploy build: the built lore reports version "${version || 'nothing'}". Integrate the release version before deploying the site.`,
    );
  }
}

export interface Run {
  /** The command as a reader would type it. */
  readonly command: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
}

/** Quote an argument the way a reader would type it into a POSIX shell. */
function shellWord(arg: string): string {
  return /^[\w@%+=:,./~-]+$/.test(arg)
    ? arg
    : `"${arg.replaceAll('"', '\\"')}"`;
}

function plainEnv(home: string): NodeJS.ProcessEnv {
  // No colour: the page is not a terminal. PATH and node are all lore needs.
  return { PATH: process.env.PATH ?? '', HOME: home, NO_COLOR: '1' };
}

/** A scratch home. `steps` run in order inside it; paths are rewritten to `~`. */
export function session(
  steps: ReadonlyArray<readonly string[]>,
  prepare?: (home: string) => void,
): Run[] {
  return explore(steps, { prepare }).runs;
}

/**
 * As `session`, and then `inspect` reads what the runs left behind — the file
 * a capture wrote, say — before the scratch home is removed. Paths are handed
 * to `inspect` relative to the home, as `~/…` in the printed output.
 */
export function explore<T = undefined>(
  steps: ReadonlyArray<readonly string[]>,
  options: {
    prepare?: (home: string) => void;
    inspect?: (read: (path: string) => string, runs: Run[]) => T;
  } = {},
): { runs: Run[]; found: T } {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'lk-docs-')));
  try {
    options.prepare?.(home);
    const runs = steps.map((args) => {
      const result = spawnSync(BIN, args, {
        cwd: home,
        env: plainEnv(home),
        encoding: 'utf8',
      });
      const tidy = (text: string) =>
        text
          .replaceAll(`${home}/`, '~/')
          .replaceAll(home, '~')
          .replaceAll(ROOT, '~/lorekeeper');
      return {
        command: ['lore', ...args.map(shellWord)].join(' '),
        stdout: tidy(result.stdout),
        stderr: tidy(result.stderr),
        code: result.status ?? 1,
      };
    });
    const read = (path: string) =>
      readFileSync(join(home, path.replace(/^~\//, '')), 'utf8');
    const found = (options.inspect?.(read, runs) ?? undefined) as T;
    return { runs, found };
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

/** The run at `index`, or a build failure naming what is missing. */
export function at(runs: readonly Run[], index: number): Run {
  const run = runs[index];
  if (!run)
    throw new Error(`expected a run at ${index}; there are ${runs.length}`);
  return run;
}

/** One command, in an empty home. */
export function lore(...args: string[]): Run {
  return at(session([args]), 0);
}

/** Write files into a scratch home before a session runs. */
export function seed(files: Record<string, string>): (home: string) => void {
  return (home) => {
    for (const [path, text] of Object.entries(files)) {
      const target = join(home, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, text);
    }
  };
}

export interface Starter {
  readonly agents: string;
  readonly readme: string;
  readonly folders: ReadonlyArray<{ name: string; readme: string }>;
  readonly owned: readonly string[];
}

/** What `lore init` actually writes, read back from a real brain. */
export function starter(): Starter {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'lk-docs-')));
  try {
    const brain = join(home, 'brain');
    const result = spawnSync(BIN, ['init', brain], {
      env: plainEnv(home),
      encoding: 'utf8',
    });
    if (result.status !== 0)
      throw new Error(`lore init failed: ${result.stderr}`);
    const read = (p: string) => readFileSync(join(brain, p), 'utf8');
    const manifest = JSON.parse(read('.lorekeeper/manifest.json')) as {
      files: Array<{ path: string }>;
    };
    const owned = manifest.files.map((f) => f.path);
    const folders = owned
      .filter((p) => /^[^/]+\/README\.md$/.test(p))
      .map((p) => ({ name: p.split('/')[0] ?? p, readme: read(p) }));
    return {
      agents: read('AGENTS.md'),
      readme: read('README.md'),
      folders,
      owned,
    };
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

/** Folder names in the order `lore init` prints them. */
export function starterFolders(): string[] {
  const run = lore('init', 'brain');
  return [...run.stdout.matchAll(/^ {2}([a-z]+)\/$/gm)].map((m) => m[1] ?? '');
}

/** The path a successful capture reports, as `~/…`. */
export function capturedPath(run: Run): string {
  const match = /^(?:Captured to|Already captured as) (\S+)$/m.exec(run.stdout);
  if (!match?.[1])
    throw new Error(
      `lore capture reported no path:\n${run.stdout}${run.stderr}`,
    );
  return match[1];
}

/**
 * The agent demo's synthetic vault — eight invented notes about a pipeline
 * that does not exist — written under `dir` in a scratch home. The site's
 * retrieval examples search the same bytes the demo does.
 */
export { DEMO_WORDINGS } from './demo';

export function demoVault(dir: string): (home: string) => void {
  const files = VAULT_FILES as ReadonlyArray<{ path: string; content: string }>;
  return seed(
    Object.fromEntries(files.map((f) => [`${dir}/${f.path}`, f.content])),
  );
}
