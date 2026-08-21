# Monorepo Foundation and Toolchain

## Status

In Progress

## Goal

A reviewable, CI-verified monorepo skeleton where `install`, `lint`, `test`, and
`build` all run and pass, with no product behavior implemented.

## Context

- Read: `context/project-overview.md` — Technology, Commands, Delivery Workflow,
  Environments and Integrations
- Read: `context/coding-standards.md` — Scope, Contracts, Testing
- Relevant area: repository root, `packages/core`, `packages/cli`, `apps/docs`
- Avoid: `prototypes/` — evidence only, never adopted by this Feature

Confirmed with the human on 2026-08-21, resolving two `TBD` rows in the
overview: build and package tooling is **npm workspaces**; the test runner is
**Vitest**. Both rows should be updated in `context/project-overview.md` when
this Feature completes.

## Requirements

- npm workspaces with exactly three packages: `packages/core`, `packages/cli`,
  `apps/docs`. No further packages without a real boundary.
- TypeScript across all packages, with a shared base config the packages extend.
- Vitest configured so tests can run per package and from the root.
- Lint and format tooling chosen once and applied repo-wide.
- The `lore` CLI binary is declared and runs, printing version and usage only.
- CI runs install, lint, test, and build on pull requests, on macOS and Linux.
  No Windows job.
- Node LTS is pinned in `engines` and used by CI.
- MIT `LICENSE` at the repository root.
- `.gitignore` ignores `context/current-feature.md` and `context/handoff.md` by
  name, and never `context/` wholesale.
- `context/project-overview.md` Commands block is filled in with the real
  commands this Feature establishes.

## Out of Scope

- Any schema, capture, indexing, search, or manifest behavior.
- Docs site content and framework selection — `apps/docs` is a placeholder
  package here; see Feature 08.
- npm publishing and release automation.
- Windows support.

## Delivery Chunks

1. Root workspace, TypeScript base config, lint and format, MIT license,
   `.gitignore` rules.
2. The three packages with build scripts, plus a `lore` binary that prints
   version and usage.
3. Vitest wiring with one real test per package, and the CI workflow.

## Acceptance Criteria

- A clean clone runs install, lint, test, and build successfully on macOS.
- `lore --version` and `lore --help` execute from a built artifact, not from
  source via a runner shim.
- CI passes on a pull request, on both macOS and Linux.
- No package depends on a network call or a credential.

## Notes / Decisions

- Docs framework remains `TBD` and must not be resolved here.
- Dependency additions in this Feature are toolchain-level and still require
  human approval per `context/ai-interaction.md`.
