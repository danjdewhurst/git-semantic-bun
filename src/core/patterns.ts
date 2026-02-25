import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { GitCommit } from "./types.ts";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function globToRegex(glob: string): RegExp {
  let pattern = "^";
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    const next = glob[i + 1];

    if (char === "*" && next === "*") {
      pattern += ".*";
      i += 1;
      continue;
    }

    if (char === "*") {
      pattern += "[^/]*";
      continue;
    }

    if (char === "?") {
      pattern += "[^/]";
      continue;
    }

    pattern += escapeRegex(char ?? "");
  }

  pattern += "$";
  return new RegExp(pattern);
}

function normaliseFilePath(file: string): string {
  return file.split(path.sep).join("/");
}

export function loadGsbIgnorePatterns(repoRoot: string): string[] {
  const ignorePath = path.join(repoRoot, ".gsbignore");
  if (!existsSync(ignorePath)) {
    return [];
  }

  const raw = readFileSync(ignorePath, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith("#"));
}

export function filterCommitsByPatterns(
  commits: readonly GitCommit[],
  includePatterns: readonly string[],
  excludePatterns: readonly string[],
): GitCommit[] {
  const includeMatchers = includePatterns.map(globToRegex);
  const excludeMatchers = excludePatterns.map(globToRegex);

  const includeActive = includeMatchers.length > 0;

  const filtered: GitCommit[] = [];
  for (const commit of commits) {
    const keptFiles = commit.files
      .map(normaliseFilePath)
      .filter((file) => {
        if (includeActive && !includeMatchers.some((regex) => regex.test(file))) {
          return false;
        }

        if (excludeMatchers.some((regex) => regex.test(file))) {
          return false;
        }

        return true;
      });

    if (commit.files.length > 0 && keptFiles.length === 0) {
      continue;
    }

    filtered.push({
      ...commit,
      files: keptFiles,
    });
  }

  return filtered;
}
