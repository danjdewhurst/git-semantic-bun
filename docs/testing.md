# Testing

## Running tests

```bash
bun test
```

All tests use Bun's built-in test runner. No additional test framework is needed.

### Useful variations

```bash
# Run a specific test file
bun test test/similarity.test.ts

# Run tests matching a pattern
bun test --grep "BM25"

# Type-check without running
bunx tsc --noEmit

# Lint
bunx @biomejs/biome check .
```

## Fake embeddings

Most tests set `GSB_FAKE_EMBEDDINGS=1` to avoid downloading and running the real embedding model. When enabled, the embedder produces deterministic 384-dimensional vectors derived from the SHA-256 hash of the input text. This keeps tests fast (~seconds) and reproducible without network access.

The fake embeddings preserve key properties:
- Same input always produces the same vector
- Different inputs produce different vectors
- Vectors are normalised (unit length)

## Test suites

### Core logic

| Test file | What it covers |
|---|---|
| `similarity.test.ts` | Cosine similarity, unit dot-product, normalisation |
| `ranking-golden.test.ts` | Golden-file regression tests against `test/fixtures/ranking-golden.json` |
| `search-ranking.test.ts` | End-to-end ranking correctness with known inputs |
| `topk.test.ts` | Min-heap correctness and equivalence with full sort |
| `filter.test.ts` | Author, date, and file filter logic |
| `lexical-cache.test.ts` | BM25 cache construction and scoring |
| `vector-search.test.ts` | ExactSearch and AnnSearch strategy behaviour |
| `patterns.test.ts` | Glob-to-regex conversion, `.gsbignore` handling |
| `parsing.test.ts` | CLI option parsing edge cases |
| `git-helpers.test.ts` | Git log output parsing |
| `indexing.test.ts` | Embedding text construction, commit deduplication |
| `index-store.test.ts` | Index serialisation/deserialisation, compact format, F16 conversion |
| `model-paths.test.ts` | Multi-model path resolution and legacy fallback |
| `search-defaults.test.ts` | Search default option handling |

### Health and diagnostics

| Test file | What it covers |
|---|---|
| `doctor.test.ts` | Doctor check logic and non-destructive fix behaviour |
| `benchmark.test.ts` | Benchmark runner logic |
| `benchmark-history.test.ts` | JSONL history append and rendering |
| `perf-guardrails.test.ts` | Statistical summary and regression threshold detection |
| `ann-benchmark.test.ts` | ANN vs exact comparison benchmarks |

### Performance

| Test file | What it covers |
|---|---|
| `performance-baseline.test.ts` | Baseline timing for the scoring hot path |
| `performance-smoke.test.ts` | Smoke test ensuring scoring completes within bounds |

### End-to-end

| Test file | What it covers |
|---|---|
| `e2e-cli.test.ts` | Full CLI invocations (`gsb init`, `gsb index`, `gsb search`, etc.) in a temporary git repo |

## Golden files

`test/fixtures/ranking-golden.json` contains expected ranking outputs for a fixed set of queries and commits. The `ranking-golden.test.ts` suite asserts that the ranking algorithm produces results matching this file exactly, catching unintentional ranking regressions.

To update the golden file after an intentional ranking change, run the golden test with an update flag or regenerate it from the test setup.

## Writing new tests

Follow the existing conventions:

1. Place tests in `test/<module-name>.test.ts`
2. Use `import { describe, expect, test } from "bun:test"`
3. Set `GSB_FAKE_EMBEDDINGS=1` if your test touches the embedder
4. Prefer small, focused test cases over large integration tests
5. Cover edge cases and error paths — not just happy paths
