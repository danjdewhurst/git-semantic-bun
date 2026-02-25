import { describe, expect, it } from "bun:test";
import { bm25ScoresFromCache, buildLexicalCache } from "../src/core/lexical-cache.ts";
import type { IndexedCommit } from "../src/core/types.ts";

const commits: IndexedCommit[] = [
  {
    hash: "a",
    author: "Dan",
    date: "2026-01-01T00:00:00.000Z",
    message: "fix token refresh race condition",
    files: ["src/auth.ts"],
    embedding: [1, 0],
  },
  {
    hash: "b",
    author: "Dan",
    date: "2026-01-02T00:00:00.000Z",
    message: "update docs and comments",
    files: ["README.md"],
    embedding: [0, 1],
  },
];

describe("lexical cache", () => {
  it("builds cache and scores relevant commit higher", () => {
    const cache = buildLexicalCache(commits);
    const scores = bm25ScoresFromCache(
      "token refresh race",
      cache,
      commits.map((c) => c.hash),
    );

    expect(scores.get("a") ?? 0).toBeGreaterThan(scores.get("b") ?? 0);
  });

  it("returns empty for empty query tokens", () => {
    const cache = buildLexicalCache(commits);
    const scores = bm25ScoresFromCache(
      "--",
      cache,
      commits.map((c) => c.hash),
    );
    expect(scores.size).toBe(0);
  });
});
