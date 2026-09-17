# Span Index and `lore search`

## Status

In Progress

## Goal

`lore search` returns ranked, span-level results — with path, anchor, line
range, score, and the span text — over a whole vault, fusing multiple query
wordings into one ranked list.

## Context

- Read: `context/project-overview.md` — every retrieval row under Requirements,
  and the `retrieval-v0` Durable Decisions including the evidence boundary
- Read: `prototypes/retrieval-v0/README.md`, `index.mjs`, `search.mjs` as
  **measured evidence**, not code to port. The private evaluation question set
  stays out of this repository.
- Relevant area: `packages/core`, `packages/cli`

## Requirements

- The index addresses locations and spans — file plus heading or block anchor,
  plus a line range — not whole files.
- Ranking is BM25 over span text plus a weighted metadata document. Ranking is
  not a separate Feature and needs no further design work.
- `search` accepts multiple alternate wordings in one invocation and fuses the
  ranked lists with Reciprocal Rank Fusion. Replace RRF only on better evidence.
- Every result exposes path, anchor or location, line span range, score, and the
  retrieved span text.
- Near-duplicate suppression is applied to the result list.
- No absolute relevance cutoff. Results are never withheld because a score looks
  low, and no "nothing found" verdict is derived from score.
- Arbitrary Markdown indexes: files with no Lorekeeper frontmatter, or with
  unrecognized fields, are indexed as ordinary knowledge.
- Retrieval correctness does not depend on `type` or on `about`.
- Reading and indexing never writes to a user's notes.
- Retrieval stays interactive on a vault of a few thousand notes; state that
  target as a measured number in the Feature's verification, not a claim.
- Output has a stable machine-readable form suitable for an agent to consume.

## Out of Scope

- Embeddings, vectors, or semantic search.
- Any LLM call from the CLI.
- A second retrieval command. v0.1 has exactly one retrieval concept.
- An MCP server or any other transport adapter.
- Agent-side query expansion instructions — Feature 07 carries those.

## Delivery Chunks

1. Span extraction and the index: anchors, line ranges, and the weighted
   metadata document, over synthetic fixtures.
2. BM25 ranking and single-query `lore search` with the full result shape.
3. Multi-wording input, RRF fusion, and near-duplicate suppression.

## Acceptance Criteria

- On a synthetic corpus, a known answer is retrievable and every returned result
  carries path, anchor, line range, score, and span text.
- Fusing three wordings ranks a target span higher than the worst single wording
  does, demonstrated on a fixture built for that case.
- Content duplicated across many fixture files does not crowd the result list.
- A fixture file with no frontmatter is indexed and retrievable.
- Indexing a fixture vault leaves every file byte-identical.
- Index and query time over a generated few-thousand-note corpus is measured and
  recorded.

## Notes / Decisions

- KNOWN v0.1 LIMITATION: score cannot prove requested knowledge is absent. This
  is documented behavior, not a defect to fix here.
- EVIDENCE BOUNDARY: `retrieval-v0` was validated over project corpora, not a
  mature personal brain. Rerunning that harness against a populated real brain
  is longitudinal validation and is not part of this Feature.
- Depends on Features 02 and 03.
- Recorded at the `05.1` review on 2026-09-16, all non-blocking and none
  addressed inside `05.1`, so the ticket did not grow during delivery. Each
  stays open until a ticket or a Feature decision takes it up:
  - **CRLF headings do not delimit spans.** The ATX heading pattern in
    `packages/core/src/spans.ts` ends at `$` and `.` does not match `\r`, so a
    heading in a CRLF file is body text and span text carries raw `\r`. The
    document reader in the same package strips `\r` per line; the splitter does
    not.
  - **A `#` line inside a fenced code block becomes an anchor.** The document
    reader tracks fences when finding the H1; the splitter does not. Parity with
    the measured prototype, but it yields an address that is not a heading.
  - **Closing-hash headings keep their hashes** — `## Closed ##` yields the
    anchor `Closed ##`, where the reader's H1 logic strips the closing sequence.
  - **Setext headings do not delimit spans.** Stated in the splitter. The stated
    rationale covers `---` colliding with a thematic break; `===` has no such
    collision and the reader already reads it, so the limitation is broader than
    its justification.
  - **The brain is positional, not `--brain`.** Ticket `05.1` wrote
    `lore search --brain <path>`; the command takes `<brain>` first, matching
    `lore capture <brain> <item>`. Command vocabulary remains an open decision.
  - **Two verification gaps.** The retrieval test that `type` is not ranked on
    asserts a type-level truth rather than ranking behavior, and exhaustion is
    reported through `lore search` but exercised only at the walker. The review
    verified both directly against the built binary.
- Recorded at the `05.2` review on 2026-09-17, all non-blocking and none
  addressed inside `05.2`:
  - **The `--help` summary line still reads `lore search <brain> <query>`.**
    The command's own usage line shows quoted repeatable wordings, and the
    paragraph beneath the summary explains them; the one-line summary is stale.
  - **Stop-word-only differences collapse as duplicates.** `retry the policy`
    and `Retry policy!` are one span under normalized-token equality. This
    follows the stated rule and matches how ranking already sees them, but is
    slightly broader than "copies of one document".
  - **Float summation can mask a rank tie.** Two spans with the same multiset
    of ranks accumulated in different list orders may differ in the last bit,
    so the path tiebreak may not engage. Run-to-run determinism holds because
    input order is fixed.
  - **A wording given twice votes twice**, as in the prototype. The caller
    controls it.
  - **Unquoted multi-word input now fuses one-word wordings** where `05.1`
    joined the words into one query. The `05.1` ticket, usage, and PR all wrote
    the query quoted, so this changes an undocumented convenience, not a
    contract. Feature 07's instructions should show the quotes.
