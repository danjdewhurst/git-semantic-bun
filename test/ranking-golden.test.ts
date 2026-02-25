import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { type ScoreWeights, combineScores, normaliseWeights } from "../src/core/ranking.ts";

interface GoldenCase {
  id: string;
  semantic: number;
  lexical: number;
  recency: number;
  expectedRank: number;
}

interface GoldenFixture {
  query: string;
  weights: ScoreWeights;
  cases: GoldenCase[];
}

describe("ranking golden fixtures", () => {
  it("keeps expected ranking order for known scoring scenarios", () => {
    const fixturePath = path.join(import.meta.dir, "fixtures", "ranking-golden.json");
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as GoldenFixture;

    const weights = normaliseWeights(fixture.weights);
    const ranked = fixture.cases
      .map((entry) => ({
        ...entry,
        finalScore: combineScores(entry.semantic, entry.lexical, entry.recency, weights),
      }))
      .sort((a, b) => b.finalScore - a.finalScore);

    const byIdRank = new Map(ranked.map((entry, index) => [entry.id, index + 1]));

    for (const entry of fixture.cases) {
      expect(byIdRank.get(entry.id)).toBe(entry.expectedRank);
    }
  });
});
