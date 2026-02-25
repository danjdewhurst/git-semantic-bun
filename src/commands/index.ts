import { DEFAULT_BATCH_SIZE, DEFAULT_MODEL } from "../core/constants.ts";
import { createEmbedder } from "../core/embeddings.ts";
import { readCommits } from "../core/git.ts";
import { saveIndex } from "../core/index-store.ts";
import { embedCommits } from "../core/indexing.ts";
import { loadMetadata } from "../core/metadata.ts";
import { validateBatchSize } from "../core/parsing.ts";
import { ensureSemanticDirectories, resolveRepoPaths } from "../core/paths.ts";
import { filterCommitsByPatterns, loadGsbIgnorePatterns } from "../core/patterns.ts";

export interface IndexOptions {
  full: boolean;
  model?: string;
  batchSize: number;
  include: string[];
  exclude: string[];
  vectorDtype?: "f32" | "f16";
}

export async function runIndex(options: IndexOptions): Promise<void> {
  const paths = resolveRepoPaths();
  ensureSemanticDirectories(paths);

  const batchSize = validateBatchSize(options.batchSize || DEFAULT_BATCH_SIZE);

  let modelName = options.model || DEFAULT_MODEL;
  try {
    const metadata = loadMetadata(paths.metadataPath);
    if (!options.model) {
      modelName = metadata.modelName;
    }
  } catch {
    // Metadata is optional for indexing.
  }

  const commits = readCommits({
    cwd: paths.repoRoot,
    includePatch: options.full,
  });

  const ignores = loadGsbIgnorePatterns(paths.repoRoot);
  const filteredCommits = filterCommitsByPatterns(commits, options.include, [
    ...options.exclude,
    ...ignores,
  ]);

  if (filteredCommits.length === 0) {
    throw new Error(
      "No commits found in repository history after applying include/exclude patterns.",
    );
  }

  console.log(`Indexing ${filteredCommits.length} commits with model ${modelName}`);
  const embedder = await createEmbedder(modelName, paths.cacheDir);
  const indexedCommits = await embedCommits(filteredCommits, embedder, {
    batchSize,
    includePatch: options.full,
    progressLabel: "Embedding commits",
  });

  const now = new Date().toISOString();
  saveIndex(paths.indexPath, {
    version: 1,
    modelName,
    createdAt: now,
    lastUpdatedAt: now,
    repositoryRoot: paths.repoRoot,
    includePatch: options.full,
    vectorDtype: options.vectorDtype ?? "f32",
    commits: indexedCommits,
  });

  console.log(`Saved index to ${paths.indexPath}`);
}
