# Project Agent Guide

This repository uses an AI-assisted, human-in-the-loop workflow. Project truth lives in `context/`, and reusable behaviors live in `skills/`.

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

For feature work, usually read:

1. `context/current-feature.md`
2. its referenced feature spec
3. relevant sections of `context/project-overview.md`
4. relevant rules from `context/coding-standards.md`
5. `context/ai-interaction.md`
6. only the source files needed for the current delivery chunk

Do not load the whole repo by default.

Pathfinder ships two context files: `ai-interaction.md` and
`coding-standards.md`. Everything else in `context/` — `project-overview.md`,
`features/`, `history.md`, `current-feature.md`, `handoff.md` — is written by
the workflow that first needs it. A missing file here is normal; skip it rather
than treating it as an error.

Track the durable ones in Git and ignore the two transient ones,
`current-feature.md` and `handoff.md`. `context/coding-standards.md` carries the
rule; do not ignore `context/` wholesale.

## Roles

When the human names a role, read `roles/<name>.md` before anything else and follow it for the session. A role says what a worker is responsible for, what it reads, and what it must not do, where a skill says how to perform a task.

The roles are `planner`, `developer`, and `tester`. Activate one with `/role <name>`.

Naming a role is the only thing that activates one. If the human names none, ignore `roles/` and work as this guide otherwise describes. A role narrows what a session may do and never widens it. Human authority sits outside the role system: approval, acceptance, merge, and release are always the human's.

## Project-selected policies

Follow the stack, architecture, commands, Git workflow, review policy, and release process documented in `context/project-overview.md`.

If a policy is `TBD`, do not invent it. Ask the human or clearly mark it unresolved.

## Before implementation

Restate:

1. Goal
2. Active delivery chunk
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

- Implement only the active feature and current delivery chunk.
- Keep the project stable after each chunk.
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
- `load-feature` — prepare one feature for implementation
- `start-feature` — implement scoped delivery chunks
- `debug-issue` — diagnose an observed failure to its root cause, apply the smallest justified fix, and verify it
- `review-feature` — review against requirements, regressions, and standards
- `complete-feature` — verify and close a feature cleanly
- `learn-feature` — create an interactive lesson for a completed feature
- `learn-codebase` — create a modular learning portal for the repository
- `teach-feature` — teach the verified current feature from its spec, diff, tests, and implementation
- `teach-architecture` — explain how completed features fit into the wider application and system architecture
- `quiz-me` — assess understanding of a recently taught feature with evidence-based questions
- `challenge-me` — create a small transfer exercise applying a learned concept in a changed context
- `learning-review` — review accumulated lessons, identify gaps, and create a reinforcement plan
- `reflect` — review completed work, and the reflection itself, and propose reusable workflow improvements for human approval
- `handoff` — preserve useful state between sessions or tools
- `role` — activate one named role for the current session
- `whereami` — report a compact read-only snapshot of the current session
- `skillsmith` — teach and create small local skills
- `setup-tracker` — configure an optional external work tracker
- `sync-tracker` — publish approved feature specs to the configured tracker, one-way and idempotently
