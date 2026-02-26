import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { executeSearch } from "../src/commands/search.ts";
import { createEmbedder } from "../src/core/embeddings.ts";
import { loadIndex, saveIndex } from "../src/core/index-store.ts";
import {
  type PerfSnapshotMetrics,
  type RegressionThresholds,
  findRegressionViolations,
  summariseSamples,
} from "../src/core/perf-guardrails.ts";

interface PerfBaselineFile {
  version: 1;
  dataset: {
    commitCount: number;
    dimension: number;
    coldIterations: number;
    warmIterations: number;
    indexLoadIterations: number;
  };
  thresholds: RegressionThresholds;
  metrics: PerfSnapshotMetrics;
}

interface PerfSnapshotFile {
  version: 1;
  generatedAt: string;
  runtime: {
    bun: string;
    platform: string;
    arch: string;
  };
  dataset: PerfBaselineFile["dataset"];
  metrics: PerfSnapshotMetrics;
  samplesMs: {
    cold: number[];
    warm: number[];
    indexLoad: number[];
  };
}

interface CliOptions {
  baselinePath: string;
  outputPath: string;
  writeBaseline: boolean;
}

const DEFAULT_DATASET = {
  commitCount: 5000,
  dimension: 32,
  coldIterations: 15,
  warmIterations: 30,
  indexLoadIterations: 20,
};

function parseArgs(argv: readonly string[]): CliOptions {
  let baselinePath = ".github/perf-baseline.json";
  let outputPath = "perf-artifacts/perf-snapshot.json";
  let writeBaseline = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--baseline") {
      baselinePath = argv[i + 1] ?? baselinePath;
      i += 1;
      continue;
    }
    if (arg === "--output") {
      outputPath = argv[i + 1] ?? outputPath;
      i += 1;
      continue;
    }
    if (arg === "--write-baseline") {
      writeBaseline = true;
    }
  }

  return { baselinePath, outputPath, writeBaseline };
}

function syntheticVector(seed: number, dimension: number): number[] {
  const vector: number[] = [];
  let norm = 0;
  for (let i = 0; i < dimension; i += 1) {
    const value = Math.sin(seed * 0.17 + i * 0.37) + Math.cos(seed * 0.11 + i * 0.19);
    vector.push(value);
    norm += value * value;
  }

  const scale = norm > 0 ? 1 / Math.sqrt(norm) : 1;
  return vector.map((value) => value * scale);
}

function buildSyntheticIndex(commitCount: number, dimension: number, repositoryRoot: string) {
  const commits = Array.from({ length: commitCount }, (_unused, index) => ({
    hash: `h${index.toString(16).padStart(8, "0")}`,
    author: `author-${index % 10}`,
    date: new Date(Date.UTC(2023, 0, 1 + (index % 730))).toISOString(),
    message: `feat: synthetic commit ${index} cache token-${index % 25}`,
    files: [`src/module-${index % 40}.ts`, `docs/topic-${index % 12}.md`],
    embedding: syntheticVector(index + 1, dimension),
  }));

  const now = new Date().toISOString();
  return {
    version: 1 as const,
    modelName: "Xenova/all-MiniLM-L6-v2",
    createdAt: now,
    lastUpdatedAt: now,
    repositoryRoot,
    includePatch: false,
    vectorDtype: "f32" as const,
    commits,
  };
}

async function measureSuites(dataset = DEFAULT_DATASET): Promise<{
  metrics: PerfSnapshotMetrics;
  samplesMs: PerfSnapshotFile["samplesMs"];
}> {
  process.env.GSB_FAKE_EMBEDDINGS = "1";

  const tempRoot = mkdtempSync(path.join(tmpdir(), "gsb-perf-"));
  const semanticDir = path.join(tempRoot, ".git", "semantic-index");
  const indexPath = path.join(semanticDir, "index.json");

  mkdirSync(semanticDir, { recursive: true });
  const index = buildSyntheticIndex(dataset.commitCount, dataset.dimension, tempRoot);
  saveIndex(indexPath, index);

  const query = "cache token and module improvements";
  const coldSamples: number[] = [];
  const warmSamples: number[] = [];
  const indexLoadSamples: number[] = [];

  try {
    for (let i = 0; i < dataset.indexLoadIterations; i += 1) {
      const start = performance.now();
      loadIndex(indexPath);
      const end = performance.now();
      indexLoadSamples.push(Number((end - start).toFixed(3)));
    }

    for (let i = 0; i < dataset.coldIterations; i += 1) {
      const start = performance.now();
      const loaded = loadIndex(indexPath);
      const embedder = await createEmbedder(loaded.modelName, path.join(semanticDir, "cache"));
      await executeSearch(
        query,
        {
          format: "json",
          limit: 15,
          recencyBoost: true,
          strategy: "exact",
        },
        {
          index: loaded,
          embedder,
          repoRoot: tempRoot,
        },
      );
      const end = performance.now();
      coldSamples.push(Number((end - start).toFixed(3)));
    }

    const warmIndex = loadIndex(indexPath);
    const warmEmbedder = await createEmbedder(warmIndex.modelName, path.join(semanticDir, "cache"));
    // Warm-up pass to avoid one-time setup noise in warm suite.
    await executeSearch(
      query,
      { format: "json", limit: 15, recencyBoost: true, strategy: "exact" },
      { index: warmIndex, embedder: warmEmbedder, repoRoot: tempRoot },
    );

    for (let i = 0; i < dataset.warmIterations; i += 1) {
      const q = `cache token-${i % 25} module-${i % 40}`;
      const start = performance.now();
      await executeSearch(
        q,
        {
          format: "json",
          limit: 15,
          recencyBoost: true,
          strategy: "exact",
        },
        {
          index: warmIndex,
          embedder: warmEmbedder,
          repoRoot: tempRoot,
        },
      );
      const end = performance.now();
      warmSamples.push(Number((end - start).toFixed(3)));
    }

    return {
      metrics: {
        cold: summariseSamples(coldSamples),
        warm: summariseSamples(warmSamples),
        indexLoad: summariseSamples(indexLoadSamples),
      },
      samplesMs: {
        cold: coldSamples,
        warm: warmSamples,
        indexLoad: indexLoadSamples,
      },
    };
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function loadBaseline(filePath: string): PerfBaselineFile {
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as PerfBaselineFile;
  if (parsed.version !== 1) {
    throw new Error(`Unsupported baseline version in ${filePath}`);
  }
  return parsed;
}

function printSuite(name: string, suite: PerfSnapshotMetrics[keyof PerfSnapshotMetrics]): void {
  console.log(
    `${name}: p50=${suite.p50Ms.toFixed(3)}ms p95=${suite.p95Ms.toFixed(3)}ms mean=${suite.meanMs.toFixed(3)}ms`,
  );
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const { metrics, samplesMs } = await measureSuites(DEFAULT_DATASET);

  const snapshot: PerfSnapshotFile = {
    version: 1,
    generatedAt: new Date().toISOString(),
    runtime: {
      bun: Bun.version,
      platform: process.platform,
      arch: process.arch,
    },
    dataset: DEFAULT_DATASET,
    metrics,
    samplesMs,
  };

  writeJson(options.outputPath, snapshot);
  console.log(`Perf snapshot written: ${options.outputPath}`);
  printSuite("cold", metrics.cold);
  printSuite("warm", metrics.warm);
  printSuite("indexLoad", metrics.indexLoad);

  if (options.writeBaseline) {
    const baseline: PerfBaselineFile = {
      version: 1,
      dataset: DEFAULT_DATASET,
      thresholds: {
        coldP50Pct: 250,
        coldP95Pct: 250,
        warmP50Pct: 300,
        warmP95Pct: 300,
        indexLoadP50Pct: 250,
      },
      metrics,
    };
    writeJson(options.baselinePath, baseline);
    console.log(`Baseline written: ${options.baselinePath}`);
    return;
  }

  const baseline = loadBaseline(options.baselinePath);
  const violations = findRegressionViolations(baseline.metrics, metrics, baseline.thresholds);
  if (violations.length === 0) {
    console.log("Perf guardrails: PASS");
    return;
  }

  console.error("Perf guardrails: FAIL");
  for (const violation of violations) {
    console.error(
      `- ${violation.metric}: current=${violation.currentMs.toFixed(3)}ms baseline=${violation.baselineMs.toFixed(3)}ms allowed=${violation.allowedMs.toFixed(3)}ms (+${violation.thresholdPct}%)`,
    );
  }
  process.exitCode = 1;
}

await main();
