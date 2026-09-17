import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildManifest,
  MANIFEST_PATH,
  parseManifest,
  serializeManifest,
} from '@lorekeeper/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashText } from '../src/hash.js';
import { init } from '../src/init.js';
import { run } from '../src/run.js';

const ARTIFACT = 'AGENTS.md';

/** Collects what a command writes, so assertions look at real output. */
function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    streams: {
      out: (text: string) => {
        out.push(text);
      },
      err: (text: string) => {
        err.push(text);
      },
    },
    out: () => out.join(''),
    err: () => err.join(''),
  };
}

let sandbox: string;
let brain: string;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'lore-agents-'));
  brain = join(sandbox, 'brain');
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function initInto(target: string) {
  const io = capture();
  const code = init([target], io.streams, { cwd: sandbox });
  return { code, out: io.out(), err: io.err() };
}

function artifactText(target: string): string {
  return readFileSync(join(target, ARTIFACT), 'utf8');
}

/**
 * The command the artifact teaches, taken from the artifact's own text.
 *
 * Extracted rather than restated, because a test that repeats the command
 * proves only that the test is consistent with itself. Prose that drifts away
 * from a working invocation has to fail here.
 */
function commandFrom(artifact: string): readonly string[] {
  const fences = [...artifact.matchAll(/```[^\n]*\n([\s\S]*?)```/g)];
  expect(fences).toHaveLength(1);
  const body = (fences[0]?.[1] ?? '').trim();
  return [...body.matchAll(/"([^"]*)"|(\S+)/g)].map(
    (match) => match[1] ?? match[2] ?? '',
  );
}

/** A note the artifact's own example wordings should find. */
function seedAnswer(target: string): void {
  mkdirSync(join(target, 'notes'), { recursive: true });
  writeFileSync(
    join(target, 'notes', 'certificates.md'),
    [
      '# Certificates',
      '',
      'Notes on the edge proxy.',
      '',
      '## Rotating the TLS certificate',
      '',
      'Renew the certificate sixty days before expiry, then reload the proxy.',
      'A rotation that skips the reload serves the old certificate until restart.',
      '',
    ].join('\n'),
    'utf8',
  );
}

describe('the agent integration artifact', () => {
  it('is written into a new brain and owned by the manifest', () => {
    const result = initInto(brain);

    expect(result.code).toBe(0);
    const text = artifactText(brain);
    expect(text).not.toBe('');

    const parsed = parseManifest(
      readFileSync(join(brain, MANIFEST_PATH), 'utf8'),
    );
    expect(parsed.ok).toBe(true);
    const owned = parsed.ok
      ? parsed.manifest.files.find((file) => file.path === ARTIFACT)
      : undefined;
    expect(owned).toBeDefined();
    expect(owned?.sha256).toBe(hashText(text));
  });

  it('teaches a command that runs as written and returns all five fields', () => {
    initInto(brain);
    seedAnswer(brain);

    const tokens = commandFrom(artifactText(brain));
    expect(tokens[0]).toBe('lore');
    expect(tokens).toContain('--json');
    // Three wordings of one question, each its own argument.
    expect(tokens.filter((token) => token.includes(' '))).toHaveLength(3);

    const argv = tokens
      .slice(1)
      .map((token) => (token === '.' ? brain : token));
    const io = capture();
    expect(run(argv, io.streams)).toBe(0);

    const payload = JSON.parse(io.out());
    expect(payload.results.length).toBeGreaterThan(0);
    for (const result of payload.results) {
      expect(Object.keys(result).sort()).toEqual([
        'anchor',
        'endLine',
        'path',
        'score',
        'startLine',
        'text',
      ]);
      expect(result.text).not.toBe('');
    }
    // The example retrieves real knowledge. It also retrieves this artifact,
    // which carries those same wordings and is an ordinary Markdown file in the
    // vault, exactly as the starter READMEs already are.
    expect(
      payload.results.map((result: { path: string }) => result.path),
    ).toContain('notes/certificates.md');
  });

  it('states the several-wordings instruction and the absence limitation', () => {
    initInto(brain);
    const text = artifactText(brain);

    expect(text).toContain('several wordings of one question in a single call');
    expect(text).toContain('not an optimization');
    expect(text).toContain('never establishes that something');
    expect(text).toContain('evidence here is insufficient');
    // Portable: no agent environment is named.
    expect(text.toLowerCase()).not.toMatch(/claude|cursor|copilot|openai|gpt/);
  });

  it('reports a user-edited copy as drift and leaves its bytes alone', () => {
    initInto(brain);
    const edited = '# My own agent notes\n\nSearch however you like.\n';
    writeFileSync(join(brain, ARTIFACT), edited, 'utf8');

    const result = initInto(brain);

    expect(result.code).toBe(0);
    expect(result.out).toContain(`modified: ${ARTIFACT}`);
    expect(readFileSync(join(brain, ARTIFACT), 'utf8')).toBe(edited);
  });

  it('adds the artifact to an existing brain that predates it', () => {
    initInto(brain);
    // A brain installed before this artifact existed: its manifest never
    // claimed the path, so the path is missing and unowned rather than drift.
    const manifest = join(brain, MANIFEST_PATH);
    const parsed = parseManifest(readFileSync(manifest, 'utf8'));
    if (!parsed.ok || parsed.manifest === null) {
      throw new Error('fixture manifest could not be read');
    }
    const older = buildManifest({
      toolkitVersion: parsed.manifest.toolkitVersion,
      createdAt: parsed.manifest.createdAt,
      files: parsed.manifest.files.filter((file) => file.path !== ARTIFACT),
    });
    if (!older.ok) {
      throw new Error('fixture manifest could not be rebuilt');
    }
    writeFileSync(manifest, serializeManifest(older.manifest), 'utf8');
    rmSync(join(brain, ARTIFACT));

    const result = initInto(brain);

    expect(result.code).toBe(0);
    expect(artifactText(brain)).toContain('lore search');
    expect(result.out).toContain('missing starter');
  });

  it('does not repair a claimed artifact the user deleted', () => {
    initInto(brain);
    rmSync(join(brain, ARTIFACT));

    const result = initInto(brain);

    // Owned and gone is drift. Repair belongs to `lore update`, Feature 06.
    expect(result.code).toBe(0);
    expect(result.out).toContain(`missing: ${ARTIFACT}`);
    expect(existsSync(join(brain, ARTIFACT))).toBe(false);
  });

  it('leaves a vault that already has its own AGENTS.md exactly as it was', () => {
    const vault = join(sandbox, 'vault');
    mkdirSync(vault, { recursive: true });
    const theirs = '# Our team conventions\n\nRun the linter before pushing.\n';
    writeFileSync(join(vault, ARTIFACT), theirs, 'utf8');

    const result = initInto(vault);

    expect(result.code).toBe(0);
    expect(readFileSync(join(vault, ARTIFACT), 'utf8')).toBe(theirs);
    expect(result.out).toContain('left unchanged and unclaimed');
    expect(result.out).toContain(ARTIFACT);

    const parsed = parseManifest(
      readFileSync(join(vault, MANIFEST_PATH), 'utf8'),
    );
    expect(parsed.ok).toBe(true);
    const claimed = parsed.ok
      ? parsed.manifest.files.some((file) => file.path === ARTIFACT)
      : true;
    expect(claimed).toBe(false);
  });
});
