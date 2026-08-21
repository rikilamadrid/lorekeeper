# Project History

Compact record of completed work.

## Completed

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
