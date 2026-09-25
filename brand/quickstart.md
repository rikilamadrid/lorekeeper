# Quickstart

From nothing to a working `lore search`, in about five minutes.

Every command on this page was run as written against the built binary. If one
of them stops working, it is a bug in the toolkit or in this page, not
something for you to work around.

## Before you start

- **Node.js 24 or newer.** Check with `node --version`.
- **macOS or Linux.** Windows is explicitly out of scope at v0.1.
- **Nothing else.** No account, no API key, no network access at run time.

## Install

Install the `lore` command from npm:

```sh
npm install -g create-lorekeeper
```

The package is `create-lorekeeper` because the bare name `lorekeeper` on npm
belongs to an unrelated project; the command it installs is `lore`. To try it
once without installing, `npx create-lorekeeper init ~/brain` makes the same
brain `lore init ~/brain` does.

Then check it:

```sh
lore --version
lore --help
```

`lore --help` is the full command surface. There are three commands.

> Every later command on this page is written as `lore …`. Without a global
> install, `npx create-lorekeeper …` runs the same program with the same
> arguments.

## 1. Make a brain

```sh
lore init ~/brain
```

That creates the directory, five folders, seven starter files, and a manifest
at `.lorekeeper/manifest.json` recording which of those files the toolkit owns.
Everything else you ever put in that directory is yours, and `lore` will not
rewrite, move, or reformat it.

The folders are `inbox/`, `daily/`, `notes/`, `sources/`, and `entities/`. They
are a browsing convenience: meaning lives in each file's frontmatter, not in
its path, so you can reorganize them later without breaking retrieval.

**Already have a Markdown or Obsidian vault?** Point `init` at it instead:

```sh
lore init ~/existing-vault
```

This is adoption, not migration. Your notes are read and indexed exactly as
they are. Nothing of yours is rewritten to make it conform, and files that
already exist at a starter path are left alone rather than claimed.

## 2. Capture something

A thought:

```sh
lore capture ~/brain "A lease is not a property: a consumer can lose its partition mid-batch"
```

It lands in `inbox/` as `YYYYMMDD-HHMMSS-subject.md`, named the same as its id,
and it says what it is and when it arrived — so it is worth finding again even
if you never process it. Two captures in the same second do not collide.

A URL:

```sh
lore capture ~/brain "https://example.com/queue-semantics-talk"
```

That lands in `sources/` instead, named for a stable source id derived from the
URL. The URL is *identified*, never visited — there is no network call here.
Capturing a URL you already have reports the file that holds it and writes
nothing, so two URLs that name the same thing stay one source.

## 3. Search it

```sh
lore search ~/brain "what does a consumer lose" "partition ownership"
```

Results are passages, not files. Each one prints the path, the heading it sits
under, its line range, its score, and the lines themselves.

Two things to notice, because they are the whole product:

**Give several wordings of one question, each in its own quotes.** Search fuses
their rankings into one list. This is not an optimization — three wordings find
what one misses, and a single wording returns a materially worse answer.

**A score ranks; it never proves absence.** If the results do not settle your
question, ask again in other words. A low score means this brain may not have
it, never that it does not.

Useful flags:

```sh
lore search ~/brain "consumer lease" --json     # the same results as JSON
lore search ~/brain "consumer lease" --limit 20 # how many come back
```

Search reads and writes nothing. It builds no index file, and it works on any
directory of Markdown whether or not `lore init` has ever run there.

## 4. Let your agent use it

`lore init` already wrote an `AGENTS.md` at the root of your brain. That file
is the whole integration: it tells a coding agent that the directory is
searchable, how to call `lore search`, why to give several wordings, what the
result fields mean, and what a score cannot tell it.

Nothing else is required. Open the brain directory with a coding agent that
reads `AGENTS.md` and ask it something that depends on your notes.

If you adopted a vault that already had its own `AGENTS.md`, `lore init` left
yours untouched and claimed nothing — so automatic discovery is not set up, and
you can paste the relevant instructions in yourself.

See `agent-integration.md` for what this looks like end to end, including a
demo you can run.

## What you have now

A directory of plain Markdown files you own, searchable at passage level,
readable with no tool installed, with a coding agent that knows to search it
before it asks you to explain your own project again.
