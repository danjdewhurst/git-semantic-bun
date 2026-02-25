import { describe, expect, it } from "bun:test";
import { defaultMinScoreForFormat } from "../src/commands/search.ts";

describe("search defaults", () => {
  it("uses output-aware min-score defaults", () => {
    expect(defaultMinScoreForFormat("text")).toBe(0.15);
    expect(defaultMinScoreForFormat("markdown")).toBe(0.15);
    expect(defaultMinScoreForFormat("json")).toBe(0);
  });
});
