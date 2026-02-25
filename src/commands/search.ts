import { DEFAULT_LIMIT } from "../core/constants.ts";
import { createEmbedder } from "../core/embeddings.ts";
import { applyFilters } from "../core/filter.ts";
import { loadIndex } from "../core/index-store.ts";
import { resolveRepoPaths } from "../core/paths.ts";
import type { SearchFilters } from "../core/types.ts";
import { cosineSimilarity } from "../core/similarity.ts";

export interface SearchOptions {
  author?: string;
  after?: Date;
  before?: Date;
  file?: string;
  limit?: number;
}

export async function runSearch(query: string, options: SearchOptions): Promise<void> {
  const paths = resolveRepoPaths();
  const index = loadIndex(paths.indexPath);

  if (index.commits.length === 0) {
    throw new Error("Index is empty. Run `gsb index` first.");
  }

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

  const ranked = filtered
    .map((commit) => ({
      commit,
      score: cosineSimilarity(queryEmbedding, commit.embedding)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit ?? DEFAULT_LIMIT);

  if (ranked.length === 0) {
    console.log("No results.");
    return;
  }

  for (const { commit, score } of ranked) {
    console.log(`${score.toFixed(4)}  ${commit.hash}  ${commit.date}  ${commit.author}`);
    console.log(`  ${commit.message}`);
    if (commit.files.length > 0) {
      console.log(`  files: ${commit.files.join(", ")}`);
    }
  }
}
