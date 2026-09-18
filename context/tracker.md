# Work Tracking

## Store

GitHub Issues on `rikilamadrid/lorekeeper`. Approved 2026-08-27.

<!-- pathfinder:ticket-store github-issues rikilamadrid/lorekeeper -->

That marker line is authoritative: it is how the orchestration engine learns
which store to read, without interpreting the prose around it. The prose stays
authoritative for people. The engine refuses to run at all while the line is
absent, and names the line to add.

This is the canonical and only place Lorekeeper's tickets exist. There is no
`context/tickets/` directory in this repository, and nothing publishes, mirrors,
or synchronizes a ticket — there is never a second copy to reconcile.

Feature specs are not tickets. They stay in `context/features/` and are the
planning source tickets are sliced from.

## Reaching it

Use the `gh` CLI, already authenticated for this repository. No credential is
stored here, and none is needed by the Lorekeeper CLI itself — this config
governs the workflow only and never reaches product code, which stays offline
and credential-free in v0.1.

- list: `gh issue list --repo rikilamadrid/lorekeeper`
- read: `gh issue view <number> --repo rikilamadrid/lorekeeper`
- create: `gh issue create --repo rikilamadrid/lorekeeper`

If GitHub cannot be reached, report it and stop. Do not write tickets anywhere
else.

## Ticket identity

A ticket's key is `NN.TT` — parent Feature number, then ticket number within
that Feature. Keys are never reused and never renumbered, because blocker edges
are matched on them.

The key is carried in the issue body on two lines, which always agree.

**The machine-readable identity**, required by Pathfinder orchestration, is the
first line of the body and nothing else:

```text
<!-- pathfinder:ticket NN.TT -->
```

The orchestration engine reads only the body's first line and matches it
exactly (`skills/orchestrate/engine/store.mjs`). A ticket whose first line is
anything else is invisible to orchestration — not reported as malformed, simply
absent from the board. That failure is silent, so the line's position matters as
much as its content.

**The human-readable compatibility line** is retained on every existing
Lorekeeper issue, directly beneath it:

```text
Ticket-Key: NN.TT
```

It predates Pathfinder 4.4 and stays because it is what this document, the
existing issues, and the `--search` query below have always used. It is not
read by the engine. Both lines carry the same key; if they ever disagree, the
`<!-- pathfinder:ticket -->` line is what orchestration acts on, and the
disagreement is a defect to fix rather than a choice to interpret.

All 18 issues were migrated to carry both lines on 2026-09-18, when Lorekeeper
adopted Pathfinder 4.4.0. Bodies were otherwise unchanged, and no ticket was
recreated, duplicated, closed, or relabelled.

A new ticket is written with both lines, in this order, at the top of the body.

An issue title may begin with `NN.TT — ` for readability. Titles are never
identity: they are human-edited, and if a title and the body markers disagree,
the body is correct. GitHub's issue number is also not the key.

Find a ticket by its key with:

```bash
gh issue list --repo rikilamadrid/lorekeeper --state all \
  --search 'in:body "Ticket-Key: NN.TT"'
```

## Parent Feature

The GitHub label `feature: NN`.

## Lifecycle status

Status lives in GitHub's own mechanisms — a label while the ticket is open, and
the issue's closed state when it is done.

| Pathfinder status | GitHub representation |
| --- | --- |
| `Proposed` | open, label `status: proposed` |
| `Ready` | open, label `status: ready` |
| `In Progress` | open, label `status: in-progress` |
| `Complete` | **closed**, no status label |
| `Cancelled` | closed, label `status: cancelled` |
| `Superseded` | closed, label `status: superseded` |

There is deliberately no `status: complete` label. A closed issue with no status
label is complete, and that is the single representation of it.

## Do not duplicate

The issue body carries neither status nor parent Feature. Both live in GitHub's
labels and issue state, and nowhere else. Two copies of one ticket's status
inside one ticket drift exactly as fast as two copies in two systems.

## Ticket body

The body is `templates/ticket.template.md`, with the `Ticket-Key` marker, and
with the `## Status` and `## Parent Feature` sections omitted for the reason
above. Every other section is written unchanged.

`## Blocked by` stays in the body, as a list of `NN.TT` ticket keys. GitHub
Issues has no native dependency field that matches on our keys, so the body is
the only place the blocker graph can live.

## Approval

Creating or updating a GitHub issue is a write outside this repository. Ask for
approval before the first such write in a run; one approval covers that run.

No labels and no issues have been created yet. The labels above are created the
first time tickets are written, with approval, and not before.
