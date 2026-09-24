# Lorekeeper identity

**Status: approved 2026-09-18.** This document and the files beside it are
ticket `09.1`'s deliverable: a mark, a wordmark, their lockups, a palette, and a
type pairing. The human approved them as proposed, and
`context/project-overview.md` records that decision with its date, so the values
here are cited rather than re-decided.

The CLI voice half of that same recorded decision is deliberately untouched. It
stays open, and is not part of Feature 09.

## The idea in one line

Lorekeeper is a star held in a ring: what was found, and what keeps it.

## What the identity has to carry

`context/project-overview.md` recorded the direction on 2026-08-21 and has not
moved since — folklore, accumulated wisdom, maps and exploration, stars and
constellations, archival knowledge, field journals, subtle mysticism, all of it
expressed through modern developer tooling. The same entry records what to
avoid: a generic productivity app, an "AI brain" gimmick, cyberpunk or neon AI
styling, a clone of Pathfinder, and a clone of any existing second-brain
project.

How the identity answers each of those, concretely:

| Recorded direction | Where it lands |
| --- | --- |
| Stars and constellations | The mark is a four-point celestial star; the second colour is named for lamplight and gilt |
| Archival knowledge, field journals | Warm parchment page, iron-gall ink, an old-style serif for headings, inscriptional capitals for the wordmark |
| Maps and exploration | The ring: a bearing circle and a seal at once, the enclosing counterpart to Pathfinder's directional blaze |
| Folklore, subtle mysticism | Carried by restraint — a single star, no glow, no rays, no sparkle trail |
| Modern developer tooling | System font stacks, a plain-JSON token source, no web font, no network call |

| Recorded avoid | How the identity avoids it |
| --- | --- |
| Generic productivity app | No rounded-square app tile, no gradient, no three-bar abstraction; the palette leads with a deep indigo and a bronze gilt, not a saturated SaaS blue |
| "AI brain" gimmick | No brain, no node graph, no circuit, no neural motif anywhere in the system |
| Cyberpunk or neon AI styling | Every colour is measured and muted; the dark variant's accent is lifted only as far as it takes to pass WCAG AA, never to glow. The four-point sparkle, which is the current AI cliché, is deliberately used *enclosed in a ring* and never floating free |
| A clone of Pathfinder | Different hue family, different mark geometry, different letterform voice — see the sibling section below |
| A clone of an existing second-brain project | No vault, no network graph, no bidirectional-link motif, no purple gradient |

## Sibling to Pathfinder, not a copy of it

Pathfinder's identity is recorded in this repository at
`skills/render-artifact/engine/render/theme.mjs`: blaze orange `#E0611F`, "the
paint on a real trail marker", on a warm near-white page with a brown-black ink,
system font stacks, a `--pf-` token prefix, and contrast ratios measured rather
than eyeballed.

**One family, because they share their bones.** The same warm paper-and-ink
neutral base. The same system-stack typography with no web font and no network
request. The same token architecture — a prefixed set of CSS custom properties,
light written as the base, dark following the reader's system. The same
insistence that every colour pairing is measured and written down. Put the two
pages side by side and they are recognisably built by the same hand.

**Distinguishable at a glance, because of three deliberate splits.**

1. **Hue.** Pathfinder is blaze orange at roughly 25°. Lorekeeper is indigo at
   roughly 235°, with a bronze gilt second voice. Dawn and dusk.
2. **Geometry.** Pathfinder's colour is a trail blaze: directional, out ahead of
   you. Lorekeeper's mark is a closed ring: enclosing, held, already arrived.
   Pathfinder finds the way; Lorekeeper remembers the journey.
3. **Letterform voice.** Pathfinder speaks in the system sans throughout.
   Lorekeeper adds an old-style serif for headings and an inscriptional drawn
   capital for the wordmark — the archive's voice against the field's.

They can share a page without competing: Lorekeeper's indigo never sits on
Pathfinder's orange, and neither is used inside the other's mark.

## The mark

`brand/logo/mark.svg` — two colour, 64×64 viewBox
`brand/logo/mark-mono.svg` — one colour, inherits `currentColor`

A four-point star held inside a ring.

- **The ring is what is kept.** Centre `32,32`, radius `22`, stroke `8`, so the
  outer edge is at `26` and the mark clears its 64-unit box by `6` on every
  side. It is a closed circle: a seal on a record, a bearing circle on a chart,
  the ring binding of a journal.
- **The star is what is found.** Four points with concave flanks, drawn as four
  quadratic curves from an outer radius of `17.5` through a control radius of
  `5`. The concavity is what keeps it a star rather than a cross: at display
  sizes the flanks read as a celestial-atlas star, and as the render shrinks
  they resolve to a clean lozenge instead of collapsing into a plus.
- **The geometry is the source.** Both files are hand-readable vector with the
  construction commented inline. `09.2` generates every raster from them.

### Colour

The two-colour mark reads its colours from the token custom properties, with the
light-variant value as a literal fallback, so the same file is correct inside a
themed page and correct standing alone:

```
ring  stroke="var(--lk-accent, #343A8C)"
star  fill="var(--lk-gold, #8A6212)"
```

On a dark page the tokens resolve to periwinkle `#99A2F0` and lamplight
`#E2B45C` with no second file and no build step.

Use `mark-mono.svg` wherever only one ink exists: a monochrome favicon, a stamp,
an engraving, a terminal-adjacent context.

**`mark-mono.svg` is not self-sufficient, and that is deliberate.** It inks with
`currentColor` and carries no literal fallback, because its whole purpose is to
take the colour of whatever encloses it. The standalone-correctness claim above
is about `mark.svg` only. Referenced through `<img>`, rasterised, or opened on
its own, `mark-mono.svg` is an independent document with nothing to inherit
from, so `currentColor` falls back to initial black: 19.63:1 on the light page,
but **1.15:1 on the dark page, which is invisible**. Anything derived from it —
`09.2`'s favicon set above all, since a favicon is always an independent
document — must set the ink explicitly per variant, `#1B1C2E` for light and
`#EDE7DB` for dark, rather than rasterising the file as it stands.

### Size

- **Minimum size: 16px.** Verified by rendering `brand/logo/mark.svg` at 16 and
  32 device pixels and looking at both. At 32px the star is unambiguous. At 16px
  the identifying silhouette is the indigo ring with a filled gold centre, and
  the star's points soften into a lozenge; it stays recognisable and stays
  distinct from anything else in a tab strip. That softening is expected and is
  why the flanks are curved rather than straight — a straight-sided star at 16px
  resolves into a cross, which was tested and rejected.
- Below 16px, do not reproduce the mark. Use the wordmark or plain text.

### Rules

- Do not rotate it. The star's points are vertical and horizontal, always.
- Do not recolour it outside the palette. Ring takes `--lk-accent`, star takes
  `--lk-gold`, or the whole mark takes one colour.
- Do not add a glow, a gradient, a shadow, a ray, or a second star.
- Do not place it on a background it was not measured against. The two-colour
  mark is measured against `--lk-page`, `--lk-surface`, and `--lk-surface-2`,
  and those three are the only grounds it may sit on.
- **Never put the two-colour mark on a filled `--lk-accent` surface.** The ring
  is `--lk-accent`, so ring-on-ground would be 1.00:1 — the ring disappears
  entirely, leaving a bare gold star at 1.80:1 light and 1.24:1 dark. That
  destroys the idea the mark exists to carry, and it leaves exactly the
  free-floating four-point sparkle this identity refuses on the grounds that the
  star is *always* enclosed. On a filled accent surface use `mark-mono.svg`
  inked with `--lk-accent-ink`, which is the pairing `brand/CONTRAST.md`
  actually measures.
- On any other ground, use the one-colour mark in a token measured against that
  ground. If the pairing is not in `brand/CONTRAST.md`, it is not a placement
  this identity permits.
- Do not put the mark inside another container shape.

## The wordmark

`brand/logo/wordmark.svg` — 876.23×100 viewBox

LOREKEEPER, set in constructed monoline capitals.

- **It is drawn, not typeset.** Every letter is original geometry: a 100-unit
  cap height, a 10-unit stroke, 24 units of tracking, classical Roman
  proportions — a circular O, narrow L and E, a shortened middle arm on the E.
  There are six unique glyphs in the word and they are built from lines, one
  ellipse, and two arcs.
- **That is a licence decision as much as a design one.** Because no typeface
  outline is embedded, this repository redistributes no font and inherits no
  font licence. See Typography below.
- The wordmark is always set in capitals, always with this tracking, and is
  never re-set in a system typeface as a substitute.
- **The viewBox is the ink box, not the path box.** The widest point of the word
  is the final R's leg: its centreline stops at `x=872.09`, but a 10-unit stroke
  on a diagonal carries `4.13` further out, so the ink reaches `876.2246` and
  the box is `876.23`. Both side bearings are therefore zero, and every
  diagonal's endpoint is stated to five places so its stroke edge lands exactly
  on the cap line or the baseline rather than a hair short of or past it. The
  lockup boxes are this width carried through their scale: `84 + 0.3 × 876.23`
  and `0.26 × 876.23`. Anything that re-measures or re-crops these files should
  measure ink, half-stroke included, and not path endpoints.

Colour: `stroke="var(--lk-ink, #1B1C2E)"` — it takes the page's ink, in both
variants. It is not an accent-coloured element.

### Rules

- Do not letterspace, condense, extend, or re-weight it.
- Do not set it in sentence case or title case. "Lorekeeper" in running prose is
  ordinary text, not the wordmark.
- Minimum reproduction: 90px wide. Below that the 10-unit stroke breaks up.

## Lockups and clear space

`brand/logo/lockup-horizontal.svg` — the default
`brand/logo/lockup-stacked.svg` — for narrow or centred placements

Both fix the relationship so it is never re-negotiated:

| | Mark height | Gap | Cap height | Alignment |
| --- | --- | --- | --- | --- |
| Horizontal | 64 | 20 | 30 | Cap centre on the mark's centre line |
| Stacked | 64 | 18 | 26 | Both centred on one vertical axis |

**Clear space is 32 units at a 64-unit mark — half the mark's height — on all
four sides of the lockup.** Nothing goes inside it: no text, no rule, no other
logo, no edge of the containing element.

Use the mark alone where the name is already present or the space is square. Use
a lockup where Lorekeeper has to introduce itself.

A lockup contains the two-colour mark, so the mark's background rule governs it
unchanged: `--lk-page`, `--lk-surface`, or `--lk-surface-2`, and nothing else.
The wordmark beside it is `--lk-ink`, which is measured against those same three
grounds and no others. There is no accent-ground lockup.

## Palette

The source of truth is `brand/tokens/tokens.json`. `brand/tokens/tokens.css` is
generated from it. Nothing downstream restates a hex value.

Hex values are written uppercase in this document and in `tokens.json`, and
lowercase in the generated CSS, which is the CSS convention. They are the same
values.

### Light

| Token | Value | Role |
| --- | --- | --- |
| `--lk-page` | `#FAF7F1` | Warm parchment, not white: a field journal open in daylight |
| `--lk-surface` | `#FFFFFF` | A card or sheet lifted off the page |
| `--lk-surface-2` | `#F0EAE0` | A recessed surface: code blocks, table headers |
| `--lk-ink` | `#1B1C2E` | Body text. Blue-black, the colour of iron-gall ink |
| `--lk-muted` | `#55566B` | Captions, metadata, provenance lines |
| `--lk-line` | `#E0D8CA` | Decorative hairline only |
| `--lk-line-strong` | `#7D7885` | A boundary that must be perceivable |
| `--lk-accent` | `#343A8C` | Deep indigo: the mark's ring, links, focus rings |
| `--lk-accent-ink` | `#FAF7F1` | On a filled accent surface |
| `--lk-gold` | `#8A6212` | Old gilt: the mark's star, an emphasis rule |
| `--lk-gold-ink` | `#FAF7F1` | On a filled gold surface |
| `--lk-ok` | `#1C6B46` | A verified state |
| `--lk-no` | `#A32A1F` | A failing state |

### Dark

| Token | Value | Role |
| --- | --- | --- |
| `--lk-page` | `#141521` | Night, cool blue-black |
| `--lk-surface` | `#1C1E2C` | A card or sheet |
| `--lk-surface-2` | `#262939` | A recessed surface |
| `--lk-ink` | `#EDE7DB` | Body text, warm parchment |
| `--lk-muted` | `#ABA7B8` | Captions, metadata |
| `--lk-line` | `#30334A` | Decorative hairline only |
| `--lk-line-strong` | `#71748F` | A perceivable boundary |
| `--lk-accent` | `#99A2F0` | Periwinkle: indigo lifted just far enough |
| `--lk-accent-ink` | `#141521` | On a filled accent surface |
| `--lk-gold` | `#E2B45C` | Lamplight |
| `--lk-gold-ink` | `#141521` | On a filled gold surface |
| `--lk-ok` | `#6FD6A0` | A verified state |
| `--lk-no` | `#F2908A` | A failing state |

### Why the dark variant is not an inversion

A mechanical inversion would have produced a warm brown-black page and a pale
orange-cream ink, and it would have dragged the accent to wherever the
arithmetic landed. Instead:

- The **page changes temperature**. Light is warm parchment `#FAF7F1`; dark is
  cool night `#141521`. They are not each other's negative and do not share a
  hue.
- The **accent changes hue as well as lightness**. `#343A8C` is a saturated deep
  indigo; `#99A2F0` is a desaturated periwinkle. The dark value was chosen at
  the lowest lightness that clears 4.5:1 on night ground, so it reads as a
  lifted indigo rather than a glowing one.
- The **gold changes job**. In light it is a bronze that can carry text as well
  as the mark's star. In dark it warms and brightens into the page's principal
  light source, and it is the element the eye lands on first — a reversal of the
  light variant, where the indigo ring leads.
- One relationship is allowed to rhyme on purpose: the dark variant's ink
  `#EDE7DB` is a near-neighbour of the light variant's page. The parchment
  becomes the writing. That is the only deliberate mirror in the system.

### Contrast

Every pair is measured, not asserted: `brand/CONTRAST.md` carries the table, and
`brand/tokens/contrast.mjs` carries the WCAG 2.1 arithmetic that produced it,
implemented from the specification with no dependency. Ratios are rounded toward
zero, so a published figure never reads higher than what was measured.

52 pairs measured across both variants. Every text pair clears 4.5:1 and every
meaningful-UI pair clears 3:1. Nothing failing was published with a caveat; the
one pair that failed an earlier draft — a brighter brass at 2.70:1 on the
recessed light surface — was changed, not annotated.

Run `npm run brand:check` to recompute. It fails if any pair misses its
requirement or if the generated files are stale.

Two rules that came out of the measurements:

- `--lk-line` is decorative. It never carries meaning on its own. Any boundary a
  reader must perceive uses `--lk-line-strong`.
- `--lk-ok` and `--lk-no` are never the only signal. They always travel with a
  word or a shape.

## Typography

| Role | Stack | Why |
| --- | --- | --- |
| Display | `"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "Times New Roman", serif` | Headings and pull quotes. The archival voice, and the clearest split from Pathfinder |
| Body and UI | `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` | The same system stack Pathfinder uses. Deliberate: it is the shared bone |
| Code | `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace` | Commands, paths, frontmatter, anything a reader may retype |

The pairing is old-style serif headings over system-sans body — an archive's
headings on a tool's text.

### Typeface licensing

**No typeface is shipped in this repository, and none is fetched over a
network.** Every stack above names fonts the reader's operating system already
has, with a generic family as the final fallback. There is therefore no font
file to redistribute and no font licence for this repository to satisfy, and
nothing here conflicts with the MIT licence in `LICENSE`.

The wordmark is the case that would normally create an obligation, and it was
designed around it: `brand/logo/wordmark.svg` contains original drawn geometry,
not outlines converted from Palatino, Georgia, or any other face. Converting a
system typeface to outlines and committing the result would have redistributed
that typeface, which those licences do not permit.

If a future ticket wants a distinctive display face, it must ship one under a
licence that permits redistribution — the SIL Open Font License being the usual
answer — and record that licence here. That is a new decision, not something
this identity assumes.

## In a terminal

The CLI carries two marks of identity, and only at a terminal that can show
colour: `Lorekeeper` at the head of `lore --help` takes the dark `--lk-accent`,
periwinkle `#99A2F0`, and the message closes with the serial `LK-047`, dimmed.
The serial is the Wonder Wagon family thread: `LK` for the product, `047` for
the maker.

- The accent, not the gold. Gold is the second voice here too, and in sixteen
  colours it falls to yellow, which is the `warn` severity and Forge's colour.
  The accent falls to bright blue, which is neither.
- Colour never carries meaning. Severity, where the CLI ever shows one, uses the
  terminal's own green, cyan, yellow, and red.
- Nothing a script reads is touched. `--version`, `--json`, every error, and
  every piped, `NO_COLOR`, or `TERM=dumb` run keep their bytes exactly.
- On a light terminal the accent measures 2.39:1 against white, below the 3:1
  non-text bar. It paints one word the message also prints plainly, so nothing
  is lost, but the shortfall is recorded here rather than hidden.

`packages/cli/src/identity.ts` is generated by `brand/terminal/build.mjs` from
the token source and the `lorekeeper` theme in `@wonder-wagon/themes`, and
`npm run brand:terminal:check` fails if it is stale or if the two disagree about
the hue. Only the build reads the Wonder Wagon packages; the CLI imports
nothing from them.

This is identity, not voice. What the CLI says, and how search results are laid
out, remain the open CLI voice decision.

## Files

```
brand/
  IDENTITY.md              this document
  CONTRAST.md              generated: the measured contrast table
  logo/
    mark.svg               two-colour mark, 64×64
    mark-mono.svg          one-colour mark, currentColor
    wordmark.svg           drawn capitals, 876.23×100
    lockup-horizontal.svg  default lockup, 346.87×64
    lockup-stacked.svg     narrow or centred lockup, 227.82×108
  tokens/
    tokens.json            SOURCE OF TRUTH — palette, type, space, radius
    tokens.css             generated: CSS custom properties
    build.mjs              generator and checker
    contrast.mjs           WCAG 2.1 contrast arithmetic
  terminal/
    build.mjs              generates packages/cli/src/identity.ts; --check
```

Consuming it, from anywhere and with no framework:

```html
<link rel="stylesheet" href="brand/tokens/tokens.css">
```

```js
const tokens = JSON.parse(await readFile('brand/tokens/tokens.json', 'utf8'));
tokens.color.light.accent.value; // '#343A8C'
```

Light is the written default. The reader's system preference is followed unless
the document sets `data-lk-theme="light"`, and an explicit `data-lk-theme="dark"`
wins over both.

## What approval means

Approval fixed three things, which are now cited rather than re-decided: the
mark and wordmark geometry, the palette values, and the type pairing. It follows
that:

1. `context/project-overview.md` records the visual-identity decision, dated
   2026-09-18. The CLI voice part of that record stays open and keeps saying so.
2. `09.2` generates the favicon set, application icons, and social preview from
   `brand/logo/`.
3. Later presentation tickets read values from `brand/tokens/`, and none of them
   hard-codes a value the token source already defines.

Amending any of it costs one ticket, not a Feature: the vector sources and the
token source are small, commented, and regenerate their outputs with one
command.
