import { DEFAULT_BATCH_SIZE } from "../core/constants.ts";
import { createEmbedder } from "../core/embeddings.ts";
import { commitExists, isAncestorCommit, readCommits } from "../core/git.ts";
import { dedupeCommits, embedCommits } from "../core/indexing.ts";
import { loadIndex, saveIndex } from "../core/index-store.ts";
import { ensureSemanticDirectories, resolveRepoPaths } from "../core/paths.ts";
import { filterCommitsByPatterns, loadGsbIgnorePatterns } from "../core/patterns.ts";
import { validateBatchSize } from "../core/parsing.ts";

export interface UpdateOptions {
  full?: boolean;
  batchSize: number;
  include: string[];
  exclude: string[];
  vectorDtype?: "f32" | "f16";
}

const WINDOWED_RECOVERY_DAYS = 90;

function newestIndexedCommitHash(indexCommits: { hash: string; date: string }[]): string | undefined {
  const sorted = [...indexCommits].sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return sorted[0]?.hash;
}

function newestIndexedCommitDate(indexCommits: { date: string }[]): Date | undefined {
  const sorted = [...indexCommits].sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  const date = sorted[0]?.date;
  return date ? new Date(date) : undefined;
}

function recoveryWindowStart(referenceDate: Date): Date {
  const windowStart = new Date(referenceDate);
  windowStart.setUTCDate(windowStart.getUTCDate() - WINDOWED_RECOVERY_DAYS);
  return windowStart;
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

  const hashStillExists = commitExists(paths.repoRoot, latestHash);
  const hashIsAncestor = hashStillExists ? isAncestorCommit(paths.repoRoot, latestHash) : false;
  const divergenceDetected = !hashStillExists || !hashIsAncestor;

  let recoveryWindow: Date | undefined;
  let newCommits = readCommits({
    cwd: paths.repoRoot,
    includePatch,
    sinceHash: latestHash,
  });

  if (divergenceDetected) {
    console.warn("Warning: indexed history appears to have diverged (rebase/force-push detected).");

    const newestDate = newestIndexedCommitDate(index.commits) ?? new Date(index.lastUpdatedAt);
    recoveryWindow = recoveryWindowStart(newestDate);

    console.warn(
      `Warning: applying windowed recovery from ${recoveryWindow.toISOString()} (last resort is full rebuild via gsb index).`,
    );

    newCommits = readCommits({
      cwd: paths.repoRoot,
      includePatch,
      sinceDate: recoveryWindow,
    });
  }

  const ignores = loadGsbIgnorePatterns(paths.repoRoot);
  const filteredNewCommits = filterCommitsByPatterns(newCommits, options.include, [...options.exclude, ...ignores]);

  if (filteredNewCommits.length === 0) {
    console.log("Index is already up to date.");
    return;
  }

  console.log(`Embedding ${filteredNewCommits.length} new commits using ${index.modelName}`);
  const embedder = await createEmbedder(index.modelName, paths.cacheDir);
  const newlyIndexed = await embedCommits(filteredNewCommits, embedder, {
    batchSize,
    includePatch,
    progressLabel: "Embedding new commits"
  });

  const preservedOlderCommits =
    divergenceDetected && recoveryWindow
      ? index.commits.filter((commit) => new Date(commit.date).getTime() < recoveryWindow.getTime())
      : index.commits;

  const merged = dedupeCommits([...newlyIndexed, ...preservedOlderCommits]).sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  saveIndex(paths.indexPath, {
    ...index,
    includePatch,
    vectorDtype: options.vectorDtype ?? index.vectorDtype ?? "f32",
    lastUpdatedAt: new Date().toISOString(),
    commits: merged
  });

  console.log(`Updated index with ${newlyIndexed.length} commits at ${paths.indexPath}`);
}
