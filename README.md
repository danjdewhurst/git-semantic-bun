# git-semantic-bun

`git-semantic-bun` is a local-first semantic git history search CLI built with Bun + TypeScript.

- CLI package: `git-semantic-bun`
- Binary command: `gsb`
- Embeddings: local open model via `@xenova/transformers` (`feature-extraction`)
- Index file: `.git/semantic-index/index.json`

## Features

- `gsb init`: verifies git repo and initializes semantic index/cache directories
- `gsb index`: indexes commit history into embeddings (`--full` optionally includes full patch text)
- `gsb search <query>`: semantic search with cosine similarity
- `gsb update`: incrementally indexes commits newer than the latest indexed hash
- `gsb stats`: index metadata and size overview

Search filters:

- `--author <name>`
- `--after <date>`
- `--before <date>`
- `--file <path-substring>`
- `-n, --limit <count>`

## Install

### Local development

```bash
bun install
```

Run directly:

```bash
bun run src/cli.ts --help
```

### Optional global command via Bun link

```bash
bun link
# then use:
gsb --help
```

## Usage

Initialize repository metadata/cache:

```bash
gsb init
```

Build full semantic index:

```bash
gsb index
```

Include full patch content in embeddings:

```bash
gsb index --full
```

Search:

```bash
gsb search "fix flaky parser for merge commits"
```

Search with filters:

```bash
gsb search "optimize performance" --author "alice" --after 2025-01-01 --file src/core -n 5
```

Incremental update:

```bash
gsb update
```

Show stats:

```bash
gsb stats
```

## Scripts

```bash
bun run test
bun run typecheck
bun run lint
bun run build
```

## Practical Notes

- Everything runs locally. No paid API dependencies are used.
- First embedding run downloads the selected model once, then reuses local cache under `.git/semantic-index/cache/`.
- `--full` gives richer semantics but can be substantially slower and produces larger index files.
- Medium-size repos are handled with batch embedding and progress output.
- The index stores vectors in JSON for transparency; very large histories will increase `.git/semantic-index/index.json` size.

## Troubleshooting

- `Error: not a git repository`:
  Run commands from inside a git repo.
- `Index is empty` / `No index found`:
  Run `gsb index` first.
- Slow first run:
  Model download + initial embedding generation is expected.
