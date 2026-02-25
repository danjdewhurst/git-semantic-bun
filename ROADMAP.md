# ROADMAP.md

Practical roadmap for improving retrieval quality, scalability, and developer ergonomics in `git-semantic-bun`.

## Principles

- Quality over speed: improve result relevance before adding bells and whistles.
- Keep local-first and dependency-light by default.
- Preserve transparent behaviour (`--explain`, deterministic scoring where possible).
- Ship in thin vertical slices with tests for every behavioural change.

## Milestone 1 — Retrieval Quality (next)

### 1.1 Improve embedding input construction
- [x] Replace current `hash/author/date/message/files` flat payload with weighted sections:
  - [x] `message` (highest signal)
  - [x] `files` (medium signal)
  - [x] optional patch summary (controlled by `--full`)
- [x] Remove low-signal metadata (`hash`, raw timestamp) from embedding text.
- [x] Add tests verifying text construction rules.

**Success criteria:** better top-5 relevance on representative queries without regression in speed >15%.

### 1.2 Add hybrid scoring (semantic + lexical + recency)
- [x] Introduce lexical term overlap/BM25-style score.
- [x] Add optional recency boost.
- [x] Implement weighted final score (configurable defaults).
- [x] Add `--explain` output showing score components.
- [x] Add ranking tests with fixed fixtures and expected order.

**Success criteria:** improved precision for exact-token queries while preserving semantic wins.

## Milestone 2 — Performance & Scale

### 2.1 Faster search path
- [x] Pre-normalise vectors at index time.
- [x] Add efficient top-k selection (avoid full sort for large sets).
- [ ] Benchmark baseline vs optimised path.

### 2.2 Index storage improvements
- [ ] Design compact index format (binary vectors + JSON metadata sidecar).
- [ ] Support migration from legacy `index.json`.
- [ ] Add `gsb stats` fields for vector bytes and load time.

**Success criteria:** materially reduced index size and faster startup/search on large repos.

## Milestone 3 — Robustness

### 3.1 Safer incremental updates
- [ ] Detect divergent history (rebase/force-push).
- [ ] Add automatic recovery strategy (windowed reindex or full reindex fallback).
- [ ] Surface clear warnings when index lineage is invalid.

### 3.2 Validation and failure handling
- [ ] Harden index validation with clearer error messages.
- [ ] Add checksum/version metadata for future migrations.

**Success criteria:** no silent stale-index behaviour in rewritten-history workflows.

## Milestone 4 — UX & Agent Workflows

### 4.1 Better output
- [ ] Optional diff snippets in search results (`--snippets`).
- [ ] JSON output includes score breakdown fields.
- [ ] Add `--min-score` to suppress weak matches.

### 4.2 Agent-friendly commands
- [ ] Add `gsb doctor` to validate environment/index/model cache.
- [ ] Add `gsb benchmark` for model/ranking comparisons.

**Success criteria:** easier to trust, debug, and automate in coding-agent pipelines.

## Milestone 5 — Testing & CI hardening

- [ ] Add end-to-end tests creating temp git repos and running `init/index/search/update`.
- [ ] Add ranking regression fixtures (golden queries).
- [ ] Add performance smoke test thresholds.
- [ ] Ensure CI runs tests + typecheck + lint for all PRs.

## Nice-to-have backlog

- [ ] Path include/exclude patterns for indexing.
- [ ] Multi-model index support with per-query model selection.
- [ ] Persistent search daemon mode to avoid repeated model cold starts.
- [ ] Optional ANN backend for very large repositories.

## Migrated from previous README roadmap

The old README checklist items are preserved here:

- Optional compact binary index format for very large repos (tracked in Milestone 2.2)
- Optional commit diff snippets in search output (tracked in Milestone 4.1)
- Multi-model benchmark command (tracked in Milestone 4.2)
- Ignore/include path patterns for indexing (tracked in Nice-to-have backlog)

## Delivery plan

1. **Ship Milestone 1 first** (highest user-visible value).
2. Land in small PRs (one feature slice per PR).
3. Update README usage/docs per shipped flag.
4. Keep roadmap checklist current as items land.
