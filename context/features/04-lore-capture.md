# `lore capture`

## Status

In Progress

## Goal

`lore capture` writes a self-describing, greppable item into the inbox, and
when the captured thing is a URL it mints a deterministic stable source ID.

## Context

- Read: `context/project-overview.md` — the FROZEN rows on source IDs and
  per-domain URL identity, and the Durable Decision that URL normalization must
  be specified before the first source is written
- Read: `prototypes/schema-v0/vault/sources/` and
  `prototypes/schema-v0/vault/inbox/` for the shape captures took as evidence
- Relevant area: `packages/cli`, `packages/core`

## Requirements

- A captured item is useful before any processing: self-describing frontmatter
  plus the captured content, findable with `grep`.
- Capture writes only into the inbox, and only files the manifest owns.
- Capturing a URL produces a stable source ID derived from a normalized URL.
- URL normalization is per-domain, not a generic tracking-parameter blocklist.
  The normalization rules are documented in `packages/core`.
- YouTube is the only domain-specific identity rule implemented for v0.1. The
  rule set is extensible; do not add unsupported domains.
- Normalization must collapse YouTube variants that identify the same video —
  including `&list=` and `&index=` — while leaving meaningful query parameters
  such as `?page=2` intact on generic URLs.
- Capturing the same URL twice reports the existing source rather than creating
  a second one.
- Provenance written at capture time goes through the Feature 02 mutation
  operations, never through hand-assembled YAML.
- Capture makes no network call. It does not fetch, transcribe, or summarize
  anything at the URL.

## Out of Scope

- Fetching page content, transcripts, or metadata from any URL.
- Automated ingestion of YouTube, web pages, newsletters, or email.
- Any LLM call, summarization, or classification.
- Promoting an inbox item into a note.

## Delivery Chunks

1. URL normalization and stable source ID derivation in `packages/core`, with a
   fixture table of variant URLs and expected IDs.
2. `lore capture` writing inbox items, including the non-URL case.
3. Source capture with provenance frontmatter, and duplicate detection.

## Acceptance Criteria

- Five YouTube URL variants for one video normalize to one ID; a URL whose
  `?page=2` is meaningful keeps it and stays distinct.
- A captured inbox item is readable and its subject identifiable with `grep`
  alone, with no tooling.
- Capturing the same URL twice creates one file and reports the duplicate.
- Captured files validate under Feature 02.
- No network access occurs during any capture test.

## Notes / Decisions

- Depends on Features 02 and 03.
- The binary name is `lore`, resolved 2026-08-21. Command vocabulary beyond
  `capture` is not settled here.
