import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { filterCommitsByPatterns, loadGsbIgnorePatterns } from "../src/core/patterns.ts";
import type { GitCommit } from "../src/core/types.ts";

const commits: GitCommit[] = [
  {
    hash: "a",
    author: "Dan",
    date: "2026-01-01T00:00:00.000Z",
    message: "feat: api",
    files: ["src/api.ts", "dist/app.js"],
  },
  {
    hash: "b",
    author: "Dan",
    date: "2026-01-02T00:00:00.000Z",
    message: "chore: deps",
    files: ["node_modules/pkg/index.js"],
  },
];

describe("patterns", () => {
  it("applies include patterns", () => {
    const result = filterCommitsByPatterns(commits, ["src/**"], []);
    expect(result).toHaveLength(1);
    expect(result[0]?.files).toEqual(["src/api.ts"]);
  });

  it("applies exclude patterns", () => {
    const result = filterCommitsByPatterns(commits, [], ["dist/**", "node_modules/**"]);
    expect(result).toHaveLength(1);
    expect(result[0]?.files).toEqual(["src/api.ts"]);
  });

  it("loads .gsbignore patterns", () => {
    const repo = mkdtempSync(path.join(tmpdir(), "gsb-ignore-test-"));
    try {
      writeFileSync(
        path.join(repo, ".gsbignore"),
        ["# comment", "", "dist/**", "node_modules/**"].join("\n"),
        "utf8",
      );

      const patterns = loadGsbIgnorePatterns(repo);
      expect(patterns).toEqual(["dist/**", "node_modules/**"]);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
