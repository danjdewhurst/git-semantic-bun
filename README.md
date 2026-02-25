# git-semantic-bun

[![CI](https://github.com/danjdewhurst/git-semantic-bun/actions/workflows/ci.yml/badge.svg)](https://github.com/danjdewhurst/git-semantic-bun/actions/workflows/ci.yml)
[![Licence: MIT](https://img.shields.io/badge/Licence-MIT-yellow.svg)](./LICENSE)
[![Bun](https://img.shields.io/badge/Bun-1.3%2B-black?logo=bun)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

Semantic search for git history, built with Bun.

Stop guessing commit message keywords. Describe what changed in plain English and get the most relevant commits back.

## Why this exists

Traditional git search is lexical:

- `git log --grep "race"` misses commits described as “concurrency”
- `git log -S "mutex"` only works when exact code tokens were used

`git-semantic-bun` indexes commits as embeddings, so queries match **meaning**, not just exact words.

## What you get

- Local-first CLI (`gsb`) with no paid API dependency
- Semantic commit indexing + cosine similarity search
- Incremental updates (`gsb update`) to avoid full reindex every time
- Practical filters (`--author`, `--after`, `--before`, `--file`, `--limit`)
- Transparent index storage at `.git/semantic-index/index.json`

## Install

### Prerequisites

- Bun 1.3+
- Git repository to index

### Local development

```bash
bun install
```

Run directly:

```bash
bun run src/cli.ts --help
```

### Optional global command

```bash
bun link
# then:
gsb --help
```

## Quick start

```bash
# 1) Initialise metadata/cache
gsb init

# 2) Build semantic index from history
gsb index

# 3) Search by meaning
gsb search "fix race condition in auth token refresh"
```

## Commands

### `gsb init`

Initialises semantic index/cache directories and saves model metadata.

### `gsb index [--full] [--batch-size <n>] [--model <name>]`

Indexes commit history into embeddings.

- Default mode indexes commit metadata (hash/author/date/message/files)
- `--full` also includes commit patch text for richer context (slower/larger)

### `gsb search <query> [filters]`

Runs semantic search over indexed commits.

Filters and output controls:

- `--author <name>`
- `--after <date>`
- `--before <date>`
- `--file <path-substring>`
- `-n, --limit <count>`
- `--format <text|markdown|json>`

Output formats:

- `text` (default): human-friendly terminal output
- `markdown`: clean markdown blocks, useful for notes and sharing
- `json`: structured output for piping into scripts and LLM workflows

### `gsb update [--full] [--batch-size <n>]`

Indexes only commits newer than the latest indexed commit.

### `gsb stats`

Shows index count, model, size, and timestamps.

## Examples

```bash
gsb search "refactor payment retry logic"
gsb search "fix flaky parser" --after 2025-01-01 --author dan
gsb search "optimise caching" --file src/core -n 5
gsb search "token refresh race" --format markdown
gsb search "error handling in webhook retries" --format json
```

## Before vs after

Before:

- Manual `git log` digging
- Lots of false positives
- Easy to miss relevant commits with different wording

After:

- Natural-language query
- Relevance-scored results
- Faster recovery of prior fixes and design decisions

## Development

```bash
bun test
bun run typecheck
bun run lint
bun run build
```

## Embedding model options

Default model:

- `Xenova/all-MiniLM-L6-v2` (fast, good general semantic quality)

You can change model with:

- `gsb init --model <model-id>` (sets default in metadata)
- `gsb index --model <model-id>` (one-off override)

Other good options:

- `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (better for multilingual commit/query text)
- `Xenova/all-mpnet-base-v2` (stronger semantic quality, heavier/slower)

Rule of thumb:

- MiniLM for speed
- MPNet for quality
- multilingual MiniLM for mixed-language repositories

## Practical notes

- Everything runs locally.
- First run downloads the embedding model once, then reuses local cache under `.git/semantic-index/cache/`.
- JSON index is transparent and easy to inspect; large repos will produce larger index files.

## Roadmap

- [ ] Optional compact binary index format for very large repos
- [ ] Optional commit diff snippets in search output
- [ ] Multi-model benchmark command
- [ ] Ignore/include path patterns for indexing

## Contributing

PRs are welcome. Please use conventional commits (`feat:`, `fix:`, `docs:`, etc.) and include tests for behavioural changes.

## Licence

MIT — see [LICENSE](./LICENSE).
