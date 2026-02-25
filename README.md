# git-semantic-bun

[![CI](https://github.com/danjdewhurst/git-semantic-bun/actions/workflows/ci.yml/badge.svg)](https://github.com/danjdewhurst/git-semantic-bun/actions/workflows/ci.yml)
[![GitHub release](https://img.shields.io/github/v/release/danjdewhurst/git-semantic-bun)](https://github.com/danjdewhurst/git-semantic-bun/releases)
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

- Bun >= 1.3.9
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

- `-m, --model <name>` — embedding model (default: `Xenova/all-MiniLM-L6-v2`)

### `gsb index`

Builds semantic index from git history.

Key options:

- `--full`
- `--model <name>`
- `--batch-size <n>` (max 256)
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
- `-n, --limit <count>` (max 200)

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
- `--strategy <auto|exact|ann>`

### `gsb serve`

Runs a warm in-process search daemon (one query per stdin line) to avoid repeated cold starts.

Interactive commands: `:reload`, `:quit` (or `:exit`).

Supports the same filter and ranking flags as `gsb search` (except `--format`, `--explain`, `--snippets`, `--snippet-lines`), plus:

- `--jsonl` — emit one compact JSON object per query line
- `--strategy <auto|exact|ann>`

Example:

```bash
printf "token refresh race\nretry backoff\n:quit\n" | gsb serve --jsonl -n 5
```

### `gsb update`

Incrementally indexes commits newer than the latest indexed commit.

Supports the same index shaping options as `gsb index`:

- `--full`
- `--batch-size <n>` (max 256)
- `--include <glob>` / `--exclude <glob>`
- `--vector-dtype <f32|f16>` — inherits from existing index when omitted

Includes rewritten-history safety checks (rebase/force-push detection + recovery window).

### `gsb stats`

Shows index and vector stats (size, dtype, timestamps, load time).

### `gsb doctor`

Checks index health and metadata/cache readiness.

- `--fix` performs safe, non-destructive repairs where possible.

### `gsb benchmark [query]`

Benchmarks ranking path (baseline full-sort vs heap top-k).

Options:

- `-i, --iterations <count>` — benchmark iterations (default: 20)
- `-n, --limit <count>` — max results (default: 10)
- `--save` — append result to `.git/semantic-index/benchmarks.jsonl`
- `--history` — print saved benchmark history (query becomes optional)
- `--ann` — compare exact vs ANN search strategies (recall + speedup)

Also accepts the same filter and ranking weight flags as `gsb search` (`--author`, `--after`, `--before`, `--file`, `--semantic-weight`, `--lexical-weight`, `--recency-weight`, `--no-recency-boost`).

## Storage layout

Primary files under `.git/semantic-index/`:

- `index.json`
- `index.meta.json`
- `index.vec.f32` or `index.vec.f16`
- `index.ann.usearch` (optional, built when `usearch` is installed)
- `cache/`
- `benchmarks.jsonl` (if benchmark history is enabled)

## Optional ANN backend

For very large repositories (>10k commits), an approximate nearest neighbour (HNSW) index can reduce semantic lookup to sub-millisecond:

```bash
bun add usearch   # optional dependency
gsb index          # builds index.ann.usearch alongside the standard index
gsb search "fix bug" --strategy ann    # force ANN
gsb search "fix bug"                   # auto: uses ANN when available and >10k commits
gsb benchmark "fix bug" --ann          # compare exact vs ANN
```

When `usearch` is not installed, all commands fall back to exact brute-force search transparently.

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
bun run perf:ci
bun run build
bun run toc
```

`bun run toc` uses [`go-toc`](https://github.com/danjdewhurst/go-toc) to generate `TOC.md`.
If `go-toc` is not installed, the project script downloads a local binary into `.tools/bin/`.

Performance CI notes:

- `bun run perf:ci` runs separate cold/warm/index-load suites against a synthetic dataset.
- `.github/perf-baseline.json` defines baseline snapshot + allowed regression thresholds.
- CI uploads `perf-artifacts/perf-snapshot.json` as an artifact for each run.

## Docs

- Current roadmap: [ROADMAP.md](./ROADMAP.md)
- Docs index: [docs/README.md](./docs/README.md)
- v0.4 performance plan: [docs/plans/v0.4-performance.md](./docs/plans/v0.4-performance.md)
- Compact index details: [docs/compact-index.md](./docs/compact-index.md)

## Contributing

PRs welcome. Please use conventional commits and include tests for behavioural changes.

## Licence

MIT — see [LICENSE](./LICENSE)
