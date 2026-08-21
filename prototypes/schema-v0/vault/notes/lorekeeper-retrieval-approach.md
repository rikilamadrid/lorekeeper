---
type: note
created: 2026-08-21T11:30:00-05:00
tags: [retrieval, design]
about: ["[[Pathfinder]]", "[[Event-driven architecture]]"]
derived_from: [20260818-0810-pragmatic-engineer-queues]
---

Retrieval should return ranked spans with their location, never whole files.

Two things follow. The index stores positions, and the CLI's output format is a
list of `path#anchor` plus an excerpt, so an agent can decide whether to open
the file at all.

Nothing in this note mentions the project by name in prose, which is exactly why
the aboutness had to be declared rather than inferred.
