import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  loadBenchmarkHistory,
  renderBenchmarkHistorySummary,
  saveBenchmarkHistory,
} from "../src/core/benchmark-history.ts";

describe("benchmark history", () => {
  it("saves and reloads benchmark entries", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "gsb-benchmark-history-"));
    try {
      const historyPath = path.join(dir, "benchmarks.jsonl");
      saveBenchmarkHistory(historyPath, {
        timestamp: "2026-02-25T00:00:00.000Z",
        query: "token refresh",
        candidates: 100,
        limit: 10,
        iterations: 20,
        baselineMs: 12.5,
        optimisedMs: 4.2,
        speedup: 2.97,
      });

      const entries = loadBenchmarkHistory(historyPath);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.query).toBe("token refresh");

      const summary = renderBenchmarkHistorySummary(entries);
      expect(summary).toContain("Recent benchmark runs:");
      expect(summary).toContain("speedup 2.97x");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns empty history when log does not exist", () => {
    const entries = loadBenchmarkHistory("/tmp/does-not-exist-benchmarks.jsonl");
    expect(entries).toEqual([]);
  });
});
