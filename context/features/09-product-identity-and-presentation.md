# Product Identity and Presentation

## Status

Proposed

## Goal

Lorekeeper has an approved visual identity and a public-facing presentation
surface — mark, palette, typography, narrative, diagrams, and a measured proof —
that a reader encountering the repository cold understands in thirty seconds,
and that Feature 08 can render without authoring anything itself.

## Context

- Read: `context/project-overview.md` — the Product section, the recorded
  identity direction and its explicit avoid-list in Durable Decisions
  (2026-08-21), the `Open decision` row for visual identity, the Accessibility
  target, and the Quality Priorities
- Read: `CLAUDE.md` — the Pathfinder relationship and the three-surface boundary
- Read: `context/features/07-agent-integration-artifact.md` — the `## Verification`
  table, which is the only source for any published context-savings figure
- Read: `context/features/05-span-index-and-search.md` — the `## Verification`
  table, the only source for any published performance figure
- Read: `context/features/08-docs-pwa.md` — the consuming Feature
- Relevant area: the framework-neutral presentation root `brand/` — resolved
  2026-09-18, see Notes / Decisions — the repository root `README.md`, and the
  GitHub repository's own settings
- Avoid: `apps/docs` framework selection, build, and hosting — Feature 08 owns
  those, and this Feature must not require them to be resolved first
- Avoid: `packages/cli` and `packages/core` runtime behavior

## Requirements

### Identity

- The identity is delivered as a proposal the human approves, not as a resolved
  decision. The `Open decision` row for visual identity in
  `context/project-overview.md` is updated only after that approval, and only by
  the human's decision, not as a side effect of producing assets.
- The identity expresses the direction already recorded on 2026-08-21 —
  folklore, accumulated wisdom, maps and exploration, stars and constellations,
  archival knowledge, field journals, subtle mysticism, expressed through modern
  developer tooling — and visibly avoids the recorded avoid-list: a generic
  productivity app, an "AI brain" gimmick, cyberpunk or neon AI styling, a clone
  of Pathfinder, or a clone of any existing second-brain project.
- The identity is a sibling to Pathfinder, not a copy of it and not unrelated to
  it. The spec must say in words what makes the two read as one family and what
  makes them distinguishable at a glance.
- Deliverables: a mark, a wordmark, their lockup and clear-space rules, a colour
  palette, and a type pairing, each with the usage rules needed to apply them
  consistently.
- The palette and type are emitted as a framework-neutral token source —
  structured data plus generated CSS custom properties — so Feature 08 consumes
  values rather than restating them. Nothing downstream hard-codes a hex value
  the token source also defines.
- Light and dark variants both ship. Neither is a mechanical inversion of the
  other.
- Every foreground-on-background pair the palette defines for text or meaningful
  UI has its contrast ratio **measured and recorded**, in both variants, against
  WCAG 2.1 AA. A pair that fails is changed or removed, not published with a
  caveat.
- Any typeface shipped or referenced carries a licence permitting redistribution
  under this repository's MIT licence, and that licence is recorded.

### Derived assets

- A favicon set, application icons, and a social preview image, all generated
  from the approved mark rather than drawn independently, so they cannot drift.
- Source form is vector where the format allows it; raster output is a build
  product of that vector source.
- The mark remains legible at favicon size. This is verified by looking at it at
  that size, not asserted.

### Narrative and copy

- A product narrative: the thesis, a thirty-second explanation, and Lorekeeper's
  positioning against Pathfinder and against the alternatives the overview's
  `Avoid becoming` list names.
- The narrative states the v0.1 boundary honestly, including that the CLI makes
  no LLM call and that retrieval cannot prove knowledge is absent. A
  presentation surface that omits the known limitation is not acceptable here.
- Installation and quickstart copy that takes a reader from nothing to a
  successful `lore search`.
- Copy is authored as plain Markdown in the presentation directory, framework-
  neutral, with no dependency on a rendering framework being chosen.

### Proof

- The measured context saving is presented from Feature 07's recorded
  verification and from nowhere else. Any published figure carries its
  measurement date, its corpus, and the statement that bytes are a proxy for
  token cost and not a literal token count.
- No published figure exceeds what was measured. Feature 07 recorded 1.97x for
  the prescribed call, reported loosely as approximately 2.0x; that is the
  ceiling, and the generous baseline and pretty-printed payload caveats travel
  with it wherever the number is shown.
- The same rule governs any performance figure taken from Feature 05.
- An agent integration demo shows an agent issuing a multi-wording search
  against a brain and using the result. It runs against synthetic fixtures
  generated by this repository, reproducibly, and the commands it shows execute
  as written against the built binary.

### Diagrams

- How-it-works diagrams covering, at minimum, the three-surface separation, the
  provenance chain, and the capture-to-retrieval path.
- Diagrams are vector, use the approved palette through its tokens, render in
  both light and dark variants, and carry text alternatives sufficient for a
  reader who cannot see them.
- A diagram states what the system does at v0.1, not what the lifecycle diagram
  in the overview marks as later.

### Repository presentation

- The repository gains a `README.md`. It currently has none.
- The README leads with what Lorekeeper is, shows the mark, gives the
  thirty-second explanation, the quickstart, and the measured proof with its
  caveats, and links onward rather than restating the docs.
- GitHub repository presentation — description, topics, and social preview —
  matches the approved narrative and assets.

### Boundaries

- No private or personal content enters this repository, including in any
  example, screenshot, demo recording, or fixture. Synthetic content only.
- Nothing in this Feature adds a network call, a credential, a dependency, or a
  behavior change to `packages/cli` or `packages/core`.
- Every command shown anywhere in this Feature's output runs as written against
  the built binary.

## Out of Scope

- The documentation site's framework, build, hosting, routing, PWA
  installability, offline behavior, and rendering. Feature 08 owns all of it.
- Authoring the reference documentation pages — CLI reference, troubleshooting,
  capture, retrieval, adoption, provenance concepts. Those derive from the
  shipped product and stay with Feature 08.
- CLI output voice, wording, and formatting. The visual-identity `Open decision`
  row also names CLI voice; this Feature deliberately does not resolve that part,
  and the row stays partially open after this Feature completes.
- Renaming any command, subcommand, or domain concept. Both remain separate
  unresolved decisions and must not move as a side effect of identity work.
- A full design system, component library, or brand guidelines document beyond
  the usage rules the listed assets need.
- Paid marketing surfaces, a landing page distinct from the docs site, launch
  copy, and any social or community presence.
- Domain registration and DNS.

## Acceptance Criteria

- The human has approved the identity proposal, and
  `context/project-overview.md`'s visual-identity `Open decision` row reflects
  that approval with its date. Before that approval, this Feature's remaining
  work does not proceed.
- The token source exists, and the palette's recorded contrast measurements show
  every defined text pair at WCAG 2.1 AA or better in both light and dark.
- The favicon set, application icons, and social preview all build from the
  approved mark's vector source, and rebuilding reproduces them.
- The repository root has a `README.md` that shows the mark, gives the
  thirty-second explanation, and states the measured saving with its date,
  corpus, and proxy caveat.
- Every figure published by this Feature traces to a `## Verification` table in
  Feature 05 or Feature 07, and none overstates it.
- The agent integration demo runs end to end from a clean build against
  generated synthetic fixtures, and every command it shows executes as written.
- Diagrams render legibly in both light and dark and each carries a text
  alternative.
- A reviewer can point at each Feature 08 content item and say whether this
  Feature authored its copy or Feature 08 does, with no item ambiguous and none
  authored twice.
- No file added by this Feature contains private or personal content.

## Notes / Decisions

- **UNRESOLVED HUMAN DECISION:** visual identity, logo, typography, and palette
  are `TBD` in `context/project-overview.md`. This Feature exists to resolve
  them by proposal and human approval; that row is this Feature's output, not a
  blocker on writing this spec. It remains a blocker on the assets themselves,
  which is why approval is the first acceptance criterion.
- This Feature does not depend on Feature 08, and specifically does not depend
  on the two decisions blocking it — the docs framework and hosting. It is
  therefore executable now, while Feature 08 is not.
- Feature 08 consumes this Feature's output. The boundary is authorship against
  rendering: this Feature authors identity, narrative, proof, and diagrams;
  Feature 08 renders them and authors the reference documentation. Feature 08
  was amended on 2026-09-18 to state that dependency.
- Depends on Features 05 and 07 for the measured figures, and on Feature 04 and
  Feature 05 for the quickstart and demo to run as written.
- Publishing a measured figure on a presentation surface is where honest
  measurement is most likely to be lost. Features 05 and 07 both recorded their
  caveats deliberately; carrying those caveats forward is a requirement here and
  not a stylistic preference.
- Changing the GitHub repository's description, topics, or social preview is a
  write outside this repository and needs human approval before it happens, per
  `context/ai-interaction.md`.
- **RESOLVED 2026-09-18 — shared presentation root: `brand/`.** The single
  framework-neutral top-level `brand/` directory holds vector sources, the token
  source, narrative Markdown, and diagrams. This was previously left as a
  ticket-level decision; it is resolved here, at Feature level, so that every
  ticket of this Feature inherits one path rather than each choosing its own.
  Tickets 09.1 and 09.3 are dispatched concurrently and cannot negotiate a path
  between themselves, which is why the decision moved up.
  - 09.1 writes the identity sources and the token source under `brand/`.
  - 09.3 writes the narrative, quickstart, and proof under `brand/`.
  - Later tickets of this Feature use the same root.
  Remaining framework-neutral and outside `apps/docs` is still a requirement,
  not a preference. Subdirectory layout within `brand/` stays a ticket-level
  decision; the root does not.
