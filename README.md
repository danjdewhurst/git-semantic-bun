# git-semantic-bun

[![CI](https://github.com/danjdewhurst/git-semantic-bun/actions/workflows/ci.yml/badge.svg)](https://github.com/danjdewhurst/git-semantic-bun/actions/workflows/ci.yml)
[![Licence: MIT](https://img.shields.io/badge/Licence-MIT-yellow.svg)](./LICENSE)

Local semantic search for git history, built with Bun.

Describe what changed in plain English and retrieve relevant commits by meaning, not just exact keywords.

## Install

### Prebuilt binaries (recommended)

Download the latest release asset for your platform:

- <https://github.com/danjdewhurst/git-semantic-bun/releases>

### Install directly from GitHub with Bun (no npm)

```bash
bun add -g github:danjdewhurst/git-semantic-bun

gsb --help
```

### Local development

Requirements:

- Bun 1.3+
- a git repository

```bash
bun install
bun run src/cli.ts --help
```

Optional global link:

```bash
bun link
gsb --help
```

## Quick start

```bash
gsb init
gsb index
gsb search "fix race condition in auth token refresh"
```

## Commands

### `gsb init`

Initialises semantic index/cache directories and writes model metadata.

### `gsb index`

Builds semantic index from git history.

Key options:

- `--full`
- `--model <name>`
- `--batch-size <n>`
- `--include <glob>` (repeatable)
- `--exclude <glob>` (repeatable)
- `--vector-dtype <f32|f16>`

Notes:

- `.gsbignore` patterns are applied automatically when present.
- `f32` is default; `f16` reduces vector storage size.

### `gsb search <query>`

Runs semantic search over indexed commits.

Filters:

- `--author <name>`
- `--after <date>`
- `--before <date>`
- `--file <path-substring>`
- `-n, --limit <count>`

Ranking/output controls:

- `--semantic-weight <0..1>`
- `--lexical-weight <0..1>`
- `--recency-weight <0..1>`
- `--no-recency-boost`
- `--explain`
- `--format <text|markdown|json>`
- `--min-score <score>`
- `--snippets`
- `--snippet-lines <count>`

### `gsb update`

Incrementally indexes commits newer than the latest indexed commit.

Supports the same index shaping options as `gsb index`:

- `--full`
- `--batch-size <n>`
- `--include <glob>` / `--exclude <glob>`
- `--vector-dtype <f32|f16>`

Includes rewritten-history safety checks (rebase/force-push detection + recovery window).

### `gsb stats`

Shows index and vector stats (size, dtype, timestamps, load time).

### `gsb doctor`

Checks index health and metadata/cache readiness.

- `--fix` performs safe, non-destructive repairs where possible.

### `gsb benchmark [query]`

Benchmarks ranking path (baseline full-sort vs heap top-k).

- `--save` appends to `.git/semantic-index/benchmarks.jsonl`
- `--history` prints recent benchmark runs

## Storage layout

Primary files under `.git/semantic-index/`:

- `index.json`
- `index.meta.json`
- `index.vec.f32` or `index.vec.f16`
- `cache/`
- `benchmarks.jsonl` (if benchmark history is enabled)

## Examples

```bash
gsb search "refactor payment retry logic"
gsb search "fix flaky parser" --after 2025-01-01 --author dan
gsb search "optimise caching" --file src/core -n 5
gsb search "token refresh race" --format markdown --explain
gsb search "error handling in webhook retries" --format json --min-score 0.35
```

## Development

```bash
bun run lint
bun run typecheck
bun test
bun run build
```

## Docs

- Current roadmap: [ROADMAP.md](./ROADMAP.md)
- Docs index: [docs/README.md](./docs/README.md)
- v0.4 performance plan: [docs/plan/v0.4-performance.md](./docs/plan/v0.4-performance.md)
- Compact index details: [docs/compact-index.md](./docs/compact-index.md)

## Contributing

PRs welcome. Please use conventional commits and include tests for behavioural changes.

## Licence

MIT — see [LICENSE](./LICENSE)
