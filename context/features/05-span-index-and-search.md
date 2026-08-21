# Span Index and `lore search`

## Status

Proposed

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
