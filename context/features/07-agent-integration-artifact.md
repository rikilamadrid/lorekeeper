# Agent-Facing Integration Artifact

## Status

Complete

## Goal

A calling coding agent knows Lorekeeper is available, knows how to query it, and
knows to issue multiple wordings — without a human pasting instructions.

## Context

- Read: `context/project-overview.md` — the Durable Decisions on the integration
  artifact, on query expansion being part of the retrieval contract, and the
  KNOWN v0.1 LIMITATION on absence
- Relevant area: `packages/cli`, generated brain output
- Avoid: any MCP or transport work

## Requirements

- The artifact is generated into the user's environment by the CLI, not
  hand-written by the user.
- It states what Lorekeeper is, when an agent should query it, and the exact
  command form including how to pass multiple wordings.
- It instructs the agent to issue several alternate wordings for a question.
  This instruction is part of the retrieval contract, not an optimization.
- It states the known limitation: retrieval score cannot prove knowledge is
  absent. The agent treats results as evidence to assess, may reformulate and
  search again, and may conclude the evidence is insufficient.
- It describes the result fields — path, anchor, line range, score, span text —
  so the agent can weigh the evidence.
- The shape stays portable across agent environments rather than Claude-only.
- It is small: a generated snippet or one small skill file.
- Generation and regeneration go through the managed manifest, so a user-edited
  artifact is reported as drift rather than overwritten.
- The context cost of the workflow this artifact prescribes is measured against
  naive whole-note reading and recorded as a number, not claimed. Bytes are the
  deterministic proxy for token cost; no tokenizer dependency and no provider
  coupling enters this Feature to produce it.

## Out of Scope

- An MCP server or any other transport adapter.
- Capability sync into `~/.claude/skills`.
- A general agent-adapter framework or per-vendor variants beyond one portable
  artifact.
- Any autonomous or proactive agent behavior.

## Delivery Chunks

1. The artifact content and its generation, wired into the manifest.
2. An end-to-end check that an agent following only the artifact's instructions
   can run a successful multi-wording search against a fixture brain.

## Acceptance Criteria

- Generating the artifact into a fixture brain produces a file the manifest
  owns, and regenerating over a user-edited copy reports drift instead of
  overwriting.
- The exact command in the artifact runs as written against a fixture brain and
  returns results with all five result fields.
- The artifact explicitly instructs multiple wordings and explicitly states the
  absence limitation.
- Over a generated corpus, the bytes a multi-wording search returns are measured
  against the bytes of the whole notes those spans sit in, and the ratio is
  recorded in this Feature's verification. Bytes are a labelled proxy for token
  cost, not a literal token count.

## Verification

Measured by `npm run bench:context` on 2026-09-17, from a clean build, over the
same deterministic synthetic corpus Feature 05 measured — 3,000 notes at seed
`20260917`, generated into a temporary directory and removed. The call follows
the workflow `AGENTS.md` teaches: three quoted wordings, `--json`, default limit.
The wordings themselves are drawn from the generator's own vocabulary rather
than the artifact's illustrative TLS-certificate example, because the synthetic
corpus holds no certificate content for that example to find. What is measured
is the shape of the call — several wordings, fused — not those particular words.
Ticket `07.2`.

**Bytes are a proxy for token cost, not a literal token count.** No tokenizer
and no provider coupling was added to produce these numbers.

| Measure | Prescribed call | Sensitivity check, `--limit 20` |
| --- | --- | --- |
| Results | 5 | 20 |
| Distinct files behind them | 5 | 18 |
| Whole notes, baseline | 5,604 bytes | 21,034 bytes |
| JSON payload received | 2,847 bytes | 9,985 bytes |
| Span text within it | 1,564 bytes | 5,913 bytes |
| **Saving, payload against whole notes** | **1.97x** | **2.11x** |
| Saving, span text against whole notes | 3.6x | 3.6x |

Corpus: 3,193,061 bytes across 3,000 notes, averaging 1,064 bytes each; the
average returned span is 313 bytes. Machine: Apple M5, macOS 25.6.0 arm64, Node
v26.5.0.

Every ratio is computed from the byte counts in the table, and
`npm run bench:context` prints ratios to one decimal — so the measured 1.97x
appears as `2.0x` in its output, and 2.11x as `2.1x`. Quoted loosely, the
headline is **approximately 2.0x**, rounded up from the measured 1.97x.

The headline is the JSON payload against the baseline, because the payload is
what a calling agent actually receives. Span text is recorded beside it as a
diagnostic: it is the evidence without the addressing that carries it, and no
agent receives one without the other.

The saving is real and modest, and it is reported as measured rather than
improved. Three things bound it, and all three are stated rather than tuned
away. The baseline is deliberately generous, charging only for the files the
returned spans came from, as though an agent had already known which ones to
open; without span retrieval it would not have known, so the measured 1.97x is
a floor rather than a best case. The synthetic notes average roughly a
kilobyte, so a span can only be about 3.4 times smaller than the note holding
it — a vault of longer notes would show a larger saving, and the corpus was
not lengthened to produce one. And the payload is pretty-printed, which is 12%
of its bytes; compact JSON would read 2.2x, but the output format is a `05.1`
contract and was not changed to improve this number.

## Notes / Decisions

- Depends on Features 03 and 05.
- Architecture must not preclude later capability sync, but no capability sync
  work belongs here.
- Approved 2026-09-17: the context saving the artifact's advice depends on
  becomes a measured number, on the precedent Feature 05 set for the
  interactivity target. Bytes are the proxy because counting real tokens needs a
  tokenizer, and the CLI ships offline with no vendor dependency — a proxy
  stated as one is honest where a vendored count would be a coupling.
- Approved 2026-09-17: the artifact is created through the existing `lore init`
  and managed-manifest path rather than a separate generation command, unless an
  existing repository invariant makes that impossible.
- Recorded at the `07.1` review on 2026-09-17, all non-blocking and none
  addressed inside `07.1`:
  - **`AGENTS.md` is itself indexed by `lore search`.** For its own example
    query it outranks the intended note, 0.0492 against 0.0484. Measured across
    four realistic questions the intended note ranked first every time, with the
    artifact appearing only lower at roughly a third of the winning score,
    exactly as the starter READMEs already do. Excluding it by filename would be
    retrieval deriving meaning from a path, against a Requirement and a Durable
    Decision, and a frontmatter-based exclusion would need vocabulary that v0.1
    has deliberately left unfrozen. There is no small correct fix, which is the
    reason there is none.
  - **The taught command works as written only from the brain directory.**
    Starter content is static, so no absolute path can be interpolated; the
    artifact says what to substitute instead.
  - **The artifact assumes `lore` is already on `PATH`** and says nothing about
    installation. Correct for a portable file, but an agent in an environment
    without it gets a shell error rather than guidance.
  - **The command-extraction test requires exactly one fenced block.** A second
    code fence added later fails it on a length assertion rather than a clear
    message.
