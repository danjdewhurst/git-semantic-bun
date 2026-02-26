import { describe, expect, it } from "bun:test";
import {
  bm25Scores,
  combineScores,
  lexicalScore,
  normaliseWeights,
  recencyScore,
} from "../src/core/ranking.ts";

describe("search scoring", () => {
  it("gives higher lexical scores for stronger token overlap", () => {
    const high = lexicalScore("token refresh race", "fix token refresh race condition", [
      "src/auth.ts",
    ]);
    const low = lexicalScore("token refresh race", "update docs", ["README.md"]);

    expect(high).toBeGreaterThan(low);
  });

  it("scores BM25 matches higher for stronger token relevance", () => {
    const scores = bm25Scores("token refresh race", [
      { id: "a", message: "fix token refresh race condition", files: ["src/auth.ts"] },
      { id: "b", message: "update docs", files: ["README.md"] },
    ]);

    expect(scores.get("a") ?? 0).toBeGreaterThan(scores.get("b") ?? 0);
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

describe("combineScores", () => {
  it("returns weighted sum of all three signals", () => {
    const weights = normaliseWeights({
      semantic: 1,
      lexical: 1,
      recency: 1,
      recencyBoostEnabled: true,
    });

    const score = combineScores(0.9, 0.6, 0.3, weights);
    const expected = (0.9 + 0.6 + 0.3) / 3;
    expect(score).toBeCloseTo(expected, 6);
  });

  it("returns only semantic when other weights are zero", () => {
    const weights = normaliseWeights({
      semantic: 1,
      lexical: 0,
      recency: 0,
      recencyBoostEnabled: false,
    });

    expect(combineScores(0.75, 0.5, 0.9, weights)).toBeCloseTo(0.75, 6);
  });

  it("returns only lexical when other weights are zero", () => {
    const weights = normaliseWeights({
      semantic: 0,
      lexical: 1,
      recency: 0,
      recencyBoostEnabled: false,
    });

    expect(combineScores(0.9, 0.4, 0.8, weights)).toBeCloseTo(0.4, 6);
  });

  it("returns only recency when other weights are zero", () => {
    const weights = normaliseWeights({
      semantic: 0,
      lexical: 0,
      recency: 1,
      recencyBoostEnabled: true,
    });

    expect(combineScores(0.9, 0.4, 0.6, weights)).toBeCloseTo(0.6, 6);
  });

  it("returns 0 when all input scores are 0", () => {
    const weights = normaliseWeights({
      semantic: 1,
      lexical: 1,
      recency: 1,
      recencyBoostEnabled: true,
    });

    expect(combineScores(0, 0, 0, weights)).toBe(0);
  });

  it("returns 1 when all input scores are 1 and weights are equal", () => {
    const weights = normaliseWeights({
      semantic: 1,
      lexical: 1,
      recency: 1,
      recencyBoostEnabled: true,
    });

    expect(combineScores(1, 1, 1, weights)).toBeCloseTo(1, 6);
  });

  it("respects unequal weight distribution", () => {
    const weights = normaliseWeights({
      semantic: 8,
      lexical: 1,
      recency: 1,
      recencyBoostEnabled: true,
    });

    const score = combineScores(1, 0, 0, weights);
    expect(score).toBeCloseTo(0.8, 6);
  });
});

describe("lexicalScore edge cases", () => {
  it("returns 0 for empty query", () => {
    expect(lexicalScore("", "some commit message", ["file.ts"])).toBe(0);
  });

  it("returns 0 when no tokens overlap", () => {
    expect(lexicalScore("authentication", "fix typo readme", ["docs.md"])).toBe(0);
  });

  it("returns 1 for perfect token overlap", () => {
    expect(lexicalScore("fix bug", "fix bug", [])).toBe(1);
  });

  it("matches tokens in file paths", () => {
    const score = lexicalScore("auth", "update module", ["src/auth.ts"]);
    expect(score).toBeGreaterThan(0);
  });
});

describe("bm25Scores edge cases", () => {
  it("returns empty map for empty query", () => {
    const scores = bm25Scores("", [{ id: "a", message: "fix bug", files: [] }]);
    expect(scores.size).toBe(0);
  });

  it("returns empty map for empty documents", () => {
    const scores = bm25Scores("fix bug", []);
    expect(scores.size).toBe(0);
  });

  it("normalises highest score to 1", () => {
    const scores = bm25Scores("fix auth token", [
      { id: "a", message: "fix auth token refresh", files: ["src/auth.ts"] },
      { id: "b", message: "update readme", files: ["README.md"] },
    ]);

    const maxScore = Math.max(...scores.values());
    expect(maxScore).toBeCloseTo(1, 6);
  });

  it("scores single document at 1 when it matches", () => {
    const scores = bm25Scores("fix bug", [{ id: "a", message: "fix a nasty bug", files: [] }]);

    expect(scores.get("a")).toBeCloseTo(1, 6);
  });
});

describe("recencyScore edge cases", () => {
  it("returns 1 for a future date", () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
    expect(recencyScore(future)).toBe(1);
  });

  it("returns a value between 0 and 1 for past dates", () => {
    const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 180).toISOString();
    const score = recencyScore(pastDate);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it("decays exponentially with a 365-day half-life", () => {
    const oneYearAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365).toISOString();
    const score = recencyScore(oneYearAgo);
    // e^(-1) ≈ 0.368
    expect(score).toBeCloseTo(Math.exp(-1), 1);
  });

  it("approaches 0 for very old commits", () => {
    const tenYearsAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365 * 10).toISOString();
    expect(recencyScore(tenYearsAgo)).toBeLessThan(0.001);
  });
});

describe("normaliseWeights edge cases", () => {
  it("preserves recencyBoostEnabled flag", () => {
    const enabled = normaliseWeights({
      semantic: 1,
      lexical: 1,
      recency: 1,
      recencyBoostEnabled: true,
    });
    const disabled = normaliseWeights({
      semantic: 1,
      lexical: 1,
      recency: 1,
      recencyBoostEnabled: false,
    });

    expect(enabled.recencyBoostEnabled).toBe(true);
    expect(disabled.recencyBoostEnabled).toBe(false);
  });

  it("handles very small weights without NaN", () => {
    const weights = normaliseWeights({
      semantic: 0.001,
      lexical: 0.001,
      recency: 0.001,
      recencyBoostEnabled: false,
    });

    expect(Number.isNaN(weights.semantic)).toBe(false);
    expect(weights.semantic + weights.lexical + weights.recency).toBeCloseTo(1, 6);
  });

  it("handles a single non-zero weight", () => {
    const weights = normaliseWeights({
      semantic: 0,
      lexical: 5,
      recency: 0,
      recencyBoostEnabled: false,
    });

    expect(weights.lexical).toBeCloseTo(1, 6);
    expect(weights.semantic).toBe(0);
    expect(weights.recency).toBe(0);
  });
});
