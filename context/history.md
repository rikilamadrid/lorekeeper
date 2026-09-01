# Project History

Compact record of completed work.

## Completed

### 2026-09-01 — Feature 04: `lore capture`

- Outcome: `lore capture <brain> <item>` writes a greppable, self-describing
  inbox item, while a URL is normalized under a per-domain identity rule and
  written as a validated source carrying its stable ID and origin URL. A repeat
  capture finds that ID across the brain, reports the existing source, and
  writes nothing. Capture remains offline. YouTube is the only v0.1 domain
  rule; the rule set is closed and versioned so claiming a host that already
  has `url-` sources requires a deliberate migration of IDs and inbound
  provenance edges rather than passing as a drop-in extension.
- Verification: `npm run lint`, `npm run build`, and `npm test` (620 tests, 13
  files) clean. PR #18 CI passed on macOS and Ubuntu. The Feature's delivery
  tickets separately verified explicit-brain refusal without writes, greppable
  inbox capture, built-artifact URL normalization, validated source creation,
  duplicate capture with a byte-identical brain, and the rule-set migration
  guard.
- Commit/PR: PRs #15 (`04.1`), #14 (`04.2`), #17 (`04.3`), and #18 (`04.4`),
  squash-merged to `main`.
- Follow-up: adding any second domain identity rule must bump the rule-set
  version and migrate every affected `url-` source ID together with its inbound
  provenance edges. The migration itself remains out of scope until such a
  rule is approved.

### 2026-08-28 — Feature 03: `lore init` and the Managed Manifest

- Outcome: `lore init` produces a working brain — thin folder set, starter
  files, and `.lorekeeper/manifest.json` recording what the toolkit owns. It
  refuses to generate into this repository, adopts an existing Markdown or
  Obsidian vault without rewriting a byte, and is idempotent: a rerun reads the
  ownership record before touching anything and reports owned files as
  unchanged, modified, missing, or unreadable without repairing any of them.
  Repair is deferred to `lore update`. A starter-path collision leaves the file
  byte-identical, unclaimed, and reported as skipped, because claiming a file
  the toolkit did not write is what would let a later run overwrite it. A
  partial installation adds only paths that are missing and unowned, merging
  them into the existing manifest atomically. A manifest-less target that still
  shows traces of an installation is refused rather than adopted; unprovable
  ownership is never reported as the user's. `packages/core` stayed
  filesystem-free.
- Verification: `npm run lint`, `npm run build`, and `npm test` (503 tests, 11
  files) clean. Init behavior re-checked against built `dist/cli.js` rather than
  the project's own tests: normal rerun, partial recovery, both missing-manifest
  variants, and missing, modified, and unreadable owned files. Adoption verified
  by hashing a synthetic vault before and after.
- Commit/PR: PRs #7 (`03.1`), #8 (`03.2`), and #9 (`03.3`), squash-merged to
  `main`.
- Follow-up: propagating later starter changes into an existing brain is Feature
  06, and `lore update` owns drift repair. One case is deliberately unreachable
  and recorded in `packages/cli/src/init.ts`: a partial installation whose
  `.lorekeeper/` is gone and whose every surviving starter has been edited
  leaves no evidence on disk and is adopted as an ordinary vault. Carried and
  still open: bump `actions/checkout` and `actions/setup-node` to `@v5`; `npm
  run clean && npm run build` without a reinstall leaves `lore` non-executable.

### 2026-08-24 — Feature 02: Frontmatter Contract and Representation-Preserving Core

- Outcome: `packages/core` reads, validates, and mutates Lorekeeper frontmatter.
  Reads parse with `yaml`; writes never re-serialize, splicing the smallest span
  that achieves the change, so existing style — flow vs block, indentation,
  separators, quoting, comments — survives untouched. `validateDocument` /
  `validateDocuments` report findings across ten codes and three severities and
  repair nothing. `addDerivedFrom` / `removeDerivedFrom` refuse rather than guess
  when frontmatter is unreadable, duplicated, or not a list, returning the text
  unchanged. Link resolution documents the name → H1 → alias fallback. Unknown
  fields are preserved through any mutation. No CLI surface, no network calls.
- Verification: `npm run lint`, `npm run build`, and `npm test` (381 tests, 8
  files) clean. All four acceptance criteria re-checked independently against
  built `dist/` rather than the project's own tests: 20 fixtures round-trip
  byte-identically; 17 existing blocks take an added edge as exactly one added
  line, 2 files gain a 3-line block with body bytes preserved, all idempotent on
  a second add; unknown fields produce 0 findings and every line survives a
  mutation; 20 fixtures scanned across 5 personal-content pattern classes with 0
  hits. Earlier evidence: 16 prototype-vault files this code did not author
  round-tripped, mutated, and reverted exactly; ~7,000 fuzzed frontmatter
  spellings and ~35 adversarial cases corrupted nothing.
- Privacy fix before close: `Finding.reason` and `WriteRefusal.reason` document
  "never contains body text", but the `yaml` parser embeds a source snippet in
  its messages, and a `---` delimiter pair encloses whatever the author put
  between it — body prose included. `parseError` is now built from the parser's
  error code and position instead of its message. A fourth leak site the review
  had not found was closed with it: `toJS()` throws on an anchorless alias as a
  plain `ReferenceError` naming the alias verbatim. Two guard tests that passed
  vacuously were replaced with ones that fail without the fix, plus two new ones.
  Verified by 4,000 randomized hostile blocks: 0 leaks.
- Commit/PR: branch `feature/frontmatter-contract-core` (`9f448a1`, `0c5874c`,
  `c36a45a`, `f2257c1`, plus the privacy fix).
- Follow-up: six known limitations recorded in the Feature spec — three deferred
  read-path defects (thematic-break-as-delimiter, indented ATX H1, H1 inside an
  HTML comment), the unread `document.warnings` tag question, the
  source-missing-its-ID contract gap, and the terser `parseError` wording. Not
  verified: `doctor` exit behavior (`TBD`), large-vault performance, systematic
  cross-parser round-tripping. Carried from Feature 01 and still open: bump
  `actions/checkout` and `actions/setup-node` to `@v5`; `npm run clean && npm run
  build` without a reinstall leaves `lore` non-executable.

### 2026-08-21 — Feature 01: Monorepo Foundation and Toolchain

- Outcome: npm workspace with `packages/core`, `packages/cli`, and `apps/docs`,
  a shared TypeScript base config, Biome for lint and format, Vitest across the
  workspace, and a `lore` binary that prints version and usage. No product
  behavior. Resolved two `TBD` rows in the overview — build tooling is npm
  workspaces, test runner is Vitest — and filled the Commands block.
- Verification: `npm ci`, `npm run lint`, `npm test` (7 tests, 3 files), and
  `npm run build` all pass on a clean install on macOS; `lore --version` and
  `lore --help` run from the built artifact. CI green on both `ubuntu-latest`
  and `macos-latest` — run `32516781331` on PR #1.
- Commit/PR: PR #1, squash-merged to `main`; branch `feature/monorepo-foundation`
  (`949d4b9`, `546e2e5`, `1b6336e`, `6143cee`).
- Follow-up: `actions/checkout@v4` and `actions/setup-node@v4` still target
  deprecated Node 20 — bump to `@v5`. `npm run clean && npm run build` without a
  reinstall leaves `lore` non-executable (mode `644`); npm's bin-linking is the
  only thing that sets the exec bit.
