# How it works, in diagrams

Three diagrams that answer "how does this work?" before any prose does: how a
search works, where a note came from and who owns it, and which surfaces stay
separate. Framework-neutral SVG under `diagrams/`. Feature 08 renders them; it
does not redraw them.

| Diagram | File | Answers |
| --- | --- | --- |
| How a search works | `diagrams/retrieval-path.svg` | A capture becomes spans; a question becomes fused, deduplicated results; those results become an agent's context. |
| Where a note came from, and who owns it | `diagrams/provenance-and-ownership.svg` | The chain from external artifact to `sources/` to `notes/` to `entities/`, which way the links point, and what the manifest owns. |
| Three surfaces, cleanly separated | `diagrams/three-surfaces.svg` | This repository, your private brain, and the documentation site — and what may cross between them. |

## The text alternative travels inside the file

Each diagram carries `role="img"`, a `<title>`, and a `<desc>` that describes it
in full — the shapes, the labels, and the claim the picture is making. The
`<desc>` is the text alternative, and it lives in the one place that cannot be
separated from the diagram it describes. Reproducing it here would create a
second copy to keep in step, so this page does not.

Render the SVG inline rather than through `<img>` and the description is
announced with it. Through `<img>`, supply the same sentence as the `alt`.

## Light and dark, from one file

Colours are the token custom properties from `tokens/tokens.css`, each with its
light-variant value as the literal fallback — the same convention the logo files
use, for the same reason.

The diagrams add one thing the logos do not need. Each carries its own
`svg:root` block and a `prefers-color-scheme: dark` override:

```css
svg:root { --lk-page: #FAF7F1; /* … */ }
@media (prefers-color-scheme: dark) {
  svg:root { --lk-page: #141521; /* … */ }
}
```

`:root` is the root element of the *document*. Opened on its own, referenced
through `<img>`, or rasterised, the SVG is its own document, `svg:root` matches,
and the file carries both variants by itself. Inlined into a themed page the
root element is `<html>`, `svg:root` matches nothing, and the page's tokens win
untouched — including an explicit `data-lk-theme`. One file, correct in every
placement, with no build step and no second asset.

Every colour a diagram names sits on `--lk-page`, `--lk-surface`, or
`--lk-surface-2`, which are the three grounds `CONTRAST.md` measures.

## What the diagrams may say

- **Only what v0.1 does.** The overview's lifecycle diagram marks CONNECT,
  THINK, and ACT as later; no diagram here depicts them as shipped. The
  retrieval diagram states the two limits on its face: no model call, no network
  call, and a score that cannot prove a thing is absent.
- **Only the narrative's words.** Every concept a diagram labels — brain,
  span, passage, index, ranked, score, anchor, line range, manifest, drifted,
  adoption, fused — is named the same way in `narrative.md`, `quickstart.md`,
  or `agent-integration.md`. Where the narrative uses a phrase rather than a
  compound, the diagram uses the phrase: the manifest's two classes of file are
  labelled **the toolkit's** and **yours**, which is how `narrative.md` and
  `lore init` itself both put it, not the `toolkit-owned` and `user-owned` of
  the schema's internals. The fusion step is labelled **fused into one ranked
  list**, the narrative's own words for it; its mechanism is reciprocal rank
  fusion, named in Feature 05 and not on the diagram.

  One exception, recorded rather than smoothed over: `09.3` never names or
  discusses **near-duplicate suppression**. The term itself is not absent from
  `09.3` — `proof.md` carries the past participle in a benchmark row copied from
  Feature 05 — but no 09.3 text names the concept or explains it, so there is no
  narrative name to match and none was invented. The diagram uses
  Feature 05's term, which is also the term ticket `09.4` asked for. If a later
  narrative names it differently, the diagram follows the narrative.
- **No published figure.** A measured claim about the saving may not appear
  here, because the caveats it must travel with do not fit in a label and a
  figure that outruns its caveats is the failure mode `proof.md` exists to
  prevent. The diagrams point at the shape of the saving — passages rather than
  whole notes — and `proof.md` carries the number. The one number on a diagram
  is the rank score in the search diagram's result card: it is a value that
  result carries, not a measurement of what Lorekeeper saves, and the caveat it
  travels with is short enough to sit on the same diagram — "a score ranks
  passages against each other; it cannot prove a thing is absent".

The wordings in the search diagram are the demo's own, elided to fit. In full
they are `"nightly export failed"`, `"run stopped partway and reported
success"`, and `"consumer lease renewal committed offset"`, and
`agent-integration.md` runs them.

## Checking them

```sh
npm run brand:diagrams
```

The diagrams are hand-authored, so nothing regenerates them and nothing else
would notice a colour, a token name, or a text alternative drifting in by hand.
`diagrams/check.mjs` reads `tokens/tokens.json` and fails if a diagram disagrees
with it: a colour literal the token source does not define, a `var()` fallback
that is not the token's light value, a dark block that is not the token's dark
value, a declared token the file never uses, a missing or stub `<desc>`, an id
reused between diagrams, or anything reaching outside the file. It has been run
against deliberate versions of each of those failures, not only against the
diagrams as they stand.

What it cannot check is whether a diagram is legible. That was verified by
rendering all three at their authored size in both variants and looking at the
six results.
