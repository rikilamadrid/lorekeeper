# The measured proof

Every number Lorekeeper publishes, where it was measured, and what it does not
claim.

Two rules govern this page, and they are requirements rather than style.

**Nothing here is measured here.** Every figure is copied from a recorded
`## Verification` section of a completed Feature — Feature 07 for the context
saving, Feature 05 for retrieval performance. Nothing was re-run to produce
this page, and no figure appears that does not trace to one of those two
sources.

**Nothing here is stated more confidently than its source stated it.** The
caveats recorded with each measurement travel with the number wherever it goes,
including into a README, a slide, or a docs page. A figure that has been
separated from its caveats is no longer the measurement.

## The context saving

**Source:** Feature 07, `context/features/07-agent-integration-artifact.md`,
`## Verification`. Ticket `07.2`.

**Measured:** 2026-09-17, by `npm run bench:context`, from a clean build.

**Corpus:** 3,000 deterministic synthetic notes at seed `20260917`, 3,193,061
bytes in total, averaging 1,064 bytes each, generated into a temporary
directory and removed. Nothing real, nothing private, nothing committed.

**Machine:** Apple M5, macOS 25.6.0 arm64, Node v26.5.0.

**The call measured** is the one `AGENTS.md` teaches an agent to make: three
quoted wordings, `--json`, default limit. The wordings come from the
generator's own vocabulary, because the synthetic corpus holds no content for
the artifact's illustrative TLS-certificate example to find. What was measured
is the *shape* of the call — several wordings, fused — not those particular
words.

| Measure | Prescribed call | Sensitivity check, `--limit 20` |
| --- | --- | --- |
| Results | 5 | 20 |
| Distinct files behind them | 5 | 18 |
| Whole notes, baseline | 5,604 bytes | 21,034 bytes |
| JSON payload received | 2,847 bytes | 9,985 bytes |
| Span text within it | 1,564 bytes | 5,913 bytes |
| **Saving, payload against whole notes** | **1.97x** | **2.11x** |
| Saving, span text against whole notes | 3.6x | 3.6x |

The average returned span is 313 bytes.

### The headline, and its ceiling

**Approximately 2.0x**, rounded up from the measured **1.97x**. That is the
ceiling on what is published for the prescribed call — not a claim about the
best case, which the generous-baseline caveat below addresses — and it is the
JSON payload against the baseline, because the payload is what a calling agent
actually receives.

Span text is recorded beside it as a diagnostic, not as the headline. It is the
evidence without the addressing that carries it, and no agent ever receives one
without the other.

`npm run bench:context` prints ratios to one decimal, so the measured 1.97x
appears as `2.0x` in its own output, and 2.11x as `2.1x`.

### What the number does not claim

- **Bytes are a proxy for token cost, not a literal token count.** No tokenizer
  and no provider coupling was added to produce these numbers. Anyone quoting
  this as a token saving is quoting something that was not measured.
- **The baseline is deliberately generous.** It charges only for the files the
  returned spans came from, as though the agent had already known which files
  to open. Without span retrieval it would not have known — so 1.97x is a floor
  for the realistic case rather than a best case.
- **The corpus was not lengthened to flatter the result.** Synthetic notes
  average roughly a kilobyte, so a span can only be about 3.4 times smaller
  than the note holding it. A vault of longer notes would show a larger saving,
  and the corpus was left as it was rather than tuned toward one.
- **The payload is pretty-printed**, which is 12% of its bytes. Compact JSON
  would read 2.2x. The output format is a `05.1` contract and was not changed
  to improve this number.

The saving is real and modest, and it is reported as measured rather than as
improved.

## Retrieval performance

**Source:** Feature 05, `context/features/05-span-index-and-search.md`,
`## Verification`. Ticket `05.3`.

**Measured:** 2026-09-17, by `npm run bench:search`, from a clean build, over a
deterministic synthetic corpus the command generates into a temporary directory
and removes. Nothing generated is committed and nothing is read from a real
vault.

| Measure | Value |
| --- | --- |
| Notes | 3,000 (seed `20260917`) |
| Spans | 10,537 |
| Corpus | 3,193,061 bytes; 907 paragraphs duplicated across files |
| Walk + read + split | 81 ms |
| Build index | 64 ms |
| Query, one wording | 2.3 ms median of 20 |
| Query, three wordings fused and suppressed | 6.9 ms median of 20 |
| `lore search` end to end, three wordings, `--json` | 129 ms median of 20 |
| Machine | Apple M5, 24 GiB, macOS 25.6.0 arm64, Node v26.5.0 |

The honest headline is the last row: **a fused three-wording search over 3,000
notes completes end to end in about 130 ms**, including building the whole
in-memory index from scratch, because there is no index file and none is kept
between commands.

### What the number does not claim

- **"Interactive" is an interpretive reading, not an acceptance threshold.**
  Feature 05 read the overview's performance target as a fused three-wording
  search, index build included, finishing inside two seconds — the round trip
  an agent tool call tolerates. That reading was recorded as a reading. The
  measured result sits roughly fifteen times inside it.
- **One machine, one corpus, one shape of note.** These are medians of twenty
  runs on an Apple M5 over generated notes, not a survey of real vaults on real
  hardware.
- **Building the index every time is a measured decision, not an oversight.**
  At this size, persisting it would save roughly 150 ms and cost a
  manifest-owned file. Revisit only on a corpus where the walk and index
  phases, which scale with the vault, approach the reading.

## What has not been measured

Recorded so that the gaps are visible rather than inferred.

- **No measurement over a mature personal second brain.** This is a recorded
  evidence boundary: the retrieval prototype was validated over substantial
  real-world Markdown project corpora, not over a populated personal brain. The
  real vaults available at the time were far too small to exercise ranking and
  were rejected for that reason, so the real-vault evidence base behind this
  project is very small and supports no quantitative claim at all. Proxy
  corpora under-represent note-to-note conceptual linking and dictated
  fragments.
- **No token-level measurement.** See the proxy caveat above.
- **No measurement of answer quality end to end**, with a real agent, on real
  questions. What is measured is what the retrieval layer returns and what it
  costs to return it.

## Reusing these figures

If you quote a figure from this page anywhere — README, docs site, slide,
social post — carry three things with it: the measurement date, the corpus, and
the caveat that applies to that specific number. The proxy caveat travels with
every byte figure. The generous-baseline and pretty-printed caveats travel with
the saving. The interpretive-reading caveat travels with the performance
figures.

If a new figure is wanted, re-run `npm run bench:context` or
`npm run bench:search` and record the result in the relevant Feature's
`## Verification` section first. This page presents measurements; it does not
make them.
