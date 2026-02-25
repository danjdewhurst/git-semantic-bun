import { describe, expect, it } from "bun:test";
import { selectTopKByMappedScore, selectTopKByScore } from "../src/core/topk.ts";

describe("selectTopKByScore", () => {
  it("returns top-k entries in descending score order", () => {
    const items = [
      { id: "a", score: 0.2 },
      { id: "b", score: 0.9 },
      { id: "c", score: 0.5 },
      { id: "d", score: 0.8 },
    ];

    const result = selectTopKByScore(items, 2, (item) => item.score);
    expect(result.map((item) => item.id)).toEqual(["b", "d"]);
  });

  it("returns empty when limit is zero", () => {
    const result = selectTopKByScore([{ id: "a", score: 1 }], 0, (item) => item.score);
    expect(result).toEqual([]);
  });

  it("returns all items when limit exceeds input length", () => {
    const items = [
      { id: "a", score: 0.3 },
      { id: "b", score: 0.7 },
    ];

    const result = selectTopKByScore(items, 10, (item) => item.score);
    expect(result.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("supports mapped top-k selection without prebuilding scored array", () => {
    const items = [
      { id: "a", score: 0.2 },
      { id: "b", score: 0.9 },
      { id: "c", score: 0.5 },
    ];

    const result = selectTopKByMappedScore(items, 2, (item) => ({
      mapped: item.id,
      score: item.score,
    }));

    expect(result).toEqual(["b", "c"]);
  });
});
