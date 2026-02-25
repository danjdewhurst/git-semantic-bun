import { describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function run(command: string[], cwd: string, extraEnv: Record<string, string> = {}): string {
  return execFileSync(command[0] as string, command.slice(1), {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      ...extraEnv,
    },
  }).trim();
}

describe("cli e2e", () => {
  it("runs init, index, search, and update in a temp git repo", () => {
    const repo = mkdtempSync(path.join(tmpdir(), "gsb-e2e-"));
    try {
      run(["git", "init"], repo);
      run(["git", "config", "user.name", "Test User"], repo);
      run(["git", "config", "user.email", "test@example.com"], repo);

      writeFileSync(path.join(repo, "app.ts"), "export const n = 1;\n", "utf8");
      run(["git", "add", "app.ts"], repo);
      run(["git", "commit", "-m", "feat: initial commit"], repo);

      const cliPath = path.join(import.meta.dir, "..", "src", "cli.ts");
      const cli = ["bun", "run", cliPath];
      const env = { GSB_FAKE_EMBEDDINGS: "1" };

      run([...cli, "init"], repo, env);
      run([...cli, "index"], repo, env);
      const searchOutput = run([...cli, "search", "initial commit", "--format", "json"], repo, env);
      expect(searchOutput).toContain('"results"');

      writeFileSync(path.join(repo, "app.ts"), "export const n = 2;\n", "utf8");
      run(["git", "add", "app.ts"], repo);
      run(["git", "commit", "-m", "fix: update value"], repo);

      const updateOutput = run([...cli, "update"], repo, env);
      expect(updateOutput).toContain("Updated index");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
