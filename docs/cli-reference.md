# CLI Reference

All commands are invoked as `gsb <command> [options]`.

Run `gsb --help` or `gsb <command> --help` for built-in usage text.

## `gsb init`

Initialise semantic index directories in the current git repository.

```bash
gsb init [--model <name>]
```

| Flag | Default | Description |
|---|---|---|
| `-m, --model <name>` | `Xenova/all-MiniLM-L6-v2` | Embedding model name |

Creates `.git/semantic-index/` and `.git/semantic-index/cache/metadata.json`.

## `gsb index`

Build the full semantic index from git commit history.

```bash
gsb index [options]
```

| Flag | Default | Description |
|---|---|---|
| `--full` | `false` | Include full commit patch in embedding text |
| `-m, --model <name>` | from metadata | Embedding model name override |
| `-b, --batch-size <size>` | `32` | Embedding batch size (max 256) |
| `--include <glob>` | — | Only include commits touching matching file paths (repeatable) |
| `--exclude <glob>` | — | Exclude commits touching matching file paths (repeatable) |
| `--vector-dtype <dtype>` | `f32` | Compact vector storage type: `f32` or `f16` |

Reads all commits via `git log`, generates embeddings in batches, and saves both the legacy `index.json` and compact sidecar files. If `usearch` is installed, an HNSW ANN index is also built.

### Filtering commits

Use `--include` and `--exclude` to scope which commits are indexed based on the files they touch:

```bash
gsb index --include "src/**/*.ts" --exclude "test/**"
```

You can also create a `.gsbignore` file in the repository root using gitignore-style patterns.

## `gsb search`

Search indexed commits with semantic similarity.

```bash
gsb search [query] [options]
```

The query can be provided as a positional argument or read from a file with `--query-file`. Exactly one must be provided.

| Flag | Default | Description |
|---|---|---|
| `--model <name>` | from metadata | Model index to query |
| `--query-file <path>` | — | Read query text from a file (mutually exclusive with positional query) |
| `--author <author>` | — | Filter by author substring |
| `--after <date>` | — | Only commits after this date |
| `--before <date>` | — | Only commits before this date |
| `--file <path>` | — | Only commits touching this file path substring |
| `-n, --limit <count>` | `10` | Maximum results (max 200) |
| `--format <format>` | `text` | Output format: `text`, `markdown`, `json` |
| `--explain` | `false` | Show score component breakdown per result |
| `--semantic-weight <w>` | `0.75` | Semantic similarity weight (0–1) |
| `--lexical-weight <w>` | `0.20` | BM25 lexical weight (0–1) |
| `--recency-weight <w>` | `0.05` | Recency decay weight (0–1) |
| `--no-recency-boost` | — | Disable recency scoring entirely |
| `--snippets` | `false` | Include compact diff snippets in output |
| `--snippet-lines <n>` | `12` | Number of diff body lines per snippet |
| `--min-score <score>` | — | Minimum final score threshold |
| `--strategy <strategy>` | `auto` | Search strategy: `auto`, `exact`, `ann` |

### Output formats

- **text** — human-readable, one result per block
- **markdown** — Markdown-formatted results
- **json** — machine-readable JSON array

### Examples

```bash
# Basic search
gsb search "database migration error"

# Filter by author and date range
gsb search "refactor auth" --author "Dan" --after 2025-01-01

# JSON output with score breakdown
gsb search "memory leak" --format json --explain

# Include diff snippets
gsb search "fix timeout" --snippets --snippet-lines 20

# Tune ranking weights (must sum > 0, auto-normalised)
gsb search "api endpoint" --semantic-weight 0.5 --lexical-weight 0.4 --recency-weight 0.1
```

## `gsb update`

Incrementally index new commits since the last indexed commit.

```bash
gsb update [options]
```

| Flag | Default | Description |
|---|---|---|
| `--model <name>` | from metadata | Model index to update |
| `--full` | — | Include full patch in newly indexed commits |
| `-b, --batch-size <size>` | `32` | Embedding batch size |
| `--include <glob>` | — | Only include matching file paths (repeatable) |
| `--exclude <glob>` | — | Exclude matching file paths (repeatable) |
| `--vector-dtype <dtype>` | from index | Compact vector dtype override: `f32` or `f16` |

Detects rebase and force-push scenarios by checking ancestor lineage. When divergence is found, the index is pruned to the common ancestor before re-indexing forward.

## `gsb serve`

Run a warm in-process search daemon. Keeps the embedding model and index loaded in memory for fast repeated queries.

```bash
gsb serve [options]
```

| Flag | Default | Description |
|---|---|---|
| `--model <name>` | from metadata | Model index to serve |
| `--author <author>` | — | Default author filter |
| `--after <date>` | — | Default after date filter |
| `--before <date>` | — | Default before date filter |
| `--file <path>` | — | Default file filter |
| `-n, --limit <count>` | `10` | Max results per query |
| `--semantic-weight <w>` | `0.75` | Semantic similarity weight |
| `--lexical-weight <w>` | `0.20` | Lexical weight |
| `--recency-weight <w>` | `0.05` | Recency weight |
| `--no-recency-boost` | — | Disable recency scoring |
| `--min-score <score>` | — | Minimum score threshold |
| `--jsonl` | `false` | Emit one compact JSON object per query line |
| `--strategy <strategy>` | `auto` | Search strategy: `auto`, `exact`, `ann` |

Reads one query per stdin line. See [Serve Daemon](./serve-daemon.md) for full usage details.

## `gsb stats`

Show semantic index statistics.

```bash
gsb stats [--model <name>]
```

| Flag | Default | Description |
|---|---|---|
| `--model <name>` | from metadata | Model index to inspect |

Displays: commit count, vector dtype, index file sizes, ANN status, and load time.

## `gsb doctor`

Check semantic index health and optionally repair issues.

```bash
gsb doctor [options]
```

| Flag | Default | Description |
|---|---|---|
| `--model <name>` | from metadata | Model index to check/fix |
| `--fix` | `false` | Attempt safe, non-destructive repairs |

### Checks performed

| Check | Description |
|---|---|
| index | `index.json` exists |
| compact metadata | `index.meta.json` exists |
| compact vectors | `.vec.f32`/`.f16` sidecar exists and is non-empty |
| model metadata | `cache/metadata.json` exists |
| model cache directory | `cache/` directory exists |
| index readability | Index can be loaded without errors |
| ann index | ANN index exists and commit count matches (informational) |

### Repairs (`--fix`)

- Recreates missing directories
- Regenerates compact sidecars from `index.json`
- Recreates `metadata.json` from the loaded index model
- Rebuilds stale ANN indexes (when `usearch` is installed)

## `gsb benchmark`

Benchmark ranking performance.

```bash
gsb benchmark <query> [options]
gsb benchmark --history
```

| Flag | Default | Description |
|---|---|---|
| `--model <name>` | from metadata | Model index to benchmark |
| `--author <author>` | — | Author filter |
| `--after <date>` | — | After date filter |
| `--before <date>` | — | Before date filter |
| `--file <path>` | — | File filter |
| `-n, --limit <count>` | `10` | Result limit |
| `-i, --iterations <count>` | `20` | Benchmark iterations |
| `--semantic-weight <w>` | `0.75` | Semantic weight |
| `--lexical-weight <w>` | `0.20` | Lexical weight |
| `--recency-weight <w>` | `0.05` | Recency weight |
| `--no-recency-boost` | — | Disable recency scoring |
| `--save` | `false` | Save result to `benchmarks.jsonl` history |
| `--history` | `false` | Show saved benchmark history (no query needed) |
| `--ann` | `false` | Compare exact vs ANN search strategies |
| `--compare-model <name>` | — | Compare against another model (repeatable) |

Compares baseline full-sort ranking against optimised heap top-K selection and reports the speedup ratio.

## Global patterns

### Date formats

The `--after` and `--before` flags accept any value parseable by JavaScript's `Date` constructor:

- `2025-01-01`
- `2025-06-15T12:00:00Z`
- `"Jan 1 2025"`

### Weight normalisation

The three weight flags (`--semantic-weight`, `--lexical-weight`, `--recency-weight`) each accept a value between 0 and 1. They are automatically normalised to sum to 1.0, so the ratios are preserved regardless of whether they already sum to 1.
