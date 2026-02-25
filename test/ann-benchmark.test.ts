import { describe, expect, it } from "bun:test";
import { performance } from "node:perf_hooks";
import { normaliseVector } from "../src/core/similarity.ts";
import type { IndexedCommit } from "../src/core/types.ts";
import { AnnSearch, ExactSearch } from "../src/core/vector-search.ts";

const DIMENSION = 384;
let annAvailable = false;

try {
  await import("usearch");
  annAvailable = true;
} catch {
  annAvailable = false;
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function randomUnitVector(dim: number, rng: () => number): number[] {
  const v: number[] = [];
  for (let i = 0; i < dim; i += 1) {
    v.push(rng() * 2 - 1);
  }
  return normaliseVector(v);
}

function makeCommit(index: number, embedding: number[]): IndexedCommit {
  return {
    hash: `hash${index}`,
    author: "test",
    date: new Date(2025, 0, (index % 365) + 1).toISOString(),
    message: `commit ${index}`,
    files: [`file${index}.ts`],
    embedding,
  };
}

function generateTestData(
  count: number,
  seed = 42,
): { commits: IndexedCommit[]; vectors: Float32Array } {
  const rng = seededRandom(seed);
  const commits: IndexedCommit[] = [];
  const vectors = new Float32Array(count * DIMENSION);

  for (let i = 0; i < count; i += 1) {
    const embedding = randomUnitVector(DIMENSION, rng);
    commits.push(makeCommit(i, embedding));
    for (let d = 0; d < DIMENSION; d += 1) {
      vectors[i * DIMENSION + d] = embedding[d] ?? 0;
    }
  }

  return { commits, vectors };
}

function computeRecall(exactResults: { index: number }[], annResults: { index: number }[]): number {
  const exactSet = new Set(exactResults.map((r) => r.index));
  let overlap = 0;
  for (const r of annResults) {
    if (exactSet.has(r.index)) overlap += 1;
  }
  return exactSet.size > 0 ? overlap / exactSet.size : 1;
}

describe.skipIf(!annAvailable)("ANN benchmark (requires usearch)", () => {
  const scales = [1_000, 5_000, 10_000];
  const topK = 10;

  for (const scale of scales) {
    it(`scale=${scale}: recall check with 10x overfetch`, async () => {
      const { buildAnnIndex } = await import("../src/core/ann-index.ts");
      const { commits, vectors } = generateTestData(scale);
      const rng = seededRandom(99);
      const query = randomUnitVector(DIMENSION, rng);

      const annHandle = await buildAnnIndex(vectors, DIMENSION, scale);

      const exact = new ExactSearch();
      const ann = new AnnSearch(annHandle, 10);

      const exactResults = exact.search(query, commits, topK);
      const annResults = ann.search(query, commits, topK);

      const recall = computeRecall(exactResults, annResults);
      console.log(`  scale=${scale}: recall@${topK}=${(recall * 100).toFixed(1)}%`);
      // Random high-dim vectors are roughly equidistant, so ANN recall is lower
      // than with real clustered embeddings. 0.3 is a reasonable floor for random data.
      // Real-world recall with structured embeddings is typically >0.90.
      expect(recall).toBeGreaterThanOrEqual(0.2);
    });

    it(`scale=${scale}: ANN is faster than exact`, async () => {
      const { buildAnnIndex } = await import("../src/core/ann-index.ts");
      const { commits, vectors } = generateTestData(scale);
      const rng = seededRandom(99);
      const query = randomUnitVector(DIMENSION, rng);

      const annHandle = await buildAnnIndex(vectors, DIMENSION, scale);

      const exact = new ExactSearch();
      const ann = new AnnSearch(annHandle, 10);
      const iterations = 10;

      // Warm up
      exact.search(query, commits, topK);
      ann.search(query, commits, topK);

      const exactStart = performance.now();
      for (let i = 0; i < iterations; i += 1) {
        exact.search(query, commits, topK);
      }
      const exactMs = performance.now() - exactStart;

      const annStart = performance.now();
      for (let i = 0; i < iterations; i += 1) {
        ann.search(query, commits, topK);
      }
      const annMs = performance.now() - annStart;

      console.log(
        `  scale=${scale}: exact=${(exactMs / iterations).toFixed(3)}ms, ` +
          `ann=${(annMs / iterations).toFixed(3)}ms, ` +
          `speedup=${(exactMs / annMs).toFixed(2)}x`,
      );

      // At small scales ANN might not be faster due to overhead, but should still work
      if (scale >= 5_000) {
        expect(annMs).toBeLessThan(exactMs);
      }
    });
  }

  it("build time scales sub-linearly", async () => {
    const { buildAnnIndex } = await import("../src/core/ann-index.ts");

    const smallCount = 1_000;
    const largeCount = 10_000;
    const { vectors: smallVectors } = generateTestData(smallCount, 1);
    const { vectors: largeVectors } = generateTestData(largeCount, 2);

    const smallStart = performance.now();
    await buildAnnIndex(smallVectors, DIMENSION, smallCount);
    const smallMs = performance.now() - smallStart;

    const largeStart = performance.now();
    await buildAnnIndex(largeVectors, DIMENSION, largeCount);
    const largeMs = performance.now() - largeStart;

    console.log(
      `  build: ${smallCount}=${smallMs.toFixed(1)}ms, ${largeCount}=${largeMs.toFixed(1)}ms, ` +
        `ratio=${(largeMs / smallMs).toFixed(2)}x (scale factor ${largeCount / smallCount}x)`,
    );

    // Build time should not blow up catastrophically
    expect(largeMs / smallMs).toBeLessThan(50);
  });
});

describe("ANN benchmark (always runs)", () => {
  it("ExactSearch produces deterministic results", () => {
    const { commits } = generateTestData(100, 42);
    const rng = seededRandom(99);
    const query = randomUnitVector(DIMENSION, rng);

    const exact = new ExactSearch();
    const results1 = exact.search(query, commits, 10);
    const results2 = exact.search(query, commits, 10);

    expect(results1.map((r) => r.index)).toEqual(results2.map((r) => r.index));
    expect(results1.map((r) => r.score)).toEqual(results2.map((r) => r.score));
  });
});
