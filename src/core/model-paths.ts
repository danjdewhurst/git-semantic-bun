import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { loadMetadata } from "./metadata.ts";
import type { RepoPaths } from "./paths.ts";

export interface IndexArtifactPaths {
  modelName?: string;
  modelKey?: string;
  artifactDir: string;
  indexPath: string;
  compactMetaPath: string;
  compactVectorPath: string;
  benchmarkHistoryPath: string;
  annIndexPath: string;
}

function slugifyModelName(modelName: string): string {
  return modelName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function modelStorageKey(modelName: string): string {
  const hash = createHash("sha1").update(modelName).digest("hex").slice(0, 10);
  const slug = slugifyModelName(modelName);
  return slug.length > 0 ? `${hash}-${slug}` : hash;
}

export function resolveLegacyIndexPaths(basePaths: RepoPaths): IndexArtifactPaths {
  return {
    artifactDir: basePaths.semanticDir,
    indexPath: basePaths.indexPath,
    compactMetaPath: basePaths.compactMetaPath,
    compactVectorPath: basePaths.compactVectorPath,
    benchmarkHistoryPath: basePaths.benchmarkHistoryPath,
    annIndexPath: basePaths.annIndexPath,
  };
}

export function resolveModelIndexPaths(
  basePaths: RepoPaths,
  modelName: string,
): IndexArtifactPaths {
  const modelKey = modelStorageKey(modelName);
  const artifactDir = path.join(basePaths.semanticDir, "models", modelKey);

  return {
    modelName,
    modelKey,
    artifactDir,
    indexPath: path.join(artifactDir, "index.json"),
    compactMetaPath: path.join(artifactDir, "index.meta.json"),
    compactVectorPath: path.join(artifactDir, "index.vec.f32"),
    benchmarkHistoryPath: path.join(artifactDir, "benchmarks.jsonl"),
    annIndexPath: path.join(artifactDir, "index.ann.usearch"),
  };
}

export function resolveTargetIndexPaths(
  basePaths: RepoPaths,
  modelName?: string,
): IndexArtifactPaths {
  if (modelName) {
    return resolveModelIndexPaths(basePaths, modelName);
  }

  try {
    const metadata = loadMetadata(basePaths.metadataPath);
    const fromMetadata = resolveModelIndexPaths(basePaths, metadata.modelName);
    if (existsSync(fromMetadata.indexPath)) {
      return fromMetadata;
    }
  } catch {
    // metadata is optional
  }

  return resolveLegacyIndexPaths(basePaths);
}

export function ensureIndexArtifactDirectory(paths: IndexArtifactPaths): void {
  mkdirSync(paths.artifactDir, { recursive: true });
}
