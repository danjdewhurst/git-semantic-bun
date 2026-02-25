import { existsSync } from "node:fs";
import {
  loadBenchmarkHistory,
  renderBenchmarkHistorySummary,
  saveBenchmarkHistory,
} from "../core/benchmark-history.ts";
import { benchmarkRanking } from "../core/benchmark.ts";
import { createEmbedder } from "../core/embeddings.ts";
import { applyFilters } from "../core/filter.ts";
import { loadIndex } from "../core/index-store.ts";
import { bm25ScoresFromCache, getLexicalCacheForIndex } from "../core/lexical-cache.ts";
import type { IndexArtifactPaths } from "../core/model-paths.ts";
import { resolveModelIndexPaths, resolveTargetIndexPaths } from "../core/model-paths.ts";
import { type RepoPaths, resolveRepoPaths } from "../core/paths.ts";
import { combineScores, normaliseWeights, recencyScore } from "../core/ranking.ts";
import { cosineSimilarityUnit, normaliseVector } from "../core/similarity.ts";
import { type AnnIndexHandle, AnnSearch, ExactSearch } from "../core/vector-search.ts";

export interface BenchmarkOptions {
  model?: string;
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
  ann?: boolean;
  compareModel?: string[];
}

interface BenchmarkModelResult {
  modelName: string;
  result: ReturnType<typeof benchmarkRanking>;
  candidates: number;
  indexPaths: IndexArtifactPaths;
}

function uniqueModels(models: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const model of models) {
    if (seen.has(model)) continue;
    seen.add(model);
    out.push(model);
  }
  return out;
}

async function runBenchmarkForModel(
  repoPaths: RepoPaths,
  targetPaths: IndexArtifactPaths,
  query: string,
  options: BenchmarkOptions,
): Promise<BenchmarkModelResult> {
  const index = loadIndex(targetPaths.indexPath);

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
    throw new Error(
      `No indexed commits matched the provided filters for model ${index.modelName}.`,
    );
  }

  const scoreWeights = normaliseWeights({
    semantic: options.semanticWeight ?? 0.75,
    lexical: options.lexicalWeight ?? 0.2,
    recency: options.recencyBoost === false ? 0 : (options.recencyWeight ?? 0.05),
    recencyBoostEnabled: options.recencyBoost !== false,
  });

  const embedder = await createEmbedder(index.modelName, repoPaths.cacheDir);
  const [queryEmbedding] = await embedder.embedBatch([query]);

  if (!queryEmbedding) {
    throw new Error("Failed to generate query embedding.");
  }

  const normalisedQueryEmbedding = normaliseVector(queryEmbedding);
  const lexicalByCommit = bm25ScoresFromCache(
    query,
    getLexicalCacheForIndex(index),
    filtered.map((commit) => commit.hash),
  );

  const scored = filtered.map((commit) => {
    const semanticScore = cosineSimilarityUnit(normalisedQueryEmbedding, commit.embedding);
    const lexical = lexicalByCommit.get(commit.hash) ?? 0;
    const recency = scoreWeights.recencyBoostEnabled ? recencyScore(commit.date) : 0;

    return {
      score: combineScores(semanticScore, lexical, recency, scoreWeights),
    };
  });

  return {
    modelName: index.modelName,
    result: benchmarkRanking(scored, options.limit, options.iterations),
    candidates: scored.length,
    indexPaths: targetPaths,
  };
}

export async function runBenchmark(query: string, options: BenchmarkOptions): Promise<void> {
  const paths = resolveRepoPaths();
  const targetPaths = options.model
    ? resolveModelIndexPaths(paths, options.model)
    : resolveTargetIndexPaths(paths);

  if (options.history) {
    const entries = loadBenchmarkHistory(targetPaths.benchmarkHistoryPath);
    console.log(renderBenchmarkHistorySummary(entries));
    return;
  }

  const primary = await runBenchmarkForModel(paths, targetPaths, query, options);
  console.log(`Benchmark query: "${query}"`);
  console.log(
    `Candidates: ${primary.candidates} · limit=${options.limit} · iterations=${options.iterations}`,
  );
  console.log(`Model: ${primary.modelName}`);
  console.log(`Baseline (full sort): ${primary.result.baselineMs.toFixed(3)} ms`);
  console.log(`Optimised (heap top-k): ${primary.result.optimisedMs.toFixed(3)} ms`);
  console.log(`Speedup: ${primary.result.speedup.toFixed(2)}x`);

  if (options.save) {
    saveBenchmarkHistory(targetPaths.benchmarkHistoryPath, {
      timestamp: new Date().toISOString(),
      query,
      candidates: primary.candidates,
      limit: options.limit,
      iterations: options.iterations,
      baselineMs: primary.result.baselineMs,
      optimisedMs: primary.result.optimisedMs,
      speedup: primary.result.speedup,
    });
    console.log(`Saved benchmark run to ${targetPaths.benchmarkHistoryPath}`);
  }

  const compareModels = uniqueModels(options.compareModel ?? []).filter(
    (modelName) => modelName !== primary.modelName,
  );
  if (compareModels.length > 0) {
    const compared: BenchmarkModelResult[] = [];
    for (const modelName of compareModels) {
      const comparePaths = resolveModelIndexPaths(paths, modelName);
      const next = await runBenchmarkForModel(paths, comparePaths, query, options);
      compared.push(next);

      if (options.save) {
        saveBenchmarkHistory(comparePaths.benchmarkHistoryPath, {
          timestamp: new Date().toISOString(),
          query,
          candidates: next.candidates,
          limit: options.limit,
          iterations: options.iterations,
          baselineMs: next.result.baselineMs,
          optimisedMs: next.result.optimisedMs,
          speedup: next.result.speedup,
        });
      }
    }

    console.log("\nModel benchmark comparison:");
    console.log("model | candidates | optimised ms | speedup | delta vs primary");
    console.log(
      `${primary.modelName} | ${primary.candidates} | ${primary.result.optimisedMs.toFixed(3)} | ${primary.result.speedup.toFixed(2)}x | baseline`,
    );
    for (const model of compared) {
      const delta = model.result.optimisedMs - primary.result.optimisedMs;
      const deltaLabel = `${delta >= 0 ? "+" : ""}${delta.toFixed(3)} ms`;
      console.log(
        `${model.modelName} | ${model.candidates} | ${model.result.optimisedMs.toFixed(3)} | ${model.result.speedup.toFixed(2)}x | ${deltaLabel}`,
      );
    }
  }

  if (options.ann) {
    const modelIndex = loadIndex(targetPaths.indexPath);
    const modelEmbedder = await createEmbedder(modelIndex.modelName, paths.cacheDir);
    const [modelQueryEmbedding] = await modelEmbedder.embedBatch([query]);
    if (!modelQueryEmbedding) {
      throw new Error("Failed to generate query embedding.");
    }

    const annFilters: {
      author?: string;
      after?: Date;
      before?: Date;
      file?: string;
    } = {};
    if (options.author !== undefined) {
      annFilters.author = options.author;
    }
    if (options.after !== undefined) {
      annFilters.after = options.after;
    }
    if (options.before !== undefined) {
      annFilters.before = options.before;
    }
    if (options.file !== undefined) {
      annFilters.file = options.file;
    }

    const modelFilters = applyFilters(modelIndex.commits, annFilters);

    await runAnnComparison(
      normaliseVector(modelQueryEmbedding),
      modelFilters,
      options.limit,
      options.iterations,
      targetPaths.annIndexPath,
    );
  }
}

async function runAnnComparison(
  queryEmbedding: number[],
  filtered: readonly { embedding: number[] }[],
  limit: number,
  iterations: number,
  annIndexPath: string,
): Promise<void> {
  const { performance } = await import("node:perf_hooks");

  if (!existsSync(annIndexPath)) {
    console.log("\nANN comparison: no ANN index found. Run `gsb index` with usearch installed.");
    return;
  }

  const { loadAnnIndex } = await import("../core/ann-index.ts");

  let annHandle: AnnIndexHandle;
  try {
    annHandle = await loadAnnIndex(annIndexPath, 384);
  } catch (error) {
    console.log(`\nANN comparison: failed to load ANN index: ${(error as Error).message}`);
    return;
  }

  const exact = new ExactSearch();
  const ann = new AnnSearch(annHandle);

  // Benchmark exact
  const exactStart = performance.now();
  let exactResults: { index: number; score: number }[] = [];
  for (let i = 0; i < iterations; i += 1) {
    exactResults = exact.search(queryEmbedding, filtered as never, limit);
  }
  const exactMs = performance.now() - exactStart;

  // Benchmark ANN
  const annStart = performance.now();
  let annResults: { index: number; score: number }[] = [];
  for (let i = 0; i < iterations; i += 1) {
    annResults = ann.search(queryEmbedding, filtered as never, limit);
  }
  const annMs = performance.now() - annStart;

  // Compute recall: how many of exact top-K appear in ANN top-K
  const exactSet = new Set(exactResults.map((r) => r.index));
  const annSet = new Set(annResults.map((r) => r.index));
  let overlap = 0;
  for (const idx of exactSet) {
    if (annSet.has(idx)) overlap += 1;
  }
  const recall = exactSet.size > 0 ? overlap / exactSet.size : 1;

  console.log(`\nANN comparison (${iterations} iterations):`);
  console.log(`Exact semantic : ${exactMs.toFixed(3)} ms`);
  console.log(`ANN semantic   : ${annMs.toFixed(3)} ms`);
  console.log(`Speedup        : ${annMs > 0 ? (exactMs / annMs).toFixed(2) : "∞"}x`);
  console.log(`Recall@${limit}      : ${(recall * 100).toFixed(1)}%`);
}
