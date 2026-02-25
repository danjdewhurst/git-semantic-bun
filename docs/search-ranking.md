# Search & Ranking

`gsb search` uses a hybrid ranking system that combines three scoring signals into a single weighted score per commit.

## Scoring signals

### 1. Semantic similarity (default weight: 0.75)

The query and each commit's embedding text are encoded into vectors using the same Transformers.js model. Similarity is computed as the dot product of pre-normalised vectors (equivalent to cosine similarity).

The embedding text for each commit includes:
- The commit message
- The list of changed files
- Optionally, the full patch text (when indexed with `--full`)

### 2. BM25 lexical score (default weight: 0.20)

A standard BM25 implementation with parameters k1=1.5, b=0.75. Tokenisation splits on non-alphanumeric characters, lowercases, and filters tokens shorter than 2 characters.

The corpus for each commit is `message + files`. IDF and term frequency statistics are computed across the full (post-filter) document set.

BM25 scores are normalised to [0, 1] by dividing by the maximum score in the result set.

**Caching:** Term frequencies and document frequencies are pre-computed when the index is loaded and cached in memory (keyed by index checksum, FIFO eviction with capacity 4). This means repeated queries against the same index skip the expensive statistics phase entirely.

### 3. Recency score (default weight: 0.05)

An exponential decay function based on commit age:

```
recency = exp(-ageDays / 365)
```

This gives a half-life of approximately 253 days. A commit from today scores 1.0; a commit from one year ago scores ~0.37; a commit from two years ago scores ~0.13.

Recency scoring can be disabled entirely with `--no-recency-boost`.

## Score combination

The three signals are combined as a weighted linear sum:

```
finalScore = (semantic × wSemantic) + (lexical × wLexical) + (recency × wRecency)
```

Each weight must be between 0 and 1. They are automatically normalised to sum to 1.0 before combination, so the ratios are preserved:

```bash
# These produce identical rankings:
gsb search "query" --semantic-weight 0.75 --lexical-weight 0.20 --recency-weight 0.05
gsb search "query" --semantic-weight 0.75 --lexical-weight 0.20
# (recency defaults to 0.05, all three are normalised)
```

## Tuning guidance

| Scenario | Suggested weights |
|---|---|
| **Default** (general purpose) | `0.75 / 0.20 / 0.05` |
| **Exact keyword matches matter** (error codes, function names) | `0.50 / 0.45 / 0.05` |
| **Conceptual search** (broad intent, no specific terms) | `0.90 / 0.05 / 0.05` |
| **Recent commits preferred** | `0.60 / 0.15 / 0.25` |
| **Pure semantic** | `1.0 / 0.0 / 0.0` |
| **Pure lexical (BM25 only)** | `0.0 / 1.0 / 0.0` |

Use `--explain` to see the breakdown of each score component per result, which is helpful for calibrating weights for your repository.

## Score thresholds

Use `--min-score <threshold>` to filter out low-confidence results. The score range depends on the weight configuration:

- With default weights, strong matches typically score > 0.5
- Weak but plausible matches fall in the 0.2–0.4 range
- Below 0.2 is usually noise

The right threshold varies by repository size and query type. Start with `--explain` to see score distributions, then set a threshold that fits your needs.

## Search strategies

The `--strategy` flag controls how vector similarity candidates are selected before scoring:

| Strategy | Behaviour |
|---|---|
| `auto` (default) | Uses ANN when `usearch` is installed and the index has >= 10,000 commits; otherwise exact |
| `exact` | Brute-force cosine similarity over all vectors |
| `ann` | HNSW approximate nearest-neighbour via usearch (requires `usearch` to be installed) |

ANN search overfetches 10x the requested limit to compensate for approximation error, then applies full hybrid scoring to the candidate set. ANN automatically falls back to exact search in two cases: when filters eliminate more than 90% of the index, or when ANN returns fewer candidates than the requested limit.

## Top-K selection

Results are selected using a min-heap with O(n log k) complexity rather than a full O(n log n) sort. This is measurably faster for large indexes where you only need the top 10–50 results. The `gsb benchmark` command quantifies this speedup for your specific index.
