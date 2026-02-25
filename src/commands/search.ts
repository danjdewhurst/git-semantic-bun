import { DEFAULT_LIMIT } from "../core/constants.ts";
import { createEmbedder } from "../core/embeddings.ts";
import { applyFilters } from "../core/filter.ts";
import { getCommitDiffSnippet } from "../core/git.ts";
import { loadIndex } from "../core/index-store.ts";
import type { SearchOutputFormat } from "../core/parsing.ts";
import { resolveRepoPaths } from "../core/paths.ts";
import {
  type ScoreWeights,
  bm25Scores,
  combineScores,
  normaliseWeights,
  recencyScore,
} from "../core/ranking.ts";
import { cosineSimilarityUnit, normaliseVector } from "../core/similarity.ts";
import { selectTopKByScore } from "../core/topk.ts";
import type { SearchFilters } from "../core/types.ts";

export interface SearchOptions {
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
}

interface RankedResult {
  rank: number;
  score: number;
  semanticScore: number;
  lexicalScore: number;
  recencyScore: number;
  hash: string;
  date: string;
  author: string;
  message: string;
  files: string[];
  snippet?: string;
}

interface SearchOutputPayload {
  query: string;
  model: string;
  format: SearchOutputFormat;
  explain: boolean;
  totalIndexedCommits: number;
  matchedCommits: number;
  returnedResults: number;
  scoreWeights: {
    semantic: number;
    lexical: number;
    recency: number;
    recencyBoostEnabled: boolean;
  };
  filters: {
    author?: string;
    after?: string;
    before?: string;
    file?: string;
    limit: number;
  };
  results: RankedResult[];
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

export async function runSearch(query: string, options: SearchOptions): Promise<void> {
  const paths = resolveRepoPaths();
  const index = loadIndex(paths.indexPath);

  if (index.commits.length === 0) {
    throw new Error("Index is empty. Run `gsb index` first.");
  }

  const format = options.format ?? "text";
  const limit = options.limit ?? DEFAULT_LIMIT;
  const explain = options.explain ?? false;
  const snippets = options.snippets ?? false;
  const snippetLines = options.snippetLines ?? 12;
  const minScore = options.minScore ?? Number.NEGATIVE_INFINITY;
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

  const filtered = applyFilters(index.commits, filters);
  if (filtered.length === 0) {
    console.log("No indexed commits matched the provided filters.");
    return;
  }

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
    const score = combineScores(semanticScore, lexical, recency, scoreWeights);

    return {
      hash: commit.hash,
      author: commit.author,
      date: commit.date,
      message: commit.message,
      files: commit.files,
      score,
      semanticScore,
      lexicalScore: lexical,
      recencyScore: recency,
    };
  });

  const rankedResultsRaw = selectTopKByScore(scored, limit, (entry) => entry.score).filter(
    (result) => result.score >= minScore,
  );

  const rankedResults: RankedResult[] = rankedResultsRaw.map((result, indexOfResult) => ({
    rank: indexOfResult + 1,
    ...result,
    ...(snippets
      ? {
          snippet: getCommitDiffSnippet(paths.repoRoot, result.hash, snippetLines),
        }
      : {}),
  }));

  if (rankedResults.length === 0) {
    console.log("No results.");
    return;
  }

  const payload = buildPayload(
    query,
    index.modelName,
    format,
    explain,
    scoreWeights,
    index.commits.length,
    filtered.length,
    limit,
    filters,
    rankedResults,
  );

  if (format === "json") {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (format === "markdown") {
    renderMarkdownOutput(payload);
    return;
  }

  renderTextOutput(payload);
}
