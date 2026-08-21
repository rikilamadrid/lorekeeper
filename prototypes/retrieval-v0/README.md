# Prototype: Lorekeeper retrieval v0 probe

**Status: findings APPROVED 2026-08-21 and recorded in
`context/project-overview.md`. The code remains a prototype — evidence only, not
production code, and not to be adopted without an approved Feature.**

## Assumption under test

That deterministic, lexical, metadata-aware, span-level retrieval — with zero LLM
calls and zero embeddings inside Lorekeeper — returns enough relevant context for
an AI agent to continue without the human pasting notes.

## Corpus — a proxy, not a second brain

The two available Obsidian vaults were profiled first and rejected: 44 notes,
~2,300 words, 7 notes over 100 words. Scaffolding, not knowledge. Evaluating
retrieval there would have measured nothing, because ranking is only exercised
under competition between candidates.

The evaluation instead ran against three substantial real Markdown corpora,
deliberately chosen to represent three Lorekeeper knowledge classes:

| Corpus role | Knowledge class |
| --- | --- |
| Learning/technical resource collection | accumulated learning and technical knowledge |
| Architecture decision archive | project architecture, history, decisions |
| Agent skills collection | reusable agent capabilities |

Indexed: **344 files, 2,249 spans, ~191,000 words**, 110 files carrying
frontmatter. The corpora contain genuine near-duplicate competition — the same
documents present in two or three directory trees — which is exactly the
adversarial ranking condition a real vault produces.

**This is a proxy corpus evaluation.** It is evidence about lexical and span
retrieval mechanics over substantial messy Markdown. It is NOT evidence that
personal second-brain retrieval is solved. Rerun this harness against a real
accumulated personal vault as a separate longitudinal validation.

## What is here

- `index.mjs` — span index over arbitrary Markdown, multi-corpus, no frontmatter
  required (adoption, not migration)
- `search.mjs` — BM25 over span text plus a weighted metadata document
  (title, heading trail, tags, aliases, folder); RRF fusion for multi-wording queries
- `evaluate.mjs` — top-1/3/5, failure attribution, context economy, expansion delta

Run: `node evaluate.mjs --vault <path> [--vault <path>...] --questions <file.json>`

## Privacy

The harness reads corpora outside this repository, copies nothing, and emits no
note content unless explicitly passed `--quote`. No corpus content, corpus path,
or note text is recorded in this repository. The question set lives outside the
repo pending approval.

## Method

20 questions were authored **before any search was run**, grounded in the corpora
by surveying file and heading structure, with expected locations verified by
grep. Categories: lexical, conceptual, project, reworded, section-specific,
cross-note, adversarial vocabulary mismatch, and two controls whose answers are
absent from the corpus. Two alternate wordings per question were authored at the
same time, also before seeing results.

Retrieval parameters (BM25 k1=1.2, b=0.75, metadata weight 0.6, 40-line span cap,
RRF k=60) were fixed in advance. **Nothing was tuned against a failing question.**

## Deliberate shortcuts

- No stemming and no lemmatization. Accent folding only. This is under test, not
  a limitation: it isolates vocabulary mismatch as a measurable failure category.
- Relevance is judged by expected file path and regex, not human reading of every
  result. It measures whether the right location surfaced, not answer quality.
- Question authorship is partially contaminated: the questions were written by
  surveying the corpus rather than recalled by its author. Adversarial questions
  were deliberately worded in vocabulary absent from the source to compensate.

## Findings

18 of 20 questions had evidence in the corpus; 2 were absent-answer controls.

| Mode | top-1 | top-3 | top-5 |
| --- | --- | --- | --- |
| Single query | 7/18 (39%) | 10/18 (56%) | 10/18 (56%) |
| Agent-side expansion, 3 wordings fused | 16/18 (89%) | 16/18 (89%) | 17/18 (94%) |

| # | Finding | Result |
| --- | --- | --- |
| 1 | Single-query lexical retrieval | 56% top-3. Not sufficient alone |
| 2 | Agent-issued multi-wording expansion | 56% -> 89% top-3; rescued 7 of 8 misses |
| 3 | Failure attribution | 6 of 8 misses vocabulary-driven, 2 ranking-only |
| 4 | Indexing and span-boundary failures | **0 of 8.** Every relevant span was correctly indexed and bounded |
| 5 | Context economy | 65KB of spans vs 1.09MB of whole files — 94% reduction |
| 6 | Span self-sufficiency | median span 405 chars, 6.5 spans/note; winning spans were coherent, heading-anchored sections |
| 7 | Absent-answer controls | **Not separable by score.** A control scored 13.11 while four genuine hits scored lower |

### Failure attribution detail

Every miss was traced by locating the best relevant span in the full ranked list
and measuring query-term overlap.

| Question kind | Best relevant rank | Term overlap | Cause |
| --- | --- | --- | --- |
| lexical, ambiguous term | 8 | full | ranking |
| conceptual, common words | 52 | 4 low-IDF terms | ranking |
| adversarial | 347 | 1 term | vocabulary |
| adversarial | 91 | 4 low-IDF terms | vocabulary |
| adversarial | 19 | 3 low-IDF terms | vocabulary |
| conceptual | 21 | 2 low-IDF terms | vocabulary |
| reworded | 13 | 1 term | vocabulary |
| procedural code block, 23 duplicates | 107 | 1 term | vocabulary + duplicate IDF dilution |

The frozen location model is vindicated: not one failure was caused by indexing
or span boundaries.

### The one expansion could not rescue

A question asking how to install a skill never retrieved the install command. The
content is a bare code block repeated identically in 23 files; the prose word
"install" appears nowhere near it, and 23 copies crush the IDF of the only shared
term. Procedural boilerplate is the weakest content class for this design, and
expansion only helps when the agent guesses the literal command string.
