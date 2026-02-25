import { describe, expect, it } from "bun:test";
import { cosineSimilarity, cosineSimilarityUnit, normaliseVector } from "../src/core/similarity.ts";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it("throws on vector length mismatch", () => {
    expect(() => cosineSimilarity([1], [1, 2])).toThrow();
  });

  it("normalises vectors to unit length", () => {
    const normalised = normaliseVector([3, 4]);
    expect(normalised[0]).toBeCloseTo(0.6, 6);
    expect(normalised[1]).toBeCloseTo(0.8, 6);
  });

  it("computes unit cosine as a dot product", () => {
    const a = normaliseVector([1, 2, 3]);
    const b = normaliseVector([1, 2, 3]);

    expect(cosineSimilarityUnit(a, b)).toBeCloseTo(1, 6);
  });
});
