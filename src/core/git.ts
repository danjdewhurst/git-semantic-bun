import { execFileSync } from "node:child_process";
import type { GitCommit } from "./types.ts";

export interface ReadCommitsOptions {
  cwd: string;
  includePatch: boolean;
  sinceHash?: string;
  sinceDate?: Date;
}

function runGit(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 512,
  });
}

function parseLogOutput(raw: string): GitCommit[] {
  if (!raw.trim()) {
    return [];
  }

  const commits: GitCommit[] = [];
  let current: GitCommit | undefined;

  const lines = raw.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const cleaned = trimmed.replaceAll("\x1e", "");
    const maybeHeader = cleaned.split("\x1f");
    if (maybeHeader.length >= 4) {
      if (current) {
        commits.push(current);
      }

      const [hash, author, date, ...messageParts] = maybeHeader;
      const message = messageParts.join("\x1f");
      if (!hash || !author || !date) {
        current = undefined;
        continue;
      }

      current = {
        hash,
        author,
        date,
        message,
        files: [],
      };
      continue;
    }

    if (current) {
      current.files.push(cleaned);
    }
  }

  if (current) {
    commits.push(current);
  }

  return commits;
}

function getPatchForCommit(cwd: string, hash: string): string {
  return runGit(["show", "--format=", "--patch", "--no-color", hash], cwd);
}

export function getCommitDiffSnippet(cwd: string, hash: string, maxLines = 12): string {
  const patch = runGit(["show", "--format=", "--patch", "--no-color", hash], cwd);
  const lines = patch.split("\n");

  const result: string[] = [];
  const maxBodyLines = Math.max(1, maxLines);
  let bodyLines = 0;

  for (const line of lines) {
    const isFileHeader =
      line.startsWith("diff --git") || line.startsWith("--- ") || line.startsWith("+++ ");
    const isHunkHeader = line.startsWith("@@");

    if (isFileHeader || isHunkHeader) {
      result.push(line);
      continue;
    }

    const isDiffBodyLine = line.startsWith("+") || line.startsWith("-") || line.startsWith(" ");
    if (!isDiffBodyLine) {
      continue;
    }

    result.push(line);
    bodyLines += 1;

    if (bodyLines >= maxBodyLines) {
      break;
    }
  }

  return result.join("\n").trim();
}

export function readCommits(options: ReadCommitsOptions): GitCommit[] {
  const args = [
    "log",
    "--date=iso-strict",
    "--pretty=format:%H%x1f%an%x1f%ad%x1f%s%x1e",
    "--name-only",
    "--no-renames",
  ];

  if (options.sinceDate) {
    args.push(`--since=${options.sinceDate.toISOString()}`);
  }

  if (options.sinceHash) {
    args.push(`${options.sinceHash}..HEAD`);
  }

  const raw = runGit(args, options.cwd);
  const commits = parseLogOutput(raw);

  if (!options.includePatch || commits.length === 0) {
    return commits;
  }

  return commits.map((commit) => ({
    ...commit,
    patch: getPatchForCommit(options.cwd, commit.hash),
  }));
}

export function parseGitLogOutput(raw: string): GitCommit[] {
  return parseLogOutput(raw);
}

export function commitExists(cwd: string, hash: string): boolean {
  try {
    execFileSync("git", ["cat-file", "-e", `${hash}^{commit}`], {
      cwd,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

export function isAncestorCommit(cwd: string, ancestorHash: string, headRef = "HEAD"): boolean {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestorHash, headRef], {
      cwd,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}
