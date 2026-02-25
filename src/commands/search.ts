import { DEFAULT_LIMIT } from "../core/constants.ts";
import type { Embedder } from "../core/embeddings.ts";
import { createEmbedder } from "../core/embeddings.ts";
import { applyFilters } from "../core/filter.ts";
import { getCommitDiffSnippet } from "../core/git.ts";
import { loadIndex } from "../core/index-store.ts";
import {
  type LexicalCache,
  bm25ScoresFromCache,
  getLexicalCacheForIndex,
} from "../core/lexical-cache.ts";
import { resolveModelIndexPaths, resolveTargetIndexPaths } from "../core/model-paths.ts";
import type { SearchOutputFormat } from "../core/parsing.ts";
import { resolveRepoPaths } from "../core/paths.ts";
import { type PluginRegistry, runHookChain } from "../core/plugin-registry.ts";
import type { RankedResult, SearchOutputPayload } from "../core/plugin-types.ts";
export type { RankedResult, SearchOutputPayload } from "../core/plugin-types.ts";
import {
  type ScoreWeights,
  combineScores,
  normaliseWeights,
  recencyScore,
} from "../core/ranking.ts";
import { normaliseVector } from "../core/similarity.ts";
import { selectTopKByMappedScore } from "../core/topk.ts";
import type {
  IndexedCommit,
  SearchFilters,
  SearchStrategyName,
  SemanticIndex,
} from "../core/types.ts";
import { type AnnIndexHandle, createSearchStrategy } from "../core/vector-search.ts";

export interface SearchOptions {
  model?: string;
  author?: string;
  after?: Date;
  before?: Date;
  file?: string;
  limit?: number;
  format?: SearchOutputFormat;
  explain?: boolean;
  semanticWeight?: number;
  lexicalWeight?: number;
  recencyWeight?: number;
  recencyBoost?: boolean;
  snippets?: boolean;
  snippetLines?: number;
  minScore?: number;
  strategy?: SearchStrategyName;
}

export function defaultMinScoreForFormat(format: SearchOutputFormat): number {
  if (format === "json") {
    return 0;
  }

  return 0.15;
}

function buildNoResultSuggestions(options: SearchOptions, minScore: number): string[] {
  const suggestions: string[] = [];

  if (options.minScore !== undefined) {
    suggestions.push(`Lower --min-score below ${minScore.toFixed(2)}.`);
  } else {
    suggestions.push(
      `Try lowering --min-score (default for this output mode is ${minScore.toFixed(2)}).`,
    );
  }

  if (options.author || options.file || options.after || options.before) {
    suggestions.push("Relax filters: --author, --file, --after, or --before.");
  } else {
    suggestions.push("Increase -n/--limit to inspect more candidates.");
  }

  suggestions.push("Try broader query terms or remove rare keywords.");
  return suggestions;
}

function buildPayload(
  query: string,
  model: string,
  format: SearchOutputFormat,
  explain: boolean,
  scoreWeights: ScoreWeights,
  totalIndexedCommits: number,
  matchedCommits: number,
  limit: number,
  filters: SearchFilters,
  ranked: RankedResult[],
): SearchOutputPayload {
  const payloadFilters: SearchOutputPayload["filters"] = {
    limit,
  };

  if (filters.author !== undefined) {
    payloadFilters.author = filters.author;
  }
  if (filters.after !== undefined) {
    payloadFilters.after = filters.after.toISOString();
  }
  if (filters.before !== undefined) {
    payloadFilters.before = filters.before.toISOString();
  }
  if (filters.file !== undefined) {
    payloadFilters.file = filters.file;
  }

  return {
    query,
    model,
    format,
    explain,
    totalIndexedCommits,
    matchedCommits,
    returnedResults: ranked.length,
    scoreWeights,
    filters: payloadFilters,
    results: ranked,
  };
}

function renderTextOutput(payload: SearchOutputPayload): void {
  console.log(`Semantic results for: "${payload.query}"`);
  console.log(
    `Model: ${payload.model} · Indexed: ${payload.totalIndexedCommits} · Matched: ${payload.matchedCommits} · Showing: ${payload.returnedResults}`,
  );
  if (payload.explain) {
    console.log(
      `Weights: semantic=${payload.scoreWeights.semantic.toFixed(2)}, lexical=${payload.scoreWeights.lexical.toFixed(2)}, recency=${payload.scoreWeights.recency.toFixed(2)}${payload.scoreWeights.recencyBoostEnabled ? "" : " (recency boost disabled)"}`,
    );
  }
  console.log("");

  for (const result of payload.results) {
    const scorePct = (result.score * 100).toFixed(1);
    console.log(`${result.rank}. ${result.message}`);
    console.log(`   ${result.hash} · ${result.author} · ${result.date} · score ${scorePct}%`);
    if (payload.explain) {
      console.log(
        `   components: semantic ${(result.semanticScore * 100).toFixed(1)}% · lexical ${(result.lexicalScore * 100).toFixed(1)}% · recency ${(result.recencyScore * 100).toFixed(1)}%`,
      );
    }
    if (result.files.length > 0) {
      console.log(`   files: ${result.files.join(", ")}`);
    }
    if (result.snippet) {
      console.log("   snippet:");
      for (const line of result.snippet.split("\n")) {
        console.log(`     ${line}`);
      }
    }
    console.log("");
  }
}

function renderMarkdownOutput(payload: SearchOutputPayload): void {
  console.log("# Semantic search results");
  console.log("");
  console.log(`- **Query:** \`${payload.query}\``);
  console.log(`- **Model:** \`${payload.model}\``);
  console.log(`- **Indexed commits:** ${payload.totalIndexedCommits}`);
  console.log(`- **Filter match count:** ${payload.matchedCommits}`);
  console.log(`- **Returned results:** ${payload.returnedResults}`);
  if (payload.explain) {
    console.log(
      `- **Weights:** semantic=${payload.scoreWeights.semantic.toFixed(2)}, lexical=${payload.scoreWeights.lexical.toFixed(2)}, recency=${payload.scoreWeights.recency.toFixed(2)}${payload.scoreWeights.recencyBoostEnabled ? "" : " (disabled)"}`,
    );
  }
  console.log("");

  for (const result of payload.results) {
    const scorePct = (result.score * 100).toFixed(1);
    console.log(`## ${result.rank}. ${result.message}`);
    console.log("");
    console.log(`- **Commit:** \`${result.hash}\``);
    console.log(`- **Author:** ${result.author}`);
    console.log(`- **Date:** ${result.date}`);
    console.log(`- **Score:** ${scorePct}%`);
    if (payload.explain) {
      console.log(`- **Semantic:** ${(result.semanticScore * 100).toFixed(1)}%`);
      console.log(`- **Lexical:** ${(result.lexicalScore * 100).toFixed(1)}%`);
      console.log(`- **Recency:** ${(result.recencyScore * 100).toFixed(1)}%`);
    }
    if (result.files.length > 0) {
      console.log(`- **Files:** ${result.files.map((file) => `\`${file}\``).join(", ")}`);
    }
    if (result.snippet) {
      console.log("- **Snippet:**");
      console.log("```diff");
      console.log(result.snippet);
      console.log("```");
    }
    console.log("");
  }
}

export interface SearchExecutionContext {
  index: SemanticIndex;
  embedder: Embedder;
  repoRoot: string;
  lexicalCache?: LexicalCache | undefined;
  strategyName?: SearchStrategyName | undefined;
  annHandle?: AnnIndexHandle | undefined;
  registry?: PluginRegistry | undefined;
}

export async function executeSearch(
  query: string,
  options: SearchOptions,
  context: SearchExecutionContext,
): Promise<SearchOutputPayload | null> {
  const { index, embedder, repoRoot, registry } = context;
  const lexicalCache = context.lexicalCache ?? getLexicalCacheForIndex(index);

  if (index.commits.length === 0) {
    throw new Error("Index is empty. Run `gsb index` first.");
  }

  const format = options.format ?? "text";
  const limit = options.limit ?? DEFAULT_LIMIT;
  const explain = options.explain ?? false;
  const snippets = options.snippets ?? false;
  const snippetLines = options.snippetLines ?? 12;
  const minScore = options.minScore ?? defaultMinScoreForFormat(format);
  const scoreWeights = normaliseWeights({
    semantic: options.semanticWeight ?? 0.75,
    lexical: options.lexicalWeight ?? 0.2,
    recency: options.recencyBoost === false ? 0 : (options.recencyWeight ?? 0.05),
    recencyBoostEnabled: options.recencyBoost !== false,
  });

  const filters: SearchFilters = {};
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

  // Run preSearch hooks — plugins can modify query and filters
  let effectiveQuery = query;
  let effectiveFilters = filters;
  if (registry) {
    const hookResult = await runHookChain(registry, "preSearch", {
      point: "preSearch",
      query: effectiveQuery,
      filters: effectiveFilters,
    });
    effectiveQuery = hookResult.query;
    effectiveFilters = hookResult.filters;
  }

  let filtered: IndexedCommit[] = applyFilters(index.commits, effectiveFilters);

  // Apply plugin commit filters
  if (registry) {
    for (const pluginFilter of registry.getCommitFilters()) {
      filtered = pluginFilter.apply(filtered, undefined);
    }
  }

  if (filtered.length === 0) {
    return null;
  }

  const [queryEmbedding] = await embedder.embedBatch([effectiveQuery]);

  if (!queryEmbedding) {
    throw new Error("Failed to generate query embedding.");
  }

  const normalisedQueryEmbedding = normaliseVector(queryEmbedding);

  // Try plugin search strategy first, then fall back to built-in
  const pluginStrategy = registry?.getSearchStrategy(index.commits.length);
  const strategyName = options.strategy ?? context.strategyName ?? "auto";
  const strategy =
    pluginStrategy ??
    createSearchStrategy({
      strategyName,
      commitCount: index.commits.length,
      annHandle: context.annHandle,
    });

  // Semantic pre-selection: strategy returns top candidates by embedding similarity.
  // For ANN, we over-fetch so hybrid re-ranking can promote lexical/recency hits.
  const semanticOverfetch = strategy.name === "ann" ? limit * 10 : limit * 3;
  const semanticCandidates = strategy.search(normalisedQueryEmbedding, filtered, semanticOverfetch);

  const lexicalByCommit = bm25ScoresFromCache(
    effectiveQuery,
    lexicalCache,
    filtered.map((commit) => commit.hash),
  );

  // Collect plugin scoring signals
  const pluginSignals = registry?.getScoringSignals() ?? [];

  // Hybrid re-rank: combine semantic scores with BM25 lexical + recency + plugin signals
  const reranked = semanticCandidates
    .map((candidate) => {
      const commit = filtered[candidate.index];
      if (!commit) return null;

      const lexical = lexicalByCommit.get(commit.hash) ?? 0;
      const recency = scoreWeights.recencyBoostEnabled ? recencyScore(commit.date) : 0;
      let score = combineScores(candidate.score, lexical, recency, scoreWeights);

      // Add plugin scoring signals (additive contribution with their default weights)
      for (const signal of pluginSignals) {
        score += signal.score(commit, effectiveQuery) * signal.defaultWeight;
      }

      return {
        hash: commit.hash,
        author: commit.author,
        date: commit.date,
        message: commit.message,
        files: commit.files,
        score,
        semanticScore: candidate.score,
        lexicalScore: lexical,
        recencyScore: recency,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // Final top-K selection from re-ranked candidates
  const rankedResultsRaw = selectTopKByMappedScore(reranked, limit, (result) => ({
    score: result.score,
    mapped: result,
  })).filter((result) => result.score >= minScore);

  if (rankedResultsRaw.length === 0) {
    return null;
  }

  const rankedResults: RankedResult[] = rankedResultsRaw.map((result, indexOfResult) => ({
    rank: indexOfResult + 1,
    ...result,
    ...(snippets
      ? {
          snippet: getCommitDiffSnippet(repoRoot, result.hash, snippetLines),
        }
      : {}),
  }));

  let payload = buildPayload(
    effectiveQuery,
    index.modelName,
    format,
    explain,
    scoreWeights,
    index.commits.length,
    filtered.length,
    limit,
    effectiveFilters,
    rankedResults,
  );

  // Run postSearch hooks — plugins can transform results
  if (registry) {
    const hookResult = await runHookChain(registry, "postSearch", {
      point: "postSearch",
      query: effectiveQuery,
      results: payload,
    });
    payload = hookResult.results as SearchOutputPayload;
  }

  return payload;
}

export interface RunSearchContext {
  registry?: PluginRegistry | undefined;
}

export async function runSearch(
  query: string,
  options: SearchOptions,
  context: RunSearchContext = {},
): Promise<void> {
  const { existsSync } = await import("node:fs");
  const { loadAnnIndex } = await import("../core/ann-index.ts");

  const { registry } = context;

  const paths = resolveRepoPaths();
  const targetPaths = options.model
    ? resolveModelIndexPaths(paths, options.model)
    : resolveTargetIndexPaths(paths);
  const index = loadIndex(targetPaths.indexPath);

  // Try plugin embedder first, fall back to built-in
  const pluginEmbedder = registry?.getEmbedder(index.modelName, paths.cacheDir);
  const embedder = pluginEmbedder
    ? await pluginEmbedder
    : await createEmbedder(index.modelName, paths.cacheDir);

  let annHandle: AnnIndexHandle | undefined;
  if (existsSync(targetPaths.annIndexPath)) {
    annHandle = await loadAnnIndex(targetPaths.annIndexPath, 384);
  }

  const payload = await executeSearch(query, options, {
    index,
    embedder,
    repoRoot: paths.repoRoot,
    annHandle,
    registry,
  });

  if (!payload) {
    const format = options.format ?? "text";
    const minScore = options.minScore ?? defaultMinScoreForFormat(format);
    const suggestions = buildNoResultSuggestions(options, minScore);

    if (format === "json") {
      console.log(
        JSON.stringify(
          {
            query,
            model: index.modelName,
            message: "No results",
            minScore,
            suggestions,
          },
          null,
          2,
        ),
      );
      return;
    }

    if (format === "markdown") {
      console.log("# Semantic search results");
      console.log("");
      console.log("- **Message:** No results");
      console.log(`- **Model:** \`${index.modelName}\``);
      console.log(`- **Min score threshold:** ${minScore.toFixed(2)}`);
      console.log("");
      console.log("## Suggestions");
      console.log("");
      for (const suggestion of suggestions) {
        console.log(`- ${suggestion}`);
      }
      return;
    }

    console.log("No results.");
    console.log("Suggestions:");
    for (const suggestion of suggestions) {
      console.log(`- ${suggestion}`);
    }
    return;
  }

  // Check plugin output formatters before built-in renderers
  if (registry) {
    const pluginFormatter = registry.getOutputFormatter(payload.format);
    if (pluginFormatter) {
      console.log(pluginFormatter.render(payload));
      return;
    }
  }

  if (payload.format === "json") {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (payload.format === "markdown") {
    renderMarkdownOutput(payload);
    return;
  }

  renderTextOutput(payload);
}
