# Project History

Compact record of completed work.

## Completed

### 2026-09-18 — Feature 07: Agent-Facing Integration Artifact

- Outcome: `lore init` writes `AGENTS.md` at the brain root as a
  manifest-owned starter file, so a calling agent learns Lorekeeper is there
  without a human pasting instructions. The artifact states what the brain is,
  the exact `lore search` call including several quoted wordings, the five
  result fields a caller needs to weigh evidence, and the known limitation that
  score cannot prove knowledge is absent. Regeneration over a user-edited copy
  reports drift and keeps the file byte for byte, because generation goes
  through the existing `lore init` and managed-manifest path rather than a
  command of its own. `npm run bench:context` then turned the Feature's central
  claim into a measured number: over the same deterministic 3,000-note corpus
  Feature 05 used, the prescribed call returns a 2,847-byte payload against a
  5,604-byte baseline of the whole notes those spans sit in — 1.97x, reported
  as approximately 2.0x. Bytes are a labelled proxy for token cost; no
  tokenizer and no vendor coupling entered the CLI to produce it.
- Verification: `npm run lint`, `npm run build`, and `npm test` (709 tests, 21
  files) clean. CI passed on macOS and Ubuntu for PRs #29 and #30. The `07.2`
  review re-ran the benchmark twice from a clean build with byte-identical
  output, reproduced the spec's compact-JSON and whitespace claims
  independently, confirmed all five result fields in the payload, and re-ran
  `npm run bench:search` to show the shared-parameters refactor left Feature
  05's recorded timings intact. The baseline charges only for the files the
  returned spans came from, so the saving is a floor rather than a best case,
  and nothing — corpus, seed, or output format — was tuned to improve it.
- Commit/PR: PRs #29 (`07.1`) and #30 (`07.2`), squash-merged to `main`.
- Follow-up: four non-blocking observations from the `07.1` review and two from
  `07.2` are recorded in the Feature spec. The ones most likely to matter:
  `AGENTS.md` is itself indexed and outranks the intended note on its own
  example query, with no small correct fix that does not derive meaning from a
  path; the taught command works as written only from the brain directory; and
  the artifact assumes `lore` is already on `PATH`. Carried and still open:
  `dist/bench/` ships in the package until the release process decides
  otherwise; bump `actions/checkout` and `actions/setup-node` to `@v5`;
  `npm run clean && npm run build` without a reinstall leaves `lore`
  non-executable.

### 2026-09-17 — Feature 05: Span Index and `lore search`

- Outcome: `lore search <brain> "<wording>" ["<wording>" ...]` walks a vault,
  splits every Markdown file into spans addressed by heading anchor plus a
  1-based line range, ranks them with BM25 over span text and a weighted
  metadata document, fuses several wordings by reciprocal rank over the top 20
  of each, suppresses spans whose normalized tokens already stand in the list,
  and prints path, anchor, line range, score, and span text on every result.
  `--json` is the machine-readable contract Feature 07 will consume. The index
  is built in memory per command and never written; a span under no heading
  carries a `null` anchor. Files without frontmatter, or with unparseable
  frontmatter, index as ordinary knowledge, and ranking reads neither `type`
  nor `about` as structure. No relevance cutoff anywhere. `packages/core`
  stayed free of `node:` builtins, asserted by a layering test.
- Verification: `npm run lint`, `npm run build`, and `npm test` (698 tests, 19
  files) clean. CI passed on macOS and Ubuntu for PRs #23, #24, and #25.
  `npm run bench:search` over a deterministic synthetic corpus of 3,000 notes
  and 10,537 spans: 81 ms to walk and split, 64 ms to build the index, 6.9 ms
  for three fused wordings, 129 ms for the command end to end, median of 20 on
  an Apple M5 with Node v26.5.0 — about fifteen times inside the two-second
  interpretive reading of "interactive" recorded in the spec. Each ticket was
  separately reviewed against the built binary: byte-identical vaults by
  sha256, no file created, headingless spans, RRF arithmetic and the top-20
  boundary, suppression before `--limit`, and run-to-run determinism.
- Commit/PR: PRs #23 (`05.1`), #24 (`05.2`), and #25 (`05.3`), squash-merged
  to `main`.
- Follow-up: fourteen non-blocking review observations are recorded in the
  spec's Notes / Decisions and none was addressed inside a ticket. The ones
  most likely to matter: CRLF headings and `#` lines inside code fences are
  not handled by the span splitter although the document reader handles both;
  the `--help` summary line still shows a single unquoted `<query>`; unquoted
  multi-word input now fuses one-word wordings, so Feature 07's instructions
  should show the quotes; and `dist/bench/` ships in the package until the
  release process decides otherwise.

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
