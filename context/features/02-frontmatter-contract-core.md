# Frontmatter Contract and Representation-Preserving Core

## Status

Proposed

## Goal

`packages/core` can read and validate Lorekeeper frontmatter, and can mutate a
Markdown file's frontmatter without altering a single byte it did not have to
change.

## Context

- Read: `context/project-overview.md` — the FROZEN v0.1 contract rows, and the
  Durable Decisions on flat frontmatter, edge direction, and `derived_from`
  absence
- Read: `context/coding-standards.md` — "Project convention:
  representation-preserving writes"
- Read: `prototypes/schema-v0/README.md` and `prototypes/schema-v0/lib.mjs` as
  **evidence of what the contract must be**, not as code to port
- Relevant area: `packages/core`

## Requirements

- Reads parse frontmatter freely; a YAML parser is an acceptable dependency for
  reads.
- Writes never serialize a parsed object back over a user's file. Mutations edit
  the smallest span of text that achieves the change.
- Frontmatter is flat. Nothing is mandatory on read. A file with no frontmatter,
  or with only unrecognized fields, is valid indexable knowledge.
- Unknown fields are preserved exactly through any mutation. Schema evolution is
  additive-only.
- Provenance edges point from the derived artifact to its origin. Inverse edges
  are never written.
- `derived_from` resolves by stable source ID. Absence means unknown or
  unrecorded, never original authorship.
- Sources carry stable IDs. Ordinary notes do not.
- Name-based link resolution falls back to H1 title, then to declared aliases.
  The fallback order is documented in the package.
- Validation reports findings; it does not repair files.
- `about` is exposed as provisional: additive structural aboutness, never a
  mirror of body wikilinks. Nothing in this package may make correctness depend
  on it.
- Every mutation operation ships with a minimal-diff test and an idempotency
  test. Round-trip identity — read then write with no mutation — is byte-exact.

## Out of Scope

- Any CLI command surface. This Feature ships library contracts only.
- The managed manifest format — Feature 03.
- Indexing, spans, and ranking — Feature 05.
- Freezing `type` values, `kind` values, or `about` semantics.
- Repairing, reformatting, or normalizing user files.

## Delivery Chunks

1. Frontmatter read and parse, with the type contracts and the documented
   link-resolution fallback.
2. Validation: findings with file, field, and reason. No mutation.
3. Representation-preserving write primitive, plus the provenance mutation
   operations built on it, with minimal-diff and idempotency tests.

## Acceptance Criteria

- A synthetic fixture set covering local-offset timestamps, inline arrays, YAML
  comments, mixed quoting, unknown fields, and absent frontmatter round-trips
  byte-identically through read-then-write with no mutation.
- Adding a `derived_from` edge to a fixture changes exactly the lines it must,
  and a second run changes nothing.
- Validation on a file with unrecognized fields reports no error and preserves
  those fields through a later mutation.
- No test fixture contains real personal content.

## Notes / Decisions

- Whether `derived_from` spans note-to-note or only source-to-note is `TBD`.
  Implement source-to-note; do not design note-to-note out, and do not add IDs
  to ordinary notes to enable it.
- How strict `doctor`-style validation may be is `TBD`. This Feature ships the
  validation library with severities; it does not decide CLI exit behavior.
- Changing these contracts once a later Feature depends on them requires human
  approval.
- Depends on Feature 01.
