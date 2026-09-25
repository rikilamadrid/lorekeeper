# Project Overview

Durable, project-wide context.

Keep this concise. Feature scope, active work, history, and temporary
planning belong elsewhere.

Two words keep an unmade decision visible:

- `TBD` — a human decision is still required
- `None` — considered and intentionally excluded

Leave nothing blank. A blank field is indistinguishable from an abandoned one.

## Project

- Name: `Lorekeeper` — companion product to `Pathfinder`. Pathfinder finds the way; Lorekeeper remembers the journey. The CLI binary name is `lore`, resolved 2026-08-21.
- Stage: `idea`
- Repo type: `monorepo` — smallest sensible shape: `apps/docs`, `packages/cli`, `packages/core`. Split further only when a real boundary requires it
- Primary goal: A person's durable knowledge, and the AI capabilities they work with, live in plain Markdown files they own, and both a human and their coding agents can retrieve exactly the relevant part on demand.

## Product

- Problem: Knowledge accumulated across notes, videos, articles, and AI conversations is not retrievable when it is needed. Agent users re-paste the same context repeatedly; note-takers pile up notes they never find again. Existing answers require becoming an expert in a specific application first, and couple the knowledge to that application.
- Primary user: A developer who already uses coding agents (Claude Code and similar) and wants accumulated knowledge and reusable agent capabilities retrievable by those agents without manual pasting. The non-expert knowledge worker is an explicit later audience, not a v0.1 audience.
- First useful outcome: A generated or adopted brain plus a working `lore search` that an agent invokes to answer a question from the user's own notes instead of asking the user to supply context.
- Distinctive quality: Durable, machine-readable provenance from source artifacts to synthesized knowledge, over plain Markdown, with a deterministic retrieval layer that requires no AI vendor. Identity evokes folklore, accumulated wisdom, maps and exploration, constellations and connection, field journals, archival knowledge, and subtle mysticism, expressed through modern developer tooling.
- Avoid becoming: An Obsidian template bundle; a vault-shaped dumping ground of transcripts; a one-time scaffold that cannot be updated; a system that stops working when an AI provider changes. In identity terms, avoid a generic productivity app, an "AI brain" gimmick, cyberpunk or neon AI styling, a clone of Pathfinder, or a clone of any existing second-brain project.

## Scope

### In

- Generate a brain: thin folder set plus validated frontmatter schema.
- `lore capture` — deterministic, self-describing capture into the inbox.
- `lore search` — lexical, metadata-aware, span-level retrieval. One retrieval concept in v0.1.
- Source → knowledge provenance contract, expressed in frontmatter.
- Managed manifest recording toolkit-owned vs user-owned files, and `lore update` honoring it.
- Adoption of an existing Markdown or Obsidian vault: read and index arbitrary Markdown, manage only manifest-owned files, never migrate.
- Minimal agent-facing integration artifact so a calling agent knows Lorekeeper is available and how to query it.
- Public documentation website shipped as an installable PWA, docs-first and narrow: thesis, concepts, installation, quick start, knowledge structure, capture, retrieval, existing-vault adoption, agent integration, provenance concepts, CLI reference, troubleshooting.
- Obsidian-compatible output, with Obsidian treated as an optional viewer.

### Out

- Any LLM call from the CLI in v0.1.
- Embeddings, vector index, or semantic search in v0.1.
- MCP server in v0.1 — deferred as an adapter over the same retrieval core.
- Mobile capture, PWA access to private brain data, and any server component.
- Automated ingestion of YouTube, web pages, newsletters, or email in v0.1.
- Capability sync into `~/.claude/skills` in v0.1 — architecture must not preclude it.
- Non-expert onboarding flows and GUI configuration.
- Automatic migration, rewriting, or restructuring of an existing user's notes.
- Docs PWA features requiring user data: authentication, cloud sync, mobile brain browsing, private capture synchronization, dashboards.
- Windows support at v0.1.
- Proactive or autonomous multi-agent behavior; the `Act` stage of the lifecycle.
- Any user private data in this repository, ever.

## Requirements and Open Decisions

Record only what constrains the work. An open decision stays `TBD` until a
human resolves it.

| Type | Item | Notes |
| --- | --- | --- |
| Requirement | Local-first; the brain is plain Markdown files the user owns | No proprietary storage, no required network |
| Requirement | This repository never contains a user's private brain | Enforced by generation target being outside the repo |
| Requirement | v0.1 CLI makes zero LLM calls | Intelligence comes from the agent invoking the CLI |
| Requirement | Provenance between source artifacts and synthesized notes is machine-readable | Frontmatter fields, validated |
| Requirement | FROZEN v0.1 contract: provenance edges point from the derived artifact to its origin | Inverse edges are never stored; backlinks are computed |
| Requirement | FROZEN v0.1 contract: provenance edges resolve by stable source ID | Not by filename or path |
| Requirement | FROZEN v0.1 contract: missing `derived_from` means unknown or unrecorded, never original | Applies to tool-created and hand-written files alike |
| Requirement | FROZEN v0.1 contract: provenance is mutated only through deterministic tested operations | No agent hand-editing of YAML |
| Requirement | FROZEN v0.1 contract: mutations are idempotent and representation-preserving | Verified by minimal-diff and repeat-run tests |
| Requirement | FROZEN v0.1 contract: sources require stable IDs; ordinary notes do not | Prototype found no note that needed one |
| Requirement | FROZEN v0.1 contract: the retrieval index addresses locations and spans, not merely files | `path#anchor` plus line range |
| Requirement | FROZEN v0.1 contract: `type` is not a retrieval primitive | Browsing ergonomics only; retrieval correctness must not depend on it |
| Requirement | FROZEN v0.1 contract: source URL identity supports per-domain normalization rules | Generic tracking-param filtering alone is insufficient |
| Requirement | FROZEN v0.1 contract: YouTube is the only domain-specific identity rule required for v0.1 | Architecture stays extensible; do not add unsupported domains |
| Requirement | FROZEN v0.1 contract: name-based links resolve with a documented H1 and alias fallback | Rename fragility outside Obsidian is not knowingly accepted |
| Requirement | Meaning lives in frontmatter, not in file path | Reorganizing folders must not break retrieval |
| Requirement | Updates never silently overwrite user-edited files | Managed manifest; report drift instead |
| Requirement | Agents retrieve scoped results, not whole-vault dumps | Retrieval returns ranked excerpts with paths |
| Requirement | One retrieval concept in v0.1: `search` | Resolved 2026-08-21. Do not add a second retrieval command without evidence of meaningfully different behavior |
| Requirement | `search` accepts multiple alternate wordings and fuses the ranked lists | First-class v0.1 capability. RRF unless a later Feature produces better evidence |
| Requirement | Every search result exposes path, anchor or location, line span range, score, and the retrieved span text | The calling agent cannot assess evidence it cannot see |
| Requirement | The agent-facing integration artifact instructs agents to issue multiple wordings | Part of the retrieval contract, not an optimization |
| Requirement | Near-duplicate suppression is part of v0.1 retrieval behavior | Duplicate content dilutes IDF and crowds the result list |
| Requirement | No absolute relevance cutoff | Score cannot separate present from absent knowledge; a threshold would manufacture false confidence |
| Requirement | KNOWN v0.1 LIMITATION: retrieval score cannot prove requested knowledge is absent | The agent treats retrieved context as evidence to assess, may reformulate and search again, and may conclude the evidence is insufficient |
| Requirement | Adoption, not migration: read/index arbitrary Markdown, manage only manifest-owned files | Resolved 2026-08-21. Lorekeeper never rewrites a user's notes to make them conform |
| Requirement | Existing notes without Lorekeeper frontmatter remain valid indexable knowledge | Missing provenance means unknown or unrecorded, per the frozen contract |
| Requirement | v0.1 ships a minimal agent-facing integration artifact | Resolved 2026-08-21. Deliberately small; not a general agent-adapter framework |
| Requirement | v0.1 ships the docs PWA as a real public installable site, docs-first | Resolved 2026-08-21. Explicit product requirement; narrow content scope recorded in Scope |
| Requirement | Supported platforms at v0.1 are macOS and Linux; Windows is out of scope | Resolved 2026-08-21. Use platform-neutral path and filesystem APIs anyway; add no Windows-specific work now |
| Requirement | Unprocessed inbox items are still useful | Captures are self-describing and greppable on arrival |
| Preference | Obsidian works well out of the box, with minimal plugins | Interface, not architecture |
| Preference | Architecture stays portable across agent environments | Adapter shape, not Claude-only |
| Constraint | Solo maintainer at v0.1 | Scope and tooling must stay proportionate |
| Constraint | Sync provider must remain swappable | iCloud, Obsidian Sync, Git all viable; none assumed |
| Requirement | Product name is Lorekeeper; identity direction is recorded in Durable Decisions | Resolved 2026-08-21 |
| Requirement | The CLI binary name is `lore` | Resolved 2026-08-21. Replaces the `brain` placeholder |
| Open decision | Command vocabulary below the binary name | `TBD` — the subcommand names are not settled; do not rename them as a side effect of other work |
| Requirement | Visual identity: mark, wordmark, palette, typography, and the token source | Resolved 2026-09-18 by Feature 09, ticket 09.1. Approved as proposed in `brand/IDENTITY.md`; see Durable Decisions. `brand/tokens/tokens.json` is the source of truth and nothing downstream hard-codes a value it defines |
| Open decision | CLI voice | `TBD` — direction recorded, design deliberately not started |
| Open decision | Whether internal domain vocabulary adopts lore terminology | `TBD` — terminology must earn its place; do not rename concepts merely to match the product name |
| Open decision | Mobile capture path under local-first | `TBD` — spike required; see Durable Decisions |
| Requirement | `system/` is neither created nor reserved in the v0.1 generated structure | Resolved 2026-08-27 by Feature 03. An empty reserved folder shipping no tooling is a promise with no delivery behind it |
| Requirement | Ranking model for v0.1: BM25 over span text plus a weighted metadata document | Resolved 2026-08-21 by prototype `retrieval-v0`. Ranking is not a separate v0.1 Feature |
| Open decision | Whether `derived_from` spans note-to-note or only source-to-note in v0.1 | `TBD` — note-to-note would require IDs on hand-written notes |
| Open decision | PROVISIONAL vocabulary: `about` | Ships in v0.1, semantics deliberately unfrozen. Additive structural-aboutness override, never a required mirror of body wikilinks. Retrieval correctness must not depend on it. Reevaluate after real usage |
| Open decision | PROVISIONAL vocabulary: `type` values | The set of values is unfrozen; the contract that `type` is not a retrieval primitive is frozen |
| Open decision | PROVISIONAL vocabulary: `kind` values | Free string, unvalidated in v0.1 |
| Open decision | PROVISIONAL vocabulary: any metadata not required by a frozen contract | Appearing in a prototype fixture does not freeze a field. `title_hint` was invented during fixture writing and is rejected |
| Open decision | How strict `doctor` validation may be | `TBD` — warnings-only is the current lean |

## System

Record only important project-wide architecture and constraints.

- Architecture: A deterministic Node CLI operating on a directory of Markdown files with validated YAML frontmatter. A shared schema package defines the contracts and is consumed by both the CLI and the docs site. A separate static docs PWA documents the product and holds no brain data. Three cleanly separated surfaces: public toolkit repository, private generated brain, public documentation site.
- Main components: `cli` (capture, search, init, update); `schema` (frontmatter contracts, validation, managed manifest format); `templates` (generated brain structure); `docs-pwa` (static documentation, installable).
- Constraints: The CLI must run offline with no credentials. The generated brain must remain valid Markdown readable without any tooling. Managed and user-owned files must be distinguishable before any write. Writes must preserve user-authored Markdown and frontmatter representation; reads may parse freely.

Conceptual lifecycle, with the v0.1 boundary marked:

```text
CAPTURE -> ORGANIZE -> CONNECT -> THINK -> ACT
[--------- v0.1 target ---------]   [-- later --]
```

Provenance chain the schema must preserve:

```text
external artifact -> sources/ (raw + provenance) -> notes/ (synthesized) -> entities/ (projects, areas, people)
```

## Technology

The stack an agent must follow rather than choose. Keep the rows this project
actually has.

| Layer | Choice | Reason |
| --- | --- | --- |
| Platform/runtime | Node.js LTS | `npx` distribution, zero install friction |
| Language(s) | TypeScript | One language across CLI, schema, and web surface |
| UI/presentation | Static docs site as installable PWA; framework `TBD` | First-class docs surface; no private data |
| Backend/application | `None` | v0.1 has no server |
| Data storage and access | Plain Markdown files with YAML frontmatter on local disk | Durability and user ownership |
| Auth | `None` | No accounts, no server |
| Testing | Vitest | Runs per package and from the root over npm workspaces |
| Build and package tooling | npm workspaces | Three packages, one lockfile, no extra tooling layer |

## Commands

The commands an agent runs to verify its own work.

```text
install: npm ci
run/dev: no dev server; `npm run build` then `lore --help`
test: npm test
lint/static analysis: npm run lint
build/package: npm run build
```

## Delivery Workflow

| Area | Choice |
| --- | --- |
| Git workflow | Trunk-based; one short-lived branch per ticket |
| Default branch | `main` |
| Branch naming | `ticket/<NN.TT>-<slug>` for ticket delivery, e.g. `ticket/03.1-init-managed-manifest`; `fix/<slug>` for unplanned bugfix work outside normal ticket delivery |
| Commit convention | Conventional Commits |
| Review policy | Pull request per ticket; self-merged while solo, for a reviewable record |
| Merge strategy | Squash merge |
| CI/CD | Required on pull request: install, lint, test, build |
| Versioning and changelog | Semver; changelog maintained from Conventional Commits |
| Release process | npm, one public package `create-lorekeeper` (bin `lore`), with the private `@lorekeeper/core` inlined into `dist/lore.js` at pack time; `yaml` is the only runtime dependency. `CHANGELOG.md` is the version's source of truth; `.github/workflows/release.yml` (manual dispatch on `main`, npm trusted publishing with provenance, registry readback, then annotated `vX.Y.Z` tag and GitHub Release). The first publication of `0.1.0` is a one-time human bootstrap — **pending** — see `RELEASING.md` |

## Environments and Integrations

| Area | Choice | Notes |
| --- | --- | --- |
| Local development | Node LTS, npm workspaces | No services required |
| Preview/staging | `TBD` | Docs site preview deploys expected |
| Production | `TBD` | Docs site hosting and npm registry |
| Configuration and secrets | `None` in v0.1 | CLI takes no credentials by design |
| External services/APIs | `None` in v0.1 | Deliberate; see Requirements |

## Quality Priorities

Rank only what matters for this project, highest first.

1. Data safety — never lose or silently overwrite a user's notes
2. Privacy — no private content leaves the machine
3. Correctness of the schema and provenance contracts
4. Onboarding and documentation quality
5. Retrieval usefulness
6. Performance

| Concern | Target or decision |
| --- | --- |
| Correctness/reliability | Writes are additive or manifest-guarded; every destructive path requires confirmation |
| Security/privacy | No network calls from the CLI in v0.1; no telemetry; no private data in this repository |
| Accessibility | Docs PWA meets WCAG 2.1 AA |
| Performance | Retrieval stays interactive on a vault of a few thousand notes |
| Supported platforms | macOS and Linux at v0.1; Windows explicitly out of scope |

## Durable Decisions

Decisions that outlive a Feature, including approved prototype direction and
anything a prototype proved must not reach production.

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-08-21 | v0.1 targets developers already using coding agents, not non-expert knowledge workers | One wedge; the non-expert product is a later layer over a proven core |
| 2026-08-21 | Knowledge and retrieval is the v0.1 spine; capability sync deferred | Human choice, overriding a capabilities-first recommendation |
| 2026-08-21 | Rejected numbered PARA folders as the taxonomy | Numeric prefixes exist to force viewer sort order; encoding a viewer concern as architecture contradicts the Obsidian-is-an-interface principle |
| 2026-08-21 | Thin stable folders carry epistemic role; frontmatter is authoritative for type, status, provenance, and links | Retrieval must survive folder reorganization |
| 2026-08-21 | CLI makes zero LLM calls in v0.1 | Makes "AI-native but not AI-dependent" literally true; no keys, no cost, no vendor, deterministic tests |
| 2026-08-21 | Lexical retrieval only; no embeddings in v0.1 | A few thousand Markdown files are well within lexical search; semantic search adds a stateful, costly dependency for little gain at this size |
| 2026-08-21 | CLI first; MCP is a later adapter over the same retrieval core | MCP is a transport, not an architecture, and the CLI is testable without an agent in the loop |
| 2026-08-21 | Starter updates use a managed manifest of toolkit-owned vs user-owned files | Update propagation is the difference between a kit and a one-time scaffold, and it constrains layout from day one |
| 2026-08-21 | Docs site ships as an installable PWA holding no private brain data | Docs are a product surface; mobile access to brain data waits on the sync spike |
| 2026-08-21 | Monorepo with a shared schema package | Prevents schema drift between CLI and docs site |
| 2026-08-21 | MIT license | Maximizes adoption and forking, which is what a starter kit wants |
| 2026-08-21 | Mobile capture identified as an unresolved architectural risk | A PWA on a phone cannot write to a local folder; the real path is a sync provider or share-sheet drop. Spike before designing the mobile surface |
| 2026-08-21 | Product name is Lorekeeper | Companion to Pathfinder from the same creator: Pathfinder finds the way, Lorekeeper remembers the journey. Pathfinder is movement, direction, and execution; Lorekeeper is memory, provenance, and connection. Spiritual siblings, clearly distinct products |
| 2026-08-21 | Identity direction: folklore, accumulated wisdom, maps and exploration, stars and constellations, archival knowledge, field journals, subtle mysticism, modern developer tooling | Recorded as direction only. Visual design deliberately not started; naming must not consume architecture time |
| 2026-08-21 | CLI binary name resolved as `lore` | Supersedes the earlier decision to keep the `brain` placeholder. Command vocabulary below the binary name remains a separate, unresolved decision and must not be changed as a side effect |
| 2026-08-21 | Domain vocabulary does not adopt lore terminology by default | Terminology earns its place by clarity, not by matching the product name |
| 2026-08-21 | Provenance and aboutness are two distinct edge types, not one chain | `derived_from` is immutable historical fact resolved by ID; `about` is mutable judgment resolved by name. Collapsing them into `source -> note -> entity` was a category error |
| 2026-08-21 | Edges point from the derived artifact to its origin; inverse edges are never stored | Storing children causes write amplification, sync merge conflicts, and a second copy of the truth. Backlinks are computed by the index |
| 2026-08-21 | Absence of `derived_from` never implies original authorship | Absence means unknown or unrecorded, in tool-created and hand-written files alike. If distinguishing original human thought becomes useful, model it explicitly rather than giving silence hidden semantics |
| 2026-08-21 | `about` is additive to body wikilinks, never a mirror of them | A mirror would duplicate derivable content. `about` records deliberate structural aboutness that prose does not already make obvious |
| 2026-08-21 | Provenance edges are mutated only through tested deterministic operations | An agent hand-editing YAML is the most likely source of silent corruption. Exact command vocabulary is not frozen |
| 2026-08-21 | The index addresses locations (file plus heading or block anchor), not files | Dictated capture produces many thoughts per session; retrofitting block granularity into a path-only index is a rewrite |
| 2026-08-21 | `type` is browsing ergonomics, not a load-bearing retrieval primitive | The claim-versus-thing distinction is not reliably decidable by a human or a deterministic CLI, so retrieval quality must not depend on it |
| 2026-08-21 | URL normalization for deterministic source IDs must be specified before the first source is written | Unnormalized URLs split one source into several and silently break dedup and provenance |
| 2026-08-21 | Frontmatter is flat; nothing mandatory on read; schema evolution is additive-only and preserves unknown fields | Nested YAML is unhand-editable and unsupported by Obsidian Properties. A tool that strips unrecognized fields is the real corruption risk |
| 2026-08-21 | Reads never derive meaning from file path; writes use paths by convention | Lets the folder set change later without a migration |
| 2026-08-21 | Cut `archive/` as a folder | Archiving is a status, and moving files is the operation the reorganization principle exists to protect against |
| 2026-08-21 | APPROVED from prototype `schema-v0`: writes must preserve user-authored representation | Object YAML round-tripping altered 16/16 fixture files: local timestamps silently rewritten to UTC, inline arrays restructured to block style, comments dropped, quoting normalized. Surgical line-level editing round-tripped 16/16 byte-identically. This is not a ban on YAML parsers — parsing for reads is fine; the constraint is on writes |
| 2026-08-21 | Deterministic mutations are tested for minimal diff and idempotency | Prototype `link` produced a single inserted line and changed nothing on a repeat run |
| 2026-08-21 | `about` ships in v0.1 as provisional, with semantics unfrozen | The prototype's `about` test was contaminated — fixtures were authored by the same person holding the hypothesis. No fixture can settle this; it needs months of real writing |
| 2026-08-21 | Name-based link resolution gains an H1 and alias fallback | Renaming two fixture files broke 2 of 4 name-resolved edges while 8 of 8 ID-resolved edges survived. All breaks were recoverable via H1 title |
| 2026-08-21 | URL identity is per-domain, not a generic parameter blocklist | Generic tracking-param filtering failed to dedupe `&list=` and `&index=`, which are not tracking params but do not change which video is identified. A YouTube identity rule collapsed five variants to one while leaving a meaningful `?page=2` intact |
| 2026-08-21 | Prototype `prototypes/schema-v0/` is preserved as evidence | Fixtures and tests document why these contracts were chosen. Prototype code is disposable and must not be adopted without an approved Feature |
| 2026-08-21 | APPROVED from prototype `retrieval-v0`: deterministic lexical span retrieval is accepted for v0.1, conditional on agent-side query expansion | Single-query lexical reached 56% top-3 over 2,249 spans of real Markdown, which is not shippable alone. Three fused wordings reached 89% top-3 and 94% top-5. Lexical is credible because the agent supplies the semantics, not on its own merits |
| 2026-08-21 | Multi-query search is a first-class v0.1 capability, fused with RRF | The single highest-value behavior the prototype found: expansion rescued 7 of 8 misses, including one that ranked 347th on a single query and 1st after fusion. Replace RRF only on better evidence |
| 2026-08-21 | The agent-facing integration artifact must instruct agents to use query expansion | This instruction is the difference between 56% and 89% top-3. It is part of the core retrieval contract; an agent issuing one wording gets a materially worse product |
| 2026-08-21 | Search results expose path, anchor, line span range, score, and span text | Judgment lives in the calling agent by design, and an agent cannot weigh evidence whose provenance and strength are hidden from it |
| 2026-08-21 | The frozen span/location indexing model is validated; do not reopen file-versus-span indexing without new evidence | Zero of eight retrieval failures were caused by indexing or span boundaries. Median span was 405 characters and winning spans were coherent heading-anchored sections. Span retrieval also returned 94% fewer bytes than the same files whole |
| 2026-08-21 | Near-duplicate suppression belongs in v0.1 retrieval behavior | Measured harm, not theory: content duplicated across 23 files crushed the IDF of its only distinctive term and left the answer at rank 107, the one failure query expansion could not rescue |
| 2026-08-21 | No absolute relevance cutoff in v0.1 | An absent-answer control scored 13.11 while four genuine hits scored lower. Score does not separate present from absent knowledge, so any threshold would convert an honest miss into false confidence |
| 2026-08-21 | KNOWN v0.1 LIMITATION: Lorekeeper cannot deterministically prove requested knowledge is absent from retrieval score alone | Recorded rather than hidden. The calling agent treats retrieved context as evidence to assess, not proof that the answer is present; it may reformulate and search again, or conclude the evidence is insufficient |
| 2026-08-21 | The zero-LLM and zero-embedding architecture remains accepted for v0.1 | Embeddings would attack the vocabulary mismatch that agent expansion already largely solves, and would not have helped the two ranking failures or the duplicated-boilerplate case. Do not add embeddings or model calls without evidence that deterministic retrieval plus agent expansion is inadequate |
| 2026-08-21 | EVIDENCE BOUNDARY: `retrieval-v0` validates retrieval mechanics over substantial real-world Markdown project corpora, not over a mature personal second brain | The two available vaults held 44 notes and ~2,300 words and were rejected as unable to exercise ranking. The proxy corpora under-represent note-to-note conceptual linking and dictated fragments. Rerun the same harness against a populated real brain as longitudinal validation |
| 2026-08-21 | Prototype `prototypes/retrieval-v0/` is preserved as evidence; its private evaluation question set stays out of the repository | The question set encodes paths into private corpora. Prototype code is disposable and must not be adopted without an approved Feature |
| 2026-08-21 | v0.1 has one retrieval concept, `search` | Two commands with an undefined boundary is how CLIs get confusing. A second command must be earned by evidence of different behavior, not anticipated |
| 2026-08-21 | Existing-vault support is adoption, not migration | Read and index arbitrary Markdown; manage only manifest-owned files; never rewrite a user's notes to conform. Rewriting someone's vault to suit the tool is the clearest possible violation of the data-safety priority |
| 2026-08-21 | v0.1 ships a minimal agent-facing integration artifact | Retrieval that never fires delivers nothing, and an agent only calls the CLI if something in its context says to. Kept deliberately small — a generated snippet or one small skill — and explicitly not a general agent-adapter framework |
| 2026-08-21 | The docs PWA stays in v0.1, docs-first and narrow | Explicit product requirement, overriding a debate recommendation to cut it. It documents the product; it is not the user's brain UI, and it touches no private data |
| 2026-08-21 | Monorepo retained, in the smallest sensible shape | Two real v0.1 product surfaces justify it. `apps/docs`, `packages/cli`, `packages/core`; no further fragmentation without a real boundary |
| 2026-08-21 | Windows is out of scope for v0.1; macOS and Linux are supported | A scope decision, not a licence for sloppy paths. Use platform-neutral Node APIs so later support is not made harder, but add no Windows-specific work now |
| 2026-08-21 | Rejected the `title_hint` field | Invented while writing fixtures and justified nothing. Recorded as a reminder that fixture presence does not justify a field |
| 2026-09-18 | Visual identity approved: a four-point celestial star enclosed in a ring, a drawn inscriptional-capitals wordmark and its lockups, light and dark palettes, and an old-style serif display over a system-sans body and UI stack | Approved by the human from the proposal in `brand/IDENTITY.md`, resolving the visual-identity half of the 2026-08-21 open decision. The framework-neutral source of truth is `brand/tokens/tokens.json`, with `brand/tokens/tokens.css` generated from it and every text and meaningful-UI pair measured against WCAG 2.1 AA in `brand/CONTRAST.md`. No typeface is shipped or fetched. The CLI voice half of that decision remains open and is outside Feature 09 |
| 2026-09-25 | `esbuild` 0.28.2 approved as a build-time devDependency of `create-lorekeeper` | Approved by the human (Atelier Feature 08, decision D-b) after verification: declared only in `packages/cli` `devDependencies`; used only by `scripts/bundle.mjs` to inline the private `@lorekeeper/core` into `dist/lore.js`; the packed `create-lorekeeper@0.1.0` (sha1 `3ef401e3…`) ships four files, imports only `node:*` and `yaml`, and declares `yaml` as its one runtime dependency; an isolated global install requests `yaml` and nothing under `@lorekeeper/*`. Development keeps the workspace boundary: core stays `private`, the CLI source imports it by name through the workspace link, 719/719 tests. Not a licence to add runtime dependencies |

## Learning

- What the human wants to understand: `None` recorded yet
- Preferred lesson format: `TBD`
