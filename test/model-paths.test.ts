import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  modelStorageKey,
  resolveModelIndexPaths,
  resolveTargetIndexPaths,
} from "../src/core/model-paths.ts";
import type { RepoPaths } from "../src/core/paths.ts";

function makeRepoPaths(root: string): RepoPaths {
  const semanticDir = path.join(root, ".git", "semantic-index");
  const cacheDir = path.join(semanticDir, "cache");

  return {
    repoRoot: root,
    gitDir: path.join(root, ".git"),
    semanticDir,
    cacheDir,
    indexPath: path.join(semanticDir, "index.json"),
    compactMetaPath: path.join(semanticDir, "index.meta.json"),
    compactVectorPath: path.join(semanticDir, "index.vec.f32"),
    metadataPath: path.join(cacheDir, "metadata.json"),
    benchmarkHistoryPath: path.join(semanticDir, "benchmarks.jsonl"),
    annIndexPath: path.join(semanticDir, "index.ann.usearch"),
  };
}

describe("model paths", () => {
  it("creates stable storage key", () => {
    const keyA = modelStorageKey("Xenova/all-MiniLM-L6-v2");
    const keyB = modelStorageKey("Xenova/all-MiniLM-L6-v2");
    expect(keyA).toBe(keyB);
    expect(keyA).toContain("-");
  });

  it("resolves model-specific index paths", () => {
    const paths = makeRepoPaths("/tmp/repo");
    const modelPaths = resolveModelIndexPaths(paths, "Xenova/all-MiniLM-L6-v2");
    expect(modelPaths.indexPath).toContain("/models/");
    expect(modelPaths.indexPath).toEndWith("/index.json");
    expect(modelPaths.annIndexPath).toEndWith("/index.ann.usearch");
  });

  it("prefers metadata model index and falls back to legacy", () => {
    const repo = mkdtempSync(path.join(tmpdir(), "gsb-model-paths-"));
    try {
      const paths = makeRepoPaths(repo);
      mkdirSync(path.dirname(paths.metadataPath), { recursive: true });
      writeFileSync(
        paths.metadataPath,
        `${JSON.stringify(
          { modelName: "Xenova/all-MiniLM-L6-v2", initializedAt: new Date().toISOString() },
          null,
          2,
        )}\n`,
        "utf8",
      );

      const fallback = resolveTargetIndexPaths(paths);
      expect(fallback.indexPath).toBe(paths.indexPath);

      const modelPaths = resolveModelIndexPaths(paths, "Xenova/all-MiniLM-L6-v2");
      mkdirSync(path.dirname(modelPaths.indexPath), { recursive: true });
      writeFileSync(modelPaths.indexPath, "{}\n", "utf8");

      const preferred = resolveTargetIndexPaths(paths);
      expect(preferred.indexPath).toBe(modelPaths.indexPath);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
