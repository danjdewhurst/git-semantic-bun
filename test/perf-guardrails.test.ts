import { describe, expect, it } from "bun:test";
import { findRegressionViolations, summariseSamples } from "../src/core/perf-guardrails.ts";

describe("perf guardrails", () => {
  it("summarises samples with percentile stats", () => {
    const summary = summariseSamples([10, 12, 8, 20, 14]);
    expect(summary.count).toBe(5);
    expect(summary.minMs).toBe(8);
    expect(summary.maxMs).toBe(20);
    expect(summary.p50Ms).toBe(12);
    expect(summary.p95Ms).toBe(20);
  });

  it("detects regressions above thresholds", () => {
    const baseline = {
      cold: { count: 1, minMs: 40, maxMs: 40, meanMs: 40, p50Ms: 40, p95Ms: 40 },
      warm: { count: 1, minMs: 10, maxMs: 10, meanMs: 10, p50Ms: 10, p95Ms: 10 },
      indexLoad: { count: 1, minMs: 5, maxMs: 5, meanMs: 5, p50Ms: 5, p95Ms: 5 },
    };
    const current = {
      cold: { count: 1, minMs: 52, maxMs: 52, meanMs: 52, p50Ms: 52, p95Ms: 52 },
      warm: { count: 1, minMs: 11, maxMs: 11, meanMs: 11, p50Ms: 11, p95Ms: 11 },
      indexLoad: { count: 1, minMs: 7, maxMs: 7, meanMs: 7, p50Ms: 7, p95Ms: 7 },
    };

    const violations = findRegressionViolations(baseline, current, {
      coldP50Pct: 20,
      coldP95Pct: 20,
      warmP50Pct: 15,
      warmP95Pct: 15,
      indexLoadP50Pct: 30,
    });

    expect(violations.map((v) => v.metric)).toEqual([
      "cold.p50Ms",
      "cold.p95Ms",
      "indexLoad.p50Ms",
    ]);
  });
});
