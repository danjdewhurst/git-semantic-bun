import { describe, expect, it } from "bun:test";
import { benchmarkRanking } from "../src/core/benchmark.ts";

describe("benchmarkRanking", () => {
  it("returns timing information and speedup", () => {
    const items = Array.from({ length: 200 }, (_unused, index) => ({ score: Math.sin(index) }));

    const result = benchmarkRanking(items, 10, 5);

    expect(result.baselineMs).toBeGreaterThanOrEqual(0);
    expect(result.optimisedMs).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(result.speedup)).toBeTrue();
  });

  it("rejects non-positive iteration count", () => {
    expect(() => benchmarkRanking([{ score: 1 }], 5, 0)).toThrow(
      "Iterations must be greater than zero",
    );
  });
});
