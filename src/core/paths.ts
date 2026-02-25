import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

export interface RepoPaths {
  repoRoot: string;
  gitDir: string;
  semanticDir: string;
  cacheDir: string;
  indexPath: string;
  compactMetaPath: string;
  compactVectorPath: string;
  metadataPath: string;
  benchmarkHistoryPath: string;
  annIndexPath: string;
}

export function resolveRepoPaths(cwd: string = process.cwd()): RepoPaths {
  const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
  }).trim();

  const gitDirRaw = execFileSync("git", ["rev-parse", "--git-dir"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();

  const gitDir = path.isAbsolute(gitDirRaw) ? gitDirRaw : path.join(repoRoot, gitDirRaw);
  const semanticDir = path.join(gitDir, "semantic-index");
  const cacheDir = path.join(semanticDir, "cache");

  return {
    repoRoot,
    gitDir,
    semanticDir,
    cacheDir,
    indexPath: path.join(semanticDir, "index.json"),
    compactMetaPath: path.join(semanticDir, "index.meta.json"),
    compactVectorPath: path.join(semanticDir, "index.vec.f32"),
    metadataPath: path.join(cacheDir, "metadata.json"),
    benchmarkHistoryPath: path.join(semanticDir, "benchmarks.jsonl"),
    annIndexPath: path.join(semanticDir, "index.ann.usearch"),
  };
}

export function ensureSemanticDirectories(paths: RepoPaths): void {
  mkdirSync(paths.semanticDir, { recursive: true });
  mkdirSync(paths.cacheDir, { recursive: true });
}
