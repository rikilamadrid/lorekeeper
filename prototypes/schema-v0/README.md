# Prototype: Lorekeeper schema v0 probe

**Status: findings APPROVED 2026-08-21 and recorded in
`context/project-overview.md`. The code remains a prototype — evidence only, not
production code, and not to be adopted without an approved Feature.**

## Assumption under test

That the proposed frontmatter schema is losslessly mutable, pleasant to
hand-write, and sufficient for deterministic location-addressed retrieval.

## What is here

- `vault/` — 16 hand-authored artifacts covering the 15 required cases
- `lib.mjs` — zero-dependency frontmatter reader, surgical field writer,
  location indexer, URL normaliser
- `probe.mjs` — the ten tests

Run: `node probe.mjs`

## Deliberate shortcuts

- No YAML library. Frontmatter is read by a flat line parser and written by
  replacing single lines. This is the behaviour under test, not a limitation.
- `naiveRoundTrip()` **simulates** object-parse-then-re-dump. It is not js-yaml.
  It reproduces the class of loss, not a specific library's exact output.
- Retrieval scoring is naive term frequency. Ranking is out of scope.
- The `about` fixtures were authored by the same person testing the hypothesis
  about `about`. That test is contaminated and its result is not evidence.

## Findings

| # | Test | Result |
|---|---|---|
| 1 | Surgical round-trip | 16/16 byte-identical |
| 2 | Object round-trip | 16/16 altered: comments dropped, inline arrays restructured, timestamps rewritten to UTC, quotes stripped |
| 3 | Deterministic `link` | Single-line insertion; idempotent on repeat |
| 4 | Hand-writing burden | Median 4 fields; minimum viable is 2 |
| 5 | `about` additive vs mirror | Contaminated; see above |
| 6 | URL normalisation | Generic param filtering insufficient; per-domain identity rules required |
| 7 | Location index | 16 files -> 19 locations; daily note split into 3 addressable spans |
| 8 | Span vs whole-file retrieval | 39–49% fewer bytes returned on a tiny vault |
| 9 | Rename survival | ID edges 8/8 survived; name edges 2/4 broke, all recoverable via H1/alias |
