import { describe, expect, it } from "bun:test";
import { parseGitLogOutput } from "../src/core/git.ts";
import { parseDateOption, parseLimitOption } from "../src/core/parsing.ts";

describe("parsing helpers", () => {
  it("parses valid date option", () => {
    const date = parseDateOption("2025-05-10", "--after");
    expect(date.toISOString().startsWith("2025-05-10")).toBeTrue();
  });

  it("rejects invalid date option", () => {
    expect(() => parseDateOption("not-a-date", "--after")).toThrow();
  });

  it("parses limit option", () => {
    expect(parseLimitOption("25")).toBe(25);
  });

  it("rejects out-of-range limit option", () => {
    expect(() => parseLimitOption("0")).toThrow();
    expect(() => parseLimitOption("500")).toThrow();
  });
});

describe("git log parser", () => {
  it("parses commit records and files", () => {
    const raw =
      "abc123\x1fAlice\x1f2025-01-01T00:00:00+00:00\x1ffeat: add thing\x1e\n" +
      "src/a.ts\n" +
      "src/b.ts\n" +
      "def456\x1fBob\x1f2025-01-02T00:00:00+00:00\x1ffix: patch\x1e\n" +
      "README.md\n";

    const parsed = parseGitLogOutput(raw);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.hash).toBe("abc123");
    expect(parsed[0]?.files).toEqual(["src/a.ts", "src/b.ts"]);
    expect(parsed[1]?.author).toBe("Bob");
  });
});
