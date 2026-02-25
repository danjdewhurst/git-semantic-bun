import { describe, expect, it } from "bun:test";
import { benchmarkRanking } from "../src/core/benchmark.ts";

describe("performance baseline", () => {
  it("captures a stable baseline snapshot shape", () => {
    const items = Array.from({ length: 10000 }, (_unused, index) => ({
      score: Math.sin(index * 0.17) + Math.cos(index * 0.031),
    }));

    const result = benchmarkRanking(items, 25, 20);

    expect(result.baselineMs).toBeGreaterThan(0);
    expect(result.optimisedMs).toBeGreaterThan(0);
    expect(Number.isFinite(result.speedup)).toBeTrue();

    // Safety floor to catch pathological regressions.
    expect(result.speedup).toBeGreaterThan(0.05);
  });
});
