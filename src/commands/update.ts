import { DEFAULT_BATCH_SIZE } from "../core/constants.ts";
import { createEmbedder } from "../core/embeddings.ts";
import { readCommits } from "../core/git.ts";
import { dedupeCommits, embedCommits } from "../core/indexing.ts";
import { loadIndex, saveIndex } from "../core/index-store.ts";
import { ensureSemanticDirectories, resolveRepoPaths } from "../core/paths.ts";
import { validateBatchSize } from "../core/parsing.ts";

export interface UpdateOptions {
  full?: boolean;
  batchSize: number;
}

function newestIndexedCommitHash(indexCommits: { hash: string; date: string }[]): string | undefined {
  const sorted = [...indexCommits].sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return sorted[0]?.hash;
}

export async function runUpdate(options: UpdateOptions): Promise<void> {
  const paths = resolveRepoPaths();
  ensureSemanticDirectories(paths);

  const index = loadIndex(paths.indexPath);
  const latestHash = newestIndexedCommitHash(index.commits);

  if (!latestHash) {
    throw new Error("Index is empty. Run `gsb index` first.");
  }

  const includePatch = options.full ?? index.includePatch;
  const batchSize = validateBatchSize(options.batchSize || DEFAULT_BATCH_SIZE);

  const newCommits = readCommits({
    cwd: paths.repoRoot,
    includePatch,
    sinceHash: latestHash
  });

  if (newCommits.length === 0) {
    console.log("Index is already up to date.");
    return;
  }

  console.log(`Embedding ${newCommits.length} new commits using ${index.modelName}`);
  const embedder = await createEmbedder(index.modelName, paths.cacheDir);
  const newlyIndexed = await embedCommits(newCommits, embedder, {
    batchSize,
    includePatch,
    progressLabel: "Embedding new commits"
  });

  const merged = dedupeCommits([...newlyIndexed, ...index.commits]).sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  saveIndex(paths.indexPath, {
    ...index,
    includePatch,
    lastUpdatedAt: new Date().toISOString(),
    commits: merged
  });

  console.log(`Updated index with ${newlyIndexed.length} commits at ${paths.indexPath}`);
}
