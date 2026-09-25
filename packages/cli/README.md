# Lorekeeper

**An AI-native second brain made of plain Markdown files you own.**
Pathfinder finds the way; Lorekeeper remembers the journey.

`LK-047` · a [Wonder Wagon](https://github.com/rikilamadrid/wonder-wagon-ui) tool.

This package installs one command, `lore`: a deterministic, offline CLI that
creates a brain, captures into it, and ranks the passages that answer a
question. It takes no credentials, makes no network call, and calls no language
model.

## Try it

You need **Node.js 24 or newer** on **macOS or Linux**.

```sh
npx create-lorekeeper init my-brain
```

That creates a brain in `./my-brain`: five folders, seven starter files, an
`AGENTS.md` that tells a coding agent how to search it, and a manifest at
`.lorekeeper/manifest.json` recording which files the toolkit owns. Everything
else you put in that directory is yours. Already have a Markdown or Obsidian
vault? Point `init` at it instead. That's adoption, not migration.

## Keep it

Lorekeeper is a tool you call every day, and the `AGENTS.md` it writes tells
agents to run `lore` from your `PATH`. So install it globally:

```sh
npm install -g create-lorekeeper
```

Then:

```sh
lore init ~/brain
lore capture ~/brain "A lease is not a property: a consumer can lose its partition mid-batch"
lore search ~/brain "what does a consumer lose" "partition ownership"
lore search ~/brain "what does a consumer lose" --json --limit 5
lore --help
```

**Give several wordings of one question, each in its own quotes.** Search fuses
their rankings into one list, and three wordings find what one misses. **A score
ranks; it never proves absence.** If the results don't settle your question,
ask again in other words.

## Where v0.1 stops

No LLM call of any kind, no embeddings or semantic search, no MCP server, no
server component, and no Windows support. Retrieval cannot prove that something
is absent, which is why there is no relevance threshold.

## More

- [Repository and full README](https://github.com/rikilamadrid/lorekeeper#readme)
- [Quickstart](https://github.com/rikilamadrid/lorekeeper/blob/main/brand/quickstart.md)
- [What an agent does with a result](https://github.com/rikilamadrid/lorekeeper/blob/main/brand/agent-integration.md)
- [Every published figure and its caveats](https://github.com/rikilamadrid/lorekeeper/blob/main/brand/proof.md)
- [Changelog](https://github.com/rikilamadrid/lorekeeper/blob/main/CHANGELOG.md)

Why is the package called `create-lorekeeper` when the command is `lore`? The
bare name `lorekeeper` on npm belongs to an unrelated project. `npx
create-lorekeeper init my-brain` reads as what it does, and the command you
keep is `lore`.

Licensed MIT.
