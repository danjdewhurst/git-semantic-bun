export interface PerfSuiteSummary {
  count: number;
  minMs: number;
  maxMs: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
}

export interface PerfSnapshotMetrics {
  cold: PerfSuiteSummary;
  warm: PerfSuiteSummary;
  indexLoad: PerfSuiteSummary;
}

export interface RegressionThresholds {
  coldP50Pct: number;
  coldP95Pct: number;
  warmP50Pct: number;
  warmP95Pct: number;
  indexLoadP50Pct: number;
}

export interface RegressionViolation {
  metric: string;
  baselineMs: number;
  currentMs: number;
  allowedMs: number;
  thresholdPct: number;
}

function roundMs(value: number): number {
  return Number(value.toFixed(3));
}

export function summariseSamples(samples: readonly number[]): PerfSuiteSummary {
  if (samples.length === 0) {
    throw new Error("Cannot summarise empty samples.");
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const count = sorted.length;
  const minMs = sorted[0] ?? 0;
  const maxMs = sorted[count - 1] ?? 0;
  const total = sorted.reduce((sum, item) => sum + item, 0);
  const meanMs = total / count;

  const percentile = (p: number): number => {
    const index = Math.ceil((p / 100) * count) - 1;
    const safeIndex = Math.max(0, Math.min(count - 1, index));
    return sorted[safeIndex] ?? 0;
  };

  return {
    count,
    minMs: roundMs(minMs),
    maxMs: roundMs(maxMs),
    meanMs: roundMs(meanMs),
    p50Ms: roundMs(percentile(50)),
    p95Ms: roundMs(percentile(95)),
  };
}

export function findRegressionViolations(
  baseline: PerfSnapshotMetrics,
  current: PerfSnapshotMetrics,
  thresholds: RegressionThresholds,
): RegressionViolation[] {
  const checks: Array<{
    metric: string;
    baselineMs: number;
    currentMs: number;
    thresholdPct: number;
  }> = [
    {
      metric: "cold.p50Ms",
      baselineMs: baseline.cold.p50Ms,
      currentMs: current.cold.p50Ms,
      thresholdPct: thresholds.coldP50Pct,
    },
    {
      metric: "cold.p95Ms",
      baselineMs: baseline.cold.p95Ms,
      currentMs: current.cold.p95Ms,
      thresholdPct: thresholds.coldP95Pct,
    },
    {
      metric: "warm.p50Ms",
      baselineMs: baseline.warm.p50Ms,
      currentMs: current.warm.p50Ms,
      thresholdPct: thresholds.warmP50Pct,
    },
    {
      metric: "warm.p95Ms",
      baselineMs: baseline.warm.p95Ms,
      currentMs: current.warm.p95Ms,
      thresholdPct: thresholds.warmP95Pct,
    },
    {
      metric: "indexLoad.p50Ms",
      baselineMs: baseline.indexLoad.p50Ms,
      currentMs: current.indexLoad.p50Ms,
      thresholdPct: thresholds.indexLoadP50Pct,
    },
  ];

  const violations: RegressionViolation[] = [];
  for (const check of checks) {
    const allowedMs = roundMs(check.baselineMs * (1 + check.thresholdPct / 100));
    if (check.currentMs > allowedMs) {
      violations.push({
        metric: check.metric,
        baselineMs: check.baselineMs,
        currentMs: check.currentMs,
        allowedMs,
        thresholdPct: check.thresholdPct,
      });
    }
  }

  return violations;
}
