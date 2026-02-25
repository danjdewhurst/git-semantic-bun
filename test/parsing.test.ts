import { describe, expect, it } from "bun:test";
import { parseGitLogOutput } from "../src/core/git.ts";
import {
  parseDateOption,
  parseLimitOption,
  parseSearchOutputFormat,
  parseVectorDtypeOption,
  parseWeightOption,
} from "../src/core/parsing.ts";

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

  it("parses output format option", () => {
    expect(parseSearchOutputFormat("text")).toBe("text");
    expect(parseSearchOutputFormat("markdown")).toBe("markdown");
    expect(parseSearchOutputFormat("json")).toBe("json");
  });

  it("accepts plugin-provided format names", () => {
    // Plugin-extensible: any string is now a valid format name
    expect(parseSearchOutputFormat("csv")).toBe("csv");
    expect(parseSearchOutputFormat("yaml")).toBe("yaml");
  });

  it("parses weight option", () => {
    expect(parseWeightOption("0.25", "--semantic-weight")).toBe(0.25);
  });

  it("rejects invalid weight option", () => {
    expect(() => parseWeightOption("2", "--semantic-weight")).toThrow();
    expect(() => parseWeightOption("x", "--semantic-weight")).toThrow();
  });

  it("parses vector dtype option", () => {
    expect(parseVectorDtypeOption("f32")).toBe("f32");
    expect(parseVectorDtypeOption("f16")).toBe("f16");
  });

  it("rejects invalid vector dtype option", () => {
    expect(() => parseVectorDtypeOption("float32")).toThrow();
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
