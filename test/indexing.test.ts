import { describe, expect, it } from "bun:test";
import { buildEmbeddingText, dedupeCommits, embedCommits } from "../src/core/indexing.ts";
import type { Embedder } from "../src/core/embeddings.ts";
import type { GitCommit } from "../src/core/types.ts";

function makeCommit(overrides: Partial<GitCommit> = {}): GitCommit {
  return {
    hash: "abc123",
    author: "Dan",
    date: "2026-02-25T14:00:00.000Z",
    message: "fix: handle parser edge case",
    files: ["src/core/parsing.ts", "test/parsing.test.ts"],
    ...overrides,
  };
}

describe("buildEmbeddingText", () => {
  it("prioritises message and files without hash/date boilerplate", () => {
    const text = buildEmbeddingText(makeCommit(), false);

    expect(text).toContain("message (high-signal):");
    expect(text).toContain("fix: handle parser edge case");
    expect(text).toContain("files (medium-signal):");
    expect(text).toContain("src/core/parsing.ts");

    expect(text).not.toContain("hash:");
    expect(text).not.toContain("date:");
    expect(text).not.toContain("author:");
  });

  it("adds optional patch summary when includePatch=true", () => {
    const text = buildEmbeddingText(
      makeCommit({
        patch: [
          "diff --git a/src/a.ts b/src/a.ts",
          "index 123..456 100644",
          "--- a/src/a.ts",
          "+++ b/src/a.ts",
          "-const a = 1;",
          "+const a = 2;",
          " context line",
        ].join("\n"),
      }),
      true,
    );

    expect(text).toContain("patch summary (optional):");
    expect(text).toContain("-const a = 1;");
    expect(text).toContain("+const a = 2;");
    expect(text).not.toContain("diff --git");
    expect(text).not.toContain(" context line");
  });

  it("omits patch section when includePatch=false", () => {
    const text = buildEmbeddingText(makeCommit({ patch: "+new line" }), false);
    expect(text).not.toContain("patch summary (optional):");
  });
});

describe("embedCommits", () => {
  it("embeds commits in batches and preserves metadata", async () => {
    const commits: GitCommit[] = [
      makeCommit({ hash: "a1", message: "feat: one" }),
      makeCommit({ hash: "b2", message: "fix: two" }),
      makeCommit({ hash: "c3", message: "refactor: three" }),
    ];

    const embedder: Embedder = {
      modelName: "test-model",
      async embedBatch(texts: string[]): Promise<number[][]> {
        return texts.map((_text, index) => [index + 1, index + 2]);
      },
    };

    const embedded = await embedCommits(commits, embedder, {
      batchSize: 2,
      includePatch: false,
      progressLabel: "test",
    });

    expect(embedded).toHaveLength(3);
    expect(embedded[0]?.hash).toBe("a1");
    expect(embedded[1]?.hash).toBe("b2");
    expect(embedded[2]?.embedding[0]).toBeCloseTo(0.4472135955, 6);
    expect(embedded[2]?.embedding[1]).toBeCloseTo(0.8944271910, 6);
  });

  it("throws when embedder returns mismatched vector count", async () => {
    const embedder: Embedder = {
      modelName: "test-model",
      async embedBatch(): Promise<number[][]> {
        return [];
      },
    };

    await expect(
      embedCommits([makeCommit()], embedder, {
        batchSize: 1,
        includePatch: false,
        progressLabel: "test",
      }),
    ).rejects.toThrow("Embedding batch size mismatch");
  });
});

describe("dedupeCommits", () => {
  it("removes duplicate hashes while preserving first occurrence", () => {
    const deduped = dedupeCommits([
      {
        hash: "same",
        author: "Dan",
        date: "2026-02-25T14:00:00.000Z",
        message: "first",
        files: ["a.ts"],
        embedding: [1, 0],
      },
      {
        hash: "same",
        author: "Dan",
        date: "2026-02-25T14:01:00.000Z",
        message: "second",
        files: ["b.ts"],
        embedding: [0, 1],
      },
    ]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.message).toBe("first");
  });
});
