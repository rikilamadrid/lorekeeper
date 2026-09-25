# Documentation PWA

## Status

In progress — at the website visual-acceptance gate

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
- Narrative copy, installation and quickstart copy, how-it-works diagrams, and
  the measured context-savings proof are consumed from Feature 09 rather than
  authored here. This Feature authors the reference content that derives from
  the shipped product: knowledge structure, capture, retrieval, existing-vault
  adoption, agent integration, provenance concepts, CLI reference, and
  troubleshooting. Every content item is authored in exactly one of the two
  Features.
- The site reads no private brain data and offers no capture, browsing, sync,
  authentication, or dashboard.
- Schema and CLI facts shown in the docs derive from `packages/core` contracts
  rather than being restated by hand where that is practical.
- WCAG 2.1 AA: keyboard navigation, focus visibility, contrast, labels, reduced
  motion.
- Offline behavior is honest: what is cached works offline, and what is not says
  so.
- Identity is applied by consuming Feature 09's approved mark, palette, and type
  tokens. This Feature restates no colour or type value the token source already
  defines, and designs no identity of its own.

## Out of Scope

- Authentication, cloud sync, mobile brain browsing, private capture sync, and
  dashboards.
- Any access to a user's brain from the browser.
- Marketing pages beyond the thesis page.
- Visual identity design work — logo, mark, wordmark, palette, typography,
  favicon, and social preview. Feature 09 owns all of it.
- Authoring the product narrative, the thirty-second explanation, the
  installation and quickstart copy, the how-it-works diagrams, the agent
  integration demo, and the presentation of the measured context saving.
  Feature 09 authors them; this Feature renders them.

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
- Every content item in the scope list has a page, and each one's copy is either
  authored here or consumed from Feature 09, with none authored twice.
- An automated accessibility check and a manual keyboard pass both pass on the
  main templates.
- The CLI reference matches the shipped commands, verified against the built
  binary rather than from memory.

## Notes / Decisions

- **Resolved 2026-09-25 (human, Atelier Feature 08 decision W):** plain Astro —
  static, no Starlight, no React — evolving `apps/docs` in place, with no
  second site app. Identity from `brand/tokens/tokens.css`; the Wonder Wagon
  `lorekeeper` theme only for the family chrome, as a generated, drift-checked
  file (`npm run theme:check -w @lorekeeper/docs`).
- **Resolved 2026-09-25 (decision W):** hosted on Vercel, root directory
  `apps/docs`, preview deploys per PR. The Vercel project is created by the
  human after the site's visual acceptance, not before.
- Depends on Feature 09 for identity, narrative, diagrams, and proof. Amended
  2026-09-18 to record that boundary: Feature 09 authors what this Feature
  renders, and the two Features are deliberately not merged. Feature 09 does not
  depend on this Feature and is executable while this one is blocked.
- Depends on Features 01, 04, 05, and 07 for accurate content.
- The `## Delivery Chunks` above predate Feature 09 and are kept as the
  historical planning record they are. Ticket slicing, when it happens, follows
  the amended Requirements and Out of Scope sections, not those chunks.
