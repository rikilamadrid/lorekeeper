import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import {
  MANIFEST_PATH,
  MANIFEST_VERSION,
  parseManifest,
  readDocument,
  validateDocuments,
} from '@lorekeeper/core';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashBytes } from '../src/hash.js';
import { init } from '../src/init.js';
import { run } from '../src/run.js';
import { STARTER_FILES, STARTER_FOLDERS } from '../src/starter.js';
import {
  COLLIDING_STARTER_PATH,
  createAdoptionVault,
} from './fixtures/adoption-vault.js';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

/** Collects what the command writes, so assertions look at real output. */
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

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'lore-init-'));
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

/** Every file under `root`, as brain-relative POSIX paths. */
function walk(root: string, prefix = ''): string[] {
  const found: string[] = [];
  for (const item of readdirSync(root, { withFileTypes: true })) {
    const path = prefix === '' ? item.name : `${prefix}/${item.name}`;
    if (item.isDirectory()) {
      found.push(...walk(join(root, item.name), path));
    } else {
      found.push(path);
    }
  }
  return found.sort();
}

/** Every file under `root`, mapped to the hash of its bytes. */
function hashTree(root: string): Record<string, string> {
  return Object.fromEntries(
    walk(root).map((path) => [path, hashBytes(readFileSync(join(root, path)))]),
  );
}

/** The paths the manifest at `target` claims. */
function claimed(target: string): string[] {
  const read = parseManifest(readFileSync(join(target, MANIFEST_PATH), 'utf8'));
  if (!read.ok) throw new Error(read.refusal.reason);
  return read.manifest.files.map((file) => file.path);
}

function initInto(target: string, extra: Parameters<typeof init>[2] = {}) {
  const c = capture();
  const code = init([target], c.streams, {
    now: () => new Date('2026-08-27T10:00:00.000Z'),
    ...extra,
  });
  return { code, out: c.out(), err: c.err() };
}

describe('init into an empty target', () => {
  it('creates the folder set and the starter files', () => {
    const target = join(sandbox, 'brain');
    const result = initInto(target);

    expect(result.code).toBe(0);
    expect(result.err).toBe('');

    for (const folder of STARTER_FOLDERS) {
      expect(readdirSync(join(target, folder))).toContain('README.md');
    }
    expect(walk(target)).toEqual(
      [...STARTER_FILES.map((f) => f.path), MANIFEST_PATH].sort(),
    );
  });

  it('creates no numbered folder, no archive/, and no system/', () => {
    const target = join(sandbox, 'brain');
    initInto(target);

    const folders = readdirSync(target, { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .map((item) => item.name);

    expect(folders.sort()).toEqual(['.lorekeeper', ...STARTER_FOLDERS].sort());
    expect(folders).not.toContain('archive');
    expect(folders).not.toContain('system');
    expect(folders.some((name) => /^\d/.test(name))).toBe(false);
  });

  it('records every generated file in the manifest, and nothing else', () => {
    const target = join(sandbox, 'brain');
    initInto(target);

    const read = parseManifest(
      readFileSync(join(target, MANIFEST_PATH), 'utf8'),
    );
    expect(read.ok).toBe(true);
    if (!read.ok) return;

    const onDisk = walk(target).filter((path) => path !== MANIFEST_PATH);
    expect(read.manifest.files.map((f) => f.path)).toEqual(onDisk);
    expect(read.manifest.manifestVersion).toBe(MANIFEST_VERSION);
    expect(read.manifest.createdAt).toBe('2026-08-27T10:00:00.000Z');
    expect(read.manifest.toolkitVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('records the hash of the bytes actually on disk', () => {
    const target = join(sandbox, 'brain');
    initInto(target);

    const read = parseManifest(
      readFileSync(join(target, MANIFEST_PATH), 'utf8'),
    );
    if (!read.ok) throw new Error(read.refusal.reason);

    for (const entry of read.manifest.files) {
      expect(entry.sha256).toBe(
        hashBytes(readFileSync(join(target, entry.path))),
      );
    }
  });

  it('produces a tree that validates under the frontmatter contract', () => {
    const target = join(sandbox, 'brain');
    initInto(target);

    const markdown = walk(target).filter((path) => path.endsWith('.md'));
    const findings = validateDocuments(
      markdown.map((path) => ({
        file: path,
        document: readDocument(
          path.replace(/^.*\//, '').replace(/\.md$/, ''),
          readFileSync(join(target, path), 'utf8'),
        ),
      })),
    );

    expect(findings.filter((f) => f.severity !== 'info')).toEqual([]);
  });

  it('reads sensibly with no tooling installed', () => {
    const target = join(sandbox, 'brain');
    initInto(target);

    const readme = readFileSync(join(target, 'README.md'), 'utf8');
    for (const folder of STARTER_FOLDERS) {
      expect(readme).toContain(`${folder}/`);
    }
    expect(readme).toContain(MANIFEST_PATH);

    for (const path of walk(target).filter((p) => p.endsWith('.md'))) {
      expect(readFileSync(join(target, path), 'utf8')).toMatch(/^# \S/m);
    }
  });

  it('reports where the brain is and what was written', () => {
    const target = join(sandbox, 'brain');
    const result = initInto(target);

    expect(result.out).toContain(target);
    expect(result.out).toContain(MANIFEST_PATH);
    expect(result.out).toContain(`${STARTER_FILES.length} starter files`);
  });

  it('resolves a relative target against the working directory', () => {
    const result = initInto('brain', { cwd: sandbox });

    expect(result.code).toBe(0);
    expect(readdirSync(join(sandbox, 'brain'))).toContain('README.md');
  });

  it('uses an existing empty directory rather than requiring a new one', () => {
    const target = join(sandbox, 'brain');
    mkdirSync(target);

    expect(initInto(target).code).toBe(0);
    expect(readdirSync(target)).toContain('notes');
  });

  it('writes byte-identical content on two independent runs', () => {
    const one = join(sandbox, 'one');
    const other = join(sandbox, 'other');
    initInto(one);
    initInto(other);

    for (const path of walk(one)) {
      expect(readFileSync(join(other, path), 'utf8')).toBe(
        readFileSync(join(one, path), 'utf8'),
      );
    }
  });
});

describe('init adopting an existing vault', () => {
  let vault: string;

  beforeEach(() => {
    vault = join(sandbox, 'vault');
    createAdoptionVault(vault);
  });

  it('leaves every pre-existing file byte-identical', () => {
    const before = hashTree(vault);

    const result = initInto(vault);

    expect(result.code).toBe(0);
    expect(result.err).toBe('');

    const after = hashTree(vault);
    const preexisting = Object.fromEntries(
      Object.keys(before).map((path) => [path, after[path]]),
    );

    expect(preexisting).toEqual(before);
  });

  it('adds the starter files that were missing, and the manifest', () => {
    const before = new Set(Object.keys(hashTree(vault)));

    initInto(vault);

    const added = walk(vault).filter((path) => !before.has(path));

    expect(added.sort()).toEqual(
      [
        ...STARTER_FILES.map((file) => file.path).filter(
          (path) => path !== COLLIDING_STARTER_PATH,
        ),
        MANIFEST_PATH,
      ].sort(),
    );
  });

  it('leaves an occupied starter path unclaimed, unchanged, and reported', () => {
    const path = join(vault, COLLIDING_STARTER_PATH);
    const mine = readFileSync(path, 'utf8');

    const result = initInto(vault);

    expect(readFileSync(path, 'utf8')).toBe(mine);
    expect(claimed(vault)).not.toContain(COLLIDING_STARTER_PATH);
    expect(result.out).toContain(COLLIDING_STARTER_PATH);
    expect(result.out).toContain('unclaimed');
  });

  it('claims nothing it did not write', () => {
    const before = new Set(Object.keys(hashTree(vault)));

    initInto(vault);

    expect(claimed(vault).filter((path) => before.has(path))).toEqual([]);
  });

  it('leaves .obsidian/ and .trash/ untouched and unclaimed', () => {
    const before = hashTree(vault);
    const theirs = Object.keys(before).filter(
      (path) => path.startsWith('.obsidian/') || path.startsWith('.trash/'),
    );
    expect(theirs.length).toBeGreaterThan(0);

    initInto(vault);

    const after = hashTree(vault);
    for (const path of theirs) {
      expect(after[path]).toBe(before[path]);
      expect(claimed(vault)).not.toContain(path);
    }
  });

  it('leaves non-Markdown attachments untouched and unclaimed', () => {
    const before = hashTree(vault);
    const attachments = Object.keys(before).filter(
      (path) => !path.endsWith('.md'),
    );
    expect(attachments).toContain('attachments/diagram.png');

    initInto(vault);

    const after = hashTree(vault);
    for (const path of attachments) {
      expect(after[path]).toBe(before[path]);
      expect(claimed(vault)).not.toContain(path);
    }
  });

  it('reuses an existing folder rather than refusing it', () => {
    initInto(vault);

    expect(readFileSync(join(vault, 'notes/README.md'), 'utf8')).toBe(
      STARTER_FILES.find((file) => file.path === 'notes/README.md')?.content,
    );
    expect(walk(join(vault, 'notes'))).toContain('existing-thought.md');
  });

  it('neither validates nor reformats an adopted note', () => {
    const hand = 'notes/hand-written-frontmatter.md';
    const before = readFileSync(join(vault, hand), 'utf8');

    const result = initInto(vault);

    expect(result.code).toBe(0);
    expect(result.err).toBe('');
    expect(readFileSync(join(vault, hand), 'utf8')).toBe(before);
    expect(before).toContain('2026-08-21T09:02:00-05:00');
    expect(before).toContain('# written by hand');
  });

  it('reports the vault as adopted rather than created', () => {
    const result = initInto(vault);

    expect(result.out).toContain(`Adopted the vault at ${vault}`);
    expect(result.out).toContain(MANIFEST_PATH);
    expect(result.out).toContain('Everything else in that directory is yours.');
  });

  it('skips a starter folder whose name a user file already holds', () => {
    const flat = join(sandbox, 'flat');
    mkdirSync(flat);
    writeFileSync(join(flat, 'notes'), 'a file, not a folder\n');

    const result = initInto(flat);

    expect(result.code).toBe(0);
    expect(readFileSync(join(flat, 'notes'), 'utf8')).toBe(
      'a file, not a folder\n',
    );
    expect(claimed(flat)).not.toContain('notes/README.md');
    expect(result.out).toContain('notes/README.md');
  });

  it('writes a manifest whose hashes match the bytes on disk', () => {
    initInto(vault);

    const read = parseManifest(
      readFileSync(join(vault, MANIFEST_PATH), 'utf8'),
    );
    if (!read.ok) throw new Error(read.refusal.reason);

    expect(read.manifest.files.length).toBeGreaterThan(0);
    for (const entry of read.manifest.files) {
      expect(entry.sha256).toBe(
        hashBytes(readFileSync(join(vault, entry.path))),
      );
    }
  });
});

describe('init and paths that lead out of the brain', () => {
  let outside: string;
  let vault: string;

  beforeEach(() => {
    outside = join(sandbox, 'outside');
    vault = join(sandbox, 'vault');
    mkdirSync(outside, { recursive: true });
    mkdirSync(vault, { recursive: true });
  });

  it('writes nothing through a starter folder symlinked out of the vault', () => {
    symlinkSync(outside, join(vault, 'notes'));

    const result = initInto(vault);

    expect(result.code).toBe(0);
    expect(readdirSync(outside)).toEqual([]);
    expect(claimed(vault)).not.toContain('notes/README.md');
  });

  it('reports the starter file it left alone for pointing outside', () => {
    symlinkSync(outside, join(vault, 'notes'));

    const result = initInto(vault);

    expect(result.out).toContain('notes/README.md');
    expect(result.out).toContain(`pointing outside ${vault}`);
  });

  it('does not let a symlinked folder defeat the repository refusal', () => {
    const fakeRepo = join(sandbox, 'fake-repo');
    mkdirSync(join(fakeRepo, 'packages'), { recursive: true });
    symlinkSync(join(fakeRepo, 'packages'), join(vault, 'notes'));

    const result = initInto(vault, { toolkitRepoRoot: fakeRepo });

    expect(readdirSync(join(fakeRepo, 'packages'))).toEqual([]);
    expect(result.code).toBe(0);
  });

  it('still writes into a folder symlinked within the vault', () => {
    mkdirSync(join(vault, 'actual-notes'));
    symlinkSync(join(vault, 'actual-notes'), join(vault, 'notes'));

    initInto(vault);

    expect(readdirSync(join(vault, 'actual-notes'))).toContain('README.md');
    expect(claimed(vault)).toContain('notes/README.md');
  });

  it('refuses when the manifest itself would land outside the vault', () => {
    symlinkSync(outside, join(vault, '.lorekeeper'));

    const result = initInto(vault);

    expect(result.code).toBe(1);
    expect(result.err).toContain(MANIFEST_PATH);
    expect(result.err).toContain('Nothing was written');
    expect(readdirSync(outside)).toEqual([]);
    // The user's symlink is all that remains: no starter file, no folder.
    expect(readdirSync(vault)).toEqual(['.lorekeeper']);
  });
});

describe('init and an unusable .lorekeeper', () => {
  const METADATA_DIRECTORY = dirname(MANIFEST_PATH);

  let vault: string;

  beforeEach(() => {
    vault = join(sandbox, 'vault');
    createAdoptionVault(vault);
  });

  it('refuses a plain file at .lorekeeper before writing anything', () => {
    writeFileSync(join(vault, METADATA_DIRECTORY), 'not a directory\n');
    const before = hashTree(vault);

    const result = initInto(vault);

    expect(result.code).toBe(1);
    expect(hashTree(vault)).toEqual(before);
  });

  it('creates no starter folder, no starter file, and no manifest', () => {
    writeFileSync(join(vault, METADATA_DIRECTORY), 'not a directory\n');
    const before = new Set(Object.keys(hashTree(vault)));

    initInto(vault);

    const created = Object.keys(hashTree(vault)).filter(
      (path) => !before.has(path),
    );
    expect(created).toEqual([]);
    for (const file of STARTER_FILES) {
      if (before.has(file.path)) continue;
      expect(existsSync(join(vault, file.path))).toBe(false);
    }
    expect(existsSync(join(vault, MANIFEST_PATH))).toBe(false);
  });

  it('leaves the user file at that path byte-identical', () => {
    const mine = 'not a directory, and not yours to replace\n';
    writeFileSync(join(vault, METADATA_DIRECTORY), mine);

    initInto(vault);

    expect(readFileSync(join(vault, METADATA_DIRECTORY), 'utf8')).toBe(mine);
  });

  it('says what it refused rather than reporting a raw mkdir errno', () => {
    writeFileSync(join(vault, METADATA_DIRECTORY), 'not a directory\n');

    const result = initInto(vault);

    expect(result.out).toBe('');
    expect(result.err).toContain(METADATA_DIRECTORY);
    expect(result.err).toContain(MANIFEST_PATH);
    expect(result.err).toContain('Nothing was written');
    expect(result.err).not.toMatch(/EEXIST|ENOTDIR|EISDIR|mkdir/);
  });

  it('refuses a symlink at .lorekeeper that leads out of the vault', () => {
    const outside = join(sandbox, 'outside');
    mkdirSync(outside);
    symlinkSync(outside, join(vault, METADATA_DIRECTORY));
    const before = walk(vault);

    const result = initInto(vault);

    expect(result.code).toBe(1);
    expect(result.err).toContain('Nothing was written');
    expect(readdirSync(outside)).toEqual([]);
    expect(walk(vault)).toEqual(before);
  });

  it('refuses a symlink at .lorekeeper that leads nowhere', () => {
    symlinkSync(
      join(vault, 'no-such-directory'),
      join(vault, METADATA_DIRECTORY),
    );
    const before = walk(vault);

    const result = initInto(vault);

    expect(result.code).toBe(1);
    expect(result.err).toContain('Nothing was written');
    expect(result.err).not.toMatch(/EEXIST|ENOTDIR|EISDIR|mkdir/);
    expect(walk(vault)).toEqual(before);
  });

  it('accepts a symlink at .lorekeeper that stays inside the vault', () => {
    mkdirSync(join(vault, 'metadata'));
    symlinkSync(join(vault, 'metadata'), join(vault, METADATA_DIRECTORY));

    const result = initInto(vault);

    expect(result.code).toBe(0);
    expect(claimed(vault)).toContain('notes/README.md');
  });

  /**
   * A `.lorekeeper` of the right shape, in the right place, that cannot be
   * written into. Nothing about its name or location says so, which is why the
   * shape checks above are not enough on their own: the run would write all six
   * starter files and only then fail on the manifest, leaving toolkit files in
   * someone's vault with nothing claiming them.
   */
  function withUnwritableMetadataDirectory<T>(act: () => T): T {
    const path = join(vault, METADATA_DIRECTORY);
    mkdirSync(path);
    // Readable and searchable, so it is unmistakably a directory here; not
    // writable, so nothing can be created inside it.
    chmodSync(path, 0o500);
    try {
      return act();
    } finally {
      chmodSync(path, 0o700);
    }
  }

  it('refuses an unwritable .lorekeeper before writing anything', () => {
    const before = hashTree(vault);

    const result = withUnwritableMetadataDirectory(() => initInto(vault));

    expect(result.code).toBe(1);
    expect(hashTree(vault)).toEqual(before);
  });

  it('creates no starter file, no starter folder, and no manifest', () => {
    const before = new Set(walk(vault));
    const foldersBefore = readdirSync(vault).sort();

    withUnwritableMetadataDirectory(() => initInto(vault));

    expect(walk(vault).filter((path) => !before.has(path))).toEqual([]);
    for (const file of STARTER_FILES) {
      if (before.has(file.path)) continue;
      expect(existsSync(join(vault, file.path))).toBe(false);
    }
    for (const folder of STARTER_FOLDERS) {
      if (foldersBefore.includes(folder)) continue;
      expect(existsSync(join(vault, folder))).toBe(false);
    }
    expect(existsSync(join(vault, MANIFEST_PATH))).toBe(false);
  });

  it('says it refused rather than reporting a raw write errno', () => {
    const result = withUnwritableMetadataDirectory(() => initInto(vault));

    expect(result.out).toBe('');
    expect(result.err).toContain(METADATA_DIRECTORY);
    expect(result.err).toContain(MANIFEST_PATH);
    expect(result.err).toContain('Nothing was written');
    expect(result.err).not.toMatch(/EACCES|EPERM|errno|mkdir|open/);
  });

  it('refuses when the vault itself cannot hold a new .lorekeeper', () => {
    const before = hashTree(vault);
    chmodSync(vault, 0o500);

    const result = (() => {
      try {
        return initInto(vault);
      } finally {
        chmodSync(vault, 0o700);
      }
    })();

    expect(result.code).toBe(1);
    expect(result.err).toContain('Nothing was written');
    expect(result.err).not.toMatch(/EACCES|EPERM|errno|mkdir|open/);
    expect(hashTree(vault)).toEqual(before);
  });

  /**
   * The manifest's own name, one level below the directory the checks above
   * cover. Something that is not a file sitting here passes every one of them
   * and still cannot be written to, which is the same failure with the same
   * cost: six starter files in someone's vault and no manifest claiming them.
   */
  describe('and a manifest name that is already taken', () => {
    /**
     * Hashes what can be read, so a dangling symlink in the tree is a fact
     * about the tree rather than a read error in the assertion.
     */
    function hashReadable(root: string): Record<string, string> {
      return Object.fromEntries(
        walk(root)
          .filter((path) => lstatSync(join(root, path)).isFile())
          .map((path) => [path, hashBytes(readFileSync(join(root, path)))]),
      );
    }

    const cases: ReadonlyArray<readonly [string, () => void]> = [
      [
        'a directory',
        () => {
          mkdirSync(join(vault, MANIFEST_PATH), { recursive: true });
        },
      ],
      [
        'a symlink to nothing',
        () => {
          mkdirSync(join(vault, METADATA_DIRECTORY));
          symlinkSync(
            join(vault, METADATA_DIRECTORY, 'nowhere'),
            join(vault, MANIFEST_PATH),
          );
        },
      ],
    ];

    for (const [what, occupy] of cases) {
      it(`refuses ${what} at the manifest path before writing anything`, () => {
        occupy();
        const before = hashReadable(vault);
        const treeBefore = walk(vault);
        const rootBefore = readdirSync(vault).sort();

        const result = initInto(vault);

        expect(result.code).toBe(1);
        // Nothing added, nothing changed, nothing removed.
        expect(walk(vault)).toEqual(treeBefore);
        expect(hashReadable(vault)).toEqual(before);
        for (const file of STARTER_FILES) {
          if (treeBefore.includes(file.path)) continue;
          expect(existsSync(join(vault, file.path))).toBe(false);
        }
        for (const folder of STARTER_FOLDERS) {
          if (rootBefore.includes(folder)) continue;
          expect(existsSync(join(vault, folder))).toBe(false);
        }
      });

      it(`leaves ${what} at the manifest path exactly as it was`, () => {
        occupy();
        const before = lstatSync(join(vault, MANIFEST_PATH));

        initInto(vault);

        const after = lstatSync(join(vault, MANIFEST_PATH));
        expect(after.isDirectory()).toBe(before.isDirectory());
        expect(after.isSymbolicLink()).toBe(before.isSymbolicLink());
        expect(after.size).toBe(before.size);
      });

      it(`says what it refused about ${what}, without a raw errno`, () => {
        occupy();

        const result = initInto(vault);

        expect(result.out).toBe('');
        expect(result.err).toContain(MANIFEST_PATH);
        expect(result.err).toContain('Nothing was written');
        expect(result.err).not.toMatch(
          /EEXIST|EISDIR|ENOTDIR|EACCES|errno|open|mkdir/,
        );
      });
    }

    it('refuses a malformed manifest before writing anything', () => {
      mkdirSync(join(vault, METADATA_DIRECTORY));
      writeFileSync(join(vault, MANIFEST_PATH), '{"version":1}\n');
      const before = hashTree(vault);

      const result = initInto(vault);

      expect(result.code).toBe(1);
      expect(result.out).toBe('');
      expect(result.err).not.toContain('is already taken');
      expect(result.err).toContain('cannot be used');
      expect(result.err).toContain('Fix or restore it');
      expect(result.err).toContain('Nothing was written');
      expect(result.err).not.toContain('EEXIST');
      expect(readFileSync(join(vault, MANIFEST_PATH), 'utf8')).toBe(
        '{"version":1}\n',
      );
      expect(hashTree(vault)).toEqual(before);
    });

    it('leaves no toolkit file behind for a later run to disown', () => {
      mkdirSync(join(vault, MANIFEST_PATH), { recursive: true });
      const before = new Set(walk(vault));

      initInto(vault);

      // The invariant the whole preflight exists for: a run that could not
      // record what it owns wrote nothing to own.
      expect(walk(vault).filter((path) => !before.has(path))).toEqual([]);
    });
  });

  it('adopts an ordinary vault that has no .lorekeeper at all', () => {
    // No record, no toolkit bytes: nothing here says this vault was ever
    // initialized, and adoption is exactly what it is owed.
    const before = readFileSync(join(vault, COLLIDING_STARTER_PATH), 'utf8');

    const result = initInto(vault);

    expect(result.code).toBe(0);
    expect(result.err).toBe('');
    expect(result.out).toContain(`Adopted the vault at ${vault}`);
    expect(readFileSync(join(vault, COLLIDING_STARTER_PATH), 'utf8')).toBe(
      before,
    );
    expect(claimed(vault)).not.toContain(COLLIDING_STARTER_PATH);
  });

  it('adopts a vault whose starter paths are only partly occupied', () => {
    // An incomplete starter set is not evidence of anything on its own: an
    // ordinary vault has no reason to hold all six, and calling one a lost
    // installation would refuse to adopt the very vaults adoption is for.
    mkdirSync(join(vault, METADATA_DIRECTORY));
    const before = readFileSync(join(vault, COLLIDING_STARTER_PATH), 'utf8');

    const result = initInto(vault);

    expect(result.code).toBe(0);
    expect(result.err).toBe('');
    expect(result.out).toContain(`Adopted the vault at ${vault}`);
    expect(result.out).not.toContain('existing Lorekeeper installation');
    expect(readFileSync(join(vault, COLLIDING_STARTER_PATH), 'utf8')).toBe(
      before,
    );
    expect(claimed(vault)).not.toContain(COLLIDING_STARTER_PATH);
  });

  it('still initializes when an empty .lorekeeper is already there', () => {
    mkdirSync(join(vault, METADATA_DIRECTORY));

    const result = initInto(vault);

    expect(result.code).toBe(0);
    expect(claimed(vault)).toContain('notes/README.md');
    expect(readFileSync(join(vault, COLLIDING_STARTER_PATH), 'utf8')).toContain(
      'Mine, written by hand',
    );
  });
});

/** A complete installation is inspected and reported without being rewritten. */
describe('init run again against a fully initialized brain', () => {
  let brain: string;

  beforeEach(() => {
    brain = join(sandbox, 'brain');
    expect(initInto(brain).code).toBe(0);
  });

  it('claims nothing was recorded, because nothing was', () => {
    const result = initInto(brain);

    expect(result.code).toBe(0);
    expect(result.out).toContain('existing Lorekeeper installation');
    expect(result.out).not.toContain(`recorded in ${MANIFEST_PATH}`);
    expect(result.out).toContain(`${MANIFEST_PATH} was not changed`);
  });

  it('does not call files unclaimed that a manifest already claims', () => {
    const owned = claimed(brain);
    const result = initInto(brain);

    expect(result.out).not.toContain('unclaimed');
    // The files it reported as skipped are exactly the ones already owned.
    for (const path of owned) {
      expect(result.out).toContain(path);
    }
  });

  it('changes not a byte of the brain it already made', () => {
    const before = hashTree(brain);

    expect(initInto(brain).code).toBe(0);

    expect(hashTree(brain)).toEqual(before);
  });

  it('reports every owned file as unchanged', () => {
    const owned = claimed(brain);

    const result = initInto(brain);

    for (const path of owned) {
      expect(result.out).toContain(`unchanged: ${path}`);
    }
    expect(result.out).not.toContain('modified:');
    expect(result.out).not.toContain('missing:');
  });

  it('reports modified and missing owned files without repairing either', () => {
    const modified = 'README.md';
    const missing = 'notes/README.md';
    writeFileSync(join(brain, modified), '# My edited brain\n');
    rmSync(join(brain, missing));
    const before = hashTree(brain);

    const result = initInto(brain);

    expect(result.code).toBe(0);
    expect(result.out).toContain(`modified: ${modified}`);
    expect(result.out).toContain(`missing: ${missing}`);
    expect(readFileSync(join(brain, modified), 'utf8')).toBe(
      '# My edited brain\n',
    );
    expect(existsSync(join(brain, missing))).toBe(false);
    expect(hashTree(brain)).toEqual(before);
  });

  it('refuses a deleted manifest instead of guessing ownership', () => {
    rmSync(join(brain, MANIFEST_PATH));
    const before = hashTree(brain);

    const result = initInto(brain);

    expect(result.code).toBe(1);
    expect(result.out).toBe('');
    expect(result.err).toContain(`${MANIFEST_PATH} is missing`);
    expect(result.err).toContain('Restore the manifest');
    expect(result.err).toContain('Nothing was written');
    expect(hashTree(brain)).toEqual(before);
    expect(existsSync(join(brain, MANIFEST_PATH))).toBe(false);
  });

  it('refuses when the whole .lorekeeper directory was removed', () => {
    // Removing the directory and removing the file inside it are one gesture
    // as far as the surviving starter files are concerned.
    rmSync(join(brain, dirname(MANIFEST_PATH)), { recursive: true });
    const before = hashTree(brain);

    const result = initInto(brain);

    expect(result.code).toBe(1);
    expect(result.out).toBe('');
    expect(result.err).toContain(`${MANIFEST_PATH} is missing`);
    expect(result.err).toContain('ownership cannot be determined safely');
    expect(result.err).toContain('Restore the manifest');
    expect(result.err).toContain('Nothing was written');
    expect(result.err).not.toContain('unclaimed');
    expect(result.err).not.toContain('Adopted');
    expect(result.err).not.toMatch(
      /EEXIST|EISDIR|ENOTDIR|EACCES|errno|open|mkdir/,
    );
    expect(hashTree(brain)).toEqual(before);
    expect(existsSync(join(brain, dirname(MANIFEST_PATH)))).toBe(false);
  });

  it('refuses ambiguous recovery when every formerly owned starter was edited', () => {
    for (const file of STARTER_FILES) {
      writeFileSync(join(brain, file.path), `# Edited ${file.path}\n`);
    }
    rmSync(join(brain, MANIFEST_PATH));
    const before = hashTree(brain);

    const result = initInto(brain);

    expect(result.code).toBe(1);
    expect(result.out).toBe('');
    expect(result.err).toContain(`${MANIFEST_PATH} is missing`);
    expect(result.err).toContain('ownership cannot be determined safely');
    expect(result.err).toContain('Restore the manifest');
    expect(result.err).toContain('Nothing was written');
    expect(result.err).not.toMatch(/EEXIST|EISDIR|EACCES|errno|open|mkdir/);
    expect(result.err).not.toContain('unclaimed');
    expect(result.err).not.toContain('Adopted');
    expect(hashTree(brain)).toEqual(before);
    expect(existsSync(join(brain, MANIFEST_PATH))).toBe(false);
  });

  it('refuses an unreadable manifest before touching the brain', () => {
    const manifestPath = join(brain, MANIFEST_PATH);
    const before = hashTree(brain);
    chmodSync(manifestPath, 0o000);

    const result = (() => {
      try {
        return initInto(brain);
      } finally {
        chmodSync(manifestPath, 0o600);
      }
    })();

    expect(result.code).toBe(1);
    expect(result.out).toBe('');
    expect(result.err).toContain('cannot be read');
    expect(result.err).toContain('Nothing was written');
    expect(hashTree(brain)).toEqual(before);
  });

  it('reports an unreadable owned file without calling it missing', () => {
    const ownedPath = 'README.md';
    const path = join(brain, ownedPath);
    const before = readFileSync(path);
    chmodSync(path, 0o000);

    const result = (() => {
      try {
        return initInto(brain);
      } finally {
        chmodSync(path, 0o600);
      }
    })();

    expect(result.code).toBe(0);
    expect(result.err).toBe('');
    expect(result.out).toContain(`unreadable: ${ownedPath}`);
    expect(result.out).not.toContain(`missing: ${ownedPath}`);
    expect(readFileSync(path)).toEqual(before);
  });

  it('still says a starter path is unclaimed when no manifest exists', () => {
    const vault = join(sandbox, 'unmanaged');
    createAdoptionVault(vault);

    const result = initInto(vault);

    expect(result.out).toContain('unclaimed');
    expect(result.out).toContain(COLLIDING_STARTER_PATH);
  });

  it('leaves an adopted starter collision unchanged and unclaimed on rerun', () => {
    const vault = join(sandbox, 'adopted');
    createAdoptionVault(vault);
    expect(initInto(vault).code).toBe(0);
    const before = hashTree(vault);

    const result = initInto(vault);

    expect(result.code).toBe(0);
    expect(result.out).toContain('unclaimed');
    expect(result.out).toContain(COLLIDING_STARTER_PATH);
    expect(claimed(vault)).not.toContain(COLLIDING_STARTER_PATH);
    expect(hashTree(vault)).toEqual(before);
  });
});

describe('init interrupted part way', () => {
  it('claims the starter files it wrote before the failure', () => {
    const vault = join(sandbox, 'vault');
    mkdirSync(join(vault, 'sources'), { recursive: true });
    writeFileSync(join(vault, 'mine.md'), 'mine\n');
    chmodSync(join(vault, 'sources'), 0o000);

    const result = (() => {
      try {
        return initInto(vault);
      } finally {
        chmodSync(join(vault, 'sources'), 0o700);
      }
    })();

    expect(result.code).toBe(1);
    expect(result.err).toContain('EACCES');

    const owned = claimed(vault);
    expect(owned.length).toBeGreaterThan(0);
    expect(owned).not.toContain('sources/README.md');
    for (const path of owned) {
      expect(walk(vault)).toContain(path);
    }
    expect(readFileSync(join(vault, 'mine.md'), 'utf8')).toBe('mine\n');
  });

  it('records hashes that match what is actually on disk', () => {
    const vault = join(sandbox, 'vault');
    mkdirSync(join(vault, 'sources'), { recursive: true });
    chmodSync(join(vault, 'sources'), 0o000);

    try {
      initInto(vault);
    } finally {
      chmodSync(join(vault, 'sources'), 0o700);
    }

    const read = parseManifest(
      readFileSync(join(vault, MANIFEST_PATH), 'utf8'),
    );
    if (!read.ok) throw new Error(read.refusal.reason);

    for (const entry of read.manifest.files) {
      expect(entry.sha256).toBe(
        hashBytes(readFileSync(join(vault, entry.path))),
      );
    }
  });

  it('refuses a deleted manifest when only part of the starter set was written', () => {
    const vault = join(sandbox, 'vault');
    mkdirSync(join(vault, 'sources'), { recursive: true });
    chmodSync(join(vault, 'sources'), 0o000);

    try {
      expect(initInto(vault).code).toBe(1);
    } finally {
      chmodSync(join(vault, 'sources'), 0o700);
    }

    // The installation is genuinely partial: some starter paths were written
    // and claimed, and at least one was never written at all.
    const owned = claimed(vault);
    expect(owned.length).toBeGreaterThan(0);
    expect(owned.length).toBeLessThan(STARTER_FILES.length);
    expect(
      STARTER_FILES.some((file) => !existsSync(join(vault, file.path))),
    ).toBe(true);

    rmSync(join(vault, MANIFEST_PATH));
    const before = hashTree(vault);

    const result = initInto(vault);

    expect(result.code).toBe(1);
    expect(result.out).toBe('');
    expect(result.err).toContain(`${MANIFEST_PATH} is missing`);
    expect(result.err).toContain('ownership cannot be determined safely');
    expect(result.err).toContain('Restore the manifest');
    expect(result.err).toContain('Nothing was written');
    expect(result.err).not.toContain('unclaimed');
    expect(result.err).not.toContain('Adopted');
    expect(result.err).not.toMatch(
      /EEXIST|EISDIR|ENOTDIR|EACCES|errno|open|mkdir/,
    );
    // The surviving evidence is neither rewritten nor disowned, and the run
    // that could not explain it wrote no manifest of its own.
    expect(hashTree(vault)).toEqual(before);
    expect(existsSync(join(vault, MANIFEST_PATH))).toBe(false);
  });

  it('refuses a partial installation whose .lorekeeper directory was removed', () => {
    const vault = join(sandbox, 'vault');
    mkdirSync(join(vault, 'sources'), { recursive: true });
    chmodSync(join(vault, 'sources'), 0o000);

    try {
      expect(initInto(vault).code).toBe(1);
    } finally {
      chmodSync(join(vault, 'sources'), 0o700);
    }

    const owned = claimed(vault);
    expect(owned.length).toBeGreaterThan(0);
    expect(owned.length).toBeLessThan(STARTER_FILES.length);
    const absent = STARTER_FILES.filter(
      (file) => !existsSync(join(vault, file.path)),
    );
    expect(absent.length).toBeGreaterThan(0);

    rmSync(join(vault, dirname(MANIFEST_PATH)), { recursive: true });
    const before = hashTree(vault);

    const result = initInto(vault);

    expect(result.code).toBe(1);
    expect(result.out).toBe('');
    expect(result.err).toContain(`${MANIFEST_PATH} is missing`);
    expect(result.err).toContain('ownership cannot be determined safely');
    expect(result.err).toContain('Nothing was written');
    expect(result.err).not.toContain('unclaimed');
    expect(result.err).not.toContain('Adopted');
    expect(result.err).not.toMatch(
      /EEXIST|EISDIR|ENOTDIR|EACCES|errno|open|mkdir/,
    );
    // Nothing written, nothing recreated, nothing disowned: the surviving
    // evidence is still there for a restored manifest to explain.
    expect(hashTree(vault)).toEqual(before);
    for (const file of absent) {
      expect(existsSync(join(vault, file.path))).toBe(false);
    }
    expect(existsSync(join(vault, dirname(MANIFEST_PATH)))).toBe(false);
  });

  it('completes the installation and extends the existing manifest', () => {
    const vault = join(sandbox, 'vault');
    mkdirSync(join(vault, 'sources'), { recursive: true });
    chmodSync(join(vault, 'sources'), 0o000);

    try {
      expect(initInto(vault).code).toBe(1);
    } finally {
      chmodSync(join(vault, 'sources'), 0o700);
    }

    const firstOwned = claimed(vault);
    const firstBytes = Object.fromEntries(
      firstOwned.map((path) => [path, readFileSync(join(vault, path))]),
    );

    const result = initInto(vault);

    expect(result.code).toBe(0);
    expect(result.err).toBe('');
    expect(result.out).toContain('existing Lorekeeper installation');
    expect(result.out).toContain('missing starter files added');
    expect(claimed(vault)).toEqual(
      STARTER_FILES.map((file) => file.path).sort(),
    );
    for (const [path, bytes] of Object.entries(firstBytes)) {
      expect(readFileSync(join(vault, path))).toEqual(bytes);
    }
  });
});

describe('the built init binary', () => {
  // The bundled file npm ships, so these cases run the bytes users install.
  const cli = join(REPO_ROOT, 'packages', 'cli', 'dist', 'lore.js');

  beforeAll(() => {
    execFileSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'pipe' });
  });

  it('refuses a partial installation whose .lorekeeper directory was removed', () => {
    const brain = join(sandbox, 'built-no-metadata');
    mkdirSync(join(brain, 'sources'), { recursive: true });
    chmodSync(join(brain, 'sources'), 0o000);

    const first = (() => {
      try {
        return spawnSync(process.execPath, [cli, 'init', brain], {
          encoding: 'utf8',
        });
      } finally {
        chmodSync(join(brain, 'sources'), 0o700);
      }
    })();
    expect(first.status).toBe(1);
    expect(claimed(brain).length).toBeLessThan(STARTER_FILES.length);

    rmSync(join(brain, dirname(MANIFEST_PATH)), { recursive: true });
    const before = hashTree(brain);

    const rerun = spawnSync(process.execPath, [cli, 'init', brain], {
      encoding: 'utf8',
    });

    expect(rerun.status).toBe(1);
    expect(rerun.stdout).toBe('');
    expect(rerun.stderr).toContain('ownership cannot be determined safely');
    expect(rerun.stderr).not.toContain('unclaimed');
    expect(rerun.stderr).not.toContain('Adopted');
    expect(rerun.stderr).not.toMatch(/EEXIST|EISDIR|EACCES|errno|open|mkdir/);
    expect(hashTree(brain)).toEqual(before);
    expect(existsSync(join(brain, dirname(MANIFEST_PATH)))).toBe(false);
  });

  it('refuses recovery when a partial installation lost its manifest', () => {
    const brain = join(sandbox, 'built-partial');
    mkdirSync(join(brain, 'sources'), { recursive: true });
    chmodSync(join(brain, 'sources'), 0o000);

    const first = (() => {
      try {
        return spawnSync(process.execPath, [cli, 'init', brain], {
          encoding: 'utf8',
        });
      } finally {
        chmodSync(join(brain, 'sources'), 0o700);
      }
    })();
    expect(first.status).toBe(1);

    const owned = claimed(brain);
    expect(owned.length).toBeGreaterThan(0);
    expect(owned.length).toBeLessThan(STARTER_FILES.length);

    rmSync(join(brain, MANIFEST_PATH));
    const before = hashTree(brain);

    const rerun = spawnSync(process.execPath, [cli, 'init', brain], {
      encoding: 'utf8',
    });

    expect(rerun.status).toBe(1);
    expect(rerun.stdout).toBe('');
    expect(rerun.stderr).toContain(`${MANIFEST_PATH} is missing`);
    expect(rerun.stderr).toContain('ownership cannot be determined safely');
    expect(rerun.stderr).not.toContain('unclaimed');
    expect(rerun.stderr).not.toContain('Adopted');
    expect(rerun.stderr).not.toMatch(/EEXIST|EISDIR|EACCES|errno|open|mkdir/);
    expect(hashTree(brain)).toEqual(before);
    expect(existsSync(join(brain, MANIFEST_PATH))).toBe(false);
  });

  it('refuses recovery when every formerly owned starter was edited and the manifest is gone', () => {
    const brain = join(sandbox, 'built-brain');
    const first = spawnSync(process.execPath, [cli, 'init', brain], {
      encoding: 'utf8',
    });
    expect(first.status).toBe(0);

    for (const file of STARTER_FILES) {
      writeFileSync(join(brain, file.path), `# Edited ${file.path}\n`);
    }
    rmSync(join(brain, MANIFEST_PATH));
    const before = hashTree(brain);

    const rerun = spawnSync(process.execPath, [cli, 'init', brain], {
      encoding: 'utf8',
    });

    expect(rerun.status).toBe(1);
    expect(rerun.stdout).toBe('');
    expect(rerun.stderr).toContain(`${MANIFEST_PATH} is missing`);
    expect(rerun.stderr).toContain('ownership cannot be determined safely');
    expect(rerun.stderr).not.toContain('unclaimed');
    expect(rerun.stderr).not.toContain('Adopted');
    expect(rerun.stderr).not.toMatch(/EEXIST|EISDIR|EACCES|errno|open|mkdir/);
    expect(hashTree(brain)).toEqual(before);
    expect(existsSync(join(brain, MANIFEST_PATH))).toBe(false);
  });
});

describe('what init says it did', () => {
  it('lists no folder that a user file already occupies', () => {
    const vault = join(sandbox, 'vault');
    mkdirSync(vault);
    writeFileSync(join(vault, 'notes'), 'a file, not a folder\n');

    const result = initInto(vault);

    expect(result.out).not.toContain('  notes/\n');
    expect(result.out).toContain('  daily/\n');
  });

  it('lists no folder that is a symlink out of the brain', () => {
    const outside = join(sandbox, 'outside');
    const vault = join(sandbox, 'vault');
    mkdirSync(outside);
    mkdirSync(vault);
    symlinkSync(outside, join(vault, 'notes'));

    const result = initInto(vault);

    expect(result.code).toBe(0);
    // init refused to write through it, so it is not one of the brain's folders.
    expect(result.out).not.toContain('  notes/\n');
    expect(result.out).toContain('  daily/\n');
    expect(readdirSync(outside)).toEqual([]);
  });

  it('still lists a folder symlinked within the brain', () => {
    const vault = join(sandbox, 'vault');
    mkdirSync(join(vault, 'actual-notes'), { recursive: true });
    symlinkSync(join(vault, 'actual-notes'), join(vault, 'notes'));

    expect(initInto(vault).out).toContain('  notes/\n');
  });

  it('does not point at a README it did not write', () => {
    const vault = join(sandbox, 'vault');
    mkdirSync(vault);
    writeFileSync(join(vault, 'README.md'), '# mine\n');

    const result = initInto(vault);

    expect(result.out).not.toContain('Start by reading');
    expect(readFileSync(join(vault, 'README.md'), 'utf8')).toBe('# mine\n');
  });

  it('still points at the README when it wrote one', () => {
    const target = join(sandbox, 'brain');

    expect(initInto(target).out).toContain(
      `Start by reading ${join(target, 'README.md')}`,
    );
  });
});

describe('init refusals', () => {
  it('refuses a target inside the toolkit repository, writing nothing', () => {
    const target = join(REPO_ROOT, 'tmp-brain-should-never-exist');
    const result = initInto(target);

    expect(result.code).toBe(1);
    expect(result.err).toContain('refusing to initialize inside');
    expect(result.err).toContain(REPO_ROOT);
    expect(readdirSync(REPO_ROOT)).not.toContain(
      'tmp-brain-should-never-exist',
    );
  });

  it('refuses the toolkit repository root itself', () => {
    expect(initInto(REPO_ROOT).code).toBe(1);
  });

  it('sees through a symlink pointing into the toolkit repository', () => {
    const link = join(sandbox, 'link');
    symlinkSync(join(REPO_ROOT, 'packages'), link);

    const result = initInto(join(link, 'brain'));

    expect(result.code).toBe(1);
    expect(result.err).toContain('refusing to initialize inside');
  });

  it('initializes normally when no toolkit checkout is present', () => {
    const result = initInto(join(sandbox, 'brain'), {
      toolkitRepoRoot: null,
      now: () => new Date('2026-08-27T10:00:00.000Z'),
    });

    expect(result.code).toBe(0);
  });

  it('refuses a target that is a file', () => {
    const target = join(sandbox, 'notes.md');
    writeFileSync(target, 'mine\n');

    const result = initInto(target);

    expect(result.code).toBe(1);
    expect(result.err).toContain('not a directory');
    expect(readFileSync(target, 'utf8')).toBe('mine\n');
  });

  it('reports an inaccessible target without throwing a stack trace', () => {
    const target = join(sandbox, 'inaccessible');
    mkdirSync(target);
    chmodSync(target, 0o000);

    const result = (() => {
      try {
        return initInto(target);
      } finally {
        chmodSync(target, 0o700);
      }
    })();

    expect(result.code).toBe(1);
    expect(result.err).toMatch(/^lore init: .*EACCES/);
    expect(result.err).not.toContain('\n    at ');
    expect(readdirSync(target)).toEqual([]);
  });

  it('asks for a target when none was given', () => {
    const c = capture();
    const code = init([], c.streams);

    expect(code).toBe(2);
    expect(c.err()).toContain('lore init <target>');
  });

  it('refuses more than one target', () => {
    const c = capture();
    const code = init(['a', 'b'], c.streams);

    expect(code).toBe(2);
    expect(c.err()).toContain('"b"');
  });
});

describe('the init path', () => {
  it('is reachable as a subcommand of lore', () => {
    const c = capture();
    const target = join(sandbox, 'brain');

    expect(run(['init', target], c.streams)).toBe(0);
    expect(readdirSync(target)).toContain('README.md');
  });

  it('imports no network module anywhere in the toolkit', () => {
    const sources = [
      join(REPO_ROOT, 'packages', 'cli', 'src'),
      join(REPO_ROOT, 'packages', 'core', 'src'),
    ].flatMap((directory) =>
      walk(directory)
        .filter((path) => path.endsWith('.ts'))
        .map((path) => join(directory, path)),
    );

    expect(sources.length).toBeGreaterThan(0);

    const network =
      /\bnode:(https?|net|tls|dgram|dns|http2)\b|\bfrom '(https?|net|tls|dgram|dns|http2)'|\bfetch\(|XMLHttpRequest|WebSocket|undici|axios/;

    for (const file of sources) {
      expect({
        file: relative(REPO_ROOT, file),
        matched: network.exec(readFileSync(file, 'utf8'))?.[0] ?? null,
      }).toEqual({ file: relative(REPO_ROOT, file), matched: null });
    }
  });
});

describe('the sandbox itself', () => {
  it('is outside the toolkit repository, so these tests prove something', () => {
    expect(sandbox.startsWith(REPO_ROOT + sep)).toBe(false);
  });
});
