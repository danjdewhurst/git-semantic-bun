<div align="center">

# git-semantic-bun

**Search your git history by meaning, not just keywords.**

[![CI](https://github.com/danjdewhurst/git-semantic-bun/actions/workflows/ci.yml/badge.svg)](https://github.com/danjdewhurst/git-semantic-bun/actions/workflows/ci.yml)
[![GitHub release](https://img.shields.io/github/v/release/danjdewhurst/git-semantic-bun)](https://github.com/danjdewhurst/git-semantic-bun/releases)
[![Licence: MIT](https://img.shields.io/badge/Licence-MIT-yellow.svg)](./LICENSE)

<br />

```
gsb search "fix race condition in auth token refresh"
```

</div>

---

## Why?

`git log --grep` matches exact strings. Real questions are fuzzier:
*"that commit where we fixed the retry backoff"* or *"the auth token race condition"*.

**gsb** embeds every commit message into a vector space and ranks results by semantic similarity, BM25 lexical overlap, and recency — all locally, all offline.

### Highlights

- **Semantic + hybrid ranking** — weighted blend of vector similarity, lexical matching, and recency
- **Runs entirely offline** — no API keys, no cloud; embeddings via [Transformers.js](https://huggingface.co/docs/transformers.js)
- **Fast** — sub-millisecond lookups with optional ANN (HNSW) backend for 10k+ commit repos
- **Incremental** — `gsb update` indexes only new commits; detects rebases and force-pushes
- **Compact** — `f16` vector storage halves disk usage; sidecar index keeps `.git` tidy

---

## Quick start

```bash
# 1. Install
bun add -g github:danjdewhurst/git-semantic-bun

# 2. Initialise & index
gsb init
gsb index

# 3. Search
gsb search "fix race condition in auth token refresh"
```

> Prebuilt binaries for macOS, Linux, and Windows are available on the [Releases](https://github.com/danjdewhurst/git-semantic-bun/releases) page.

---

## Install

### Prebuilt binaries (recommended)

Download the latest release asset for your platform from [**Releases**](https://github.com/danjdewhurst/git-semantic-bun/releases).

### From GitHub with Bun

```bash
bun add -g github:danjdewhurst/git-semantic-bun
gsb --help
```

### From source

Requirements: **Bun >= 1.3.9**, a git repository.

```bash
git clone https://github.com/danjdewhurst/git-semantic-bun.git
cd git-semantic-bun
bun install
bun run src/cli.ts --help
```

---

## Commands

| Command | Description |
|---|---|
| [`gsb init`](#gsb-init) | Initialise index directories and model metadata |
| [`gsb index`](#gsb-index) | Build semantic index from git history |
| [`gsb search`](#gsb-search-query) | Semantic search over indexed commits |
| [`gsb update`](#gsb-update) | Incrementally index new commits |
| [`gsb serve`](#gsb-serve) | Warm search daemon (stdin/stdout) |
| [`gsb stats`](#gsb-stats) | Show index and vector stats |
| [`gsb doctor`](#gsb-doctor) | Check index health; `--fix` to repair |
| [`gsb benchmark`](#gsb-benchmark-query) | Benchmark ranking performance |

### `gsb init`

Initialises semantic index/cache directories and writes model metadata.

```
-m, --model <name>    embedding model (default: Xenova/all-MiniLM-L6-v2)
```

### `gsb index`

Builds the semantic index from git history.

```
--full                    full re-index
--model <name>            embedding model
--batch-size <n>          max 256
--include <glob>          repeatable
--exclude <glob>          repeatable
--vector-dtype <f32|f16>  f32 default; f16 halves storage
```

> `.gsbignore` patterns are applied automatically when present.

### `gsb search <query>`

Runs semantic search over indexed commits.

**Filters:**

```
--author <name>       filter by commit author
--after <date>        commits after date
--before <date>       commits before date
--file <path>         path substring filter
-m, --model <name>    select model index
--query-file <path>   read long query text from file
-n, --limit <count>   max results (max 200)
```

**Ranking & output:**

```
--semantic-weight <0..1>    vector similarity weight
--lexical-weight <0..1>     BM25 lexical weight
--recency-weight <0..1>     recency boost weight
--no-recency-boost          disable recency boosting
--explain                   show score breakdown
--format <text|md|json>     output format
--min-score <score>         minimum score threshold
--snippets                  show diff snippets
--snippet-lines <count>     lines per snippet
--strategy <auto|exact|ann> search strategy
```

`--min-score` defaults are output-mode aware:

- `text` / `markdown`: `0.15`
- `json`: `0.00`

When no results are found, `gsb search` now prints actionable suggestions (threshold and filter hints).

### `gsb serve`

Warm in-process search daemon — one query per stdin line, avoids repeated cold starts.

Interactive commands: `:reload`, `:quit` (or `:exit`).

```bash
printf "token refresh race\nretry backoff\n:quit\n" | gsb serve --jsonl -n 5
```

Supports all `search` filter and ranking flags, plus `--jsonl` for compact JSON output.

### `gsb update`

Incrementally indexes commits newer than the latest indexed commit. Supports the same options as `gsb index`. Includes rewritten-history safety checks (rebase/force-push detection + recovery window).
Use `--model <name>` to update a specific model index.

### `gsb stats`

Shows index and vector stats — size, dtype, timestamps, load time.
Use `--model <name>` to inspect a specific model index.

### `gsb doctor`

Checks index health and metadata/cache readiness. `--fix` performs safe, non-destructive repairs.
Use `--model <name>` to check or repair one model index.

### `gsb benchmark [query]`

Benchmarks ranking path (baseline full-sort vs heap top-k).

```
-i, --iterations <count>   iterations (default: 20)
-n, --limit <count>        max results (default: 10)
--model <name>             benchmark model index
--compare-model <name>     compare with another model (repeatable)
--save                     append to benchmarks.jsonl
--history                  print saved history
--ann                      compare exact vs ANN
```

Also accepts all `search` filter and ranking weight flags.

---

## Examples

```bash
gsb search "refactor payment retry logic"
gsb search "fix flaky parser" --after 2025-01-01 --author dan
gsb search "optimise caching" --file src/core -n 5
gsb search "token refresh race" --format markdown --explain
gsb search "error handling in webhook retries" --format json --min-score 0.35
```

---

## Optional ANN backend

For very large repositories (>10k commits), an approximate nearest-neighbour (HNSW) index reduces semantic lookup to sub-millisecond:

```bash
bun add usearch            # optional dependency
gsb index                  # builds .ann.usearch alongside standard index
gsb search "fix bug" --strategy ann   # force ANN
gsb search "fix bug"                  # auto: ANN when available & >10k commits
gsb benchmark "fix bug" --ann         # compare exact vs ANN recall + speedup
```

When `usearch` is not installed, all commands fall back to exact brute-force search transparently.

---

## Storage layout

All data lives under `.git/semantic-index/` — nothing outside your repo:

```
.git/semantic-index/
├── models/
│   └── <model-key>/
│       ├── index.json
│       ├── index.meta.json
│       ├── index.vec.f32   # or .f16
│       ├── index.ann.usearch
│       └── benchmarks.jsonl
├── cache/                  # embedding cache
└── index.json              # legacy single-index layout (still supported)
```

---

## Development

```bash
bun install          # install dependencies
bun run lint         # biome check
bun run typecheck    # tsc --noEmit
bun test             # run test suite
bun run perf:ci      # performance regression suite
bun run build        # compile to dist/
```

### Performance CI

- `bun run perf:ci` runs cold/warm/index-load suites against a synthetic dataset.
- `.github/perf-baseline.json` defines baseline snapshots + allowed regression thresholds.
- CI uploads `perf-artifacts/perf-snapshot.json` as a build artifact.

---

## Docs

See the [documentation index](./docs/README.md) for guides, architecture, and development references. Project roadmap: [ROADMAP.md](./ROADMAP.md).

---

## Contributing

PRs welcome. Please use [conventional commits](https://www.conventionalcommits.org/) and include tests for behavioural changes.

## Licence

MIT — see [LICENSE](./LICENSE)
