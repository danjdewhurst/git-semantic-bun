import { describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runDoctorChecks, runDoctorFixes } from "../src/core/doctor.ts";
import type { RepoPaths } from "../src/core/paths.ts";

describe("runDoctorChecks", () => {
  it("reports expected statuses for present and missing files", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "gsb-doctor-test-"));
    try {
      const semanticDir = path.join(dir, "semantic-index");
      const cacheDir = path.join(semanticDir, "cache");
      mkdirSync(cacheDir, { recursive: true });

      const paths: RepoPaths = {
        repoRoot: dir,
        gitDir: path.join(dir, ".git"),
        semanticDir,
        cacheDir,
        indexPath: path.join(semanticDir, "index.json"),
        compactMetaPath: path.join(semanticDir, "index.meta.json"),
        compactVectorPath: path.join(semanticDir, "index.vec.f32"),
        metadataPath: path.join(cacheDir, "metadata.json"),
        benchmarkHistoryPath: path.join(semanticDir, "benchmarks.jsonl"),
      };

      writeFileSync(paths.indexPath, "{}\n", "utf8");
      writeFileSync(paths.compactMetaPath, "{}\n", "utf8");

      const checks = runDoctorChecks(paths);
      const byName = new Map(checks.map((check) => [check.name, check]));

      expect(byName.get("index")?.ok).toBeTrue();
      expect(byName.get("compact metadata")?.ok).toBeTrue();
      expect(byName.get("compact vectors")?.ok).toBeFalse();
      expect(byName.get("model metadata")?.ok).toBeFalse();
      expect(byName.get("model cache directory")?.ok).toBeTrue();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("applies safe repairs with --fix logic", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "gsb-doctor-fix-test-"));
    try {
      const semanticDir = path.join(dir, "semantic-index");
      const cacheDir = path.join(semanticDir, "cache");
      mkdirSync(semanticDir, { recursive: true });

      const paths: RepoPaths = {
        repoRoot: dir,
        gitDir: path.join(dir, ".git"),
        semanticDir,
        cacheDir,
        indexPath: path.join(semanticDir, "index.json"),
        compactMetaPath: path.join(semanticDir, "index.meta.json"),
        compactVectorPath: path.join(semanticDir, "index.vec.f32"),
        metadataPath: path.join(cacheDir, "metadata.json"),
        benchmarkHistoryPath: path.join(semanticDir, "benchmarks.jsonl"),
      };

      writeFileSync(
        paths.indexPath,
        `${JSON.stringify(
          {
            version: 1,
            modelName: "Xenova/all-MiniLM-L6-v2",
            createdAt: "2026-01-01T00:00:00.000Z",
            lastUpdatedAt: "2026-01-02T00:00:00.000Z",
            repositoryRoot: dir,
            includePatch: false,
            commits: [
              {
                hash: "abc",
                author: "Dan",
                date: "2026-01-01T00:00:00.000Z",
                message: "feat: init",
                files: ["src/a.ts"],
                embedding: [1, 0, 0],
              },
            ],
          },
          null,
          2,
        )}\n`,
        "utf8",
      );

      const result = runDoctorFixes(paths);
      expect(result.actions.length).toBeGreaterThan(0);

      const checks = runDoctorChecks(paths);
      const failing = checks.filter((check) => !check.ok);
      expect(failing).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
