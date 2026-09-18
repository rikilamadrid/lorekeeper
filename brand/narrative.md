# Lorekeeper, in words

The product narrative: what Lorekeeper is, why it exists, what it is not, and
where v0.1 stops. Framework-neutral Markdown. Feature 08 renders this; it does
not rewrite it.

Every figure quoted here is traceable to a recorded measurement, and every
figure carries its caveats with it. The measurements themselves, in full, are
in `proof.md`.

## The thesis

You already wrote it down. You cannot find it again.

Knowledge accumulates across notes, articles, videos, and long conversations
with AI agents, and almost none of it comes back when it is needed. So you
re-explain your own project to an agent for the fourth time this week, and it
answers from what you just pasted rather than from what you have known for a
year.

The usual fixes ask you to become an expert in an application first, and then
they hold your knowledge inside it.

Lorekeeper takes the other side of that trade. Your knowledge stays as plain
Markdown files you own, readable with no tool installed, including this one.
On top of those files sits a deterministic retrieval layer that returns the
individual passages that answer a question — and an agent calls it instead of
asking you to supply context again.

The knowledge is yours. The retrieval is deterministic. The intelligence is
whatever agent you were already using.

## Lorekeeper in thirty seconds

Lorekeeper is a command-line toolkit for a second brain made of plain Markdown.

`lore init` creates a brain, or adopts a Markdown vault you already have
without rewriting a single file of it. `lore capture` files a thought or a URL
with enough context that it is still useful months later, unprocessed.
`lore search` ranks the *passages* of that brain against a question and returns
each one with its file, its heading, its line range, its score, and its text.

`lore init` also writes an `AGENTS.md` into the brain, which is what makes any
of it fire: a coding agent reads it, learns the directory is searchable, and
searches it before answering questions about your work.

It runs offline. It takes no credentials, makes no network call, and calls no
language model. Nothing about it breaks when an AI provider changes its API,
its pricing, or its mind.

## Why it works without a model

Lexical search alone is not good enough — a fact this project measured rather
than assumed, and recorded in `context/project-overview.md` on 2026-08-21.

What makes it good enough is that the agent asks the same question several
ways in a single call, and Lorekeeper fuses the ranked lists. That is not an
optimization bolted on afterwards; it is the retrieval contract, and the
integration artifact instructs agents to use it.

The effect is visible in the demo in `agent-integration.md`: a question phrased
one way surfaces the wrong note, and the same question phrased three ways
surfaces the note that answers it — a note that never uses the words the first
phrasing was built from.

## What it saves

Measured on 2026-09-17 over a synthetic corpus of 3,000 notes, the prescribed
agent call returned a JSON payload **approximately 2.0x** smaller than the
whole notes those passages came from. The measured ratio was 1.97x; 2.0x is it
rounded up, and it is the ceiling on what we publish — not a claim about the
best case.

Four caveats sit behind that number. The proxy caveat travels with every byte
figure; the generous-baseline and pretty-printed caveats travel with this
saving wherever it appears:

- **Bytes are a proxy for token cost, not a literal token count.** No tokenizer
  and no provider coupling was added to produce it.
- **The baseline is deliberately generous.** It charges only for the files the
  returned passages came from, as though the agent had already known which
  files to open. Without span retrieval it would not have known — which is why
  Feature 07 recorded 1.97x as a floor for the realistic case rather than a
  best case. The ceiling above is a ceiling on what is published, not on what
  the tool can do.
- **The payload is pretty-printed**, which is 12% of its bytes. Compact JSON
  would read 2.2x. The output format is a retrieval contract and was not
  changed to improve this number.
- **The corpus was not shaped to flatter the result.** Its notes average about
  a kilobyte, which bounds how much smaller a passage can be than the note
  holding it.

The saving is real and modest, and it is reported as measured rather than as
improved. `proof.md` has the table, the machine, and the rest of the caveats.

## Lorekeeper and Pathfinder

Pathfinder finds the way. Lorekeeper remembers the journey.

They come from the same maker and are built to read as siblings, not as one
product split in two. Pathfinder is movement, direction, and execution: it
takes a project from intent to delivered work. Lorekeeper is memory,
provenance, and connection: it keeps what was learned along the way and hands
it back when it is next needed.

You can use either without the other. Neither imports the other. Lorekeeper is
not a Pathfinder plugin and does not require a Pathfinder project to be useful.

## What Lorekeeper is not

Four specific things this project has decided not to become, recorded in
`context/project-overview.md`:

**Not an Obsidian template bundle.** Obsidian is an optional viewer, not the
architecture. The folder set carries epistemic role and nothing else — no
numeric prefixes to force a sidebar's sort order. Meaning lives in frontmatter,
so you can reorganize the folders without breaking retrieval.

**Not a vault-shaped dumping ground of transcripts.** A capture is
self-describing on arrival: it records what it is and when it came, so an item
you never get around to processing is still worth finding. Retrieval ranks
passages, not files, so the answer comes back rather than the container it
lives in.

**Not a one-time scaffold.** A manifest records which files the toolkit owns
and which are yours. Toolkit files can be updated; yours are never rewritten,
moved, or reformatted, and a file you edited is reported as drifted rather than
overwritten. Adoption of an existing vault is adoption, not migration: nothing
is restructured to suit the tool.

**Not a system that stops working when an AI provider changes.** The CLI makes
zero model calls by design. There is no API key to rotate, no embedding index
to rebuild against a new model, and no vendor whose deprecation notice becomes
your migration. The intelligence lives in whatever agent calls the CLI, and the
CLI is testable with no agent in the loop.

And, in identity terms: not a generic productivity app, not an "AI brain"
gimmick, not cyberpunk neon AI styling, not a clone of Pathfinder, and not a
clone of any existing second-brain project.

## Where v0.1 stops

Stated plainly, because a presentation surface that omits the known limitation
is not an honest one.

**The CLI makes no LLM call.** None. Not for query expansion, not for
summarizing a result, not for ranking. If you run `lore search` with no agent
in front of it, you get deterministic lexical retrieval and nothing more. The
several-wordings behavior that makes retrieval good enough is supplied by the
*calling agent*, which means a caller that issues one wording gets a materially
worse product than one that issues three.

**Retrieval cannot prove that something is absent.** This is the known v0.1
limitation, recorded on 2026-08-21 rather than hidden. A score ranks passages
against each other; it does not separate knowledge that is present from
knowledge that is not there. During evaluation, a question with no answer in
the corpus scored higher than four questions that did have one. That is exactly
why there is no relevance threshold: a cutoff would turn an honest miss into
false confidence.

So a calling agent must treat results as evidence to weigh, not as proof. When
the evidence does not settle a question, it searches again in other words; when
it still does not, it says the evidence is insufficient. It never reports that
your brain lacks something because a score looked low.

**And what v0.1 simply does not include yet:** no embeddings or semantic
search, no MCP server, no mobile capture, no automated ingestion of web pages
or video, no server component of any kind, and no Windows support. macOS and
Linux, on Node 24 or newer.

## Where to go next

- `quickstart.md` — from nothing to a working `lore search`
- `agent-integration.md` — the demo, and what an agent actually does with a
  result
- `proof.md` — every published figure, its measurement, and its caveats
