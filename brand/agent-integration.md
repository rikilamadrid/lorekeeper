# The agent integration demo

An agent asking one question three ways, against a brain, and using what comes
back. This page explains the demo; `demo/agent-demo.mjs` *is* the demo, and
every `lore` call in it goes through the built binary as a process, with the
same arguments this page shows.

## Run it

```sh
npm run demo:agent
```

That builds the toolkit and runs the demo. The build writes compiled output
under each package's `dist/`; the demo itself writes only into a temporary
directory, which holds the brain it searches and is removed when it finishes.
Nothing it creates is left in the working tree.

The output is deterministic. The vault is static bytes, retrieval is
deterministic, and the one thing that differs between two runs — the temporary
directory's name — is printed as `<brain>`. So the transcript below can be
compared against a fresh run rather than taken on trust.

The demo also checks itself. If fusing three wordings ever stops promoting the
note that answers the question, it exits non-zero and says so, instead of
printing a story about behavior that is no longer there.

## The vault it searches

Eight invented Markdown files about a made-up data pipeline called Harbour.
There is no Harbour, no team behind it, and no person behind any of these
notes. Nothing is copied, paraphrased, or derived from anyone's real notes:
this repository carries no private content, in demos and fixtures included.

The vault is shaped to show one specific thing. The question the demo asks is
answered in `notes/consumer-leases.md`, which never uses the words "nightly" or
"export". `notes/nightly-export.md` uses them constantly and does not answer
it. One wording of the question therefore finds the wrong note, and fusing
three wordings finds the right one.

That is not a trick arranged for a demo. It is the vocabulary mismatch that
made multi-wording search a first-class v0.1 capability in the first place, in
miniature and small enough to read.

## The transcript

```text

1. A synthetic vault, written by this repository
------------------------------------------------

8 invented Markdown files, written to <brain>.
Static bytes. No clock, no personal content, no real vault.

2. `lore init` adopts it
------------------------

$ lore init <brain>

Adopted the vault at <brain>

  inbox/
  daily/
  notes/
  sources/
  entities/

7 starter files, recorded in .lorekeeper/manifest.json.
Everything else in that directory is yours.

Start by reading <brain>/README.md
The notes above were already there and were left alone. Init added the
starter files it owns, and `AGENTS.md` is the one that matters here:
it is what tells a coding agent this directory is searchable and how.

3. The agent asks once, in one wording
--------------------------------------

$ lore search <brain> "nightly export failed" --json

  notes/nightly-export.md#When it runs:16-18
  notes/nightly-export.md#Restarting a failed export:28-30
  notes/nightly-export.md#What it writes:22-24
  notes/nightly-export.md#The nightly export:10-12
  notes/writer-retries.md#Writer retries:9-10

Top result: notes/nightly-export.md
That is the note about the nightly export. It says when the export
runs and how to restart it. It does not say why a run stops.

4. The agent asks again, three ways, in one call
------------------------------------------------

$ lore search <brain> "nightly export failed" "run stopped partway and reported success" "consumer lease renewal committed offset" --json

  notes/consumer-leases.md#A lease is lost silently:15-22
  notes/consumer-leases.md#How to tell this is what happened:26-28
  notes/oncall-triage.md#A run that reported success:20-22
  notes/consumer-leases.md#Making it less likely:32-34
  notes/writer-retries.md#Writer retries:9-10

Top result: notes/consumer-leases.md
The answering note never uses the words "nightly" or "export", so the
first wording could not reach it. The third one could, and the ranked
lists are fused into the one list above.

5. What the agent received, in full, for that top result
--------------------------------------------------------

{
  "path": "notes/consumer-leases.md",
  "anchor": "A lease is lost silently",
  "startLine": 15,
  "endLine": 22,
  "score": 0.03225806451612903,
  "text": "The renewal interval is thirty seconds. A consumer that spends longer than that\ninside a single batch never gets to renew, and the broker hands the partition\nto somebody else while the first consumer is still working.\n\nNothing raises an error at that moment. The consumer finishes its batch and\ntries to commit an offset it no longer owns, the commit is refused, and the run\nstops at the last offset it did commit. From the outside the job simply stopped\npartway through and reported success."
}

6. What the agent does with it
------------------------------

It reads `text` as the evidence, and cites `path`, `anchor`, and the
line range so the person can open exactly that passage:

  A run can stop partway and still report success — see notes/consumer-leases.md#A lease is lost silently:15-22.

It did not read a whole note to get there, and it did not need one.

And what it must not conclude: nothing here proves the vault is silent
on a question. A score ranks passages against each other. If the
evidence does not settle the question, the agent searches again in
other words, or says the evidence is insufficient.

The temporary brain has been removed. The demo wrote nothing outside it.
```

## What that shows

**One wording finds the wrong note.** `"nightly export failed"` returns four
passages from the note about the nightly export and one about writer retries.
Every one of them is on topic and none of them answers the question, because
the note that does answer it does not contain those words.

**Three wordings find the right one.** Adding `"run stopped partway and
reported success"` and `"consumer lease renewal committed offset"` in the same
call puts `notes/consumer-leases.md` first. The three ranked lists are fused
into one; the agent makes one call, not three.

**The agent gets a passage, not a file.** The top result is eight lines with a
path, a heading anchor, a line range, a score, and the text itself. That is
enough to answer and enough to cite, and the agent did not read a whole note to
get there.

**The agent cites where it came from.** `path`, `anchor`, and the line range
give a person the exact passage to open. Retrieval that cannot be checked is
not much better than a guess.

**And the honest part.** Nothing in that result proves the vault is silent on
anything. A score ranks passages against each other and no more. When the
evidence does not settle a question, the agent searches again in other words;
when it still does not, it says the evidence is insufficient.

## How the agent knew to do any of this

`lore init` writes an `AGENTS.md` into the brain, and that file is the entire
integration surface. It tells a coding agent that the directory is searchable,
gives the exact command, insists on several wordings in one call, names the
five fields a result carries, and states what a score cannot establish.

`AGENTS.md` is a convention read across agent environments rather than by one
vendor, which is why it sits at the brain root where an agent looks without
being told. A path under `.lorekeeper/` would have satisfied the requirement
and been found by nothing.

A vault that already has its own `AGENTS.md` keeps it, byte for byte. `init`
reports the path as occupied and claims nothing — automatic discovery is simply
unavailable in that case, because merging into a file the toolkit does not own
is not something this command may do.

## What the demo is not

It is not a benchmark. It is one question against eight files, chosen to be
readable. The measured figures — how much smaller the payload is than the notes
behind it, and how fast retrieval is at a realistic vault size — come from
recorded measurements over a 3,000-note corpus and live in `proof.md`.
