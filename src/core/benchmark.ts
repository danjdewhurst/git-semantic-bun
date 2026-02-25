import { performance } from "node:perf_hooks";
import { selectTopKByScore } from "./topk.ts";

export interface ScoredEntry {
  score: number;
}

export interface RankingBenchmarkResult {
  baselineMs: number;
  optimisedMs: number;
  speedup: number;
}

function baselineTopK<T extends ScoredEntry>(items: readonly T[], limit: number): T[] {
  return [...items].sort((a, b) => b.score - a.score).slice(0, limit);
}

function totalMs(start: number, end: number): number {
  return Number((end - start).toFixed(3));
}

export function benchmarkRanking<T extends ScoredEntry>(
  items: readonly T[],
  limit: number,
  iterations: number,
): RankingBenchmarkResult {
  if (iterations <= 0) {
    throw new Error("Iterations must be greater than zero.");
  }

  const baselineStart = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    baselineTopK(items, limit);
  }
  const baselineEnd = performance.now();

  const optimisedStart = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    selectTopKByScore(items, limit, (entry) => entry.score);
  }
  const optimisedEnd = performance.now();

  const baselineMs = totalMs(baselineStart, baselineEnd);
  const optimisedMs = totalMs(optimisedStart, optimisedEnd);

  return {
    baselineMs,
    optimisedMs,
    speedup: optimisedMs > 0 ? baselineMs / optimisedMs : Number.POSITIVE_INFINITY,
  };
}
