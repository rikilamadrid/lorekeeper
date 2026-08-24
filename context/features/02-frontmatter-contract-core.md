# Frontmatter Contract and Representation-Preserving Core

## Status

Complete

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

## Known Limitations

Accepted for v0.1 by human decision on 2026-08-24. None is a write-path defect;
none blocks Feature 05 depending on these contracts.

### Read-path defects, deferred

1. **A file opening with a thematic break reports `frontmatter-unreadable`.**
   A `---` on the first line is read as an opening delimiter, so the prose that
   follows lands in `block.raw`. The file is still indexable and no mutation
   corrupts it; the finding is noise, not damage.
2. **An indented ATX H1 is not found.** `  # Title` does not resolve as a
   title, so name-based links fall through to the alias tier.
3. **An ATX H1 inside an HTML comment wins over the real H1.** The commented
   heading is read as the title. This one carries more weight than its severity
   suggests: on the prototype vault, 2 of 4 `about` edges resolved *only*
   through the H1 tier, so the tier does real work and a wrong answer there is
   a wrong link rather than a missing one.

### Open decision, not a defect

4. **Tag-resolution warnings are not inspected.** `readFrontmatter` reads
   `document.errors` but never `document.warnings`, so a file whose tag fails to
   resolve (`TAG_RESOLVE_FAILED`) is read, written, and reported clean. Current
   behavior is portable — `!!null [abc]` and `!!str [abc]` both read as
   `["abc"]` under this package's `yaml` and under Ruby Psych — so nothing is
   silently non-portable today. Whether a warning should become a finding is a
   contract question for whoever needs it.

### Contract gap, resolved as unreported

5. **Validation cannot detect a source missing its stable ID.** The frozen
   contract says sources carry stable IDs and ordinary notes do not, but only
   `type: source` announces source-ness, and `type` values are unfrozen and must
   not become load-bearing. Resolved 2026-08-22: leave it unreported. Closing
   the gap needs a signal the contract can lean on, which is a contract change,
   not a validation change. Candidate for an `Open decision` row in
   `context/project-overview.md`.

### Interface note

6. **`parseError` carries a code and position, not parser prose.** It now reads
   `BAD_INDENT at line 3, column 1`. The `yaml` parser's own message quotes the
   source lines that failed, and a frontmatter block holds whatever the author's
   delimiters enclose — body prose included — so the message is rebuilt from the
   parser's stable error code and position instead. Terser and greppable, at the
   cost of the parser's human explanation. A curated per-code wording catalogue
   is a possible follow-up.

### Not verified

- `doctor` exit behavior — `TBD` by design, out of scope for this Feature.
- Large-vault performance. No benchmark exists.
- Systematic cross-parser round-tripping beyond the tag spot-check above.
- `changedLines` in `packages/core/test/write.test.ts` is a set-based diff and
  can under-report a moved line. An independent LCS diff over all 20 fixtures
  found no case where it did, but the helper remains weaker than it reads.

## Notes / Decisions

- Whether `derived_from` spans note-to-note or only source-to-note is `TBD`.
  Implement source-to-note; do not design note-to-note out, and do not add IDs
  to ordinary notes to enable it.
- How strict `doctor`-style validation may be is `TBD`. This Feature ships the
  validation library with severities; it does not decide CLI exit behavior.
- Changing these contracts once a later Feature depends on them requires human
  approval.
- Depends on Feature 01.
