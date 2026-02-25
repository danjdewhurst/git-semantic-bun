import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getIndexSizeBytes, getVectorSizeBytes, loadIndex, saveIndex } from "../src/core/index-store.ts";
import type { SemanticIndex } from "../src/core/types.ts";

describe("index-store", () => {
  it("writes json and compact sidecar, then loads compact index", () => {
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
            embedding: [0.5, 0.25, 0.125],
          },
        ],
      };

      saveIndex(indexPath, index);
      const loaded = loadIndex(indexPath);
      expect(loaded).toEqual(index);
      expect(getIndexSizeBytes(indexPath)).toBeGreaterThan(0);
      expect(getVectorSizeBytes(indexPath)).toBeGreaterThan(0);
      expect(existsSync(path.join(dir, "index.meta.json"))).toBeTrue();
      expect(existsSync(path.join(dir, "index.vec.f32"))).toBeTrue();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loads legacy json when compact files are missing", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "gsb-index-legacy-test-"));
    try {
      const indexPath = path.join(dir, "index.json");
      const legacy: SemanticIndex = {
        version: 1,
        modelName: "Xenova/all-MiniLM-L6-v2",
        createdAt: "2025-01-01T00:00:00.000Z",
        lastUpdatedAt: "2025-01-02T00:00:00.000Z",
        repositoryRoot: "/repo",
        includePatch: false,
        commits: [
          {
            hash: "def",
            author: "Bob",
            date: "2025-01-03T00:00:00.000Z",
            message: "fix: legacy",
            files: ["README.md"],
            embedding: [1, 0, 0],
          },
        ],
      };

      writeFileSync(indexPath, `${JSON.stringify(legacy, null, 2)}\n`, "utf8");
      const loaded = loadIndex(indexPath);
      expect(loaded).toEqual(legacy);
      expect(getVectorSizeBytes(indexPath)).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
