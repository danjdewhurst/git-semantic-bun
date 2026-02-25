import { describe, expect, it } from "bun:test";
import { lexicalScore, normaliseWeights, recencyScore } from "../src/core/ranking.ts";

describe("search scoring", () => {
  it("gives higher lexical scores for stronger token overlap", () => {
    const high = lexicalScore("token refresh race", "fix token refresh race condition", ["src/auth.ts"]);
    const low = lexicalScore("token refresh race", "update docs", ["README.md"]);

    expect(high).toBeGreaterThan(low);
  });

  it("normalises score weights to total 1", () => {
    const weights = normaliseWeights({
      semantic: 3,
      lexical: 1,
      recency: 1,
      recencyBoostEnabled: true,
    });

    expect(weights.semantic + weights.lexical + weights.recency).toBeCloseTo(1, 6);
    expect(weights.semantic).toBeCloseTo(0.6, 6);
  });

  it("returns higher recency score for newer commits", () => {
    const now = new Date().toISOString();
    const old = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365).toISOString();

    expect(recencyScore(now)).toBeGreaterThan(recencyScore(old));
  });

  it("throws when all weights are zero", () => {
    expect(() =>
      normaliseWeights({
        semantic: 0,
        lexical: 0,
        recency: 0,
        recencyBoostEnabled: false,
      }),
    ).toThrow("At least one search weight must be greater than zero");
  });
});
