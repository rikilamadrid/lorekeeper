# Agent-Facing Integration Artifact

## Status

Proposed

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
