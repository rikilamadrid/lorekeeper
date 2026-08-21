# `lore update`

## Status

Proposed

## Goal

`lore update` propagates toolkit changes into an existing brain, updating only
files the manifest owns and reporting drift instead of overwriting anything a
person edited.

## Context

- Read: `context/project-overview.md` — the managed-manifest Durable Decision
  and the Quality Priority "Data safety"
- Read: `context/ai-interaction.md` — Project-Specific Approval
- Relevant area: `packages/cli`, `packages/core` manifest module from Feature 03

## Requirements

- Update classifies every managed file before writing: unchanged, user-edited,
  missing, or newly added by the toolkit.
- A user-edited managed file is never overwritten. The drift is reported with
  the path and what differs.
- A file the manifest does not own is never touched, for any reason.
- Update is idempotent: a second run immediately after a first reports no work.
- A dry-run mode reports exactly what would change and writes nothing.
- The manifest is updated to reflect the new toolkit state only for files that
  were actually written.
- Failure part-way through leaves the brain in a readable, valid state and says
  what was and was not applied.
- No network call on any update path.

## Out of Scope

- Migrating, restructuring, or reformatting user notes.
- Merging a user's edits with a new toolkit version.
- Rolling back an applied update.
- Version negotiation or upgrade paths across future schema versions beyond what
  the additive-only rule already provides.

## Delivery Chunks

1. Drift classification over a manifest and a target brain, with dry-run output.
2. Applying updates to unchanged managed files, and updating the manifest.
3. Drift reporting and safe partial-failure behavior.

## Acceptance Criteria

- Given a brain with one edited managed file, update reports that file as
  drifted, leaves it byte-identical, and still applies the other changes.
- Every non-managed file in a synthetic vault is byte-identical after update,
  verified by hashing before and after.
- A second update run reports no work.
- Dry-run writes nothing, verified by hashing the whole target.

## Notes / Decisions

- Depends on Feature 03.
- Any operation that would overwrite a file the manifest does not own requires
  human approval and must not be added to this Feature silently.
