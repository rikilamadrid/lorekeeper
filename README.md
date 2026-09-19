<p align="center">
  <img src="brand/assets/social-preview.png" width="560"
       alt="Lorekeeper: a four-point gold star held inside an indigo ring, beside the wordmark LOREKEEPER.">
</p>

<p align="center">
  <strong>An AI-native second brain made of plain Markdown files you own.</strong><br>
  Pathfinder finds the way; Lorekeeper remembers the journey.
</p>

---

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

## Why it matters

You already wrote it down. You cannot find it again.

Knowledge accumulates across notes, articles, videos, and long conversations
with AI agents, and almost none of it comes back when it is needed. So you
re-explain your own project to an agent for the fourth time this week, and it
answers from what you just pasted rather than from what you have known for a
year.

The usual fixes ask you to become an expert in an application first, and then
they hold your knowledge inside it. Lorekeeper takes the other side of that
trade. Your knowledge stays as plain Markdown files you own, readable with no
tool installed, including this one. On top of those files sits a deterministic
retrieval layer that returns the individual passages that answer a question —
and an agent calls it instead of asking you to supply context again.

The knowledge is yours. The retrieval is deterministic. The intelligence is
whatever agent you were already using.

## The look of it

Lorekeeper is a star held in a ring: what was found, and what keeps it. The
identity leans on folklore, field journals, and archival knowledge rather than
on the neon-and-circuitry that usually signals "AI" — a warm parchment page,
iron-gall ink, a deep indigo and a bronze gilt, and a mark with no glow and no
sparkle trail. Every colour pairing it defines is measured against WCAG 2.1 AA
in both light and dark rather than eyeballed.

Sibling to [Pathfinder](https://github.com/rikilamadrid/pathfinder), not a copy
of it: the same paper-and-ink bones and the same measured token architecture,
split by hue, geometry, and letterform. Pathfinder's colour is a trail blaze,
directional and out ahead of you. Lorekeeper's mark is a closed ring:
enclosing, held, already arrived.

See [`brand/IDENTITY.md`](brand/IDENTITY.md) for the mark, the palette, the
type pairing, and the usage rules.

## Quickstart

You need **Node.js 24 or newer** and **macOS or Linux**. Nothing else — no
account, no API key, no network access at run time.

Lorekeeper is not published to a package registry yet, so install from source:

```sh
git clone https://github.com/rikilamadrid/lorekeeper.git
cd lorekeeper
npm ci
npm run build
export PATH="$PWD/node_modules/.bin:$PATH"
```

Make a brain:

```sh
lore init ~/brain
```

That creates five folders, seven starter files, and a manifest at
`.lorekeeper/manifest.json` recording which of those files the toolkit owns.
Everything else you ever put in that directory is yours, and `lore` will not
rewrite, move, or reformat it. **Already have a Markdown or Obsidian vault?**
Point `init` at it instead — this is adoption, not migration.

Capture something, then search it:

```sh
lore capture ~/brain "A lease is not a property: a consumer can lose its partition mid-batch"
lore search ~/brain "what does a consumer lose" "partition ownership"
```

Two things to notice, because they are the whole product. **Give several
wordings of one question, each in its own quotes** — search fuses their
rankings into one list, and three wordings find what one misses. **A score
ranks; it never proves absence** — if the results do not settle your question,
ask again in other words.

Full walkthrough: [`brand/quickstart.md`](brand/quickstart.md).

## How it works

<p align="center">
  <img src="brand/diagrams/retrieval-path.svg" width="760"
       alt="How a search works in Lorekeeper. A four-step pipeline. One: capture — a thought or a link is filed by lore capture into your Markdown files, which stay plain and readable with no tool installed. Two: index — every search builds an index in memory and then drops it, writing nothing to your notes; what it indexes is spans, a heading's passage addressed by file, anchor and line range. Three: search — a coding agent asks one question three ways in a single call, each wording produces its own ranked list, and the ranked lists are fused into one. Four: answer — one result carries its path, anchor, line range, score and span text, and the agent's context holds the passages that answer the question, not the whole notes they came from. Version 0.1 makes no model call and no network call, and a score ranks passages against each other; it cannot prove a thing is absent. The full description is inside the file.">
</p>

A capture becomes spans; a question becomes fused, deduplicated results; those
results become an agent's context. Every search builds its index in memory and
drops it — there is no index file, and nothing is written to your notes.

<p align="center">
  <img src="brand/diagrams/three-surfaces.svg" width="760"
       alt="The three surfaces Lorekeeper keeps separate. Two public surfaces sit above a dashed boundary line, and one private surface sits below it. Above: this repository, holding the CLI, its contracts and its tests, the identity, the narrative and this diagram, and no brain data ever; and the documentation site, which renders what this repository authors and holds no brain data. The dashed boundary reads: no brain data crosses this line, nothing private is committed here. Below it: your brain, holding your Markdown files and the manifest that says which of them the toolkit owns — private, on your machine, and never committed to this repository. The full description is inside the file.">
</p>

Three surfaces stay cleanly separated: this repository, your private brain, and
the documentation site. No brain data crosses the line, and nothing private is
committed here.

The third diagram — where a note came from and who owns it — and the notes on
how all three are built are in [`brand/diagrams.md`](brand/diagrams.md). Each
diagram carries its full text alternative inside the file.

## What your agent does with it

`lore init` writes an `AGENTS.md` into the brain, and that file is the entire
integration surface. It tells a coding agent that the directory is searchable,
gives the exact command, insists on several wordings in one call, names the
five fields a result carries, and states what a score cannot establish.

Run the demo:

```sh
npm run demo:agent
```

Eight invented Markdown files about a made-up data pipeline. The question is
answered in `notes/consumer-leases.md`, which never uses the words "nightly" or
"export" — so one wording finds the wrong note:

```sh
lore search <brain> "nightly export failed" --json
#   notes/nightly-export.md#When it runs:16-18
#   notes/nightly-export.md#Restarting a failed export:28-30
#   …on topic, and none of it answers the question
```

Three wordings in the same call find the right one:

```sh
lore search <brain> "nightly export failed" "run stopped partway and reported success" "consumer lease renewal committed offset" --json
#   notes/consumer-leases.md#A lease is lost silently:15-22
```

The agent receives eight lines with a path, a heading anchor, a line range, a
score, and the text itself — enough to answer and enough to cite, without
reading a whole note. That is not a trick arranged for a demo; it is the
vocabulary mismatch that made multi-wording search a v0.1 capability in the
first place, in miniature.

Full transcript: [`brand/agent-integration.md`](brand/agent-integration.md).

## What it saves

Measured on **2026-09-17** over a synthetic corpus of **3,000 notes**
(3,193,061 bytes, averaging 1,064 bytes each), the prescribed agent call
returned a JSON payload **approximately 2.0x** smaller than the whole notes
those passages came from. The measured ratio was **1.97x**; 2.0x is it rounded
up, and it is the ceiling on what we publish — not a claim about the best case.

Three caveats travel with that number wherever it appears:

- **Bytes are a proxy for token cost, not a literal token count.** No tokenizer
  and no provider coupling was added to produce it.
- **The baseline is deliberately generous.** It charges only for the files the
  returned passages came from, as though the agent had already known which
  files to open. Without span retrieval it would not have known — which is why
  1.97x is a floor for the realistic case rather than a best case.
- **The payload is pretty-printed**, which is 12% of its bytes. Compact JSON
  would read 2.2x. The output format is a retrieval contract and was not
  changed to improve this number.

Retrieval speed, measured the same day over the same corpus: a fused
three-wording search completes **end to end in about 130 ms**, including
building the whole in-memory index from scratch. That is one machine, one
corpus, and one shape of note — medians of twenty runs on an Apple M5, not a
survey of real vaults on real hardware.

Every figure above, its measurement, and the rest of its caveats:
[`brand/proof.md`](brand/proof.md).

## Where v0.1 stops

Stated plainly, because a presentation surface that omits the known limitation
is not an honest one.

**The CLI makes no LLM call.** None — not for query expansion, not for
summarizing a result, not for ranking. The several-wordings behavior that makes
retrieval good enough is supplied by the *calling agent*, which means a caller
that issues one wording gets a materially worse product than one that issues
three.

**Retrieval cannot prove that something is absent.** A score ranks passages
against each other; it does not separate knowledge that is present from
knowledge that is not there. A top result can be nothing more than the best of
a bad field. That is exactly why there is no relevance threshold: a cutoff
would turn an honest miss into false confidence.

**And what v0.1 simply does not include yet:** no embeddings or semantic
search, no MCP server, no mobile capture, no automated ingestion of web pages
or video, no server component of any kind, and no Windows support.

## Where to go next

| | |
| --- | --- |
| [`brand/narrative.md`](brand/narrative.md) | What Lorekeeper is, what it is not, and where v0.1 stops |
| [`brand/quickstart.md`](brand/quickstart.md) | From nothing to a working `lore search` |
| [`brand/agent-integration.md`](brand/agent-integration.md) | The demo, and what an agent does with a result |
| [`brand/proof.md`](brand/proof.md) | Every published figure, its measurement, and its caveats |
| [`brand/diagrams.md`](brand/diagrams.md) | How a search works, provenance, and the three surfaces |
| [`brand/IDENTITY.md`](brand/IDENTITY.md) | Mark, wordmark, palette, type, and usage rules |

A documentation site is planned and not yet built.

Licensed [MIT](LICENSE).
