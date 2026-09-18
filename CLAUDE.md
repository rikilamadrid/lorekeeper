# Project Agent Guide

This repository uses Pathfinder's AI-assisted delivery workflow. Read
`context/execution-mode.md` as `skills/ticket/SKILL.md` defines it: the marker
line `<!-- pathfinder:execution-mode orchestrator -->` is the value Pathfinder
reads, and human-in-the-loop is the default when the file is absent. Lorekeeper
runs in **orchestrator** mode. Project truth lives in `context/`, and reusable
behaviors live in `skills/`.

## This project — Lorekeeper

Lorekeeper is the public toolkit for an AI-native Second Brain: a deterministic
Node/TypeScript CLI over a directory of plain Markdown files with validated
frontmatter, plus a documentation PWA. See `context/project-overview.md` for
scope, stack, and durable decisions.

Lorekeeper is the companion product to Pathfinder. Pathfinder finds the way;
Lorekeeper remembers the journey. Pathfinder is movement, direction, and
execution; Lorekeeper is memory, provenance, and connection.

The CLI binary name is `lore`, resolved 2026-08-21. The command vocabulary
below it is not settled, and domain vocabulary does not adopt lore terminology
by default. Do not rename subcommands or concepts as a side effect of other
work — both remain open decisions recorded in `context/project-overview.md`.

Three surfaces stay cleanly separated:

1. this repository — the toolkit
2. a generated private brain — the user's files, never committed here
3. the documentation site — public, holds no brain data

Two boundaries are non-negotiable. No private or personal content enters this
repository, fixtures included. The v0.1 CLI makes no network calls and takes no
credentials.

## Read only what is needed

For delivery work, usually read:

1. `context/current-ticket.md`
2. the ticket it names, and that ticket's parent feature spec
3. relevant sections of `context/project-overview.md`
4. relevant rules from `context/coding-standards.md`
5. `context/ai-interaction.md`
6. only the source files needed for the current ticket

Do not load the whole repo by default.

Pathfinder ships two context files: `ai-interaction.md` and
`coding-standards.md`. Everything else in `context/` — `project-overview.md`,
`features/`, `tracker.md`, `history.md`, `current-ticket.md`, `handoff.md` — is
written by the workflow that first needs it. A missing file here is normal; skip
it rather than treating it as an error. This project's tickets live in GitHub
Issues, named by `context/tracker.md`, so there is no `context/tickets/`
directory and that is not a gap.

Track the durable ones in Git and ignore the two transient ones,
`current-ticket.md` and `handoff.md`. `context/coding-standards.md` carries the
rule; do not ignore `context/` wholesale.

## Features and tickets

A Feature spec is a planning record: scope, acceptance criteria, and the
decisions behind them. A ticket is the executable unit of work, sliced from an
approved Feature by `to-tickets` and delivered through the `/ticket` loop.

Feature specs already in `context/features/` remain valid planning records as
written. Their `## Delivery Chunks` sections are historical planning notes, not
execution state; do not rewrite them as a side effect of other work.

A Feature's status is derived from the state of its tickets. Do not maintain it
by hand during execution.

## Roles

Lifecycle skills assume their responsible role for each invocation and read its
contract themselves: planning, spec writing, and ticket creation use `planner`;
ticket load, start, and complete use `developer`; ticket review uses `tester`;
orchestration uses `orchestrator`; integration uses `integrator`. In
orchestrator mode each worker implements one active ticket in its own Git
worktree, and roles never call one another directly.

The human can explicitly override that default with `/role <name>`. Read the
named `roles/<name>.md` before anything else and follow it for the session. A
role says what a worker is responsible for, what it reads, and what it must not
do, where a skill says how to perform a task.

A role narrows responsibility and never widens authority. Approval, acceptance,
merge, and release remain the human's whether a role was assumed or explicit.

## Project-selected policies

Follow the stack, architecture, commands, Git workflow, review policy, and release process documented in `context/project-overview.md`.

If a policy is `TBD`, do not invent it. Ask the human or clearly mark it unresolved.

## Before implementation

Restate:

1. Goal
2. Active ticket
3. Expected files or areas
4. Required context
5. Risks
6. Assumptions
7. Verification plan
8. Out-of-scope work
9. Current Git state
10. Intended Git action under the documented workflow

## Human approval

Ask before actions identified in `context/ai-interaction.md`, especially dependency additions, destructive commands, sensitive migrations, commits, merges, and releases.

## Scope and quality

- Implement only the active feature and current ticket.
- Keep the project stable after each ticket.
- Do not convert prototype code into production code without an explicit feature decision.
- Prefer concrete verification over confident narration.
- Report conflicts between specs, repository reality, and durable context.

## Canonical skills and harness adapters

Canonical Pathfinder skills are tool-neutral and live under `skills/`. Harness-specific representations — `.claude/skills/`, `.agents/skills/` — are generated integration artifacts and must not become independent behavior contracts. Edit the canonical file; regenerate the adapter.

An adapter carries the canonical skill's frontmatter and a pointer to it, and nothing else. If an adapter and its canonical skill disagree, the canonical skill is correct.

## Available skills

- `kickstart-pathfinder` — discover and initialize project context
- `debate-me` — pressure-test and recommend product, stack, workflow, and prototype direction
- `reverse-engineer` — analyze an external reference and produce an evidence-based reconstruction blueprint
- `prototype` — create and iterate the cheapest useful validation artifact
- `to-specs` — generate context-sized feature specs
- `to-tickets` — decompose one approved Feature into blocker-linked tickets
- `ticket` — run one action of the ticket delivery loop: `load`, `start`, `review`, `complete`
- `orchestrate` — coordinate several dependency-safe ticket workers at once in orchestrator mode: `status`, `start`, `resume`, `integrate`
- `debug-issue` — diagnose an observed failure to its root cause, apply the smallest justified fix, and verify it
- `learn-feature` — create an interactive lesson for a completed feature
- `learn-codebase` — create a modular learning portal for the repository
- `teach-feature` — teach the verified current feature from its spec, diff, tests, and implementation
- `teach-architecture` — explain how completed features fit into the wider application and system architecture
- `quiz-me` — assess understanding of a recently taught feature with evidence-based questions
- `challenge-me` — create a small transfer exercise applying a learned concept in a changed context
- `learning-review` — review accumulated lessons, identify gaps, and create a reinforcement plan
- `reflect` — review completed work, and the reflection itself, and propose reusable workflow improvements for human approval
- `handoff` — preserve useful state between sessions or tools
- `role` — explicitly override the role the lifecycle would assume
- `whereami` — report a compact read-only snapshot of the current session
- `skillsmith` — teach and create small local skills
- `setup-tracker` — choose the canonical ticket store when it is not local Markdown
