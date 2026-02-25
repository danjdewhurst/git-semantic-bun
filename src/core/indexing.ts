import type { Embedder } from "./embeddings.ts";
import type { GitCommit, IndexedCommit } from "./types.ts";

export interface IndexingOptions {
  batchSize: number;
  includePatch: boolean;
  progressLabel: string;
}

function commitToEmbeddingText(commit: GitCommit, includePatch: boolean): string {
  const parts: string[] = [
    `hash:${commit.hash}`,
    `author:${commit.author}`,
    `date:${commit.date}`,
    `message:${commit.message}`,
    `files:${commit.files.join(", ")}`
  ];

  if (includePatch && commit.patch) {
    parts.push(`patch:\n${commit.patch}`);
  }

  return parts.join("\n");
}

export async function embedCommits(
  commits: readonly GitCommit[],
  embedder: Embedder,
  options: IndexingOptions
): Promise<IndexedCommit[]> {
  const results: IndexedCommit[] = [];

  for (let offset = 0; offset < commits.length; offset += options.batchSize) {
    const batch = commits.slice(offset, offset + options.batchSize);
    const payload = batch.map((commit) => commitToEmbeddingText(commit, options.includePatch));
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
