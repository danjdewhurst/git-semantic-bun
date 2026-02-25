# Architecture

## Overview

`git-semantic-bun` is structured as a CLI application with a clean separation between command handlers (`src/commands/`) and domain logic (`src/core/`). Command files handle option parsing and output formatting; core modules are pure logic with no CLI concerns.

```
src/
├── cli.ts              # Entry point — Commander program definition
├── index.ts            # Public re-exports
├── commands/           # One file per CLI command
│   ├── init.ts
│   ├── index.ts
│   ├── search.ts
│   ├── serve.ts
│   ├── update.ts
│   ├── stats.ts
│   ├── doctor.ts
│   └── benchmark.ts
└── core/               # Domain logic
    ├── types.ts
    ├── constants.ts
    ├── paths.ts
    ├── model-paths.ts
    ├── metadata.ts
    ├── git.ts
    ├── embeddings.ts
    ├── indexing.ts
    ├── index-store.ts
    ├── patterns.ts
    ├── filter.ts
    ├── similarity.ts
    ├── ranking.ts
    ├── lexical-cache.ts
    ├── topk.ts
    ├── vector-search.ts
    ├── ann-index.ts
    ├── benchmark.ts
    ├── benchmark-history.ts
    ├── doctor.ts
    ├── perf-guardrails.ts
    ├── format.ts
    └── parsing.ts
```

## Data flow

### Indexing pipeline

```
git log
  │
  ▼
git.ts ─── readCommits()
  │         Parses git log output with custom field separator (\x1f)
  ▼
patterns.ts ─── filterCommitsByPatterns()
  │              Applies --include/--exclude globs and .gsbignore
  ▼
indexing.ts ─── buildEmbeddingText() → embedCommits()
  │              Constructs text payload (message + files + optional patch)
  │              Batches through the embedding model
  │              Normalises output vectors
  ▼
index-store.ts ─── saveIndexWithAnn()
  │                  Writes index.json + compact sidecars
  │                  Optionally builds HNSW ANN index
  ▼
.git/semantic-index/
```

### Search pipeline

```
query string
  │
  ▼
embeddings.ts ─── embed query
  │
  ▼
index-store.ts ─── loadIndex()
  │                  Reads compact sidecars (or falls back to index.json)
  │                  Lazy-loads vectors via getter with cache
  ▼
filter.ts ─── applyFilters()
  │            Pre-filters by author, date range, file path
  ▼
vector-search.ts ─── ExactSearch or AnnSearch
  │                    Pre-selects candidate set by vector similarity
  ▼
lexical-cache.ts ─── bm25ScoresFromCache()
  │                    BM25 lexical scores from pre-computed term stats
  ▼
ranking.ts ─── combineScores()
  │              Weighted sum: semantic + lexical + recency
  ▼
topk.ts ─── selectTopKByMappedScore()
  │           Min-heap selection, O(n log k)
  ▼
results
```

## Core modules

### Types (`types.ts`)

Shared interfaces used across the codebase:

- `GitCommit` — raw commit data from git log
- `IndexedCommit` — commit with its embedding vector
- `SemanticIndex` — the full index structure (metadata + commits)
- `SearchFilters` — author/date/file filter criteria
- `SearchStrategyName` — `"auto" | "exact" | "ann"`
- `InitMetadata` — model name and initialisation timestamp
- `VectorDtype` — `"f32" | "f16"`

### Path resolution (`paths.ts`, `model-paths.ts`)

- `paths.ts` — resolves `RepoPaths` by calling `git rev-parse --git-dir`. Provides paths for `semanticDir`, `indexPath`, `compactMetaPath`, `cacheDir`, `metadataPath`, `annIndexPath`, and `benchmarkHistoryPath`.
- `model-paths.ts` — extends path resolution for multi-model support. Each model gets a directory under `semantic-index/models/<hash-slug>/`, with legacy fallback to the root `semantic-index/` directory.

### Git interface (`git.ts`)

- `readCommits()` — runs `git log` with a custom `--format` using `\x1f` field separators. Returns parsed `GitCommit[]`.
- `getCommitDiffSnippet()` — retrieves a compact diff snippet for a single commit hash.
- `commitExists()` / `isAncestorCommit()` — lineage checks used by `update` to detect rebase/force-push.

### Embeddings (`embeddings.ts`)

Wraps `@xenova/transformers` (Transformers.js) to run embedding models locally. The `createEmbedder()` function returns a callable that maps text to normalised float arrays.

Test mode: setting `GSB_FAKE_EMBEDDINGS=1` replaces the real model with deterministic SHA-256-based fake vectors, allowing tests to run without downloading any model.

### Index storage (`index-store.ts`)

The largest core module. Handles two storage formats:

- **Legacy v1** — `index.json` with embeddings inline as JSON arrays
- **Compact v2** — `index.meta.json` (metadata without vectors) + `index.vec.f32`/`.f16` (dense row-major float matrix)

Key features:
- F32/F16 conversion implemented from scratch using bit manipulation
- SHA-256 checksum validation
- Lazy vector loading via property getter with cache (vectors are only read from disc when first accessed)
- ANN index build/save integration

See [Compact Index Format](./compact-index.md) for the full specification.

### Patterns (`patterns.ts`)

Converts glob patterns to regular expressions for commit filtering. Reads `.gsbignore` from the repository root (gitignore-style syntax). Used during indexing to scope which commits are included.

### Filtering (`filter.ts`)

`applyFilters()` — pre-filters the commit list before scoring. Supports:
- Author substring match (case-insensitive)
- Date range (after/before)
- File path substring match

### Similarity (`similarity.ts`)

- `cosineSimilarity()` — standard cosine similarity
- `cosineSimilarityUnit()` — optimised dot-product for pre-normalised vectors (skips magnitude computation)
- `normaliseVector()` — L2 normalisation

### Ranking (`ranking.ts`)

The hybrid scoring engine. See [Search & Ranking](./search-ranking.md) for details.

- `bm25Scores()` — full BM25 scoring with IDF weighting (k1=1.5, b=0.75)
- `recencyScore()` — exponential decay with a 365-day half-life
- `normaliseWeights()` — ensures weights sum to 1.0
- `combineScores()` — weighted linear combination of all three signals

### Lexical cache (`lexical-cache.ts`)

Pre-computes per-document term frequencies and document frequencies at index load time. Caches up to 4 indexes by checksum in an in-memory FIFO cache. `bm25ScoresFromCache()` provides fast BM25 scoring on repeated queries without recomputing statistics.

### Top-K selection (`topk.ts`)

Min-heap implementation for selecting the top K results from N candidates in O(n log k) time, avoiding the O(n log n) cost of a full sort. Two variants:
- `selectTopKByScore()` — when scores are pre-computed
- `selectTopKByMappedScore()` — computes scores lazily via a mapping function

### Vector search (`vector-search.ts`)

Strategy pattern for vector similarity pre-selection:

- **ExactSearch** — brute-force cosine similarity over all vectors
- **AnnSearch** — delegates to usearch HNSW index with overfetching (10x the limit). Falls back to exact search when filters eliminate more than 90% of the index, when ANN returns fewer candidates than the limit, or when usearch is unavailable.
- `createSearchStrategy()` — factory that selects the strategy based on the `--strategy` flag and index size

### ANN index (`ann-index.ts`)

Optional integration with [usearch](https://github.com/unum-cloud/usearch) for HNSW approximate nearest-neighbour search. Lazy-loads the `usearch` package so the dependency is truly optional.

- `buildAnnIndex()` — builds an HNSW index from pre-normalised vectors
- `loadAnnIndex()` — loads a previously built index from disc
- Uses inner product metric (equivalent to cosine for normalised vectors)
- Connectivity: 16 (HNSW graph degree)

### Doctor (`doctor.ts`)

Health checking and self-repair:

- `runDoctorChecks()` — runs 7 named checks (index file, compact meta, compact vectors, model metadata, cache directory, index readability, ANN index staleness)
- `runDoctorFixes()` — non-destructive repairs: recreates directories, regenerates sidecars, rebuilds stale ANN indexes

### Performance (`benchmark.ts`, `benchmark-history.ts`, `perf-guardrails.ts`)

- `benchmark.ts` — runs timed iterations comparing full-sort vs heap top-K ranking
- `benchmark-history.ts` — persists results to `benchmarks.jsonl` in append-only JSONL format
- `perf-guardrails.ts` — statistical summary (min/max/mean/p50/p95) and regression detection against baseline thresholds

## Dependencies

| Package | Role |
|---|---|
| `@xenova/transformers` | Local embedding model inference |
| `commander` | CLI argument parsing |
| `usearch` (optional) | HNSW approximate nearest-neighbour index |
| `@biomejs/biome` (dev) | Linting and formatting |
| `typescript` (dev) | Type checking |
| `@types/bun` (dev) | Bun type definitions |
