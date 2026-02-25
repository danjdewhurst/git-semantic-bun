import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { getIndexSizeBytes, loadIndex, saveIndex } from "../src/core/index-store.ts";
import type { SemanticIndex } from "../src/core/types.ts";

describe("index-store", () => {
  it("writes and reads index JSON", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "gsb-index-test-"));
    try {
      const indexPath = path.join(dir, "index.json");
      const index: SemanticIndex = {
        version: 1,
        modelName: "Xenova/all-MiniLM-L6-v2",
        createdAt: "2025-01-01T00:00:00.000Z",
        lastUpdatedAt: "2025-01-02T00:00:00.000Z",
        repositoryRoot: "/repo",
        includePatch: false,
        commits: [
          {
            hash: "abc",
            author: "Alice",
            date: "2025-01-01T00:00:00.000Z",
            message: "feat: init",
            files: ["src/cli.ts"],
            embedding: [0.1, 0.2, 0.3]
          }
        ]
      };

      saveIndex(indexPath, index);
      const loaded = loadIndex(indexPath);
      expect(loaded).toEqual(index);
      expect(getIndexSizeBytes(indexPath)).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
