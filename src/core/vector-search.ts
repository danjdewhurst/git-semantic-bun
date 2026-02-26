import { ANN_COMMIT_THRESHOLD, ANN_OVERFETCH_MULTIPLIER } from "./constants.ts";
import { cosineSimilarityUnit } from "./similarity.ts";
import type { IndexedCommit, SearchStrategyName } from "./types.ts";

export interface SemanticCandidate {
  index: number;
  score: number;
}

export interface VectorSearchStrategy {
  readonly name: SearchStrategyName;
  search(
    queryEmbedding: readonly number[],
    candidates: readonly IndexedCommit[],
    limit: number,
  ): SemanticCandidate[];
}

export class ExactSearch implements VectorSearchStrategy {
  readonly name: SearchStrategyName = "exact";

  search(
    queryEmbedding: readonly number[],
    candidates: readonly IndexedCommit[],
    limit: number,
  ): SemanticCandidate[] {
    const scored: SemanticCandidate[] = [];
    for (let i = 0; i < candidates.length; i += 1) {
      const commit = candidates[i];
      if (!commit) continue;
      scored.push({
        index: i,
        score: cosineSimilarityUnit(queryEmbedding, commit.embedding),
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }
}

export interface AnnIndexHandle {
  search(query: Float32Array, limit: number): { keys: bigint[]; distances: number[] };
  save(filePath: string): void;
  size(): number;
}

export class AnnSearch implements VectorSearchStrategy {
  readonly name: SearchStrategyName = "ann";
  private readonly handle: AnnIndexHandle;
  private readonly overfetchMultiplier: number;

  constructor(handle: AnnIndexHandle, overfetchMultiplier = ANN_OVERFETCH_MULTIPLIER) {
    this.handle = handle;
    this.overfetchMultiplier = overfetchMultiplier;
  }

  search(
    queryEmbedding: readonly number[],
    candidates: readonly IndexedCommit[],
    limit: number,
  ): SemanticCandidate[] {
    // Build mapping from global index (ANN keys) to filtered index (position in candidates array)
    // Each candidate has originalIndex set to its position in the full index
    const globalToFiltered = new Map<number, number>();
    for (let i = 0; i < candidates.length; i += 1) {
      const commit = candidates[i];
      if (commit === undefined) continue;
      const globalIndex = commit.originalIndex ?? i;
      globalToFiltered.set(globalIndex, i);
    }

    const filteredRatio = candidates.length / Math.max(1, this.handle.size());

    // Fall back to exact search when filters eliminate >90% of commits
    if (filteredRatio < 0.1) {
      return new ExactSearch().search(queryEmbedding, candidates, limit);
    }

    const queryF32 = new Float32Array(queryEmbedding);
    const annLimit = Math.min(limit * this.overfetchMultiplier, this.handle.size());
    const { keys, distances } = this.handle.search(queryF32, annLimit);

    const results: SemanticCandidate[] = [];
    for (let i = 0; i < keys.length; i += 1) {
      const globalKey = Number(keys[i]);
      const filteredIndex = globalToFiltered.get(globalKey);
      if (filteredIndex !== undefined) {
        // usearch ip metric returns distance = 1 - similarity for normalised vectors
        results.push({ index: filteredIndex, score: 1 - (distances[i] ?? 0) });
      }
    }

    // If ANN didn't return enough candidates from the filtered set, fall back to exact
    if (results.length < limit && results.length < candidates.length) {
      return new ExactSearch().search(queryEmbedding, candidates, limit);
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }
}

export interface CreateStrategyOptions {
  strategyName: SearchStrategyName;
  commitCount: number;
  annHandle?: AnnIndexHandle | undefined;
}

export function createSearchStrategy(options: CreateStrategyOptions): VectorSearchStrategy {
  const { strategyName, commitCount, annHandle } = options;

  if (strategyName === "exact") {
    return new ExactSearch();
  }

  if (strategyName === "ann") {
    if (!annHandle) {
      throw new Error("ANN strategy requested but no ANN index is available.");
    }
    return new AnnSearch(annHandle);
  }

  // auto: use ANN only when handle exists AND commit count exceeds threshold
  if (annHandle && commitCount >= ANN_COMMIT_THRESHOLD) {
    return new AnnSearch(annHandle);
  }

  return new ExactSearch();
}
