import { describe, expect, it } from "bun:test";
import { applyFilters } from "../src/core/filter.ts";
import type { IndexedCommit } from "../src/core/types.ts";

const commits: IndexedCommit[] = [
  {
    hash: "a1",
    author: "Alice",
    date: "2025-01-01T12:00:00.000Z",
    message: "Add search command",
    files: ["src/commands/search.ts"],
    embedding: [0.1, 0.2],
  },
  {
    hash: "b2",
    author: "Bob",
    date: "2025-02-10T12:00:00.000Z",
    message: "Fix index writer",
    files: ["src/core/index-store.ts"],
    embedding: [0.2, 0.3],
  },
];

describe("applyFilters", () => {
  it("filters by author", () => {
    const result = applyFilters(commits, { author: "ali" });
    expect(result).toHaveLength(1);
    expect(result[0]?.hash).toBe("a1");
  });

  it("filters by date range", () => {
    const result = applyFilters(commits, {
      after: new Date("2025-01-15T00:00:00.000Z"),
      before: new Date("2025-03-01T00:00:00.000Z"),
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.hash).toBe("b2");
  });

  it("filters by file substring", () => {
    const result = applyFilters(commits, { file: "index-store" });
    expect(result).toHaveLength(1);
    expect(result[0]?.hash).toBe("b2");
  });
});
