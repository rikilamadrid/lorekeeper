# `lore capture`

## Status

In Progress

## Goal

`lore capture` writes a self-describing, greppable item, filed by what it is:
a plain-text capture lands in `inbox/`, and a URL becomes a source in
`sources/` under the deterministic stable source ID minted from its
normalized form.

## Context

- Read: `context/project-overview.md` — the FROZEN rows on source IDs and
  per-domain URL identity, and the Durable Decision that URL normalization must
  be specified before the first source is written
- Read: `prototypes/schema-v0/vault/sources/` and
  `prototypes/schema-v0/vault/inbox/` for the shape captures took as evidence
- Relevant area: `packages/cli`, `packages/core`

## Requirements

- The brain is named explicitly: `lore capture <brain> <item>`. For v0.1 there
  is no upward discovery from the working directory, no configured default
  brain, and no implicit lookup of any other kind.
- `<brain>` must resolve to an initialized brain holding a valid
  `.lorekeeper/manifest.json`. When it does not, capture fails with an
  actionable error and writes nothing.
- The explicit-path convention is the default for every later command that
  operates on an existing brain, including `search` in Feature 05 and `update`
  in Feature 06, until a Feature explicitly changes it. Nested brains need no
  lookup rule, because the caller names the one it means.
- A captured item is useful before any processing: self-describing frontmatter
  plus the captured content, findable with `grep`.
- Capture writes into `inbox/` and `sources/` and nowhere else: a plain-text
  capture lands in `inbox/`, a captured URL lands in `sources/`. Either way it
  writes only files the manifest owns.
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
- A source file is created with its initial validated frontmatter composed
  directly. Creating a file is not mutating one.
- Every later change to provenance or edges on a file that already exists goes
  through the Feature 02 mutation operations, never through hand-assembled YAML.
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
- The two Requirements about provenance were one line until 2026-08-31, reading
  that provenance written at capture time goes through the Feature 02 mutation
  operations. It was split to match the decision recorded on ticket `04.3`
  (issue #12) on 2026-08-28 and delivered there: creating a brand-new source
  file with its first validated frontmatter is file creation, not mutation of an
  existing note, so it composes the file directly. Feature 02 is not widened,
  and no core mutation API exists merely to write the first version of a file.
  This records the boundary that was always meant; it grants nothing new.
- The Requirement about where capture writes read "only into the inbox" until
  2026-09-01. That was accurate before `04.3` and stale after it: the same
  Requirements section already described minting a source ID and reporting an
  existing source, and `04.3` delivered captured URLs into `sources/`. The line
  was corrected to name both folders. The guarantee it carries is unchanged —
  capture writes to those two folders and no others, and only to files the
  manifest owns.
