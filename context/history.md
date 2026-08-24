# Project History

Compact record of completed work.

## Completed

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
