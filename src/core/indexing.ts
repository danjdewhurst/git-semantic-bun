import type { Embedder } from "./embeddings.ts";
import type { GitCommit, IndexedCommit } from "./types.ts";

export interface IndexingOptions {
  batchSize: number;
  includePatch: boolean;
  progressLabel: string;
}

const PATCH_SUMMARY_MAX_LINES = 40;
const PATCH_SUMMARY_MAX_CHARS = 4000;

function buildPatchSummary(patch: string): string {
  const lines = patch
    .split("\n")
    .filter((line) => line.startsWith("+") || line.startsWith("-"))
    .filter((line) => !(line.startsWith("+++") || line.startsWith("---")))
    .slice(0, PATCH_SUMMARY_MAX_LINES);

  const summary = lines.join("\n").slice(0, PATCH_SUMMARY_MAX_CHARS).trim();
  return summary;
}

export function buildEmbeddingText(commit: GitCommit, includePatch: boolean): string {
  const sections: string[] = [
    "message (high-signal):",
    commit.message,
    "",
    "files (medium-signal):",
    commit.files.join("\n")
  ];

  if (includePatch && commit.patch) {
    const patchSummary = buildPatchSummary(commit.patch);
    if (patchSummary.length > 0) {
      sections.push("", "patch summary (optional):", patchSummary);
    }
  }

  return sections.join("\n");
}

export async function embedCommits(
  commits: readonly GitCommit[],
  embedder: Embedder,
  options: IndexingOptions
): Promise<IndexedCommit[]> {
  const results: IndexedCommit[] = [];

  for (let offset = 0; offset < commits.length; offset += options.batchSize) {
    const batch = commits.slice(offset, offset + options.batchSize);
    const payload = batch.map((commit) => buildEmbeddingText(commit, options.includePatch));
    const vectors = await embedder.embedBatch(payload);

    for (let i = 0; i < batch.length; i += 1) {
      const commit = batch[i];
      const vector = vectors[i];
      if (!commit || !vector) {
        throw new Error("Embedding batch size mismatch.");
      }

      results.push({
        hash: commit.hash,
        author: commit.author,
        date: commit.date,
        message: commit.message,
        files: commit.files,
        embedding: vector
      });
    }

    const done = Math.min(offset + batch.length, commits.length);
    process.stdout.write(`\r${options.progressLabel}: ${done}/${commits.length}`);
  }

  if (commits.length > 0) {
    process.stdout.write("\n");
  }

  return results;
}

export function dedupeCommits(commits: readonly IndexedCommit[]): IndexedCommit[] {
  const seen = new Set<string>();
  const unique: IndexedCommit[] = [];

  for (const commit of commits) {
    if (seen.has(commit.hash)) {
      continue;
    }

    seen.add(commit.hash);
    unique.push(commit);
  }

  return unique;
}
