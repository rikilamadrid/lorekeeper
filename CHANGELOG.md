# Changelog

All notable changes to the published `create-lorekeeper` package are recorded
here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/).

The newest `## [X.Y.Z]` heading is the source of truth for the version: the
package manifest, the Git tag and the GitHub Release are derived from it, and
the release workflow refuses to run if they disagree. See `RELEASING.md`.

## [Unreleased]

### Added

- The 0.2.0-facing terminal identity: interactive help uses the shared Wonder
  Wagon line grammar, and successful interactive `lore init` runs are
  bookended by Lorekeeper's five-row periwinkle ring and gilt star. Pipes,
  JSON, `--version`, machine-readable output, and failed init keep their
  existing bytes. `NO_COLOR`, `WW_ASCII=1`, and narrow terminals degrade
  explicitly.

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
