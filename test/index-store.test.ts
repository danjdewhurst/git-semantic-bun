import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  getIndexSizeBytes,
  getVectorDtype,
  getVectorSizeBytes,
  loadIndex,
  saveIndex,
} from "../src/core/index-store.ts";
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
      expect(loaded.modelName).toBe(index.modelName);
      expect(loaded.commits).toEqual(index.commits);
      expect(typeof loaded.checksum).toBe("string");
      expect(getIndexSizeBytes(indexPath)).toBeGreaterThan(0);
      expect(getVectorSizeBytes(indexPath)).toBeGreaterThan(0);
      expect(getVectorDtype(indexPath)).toBe("f32");
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

      saveIndex(indexPath, legacy);
      rmSync(path.join(dir, "index.meta.json"));
      rmSync(path.join(dir, "index.vec.f32"));

      const loaded = loadIndex(indexPath);
      expect(loaded.modelName).toBe(legacy.modelName);
      expect(loaded.commits).toEqual(legacy.commits);
      expect(typeof loaded.checksum).toBe("string");
      expect(getVectorSizeBytes(indexPath)).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("supports f16 compact vector storage", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "gsb-index-f16-test-"));
    try {
      const indexPath = path.join(dir, "index.json");
      saveIndex(indexPath, {
        version: 1,
        modelName: "Xenova/all-MiniLM-L6-v2",
        createdAt: "2025-01-01T00:00:00.000Z",
        lastUpdatedAt: "2025-01-02T00:00:00.000Z",
        repositoryRoot: "/repo",
        includePatch: false,
        vectorDtype: "f16",
        commits: [
          {
            hash: "f16",
            author: "Alice",
            date: "2025-01-04T00:00:00.000Z",
            message: "feat: f16",
            files: ["src/f16.ts"],
            embedding: [0.1234, -0.5678, 0.9101],
          },
        ],
      });

      const loaded = loadIndex(indexPath);
      expect(loaded.vectorDtype).toBe("f16");
      expect(getVectorDtype(indexPath)).toBe("f16");
      expect(loaded.commits[0]?.embedding[0] ?? 0).toBeCloseTo(0.1234, 3);
      expect(existsSync(path.join(dir, "index.vec.f16"))).toBeTrue();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails when checksum does not match", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "gsb-index-checksum-test-"));
    try {
      const indexPath = path.join(dir, "index.json");
      saveIndex(indexPath, {
        version: 1,
        modelName: "Xenova/all-MiniLM-L6-v2",
        createdAt: "2025-01-01T00:00:00.000Z",
        lastUpdatedAt: "2025-01-02T00:00:00.000Z",
        repositoryRoot: "/repo",
        includePatch: false,
        commits: [
          {
            hash: "xyz",
            author: "Alice",
            date: "2025-01-04T00:00:00.000Z",
            message: "feat: checksum",
            files: ["src/x.ts"],
            embedding: [0.1, 0.2, 0.3],
          },
        ],
      });

      const tampered = JSON.parse(readFileSync(indexPath, "utf8")) as Record<string, unknown>;
      tampered.checksum = "invalid";
      writeFileSync(indexPath, `${JSON.stringify(tampered, null, 2)}\n`, "utf8");
      rmSync(path.join(dir, "index.meta.json"));
      rmSync(path.join(dir, "index.vec.f32"));

      expect(() => loadIndex(indexPath)).toThrow("checksum mismatch");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
