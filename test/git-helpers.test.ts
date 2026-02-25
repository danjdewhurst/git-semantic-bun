import { describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { commitExists, isAncestorCommit } from "../src/core/git.ts";

function run(command: string[], cwd: string): string {
  return execFileSync(command[0] as string, command.slice(1), {
    cwd,
    encoding: "utf8",
  }).trim();
}

describe("git helpers", () => {
  it("checks commit existence and ancestry", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "gsb-git-helpers-"));
    try {
      run(["git", "init"], dir);
      run(["git", "config", "user.name", "Test User"], dir);
      run(["git", "config", "user.email", "test@example.com"], dir);

      writeFileSync(path.join(dir, "a.txt"), "one\n", "utf8");
      run(["git", "add", "a.txt"], dir);
      run(["git", "commit", "-m", "first"], dir);
      const firstHash = run(["git", "rev-parse", "HEAD"], dir);

      writeFileSync(path.join(dir, "a.txt"), "two\n", "utf8");
      run(["git", "add", "a.txt"], dir);
      run(["git", "commit", "-m", "second"], dir);

      expect(commitExists(dir, firstHash)).toBeTrue();
      expect(commitExists(dir, "deadbeef")).toBeFalse();
      expect(isAncestorCommit(dir, firstHash)).toBeTrue();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
