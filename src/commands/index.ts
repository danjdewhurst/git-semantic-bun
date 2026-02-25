import { DEFAULT_BATCH_SIZE, DEFAULT_MODEL } from "../core/constants.ts";
import { createEmbedder } from "../core/embeddings.ts";
import { readCommits } from "../core/git.ts";
import { embedCommits } from "../core/indexing.ts";
import { saveIndex } from "../core/index-store.ts";
import { loadMetadata } from "../core/metadata.ts";
import { ensureSemanticDirectories, resolveRepoPaths } from "../core/paths.ts";
import { validateBatchSize } from "../core/parsing.ts";

export interface IndexOptions {
  full: boolean;
  model?: string;
  batchSize: number;
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
    includePatch: options.full
  });

  if (commits.length === 0) {
    throw new Error("No commits found in repository history.");
  }

  console.log(`Indexing ${commits.length} commits with model ${modelName}`);
  const embedder = await createEmbedder(modelName, paths.cacheDir);
  const indexedCommits = await embedCommits(commits, embedder, {
    batchSize,
    includePatch: options.full,
    progressLabel: "Embedding commits"
  });

  const now = new Date().toISOString();
  saveIndex(paths.indexPath, {
    version: 1,
    modelName,
    createdAt: now,
    lastUpdatedAt: now,
    repositoryRoot: paths.repoRoot,
    includePatch: options.full,
    commits: indexedCommits
  });

  console.log(`Saved index to ${paths.indexPath}`);
}
