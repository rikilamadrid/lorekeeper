# Derived assets

Every favicon, application icon, and social preview Lorekeeper ships is a build
product of the approved mark. Nothing in this directory is drawn by hand, and
nothing in it states a colour of its own.

```sh
npm run brand:assets         # regenerate
npm run brand:assets:check   # fail if any asset is stale
```

## Two sources, and only two

| Source | Supplies |
| --- | --- |
| `brand/logo/*.svg` | every outline, verbatim |
| `brand/tokens/tokens.json` | every colour |

`build.mjs` contains no hex value and no coordinate. A change to the mark or to
the palette reaches these files by rerunning the command, which is the point:
the assets cannot drift from the identity, because they are not a copy of it.

The check is byte-exact. `brand:assets:check` regenerates every asset in memory
and compares it to the file on disk, so a stale asset fails rather than
lingering, and a rebuild on another machine produces the same bytes rather than
a diff.

## What is generated

| File | Size | Built from |
| --- | --- | --- |
| `favicon.svg` | vector | `mark.svg` |
| `favicon-mono.svg` | vector | `mark-mono.svg` |
| `favicon-16.png` | 16 | `mark.svg` |
| `favicon-32.png` | 32 | `mark.svg` |
| `favicon-48.png` | 48 | `mark.svg` |
| `favicon.ico` | 16, 32, 48 | the three PNGs above |
| `apple-touch-icon.png` | 180 | `mark.svg` |
| `icon-192.png` | 192 | `mark.svg` |
| `icon-512.png` | 512 | `mark.svg` |
| `icon-maskable-512.png` | 512 | `mark.svg` |
| `social-preview.png` | 1280x640 | `lockup-horizontal.svg` |

Uploading `social-preview.png` to the repository's settings is `09.6`: it is a
write outside this repository and needs a human.

## The rules these assets keep

**A favicon is an independent document.** It is loaded on its own, with no page
around it, so a value it does not state is a value it does not have.
`mark-mono.svg` inks with `currentColor` precisely so that it takes the colour
of whatever encloses it — and rasterised or loaded alone it would fall back to
initial black, 1.15:1 on the dark page and effectively invisible.
`brand/IDENTITY.md` requires anything derived from it to set the ink per
variant instead, and `favicon-mono.svg` does: `#1b1c2e` for light, `#ede7db`
for dark, both read from the token source and declared under
`prefers-color-scheme`. `favicon.svg` does the same for the two-colour mark,
which is why it stays legible on a dark browser chrome where the deep indigo
ring alone would not.

**A PNG cannot follow the reader's colour scheme.** So every raster is opaque
and sits on `--lk-page`, one of the three grounds `brand/IDENTITY.md` measures
the two-colour mark against. A transparent mark dropped onto an unknown ground
would be an unmeasured pairing, which the identity does not permit. The two
SVGs are the assets that adapt; the rasters are the ones that are safe
anywhere.

**No colour that is not in the palette.** Paint resolves through
`tokens.json`, a literal fallback inside a logo's `var()` is checked against
the token rather than used, and the generated SVGs are scanned before they are
written: a hex value the palette does not define fails the build.

## Consuming them

```html
<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
```

The PWA icons are for Feature 08's web app manifest — `icon-192.png` and
`icon-512.png` as `"purpose": "any"`, `icon-maskable-512.png` as
`"purpose": "maskable"`. Writing that manifest belongs to Feature 08; these
files are what it points at.

## Why the toolchain is in here

Rasterising, PNG encoding, and the icon container are written in this
directory rather than installed.

Two reasons, both of them the ticket's own requirements. A dependency would be
the first one this repository's identity work has needed, and the v0.1
boundary is deliberately offline and dependency-free. And byte-exact
reproducibility is only true of a compressor that cannot change underneath us:
`zlib.deflateSync` ties the output bytes to whichever zlib ships inside the
current Node release, so a runtime upgrade would rewrite every asset with no
source file changing. The DEFLATE stream is produced here instead, and
`node:zlib` is used only to inflate it again and prove it round-trips.

| File | Does |
| --- | --- |
| `build.mjs` | resolves colour, composes each asset, writes or checks |
| `svg.mjs` | reads the logo files — the element set they use, nothing more |
| `raster.mjs` | flattens curves, converts strokes to polygons, measures coverage |
| `png.mjs` | deterministic PNG encoder, round-trip verified |
| `ico.mjs` | the Windows icon container around the favicon PNGs |

`svg.mjs` is not a general SVG implementation and must not become one. It reads
what `brand/logo/` uses and throws on anything else, so a future logo change it
cannot honour fails the build instead of quietly disappearing from an asset.
