# Changelog

All notable changes to the published `create-lorekeeper` package are recorded
here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/).

The newest `## [X.Y.Z]` heading is the source of truth for the version: the
package manifest, the Git tag and the GitHub Release are derived from it, and
the release workflow refuses to run if they disagree. See `RELEASING.md`.

## [Unreleased]

## [0.2.0] - 2026-09-26

Lorekeeper now carries the Wonder Wagon family's terminal identity, and the npm
page points to the website. Commands, flags, files written and machine output
are unchanged.

### Added

- A terminal mark. In an interactive terminal, a successful `lore init` opens and
  closes with Lorekeeper's five-row mark: a periwinkle ring holding a gilt star,
  beside `L O R E K E E P E R  v0.2.0 · LK-047` and the tagline.

### Changed

- In an interactive terminal, `lore --help` opens with the family's one-line
  identity, `L O R E K E E P E R  v0.2.0 · LK-047`. The serial moves from the
  foot of the help into that line.
- The npm README opens with links to the
  [website](https://lorekeeper-bay.vercel.app), Quickstart, How it works, Proof,
  Identity and GitHub. The package `homepage` is now the website instead of the
  GitHub README.

### Unchanged

- Piped and redirected output, `--json`, `--version`, `capture` and `search`
  results, and a refused `init` produce the same bytes as 0.1.0, apart from the
  version number.
- `NO_COLOR`, `FORCE_COLOR=0` and `TERM=dumb` remove every colour code.
  `WW_ASCII=1` swaps in an ASCII mark for terminals that draw box characters
  double-width. A narrow terminal gets the one-line form instead of the mark.
- The identity code is generated at build time and compiled into `dist/lore.js`,
  so `yaml` is still the only runtime dependency. Lorekeeper still runs offline,
  takes no credentials and calls no language model.

## [0.1.0] - 2026-09-25

The first published release. It installs one command, `lore`.

### Added

- `lore init <dir>` creates a brain: five folders, seven starter files, an
  `AGENTS.md` for coding agents, and a managed manifest at
  `.lorekeeper/manifest.json` recording which files the toolkit owns. Pointed at
  an existing Markdown or Obsidian vault, it adopts the vault without rewriting
  any file in it. Re-running `init` is idempotent and reports drift instead of
  overwriting it.
- `lore capture <brain> <item>` files a thought into `inbox/`, or a URL into
  `sources/` under a stable source ID, so capturing the same source twice writes
  nothing. URLs are identified, never fetched.
- `lore search <brain> <query>...` ranks passages, not files. Several wordings
  in one call are fused into one ranked, deduplicated list. Each result carries
  its path, heading anchor, line range, score and text. `--json` gives a stable
  machine contract, and `--limit` caps the results. Search builds its index in
  memory and writes nothing.
- At a colour terminal, `lore --help` carries the Lorekeeper identity: the
  product name in periwinkle and a dimmed `LK-047`. Piped, `NO_COLOR`,
  `TERM=dumb` and `--json` output carry no escape codes.

### Notes

- Deterministic and offline. No credentials, no network calls, no language
  model.
- Requires Node.js 24 or newer, on macOS or Linux. Windows is not supported in
  v0.1.
- The package is self-contained. The toolkit's internal core is compiled into
  `dist/lore.js`, and `yaml` is its one runtime dependency.
- The package is named `create-lorekeeper` because the bare name `lorekeeper` on
  npm belongs to an unrelated project. The command is `lore`.
