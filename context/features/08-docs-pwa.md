# Documentation PWA

## Status

Proposed

## Goal

A public, installable documentation site that explains Lorekeeper end to end and
holds no brain data.

## Context

- Read: `context/project-overview.md` — the docs content list under Scope, the
  docs PWA Durable Decision, and the Accessibility target
- Read: `context/coding-standards.md` — User Interfaces
- Relevant area: `apps/docs`, consuming contracts from `packages/core`

## Requirements

- Static site, installable as a PWA, with no server component.
- Content scope is exactly the list recorded in the overview: thesis, concepts,
  installation, quick start, knowledge structure, capture, retrieval,
  existing-vault adoption, agent integration, provenance concepts, CLI
  reference, troubleshooting. Nothing beyond it.
- The site reads no private brain data and offers no capture, browsing, sync,
  authentication, or dashboard.
- Schema and CLI facts shown in the docs derive from `packages/core` contracts
  rather than being restated by hand where that is practical.
- WCAG 2.1 AA: keyboard navigation, focus visibility, contrast, labels, reduced
  motion.
- Offline behavior is honest: what is cached works offline, and what is not says
  so.
- Identity is applied only as far as the unresolved design direction allows.

## Out of Scope

- Authentication, cloud sync, mobile brain browsing, private capture sync, and
  dashboards.
- Any access to a user's brain from the browser.
- Marketing pages beyond the thesis page.
- Visual identity design work — logo, palette, typography.

## Delivery Chunks

1. Framework setup in `apps/docs` and the site shell, once the framework
   decision is made.
2. Core content: thesis, concepts, installation, quick start, knowledge
   structure.
3. Reference content: capture, retrieval, adoption, agent integration,
   provenance, CLI reference, troubleshooting.
4. PWA installability, offline behavior, and the accessibility pass.

## Acceptance Criteria

- The built site is static, installs as a PWA, and makes no request for user
  data.
- Every content item in the scope list has a page.
- An automated accessibility check and a manual keyboard pass both pass on the
  main templates.
- The CLI reference matches the shipped commands, verified against the built
  binary rather than from memory.

## Notes / Decisions

- **UNRESOLVED HUMAN DECISION:** the docs framework is `TBD` in
  `context/project-overview.md`. This Feature cannot move to `Ready` until a
  human names it.
- **UNRESOLVED HUMAN DECISION:** hosting for the docs site and its preview
  deploys is `TBD`.
- Visual identity is `TBD` and deliberately not started.
- Depends on Features 01, 04, 05, and 07 for accurate content.
