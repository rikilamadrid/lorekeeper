# `lore init` and the Managed Manifest

## Status

Proposed

## Goal

`lore init` produces a working brain — thin folder set, starter files, and a
managed manifest recording which files the toolkit owns — and can point at an
existing Markdown or Obsidian vault without rewriting anything in it.

## Context

- Read: `context/project-overview.md` — Scope, the manifest and adoption
  Durable Decisions, and the Quality Priority "Data safety"
- Read: `context/ai-interaction.md` — Project-Specific Approval
- Read: `prototypes/schema-v0/vault/` as an illustration of the folder shape
- Relevant area: `packages/cli`, `packages/core`

## Requirements

- The generated structure is thin and stable: folders carry epistemic role, and
  frontmatter is authoritative for type, status, provenance, and links.
- No numbered folders. No `archive/` folder.
- The manifest records, for each toolkit-owned file, enough to detect later
  drift, and distinguishes toolkit-owned from user-owned before any write.
- The generated brain is valid Markdown, readable and useful with no tooling
  installed.
- Init targets a directory outside this repository and refuses to generate into
  the toolkit repository itself.
- Adoption mode: pointed at an existing vault, init adds only manifest-owned
  files and never moves, rewrites, or reformats an existing note.
- Init is idempotent. Re-running against an already-initialized target reports
  what exists rather than overwriting it.
- Every write path is additive or manifest-guarded; anything else stops and asks.

## Out of Scope

- Propagating later starter changes into an existing brain — Feature 06.
- Capture and search behavior.
- Whether `system/` capabilities ship in the generated structure.
- Any interactive onboarding or GUI configuration.

## Delivery Chunks

1. Manifest format in `packages/core`, with ownership and drift-detection
   primitives and their tests.
2. `lore init` generating the folder set and starter files into an empty
   target, writing the manifest.
3. Adoption of a non-empty existing vault, plus idempotent re-run behavior.

## Acceptance Criteria

- Init into an empty directory produces a structure that validates under Feature
  02 and reads sensibly with no tooling.
- Init into a synthetic existing vault leaves every pre-existing file
  byte-identical, verified by hashing before and after.
- A second init run writes nothing and reports the existing installation.
- Init aborts with an actionable error when the target is inside this repository.
- No network call is made on any init path.

## Notes / Decisions

- Whether `system/` capabilities ship in the v0.1 generated structure is `TBD`.
  The structure may reserve the location; ship no tooling for it.
- Depends on Feature 02.
