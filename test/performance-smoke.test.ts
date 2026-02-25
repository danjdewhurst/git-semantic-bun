import { describe, expect, it } from "bun:test";
import { benchmarkRanking } from "../src/core/benchmark.ts";

describe("performance smoke", () => {
  it("keeps heap top-k within sane bound vs baseline full sort", () => {
    const items = Array.from({ length: 5000 }, (_unused, index) => ({
      score: Math.sin(index) + Math.cos(index / 3),
    }));

    const result = benchmarkRanking(items, 20, 25);

    expect(result.baselineMs).toBeGreaterThan(0);
    expect(result.optimisedMs).toBeGreaterThan(0);

    // Guardrail: optimised path should not be catastrophically worse.
    expect(result.optimisedMs).toBeLessThan(result.baselineMs * 10);
  });
});
