import { DEFAULT_BATCH_SIZE, DEFAULT_MODEL } from "../core/constants.ts";
import { createEmbedder } from "../core/embeddings.ts";
import { readCommits } from "../core/git.ts";
import { saveIndexWithAnn } from "../core/index-store.ts";
import { embedCommits } from "../core/indexing.ts";
import { loadMetadata } from "../core/metadata.ts";
import { ensureIndexArtifactDirectory, resolveModelIndexPaths } from "../core/model-paths.ts";
import { validateBatchSize } from "../core/parsing.ts";
import { ensureSemanticDirectories, resolveRepoPaths } from "../core/paths.ts";
import { filterCommitsByPatterns, loadGsbIgnorePatterns } from "../core/patterns.ts";
import { type PluginRegistry, runHookChain } from "../core/plugin-registry.ts";

export interface IndexOptions {
  full: boolean;
  model?: string;
  batchSize: number;
  include: string[];
  exclude: string[];
  vectorDtype?: "f32" | "f16";
}

export interface RunIndexContext {
  registry?: PluginRegistry | undefined;
}

export async function runIndex(
  options: IndexOptions,
  context: RunIndexContext = {},
): Promise<void> {
  const { registry } = context;
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

  // Run preIndex hooks — plugins can transform the commit list
  let commitsToIndex = filteredCommits;
  if (registry) {
    const hookResult = await runHookChain(registry, "preIndex", {
      point: "preIndex",
      commits: [...commitsToIndex],
    });
    commitsToIndex = hookResult.commits;
  }

  console.log(`Indexing ${commitsToIndex.length} commits with model ${modelName}`);

  // Try plugin embedder first, fall back to built-in
  const pluginEmbedder = registry?.getEmbedder(modelName, paths.cacheDir);
  const embedder = pluginEmbedder
    ? await pluginEmbedder
    : await createEmbedder(modelName, paths.cacheDir);

  let indexedCommits = await embedCommits(commitsToIndex, embedder, {
    batchSize,
    includePatch: options.full,
    progressLabel: "Embedding commits",
  });

  // Run postIndex hooks — plugins can transform indexed commits
  if (registry) {
    const hookResult = await runHookChain(registry, "postIndex", {
      point: "postIndex",
      indexed: [...indexedCommits],
    });
    indexedCommits = hookResult.indexed;
  }

  const now = new Date().toISOString();
  const targetPaths = resolveModelIndexPaths(paths, modelName);
  ensureIndexArtifactDirectory(targetPaths);
  await saveIndexWithAnn(targetPaths.indexPath, {
    version: 1,
    modelName,
    createdAt: now,
    lastUpdatedAt: now,
    repositoryRoot: paths.repoRoot,
    includePatch: options.full,
    vectorDtype: options.vectorDtype ?? "f32",
    commits: indexedCommits,
  });

  console.log(`Saved index to ${targetPaths.indexPath}`);
}
