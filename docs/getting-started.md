# Getting Started

## Prerequisites

- [Bun](https://bun.sh/) >= 1.3.9
- A git repository with commit history

## Installation

### From source

```bash
git clone https://github.com/danjdewhurst/git-semantic-bun.git
cd git-semantic-bun
bun install
bun link
```

### From a release binary

Download the binary for your platform from the [GitHub Releases](https://github.com/danjdewhurst/git-semantic-bun/releases) page. Available targets:

- `gsb-linux-x64`
- `gsb-linux-arm64`
- `gsb-darwin-x64`
- `gsb-darwin-arm64`
- `gsb-windows-x64.exe`

Make the binary executable and place it on your `PATH`:

```bash
chmod +x gsb-darwin-arm64
mv gsb-darwin-arm64 /usr/local/bin/gsb
```

### Optional: ANN support

For approximate nearest-neighbour search on large repositories (>10,000 commits), install `usearch`:

```bash
bun add usearch
```

This is optional — `gsb` works without it, falling back to exact brute-force search.

## Quick start

Navigate to any git repository:

```bash
cd ~/my-project
```

### 1. Initialise the index

```bash
gsb init
```

This creates `.git/semantic-index/` with metadata for the default embedding model (`Xenova/all-MiniLM-L6-v2`). All data stays inside `.git/` — nothing is committed to your repository.

### 2. Build the index

```bash
gsb index
```

This reads every commit from `git log`, generates vector embeddings locally via [Transformers.js](https://huggingface.co/docs/transformers.js), and saves the index. The first run downloads the model (~23 MB) to a local cache.

For large repos, you can tune the batch size:

```bash
gsb index --batch-size 64
```

### 3. Search

```bash
gsb search "fix authentication timeout"
```

Results are ranked by a hybrid score combining semantic similarity, BM25 lexical matching, and recency.

### 4. Keep the index up to date

After new commits:

```bash
gsb update
```

This incrementally indexes only commits added since the last run. It also detects rebased/force-pushed history and recovers automatically.

## What gets stored

```
.git/semantic-index/
├── cache/
│   └── metadata.json                   # Model name + init timestamp
└── models/<hash-slug>/                 # Per-model artifact directory
    ├── index.json                      # v1 canonical index (legacy fallback)
    ├── index.meta.json                 # v2 compact metadata sidecar
    ├── index.vec.f32                   # Dense vector matrix (or .f16)
    ├── index.ann.usearch               # Optional HNSW ANN index
    └── benchmarks.jsonl                # Benchmark history (opt-in)
```

Each model gets its own subdirectory under `models/`, keyed by a hash-slug derived from the model name. This allows multiple models to coexist. Legacy indexes stored at the root level are still supported as a fallback.

Everything lives inside `.git/`, so it is automatically excluded from version control.

## Next steps

- [CLI Reference](./cli-reference.md) — full command and flag documentation
- [Search & Ranking](./search-ranking.md) — how hybrid scoring works and how to tune it
- [Serve Daemon](./serve-daemon.md) — keep the index warm for fast repeated queries
- [Compact Index Format](./compact-index.md) — storage format internals
