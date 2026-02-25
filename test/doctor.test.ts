import { describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runDoctorChecks } from "../src/core/doctor.ts";
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
});
