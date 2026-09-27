# Lorekeeper terminal identity

The approved mark is a five-row periwinkle ring holding a gold star: preserved
knowledge with a passage worth finding. The tagline is **You already wrote it
down. Find the passage that answers.** The product serial remains `LK-047`.

Interactive `npx create-lorekeeper` (the package's `lore` binary), bare `lore`,
and `lore --help` show the complete identity once. Successful interactive
`lore init` shows one identity before the result. Init buffers its result until
success, so failed and refused runs retain their exact previous streams.

Wonder Wagon owns spacing, wordmark treatment, metadata placement, terminal
capability detection, and responsive layout. Lorekeeper owns the ring, star,
periwinkle/gold palette, serial, and tagline. Narrow terminals stack the mark,
wordmark, version/serial, and wrapped tagline. `NO_COLOR` keeps Unicode geometry;
`WW_ASCII=1` independently selects the ASCII ring/star. Piped output and data
commands use the existing contracts.

## Generator provenance

`family-cli.snapshot.mjs` is an exact, build-time-only copy of Wonder Wagon's
React-free, dependency-free CLI generator with opt-in responsive layout. It is
vendored while that addition awaits a release; the pinned published dependency
and all package versions remain unchanged. The generated runtime is committed as
`packages/cli/src/identity.ts`, and the package still ships only its bundled CLI,
README, manifest, and licence. The snapshot is excluded from formatting so its
upstream bytes remain auditable.

Source: `rikilamadrid/wonder-wagon-ui`, `packages/foundation/dist/cli.js`, identity
upgrade branch (upstream commit recorded when finalized).
SHA-256: `8b985538461158673eeaf087e0b6745f310d09910196cd404d35a3e47594d6f5`.

Run `npm run brand:terminal` to regenerate, or `npm run brand:terminal:check` to
prove the committed module has no drift. Once Wonder Wagon publishes this
additive generator API, a later dependency update can replace the snapshot
without altering the generated runtime.

## Terminal evidence

`specimens/manifest.json` records the real bundled binary's PTY captures at
100 and 32 columns, in truecolor, 256 colors, ANSI-16, `NO_COLOR`, ASCII, and dumb
terminal modes, plus bare invocation and successful initialization. `.ansi`
files retain SGR bytes and `.txt` files remove only SGR for accessible reading.
The existing README SVG is also regenerated from actual `lore --help` PTY bytes.

Reproduce with `npm run build` and `python3 brand/terminal/capture.py` on macOS
or Linux. Captures use a disposable external brain containing synthetic data.
The capture normalizes PTY carriage returns only.

`specimens/contract-proof.json` records 101 exact comparisons against baseline
commit `d1ec6db5ad294e4be28da6cc3ec3af72c7ff7446`: exit status, stdout, and stderr
match for versions, JSON search, plain search, unknown arguments, failed/refused
init, capture/search usage errors, piped help/no-arg, and successful piped init.
TTY and pipe cases cover default, forced color, `NO_COLOR`, ASCII, and dumb
terminal environments. To rerun that comparison, build the baseline and copy its
bundle to `packages/cli/dist/lore.baseline.js` before building this branch.
