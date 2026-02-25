import { benchmarkRanking } from "../core/benchmark.ts";
import {
  loadBenchmarkHistory,
  renderBenchmarkHistorySummary,
  saveBenchmarkHistory,
} from "../core/benchmark-history.ts";
import { createEmbedder } from "../core/embeddings.ts";
import { applyFilters } from "../core/filter.ts";
import { loadIndex } from "../core/index-store.ts";
import { resolveRepoPaths } from "../core/paths.ts";
import { bm25Scores, combineScores, normaliseWeights, recencyScore } from "../core/ranking.ts";
import { cosineSimilarityUnit, normaliseVector } from "../core/similarity.ts";

export interface BenchmarkOptions {
  author?: string;
  after?: Date;
  before?: Date;
  file?: string;
  limit: number;
  iterations: number;
  semanticWeight?: number;
  lexicalWeight?: number;
  recencyWeight?: number;
  recencyBoost?: boolean;
  save?: boolean;
  history?: boolean;
}

export async function runBenchmark(query: string, options: BenchmarkOptions): Promise<void> {
  const paths = resolveRepoPaths();

  if (options.history) {
    const entries = loadBenchmarkHistory(paths.benchmarkHistoryPath);
    console.log(renderBenchmarkHistorySummary(entries));
    return;
  }

  const index = loadIndex(paths.indexPath);

  const filters: {
    author?: string;
    after?: Date;
    before?: Date;
    file?: string;
  } = {};

  if (options.author !== undefined) {
    filters.author = options.author;
  }
  if (options.after !== undefined) {
    filters.after = options.after;
  }
  if (options.before !== undefined) {
    filters.before = options.before;
  }
  if (options.file !== undefined) {
    filters.file = options.file;
  }

  const filtered = applyFilters(index.commits, filters);
  if (filtered.length === 0) {
    throw new Error("No indexed commits matched the provided filters.");
  }

  const scoreWeights = normaliseWeights({
    semantic: options.semanticWeight ?? 0.75,
    lexical: options.lexicalWeight ?? 0.2,
    recency: options.recencyBoost === false ? 0 : (options.recencyWeight ?? 0.05),
    recencyBoostEnabled: options.recencyBoost !== false,
  });

  const embedder = await createEmbedder(index.modelName, paths.cacheDir);
  const [queryEmbedding] = await embedder.embedBatch([query]);

  if (!queryEmbedding) {
    throw new Error("Failed to generate query embedding.");
  }

  const normalisedQueryEmbedding = normaliseVector(queryEmbedding);

  const lexicalByCommit = bm25Scores(
    query,
    filtered.map((commit) => ({
      id: commit.hash,
      message: commit.message,
      files: commit.files,
    })),
  );

  const scored = filtered.map((commit) => {
    const semanticScore = cosineSimilarityUnit(normalisedQueryEmbedding, commit.embedding);
    const lexical = lexicalByCommit.get(commit.hash) ?? 0;
    const recency = scoreWeights.recencyBoostEnabled ? recencyScore(commit.date) : 0;

    return {
      score: combineScores(semanticScore, lexical, recency, scoreWeights),
    };
  });

  const result = benchmarkRanking(scored, options.limit, options.iterations);
  console.log(`Benchmark query: "${query}"`);
  console.log(`Candidates: ${scored.length} · limit=${options.limit} · iterations=${options.iterations}`);
  console.log(`Baseline (full sort): ${result.baselineMs.toFixed(3)} ms`);
  console.log(`Optimised (heap top-k): ${result.optimisedMs.toFixed(3)} ms`);
  console.log(`Speedup: ${result.speedup.toFixed(2)}x`);

  if (options.save) {
    saveBenchmarkHistory(paths.benchmarkHistoryPath, {
      timestamp: new Date().toISOString(),
      query,
      candidates: scored.length,
      limit: options.limit,
      iterations: options.iterations,
      baselineMs: result.baselineMs,
      optimisedMs: result.optimisedMs,
      speedup: result.speedup,
    });
    console.log(`Saved benchmark run to ${paths.benchmarkHistoryPath}`);
  }
}
