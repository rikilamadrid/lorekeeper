# Agent Entry Point

This project is **Lorekeeper**, companion to Pathfinder. Pathfinder finds the way; Lorekeeper remembers the journey.

Read `CLAUDE.md` first.

Project truth lives in `context/`. Follow the technology and delivery choices documented in `context/project-overview.md`; do not assume a framework, package manager, branch model, or release process. That file, like `context/features/`, `context/history.md`, `context/current-ticket.md`, and `context/handoff.md`, is created by the workflow that first needs it — its absence is normal, not an error. This project's tickets live in GitHub Issues, the store named by `context/tracker.md`, so there is no `context/tickets/` directory and that is not a gap. Track the durable ones in Git; `context/current-ticket.md` and `context/handoff.md` are transient session state and belong in `.gitignore`. Never ignore `context/` as a whole.

Use the smallest relevant context for the active task. Work one ticket at a time, and keep each ticket stable, reviewable, and verifiable.

Feature specs are planning records; tickets, sliced from an approved Feature by `to-tickets`, are the executable unit of work. A Feature's status is derived from its tickets rather than maintained by hand.

The roles are `planner`, `developer`, and `tester`. Lifecycle skills assume the responsible role for each invocation and read its contract themselves. When the human explicitly names a role, read `roles/<name>.md` before anything else and use it instead for that session. A role is a declarative contract stating what a worker is responsible for and what it must not do, where a skill states how to perform a task. Assumed or explicit, a role narrows responsibility and never grants human authority.

Canonical skills live under `skills/` and are the only behavior contract; anything under `.claude/skills/` or `.agents/skills/` is a generated pointer to one, so edit the canonical file and regenerate the adapter.

If this tool has no native skill discovery, invoke a skill by reading its canonical file directly: `Use skills/<name>/SKILL.md and follow it exactly.` That is the whole fallback — one line, and no second copy of a skill anywhere to find.

This repository is the public toolkit only. A user's private brain is generated outside it and must never be committed here — including as test fixtures or examples. Use synthetic content.
