import { describe, expect, it } from "bun:test";
import { cosineSimilarity } from "../src/core/similarity.ts";

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
});
