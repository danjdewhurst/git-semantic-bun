# Code Review: git-semantic-bun

**Model:** minimax-m2.5  
**Reviewer:** Jarvis (auto-generated)  
**Date:** 2026-02-26

---

## Summary

A well-structured, production-ready CLI tool for semantic git commit search. ~2.2k lines of TypeScript across 30 modules. Uses Bun + transformers.js for local embeddings, with hybrid ranking (semantic + lexical + recency).

---

## Strengths

### Architecture
- **Clean separation**: CLI → commands → core modules → types/constants
- **Extensible design**: Embedder interface, filter/parsing abstractions, score weighting system
- **Compact index format**: v2 metadata with optional f16 vectors, lazy-loaded embeddings, checksum validation
- **Caching**: BM25 lexical stats cached per-index-checksum (LRU with limit 4)

### Core Algorithm
- **Hybrid scoring**: Semantic (cosine similarity), lexical (BM25), recency (exponential decay) with configurable weights
- **Heap-based top-k**: O(n log k) vs full sort — efficient for large commit histories
- **Pre-normalised vectors**: Embeddings normalised at index time → faster similarity (dot product vs cosine)
- **Filters**: Author, date range, file path — composed cleanly in `filter.ts`

### Robustness
- **Checksum validation**: Detects stale/corrupted indexes
- **Rewrite detection**: `update` command detects rewritten history
- **Graceful degradation**: Fake embedder mode (`GSB_FAKE_EMBEDDINGS=1`) for testing
- **Type safety**: Strict TypeScript, no `any`

### Testing
- **Comprehensive test suite**: unit, e2e, golden ranking, performance baselines
- **test/benchmarks**: Smoke tests + historical tracking

### UX/CLI
- **Rich CLI**: commander-based with parse helpers for dates/weights/limits
- **Multiple output formats**: text, markdown, JSON
- **Explainable scores**: `--explain` shows semantic/lexical/recency breakdown
- **Snippets**: Optional diff snippets in output

---

## Issues & Recommendations

### 1. Medium: In-memory lexical cache can grow unbounded in long-running processes

**Location**: `src/core/lexical-cache.ts:47`

```typescript
const INDEX_CACHE_LIMIT = 4;
```

The LRU limit is good, but if you run `gsb serve` for days, it caches only by checksum — which may be the same index. Consider adding a time-based eviction or configurable limit.

### 2. Medium: No error handling for embedding model download failures

**Location**: `src/core/embeddings.ts:83`

```typescript
const extractor = (await pipeline("feature-extraction", modelName)) as unknown as Extractor;
```

If the model can't download (network, disk space), the error is uncaught. Wrap in try/catch with clear error message.

### 3. Low: Hardcoded BM25 parameters

**Location**: `src/core/ranking.ts`, `src/core/lexical-cache.ts`

```typescript
const k1 = 1.5;
const b = 0.75;
```

These are standard defaults but not configurable. Consider CLI flags for power users.

### 4. Low: `execFileSync` with large buffer could stall

**Location**: `src/core/git.ts:18`

```typescript
maxBuffer: 1024 * 1024 * 512, // 512MB
```

Huge repositories could hit this. Consider streaming or bounding the log output.

### 5. Low: No progress bar for large indexes during search

**Location**: `src/commands/search.ts`

Search on very large indexes loads all embeddings into memory via the lazy getter. For 100k+ commits, this could be slow. Consider parallel loading or mmap.

### 6. Minor: Duplicate BM25 logic

**Location**: `src/core/ranking.ts` and `src/core/lexical-cache.ts` both implement BM25. `lexicalScore()` in ranking.ts is a simpler overlap-based function, not BM25. This is intentional (lexicalScore for simple overlap, bm25Scores for full ranking), but could be documented better.

### 7. Minor: `fakeVector()` uses SHA256 — slow for large test batches

**Location**: `src/core/embeddings.ts:45`

If you're testing with fake embeddings on 10k commits, this will be slow. Consider a simpler hash like xxhash or a counter-based vector.

---

## Security

- **No obvious issues**: Uses native crypto for checksums, no shell injection (uses `execFileSync` with args), no user input in eval.
- **API keys**: N/A (runs locally with transformers.js)

---

## Performance Considerations

The v0.4 roadmap mentions ANN backends for large repos. Current bottleneck:
- Lazy embedding load helps startup, but full vector scan for every query
- Heap top-k is already optimal — the issue is computing scores for all N commits

Consider: vectorised scoring (WebGPU SIMD if available), or a pre-filter step (e.g., date range reduces N significantly).

---

## Verdict

**Solid, well-designed tool**. The issues are minor polish items. Production-ready for medium repos (<50k commits). For very large repos, monitor memory usage and consider the ANN roadmap.
