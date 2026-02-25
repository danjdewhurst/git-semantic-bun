import { describe, expect, it } from "bun:test";
import { normaliseVector } from "../src/core/similarity.ts";
import type { IndexedCommit } from "../src/core/types.ts";
import {
  type AnnIndexHandle,
  AnnSearch,
  ExactSearch,
  createSearchStrategy,
} from "../src/core/vector-search.ts";

function makeCommit(index: number, embedding: number[]): IndexedCommit {
  return {
    hash: `hash${index}`,
    author: "test",
    date: new Date(2025, 0, index + 1).toISOString(),
    message: `commit ${index}`,
    files: [`file${index}.ts`],
    embedding,
  };
}

function randomUnitVector(dim: number, seed: number): number[] {
  const v: number[] = [];
  let s = seed;
  for (let i = 0; i < dim; i += 1) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    v.push((s / 0x7fffffff) * 2 - 1);
  }
  return normaliseVector(v);
}

describe("ExactSearch", () => {
  it("returns correct top-K by cosine similarity", () => {
    const query = normaliseVector([1, 0, 0, 0]);
    const commits = [
      makeCommit(0, normaliseVector([1, 0, 0, 0])), // most similar
      makeCommit(1, normaliseVector([0, 1, 0, 0])), // orthogonal
      makeCommit(2, normaliseVector([0.9, 0.1, 0, 0])), // quite similar
      makeCommit(3, normaliseVector([-1, 0, 0, 0])), // opposite
    ];

    const exact = new ExactSearch();
    const results = exact.search(query, commits, 2);

    expect(results).toHaveLength(2);
    expect(results[0]?.index).toBe(0); // [1,0,0,0] most similar
    expect(results[1]?.index).toBe(2); // [0.9,0.1,0,0] second
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 0);
  });

  it("handles limit larger than candidate set", () => {
    const query = normaliseVector([1, 0]);
    const commits = [makeCommit(0, normaliseVector([1, 0]))];

    const exact = new ExactSearch();
    const results = exact.search(query, commits, 10);

    expect(results).toHaveLength(1);
  });

  it("returns empty for empty candidates", () => {
    const exact = new ExactSearch();
    const results = exact.search([1, 0], [], 5);
    expect(results).toHaveLength(0);
  });
});

describe("AnnSearch", () => {
  function createMockAnnHandle(commits: IndexedCommit[], query: readonly number[]): AnnIndexHandle {
    return {
      search(_q: Float32Array, limit: number) {
        // Simulate ANN by computing exact similarities and returning top results
        const scored = commits.map((c, i) => {
          let dot = 0;
          for (let d = 0; d < query.length; d += 1) {
            dot += (query[d] ?? 0) * (c.embedding[d] ?? 0);
          }
          return { key: BigInt(i), distance: 1 - dot };
        });
        scored.sort((a, b) => a.distance - b.distance);
        const top = scored.slice(0, limit);
        return {
          keys: top.map((s) => s.key),
          distances: top.map((s) => s.distance),
        };
      },
      save() {},
      size() {
        return commits.length;
      },
    };
  }

  it("returns results using ANN handle", () => {
    const query = normaliseVector([1, 0, 0, 0]);
    const commits = [
      makeCommit(0, normaliseVector([1, 0, 0, 0])),
      makeCommit(1, normaliseVector([0, 1, 0, 0])),
      makeCommit(2, normaliseVector([0.9, 0.1, 0, 0])),
    ];

    const handle = createMockAnnHandle(commits, query);
    const ann = new AnnSearch(handle, 10);
    const results = ann.search(query, commits, 2);

    expect(results).toHaveLength(2);
    expect(results[0]?.index).toBe(0);
  });

  it("falls back to exact when filtered ratio is below 10%", () => {
    const dim = 4;
    const query = normaliseVector([1, 0, 0, 0]);

    // Create 100 commits but only pass 5 as candidates (<10% of 100)
    const allCommits: IndexedCommit[] = [];
    for (let i = 0; i < 100; i += 1) {
      allCommits.push(makeCommit(i, randomUnitVector(dim, i)));
    }

    const handle = createMockAnnHandle(allCommits, query);
    // Override size to return 100
    const wrappedHandle: AnnIndexHandle = {
      ...handle,
      size: () => 100,
    };

    const candidates = allCommits.slice(0, 5); // Only 5% of index
    const ann = new AnnSearch(wrappedHandle, 10);
    const results = ann.search(query, candidates, 3);

    // Should still get results (from fallback to exact)
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.length).toBeLessThanOrEqual(3);
  });
});

describe("createSearchStrategy", () => {
  it("returns ExactSearch for 'exact' strategy", () => {
    const strategy = createSearchStrategy({
      strategyName: "exact",
      commitCount: 50_000,
    });
    expect(strategy.name).toBe("exact");
  });

  it("returns ExactSearch for 'auto' below threshold", () => {
    const strategy = createSearchStrategy({
      strategyName: "auto",
      commitCount: 5_000,
    });
    expect(strategy.name).toBe("exact");
  });

  it("returns ExactSearch for 'auto' above threshold without ANN handle", () => {
    const strategy = createSearchStrategy({
      strategyName: "auto",
      commitCount: 50_000,
    });
    expect(strategy.name).toBe("exact");
  });

  it("returns AnnSearch for 'auto' above threshold with ANN handle", () => {
    const mockHandle: AnnIndexHandle = {
      search: () => ({ keys: [], distances: [] }),
      save: () => {},
      size: () => 50_000,
    };

    const strategy = createSearchStrategy({
      strategyName: "auto",
      commitCount: 50_000,
      annHandle: mockHandle,
    });
    expect(strategy.name).toBe("ann");
  });

  it("throws for 'ann' strategy without ANN handle", () => {
    expect(() =>
      createSearchStrategy({
        strategyName: "ann",
        commitCount: 1_000,
      }),
    ).toThrow("ANN strategy requested but no ANN index is available.");
  });
});
