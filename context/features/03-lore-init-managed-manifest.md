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
- The manifest lives at `.lorekeeper/manifest.json` inside the target brain.
- Unlisted files are user-owned by default. Absence from the manifest is a
  positive statement of user ownership, not missing information.
- The manifest is ownership metadata, not an inventory of the vault. It records
  the files the toolkit owns and nothing about the rest.
- Collision policy: when a starter path already exists, init leaves the file
  byte-identical, does not claim it in the manifest, and reports it as skipped.
  Claiming a file the toolkit did not write would let a later `lore update`
  overwrite the user's content. Existing directories may be reused.
- `lore init` does not validate, reformat, or rewrite adopted user notes.
  Notes without Lorekeeper frontmatter are valid, indexable knowledge.
- `packages/core` stays filesystem-free. All `fs` access belongs in
  `packages/cli`; core holds contracts and representation logic only.

## Out of Scope

- Propagating later starter changes into an existing brain — Feature 06.
- Capture and search behavior.
- A `system/` folder. Resolved: v0.1 neither creates nor reserves it.
- Any interactive onboarding or GUI configuration.
- Validation or repair of adopted notes; that is `doctor`'s concern.
- Transcript or session ingestion.
- Claude hooks, queues, and background workers.
- AI-driven brain population of any kind. Init writes starter files and a
  manifest; nothing generates knowledge.

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
  byte-identical, verified by hashing before and after. The adoption fixture
  includes an `.obsidian/` directory, a `.trash/` directory, attachments and
  other non-Markdown files, and at least one file occupying a starter path.
- A starter-path collision leaves the existing file untouched, omits it from the
  manifest, and is reported as skipped.
- A second init run writes nothing and reports the existing installation.
- Init aborts with an actionable error when the target is inside this repository.
- No network call is made on any init path.

## Notes / Decisions

- Resolved 2026-08-27: the manifest lives at `.lorekeeper/manifest.json`. Dot
  prefixed, so Obsidian ignores it and it never surfaces as a note.
- Resolved 2026-08-27: `packages/core` stays filesystem-free; `fs` lives in
  `packages/cli`. This is already true of the code and is now a contract.
- Resolved 2026-08-27: starter-path collisions are skipped and unclaimed, never
  overwritten and never adopted into the manifest.
- Resolved 2026-08-27: init does not validate or rewrite adopted notes.
- Resolved 2026-08-27: `system/` is neither created nor reserved in v0.1. An
  empty reserved folder shipping no tooling is a promise with no delivery
  behind it. Recorded in `context/project-overview.md`.
- Depends on Feature 02.
