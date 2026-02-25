import { readFileSync, statSync, writeFileSync } from "node:fs";
import type { SemanticIndex } from "./types.ts";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number");
}

function validateIndex(parsed: unknown): SemanticIndex {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Index file is not a JSON object");
  }

  const value = parsed as Record<string, unknown>;

  if (value.version !== 1) {
    throw new Error("Unsupported index version");
  }

  if (typeof value.modelName !== "string") {
    throw new Error("Index missing modelName");
  }

  if (typeof value.createdAt !== "string" || typeof value.lastUpdatedAt !== "string") {
    throw new Error("Index missing timestamps");
  }

  if (typeof value.repositoryRoot !== "string") {
    throw new Error("Index missing repositoryRoot");
  }

  if (typeof value.includePatch !== "boolean") {
    throw new Error("Index missing includePatch flag");
  }

  if (!Array.isArray(value.commits)) {
    throw new Error("Index missing commits array");
  }

  const commits = value.commits.map((commitRaw) => {
    if (typeof commitRaw !== "object" || commitRaw === null) {
      throw new Error("Index contains invalid commit entry");
    }

    const commit = commitRaw as Record<string, unknown>;
    if (
      typeof commit.hash !== "string" ||
      typeof commit.author !== "string" ||
      typeof commit.date !== "string" ||
      typeof commit.message !== "string"
    ) {
      throw new Error("Index commit missing required fields");
    }

    if (!isStringArray(commit.files)) {
      throw new Error("Index commit files must be a string array");
    }

    if (!isNumberArray(commit.embedding)) {
      throw new Error("Index commit embedding must be a number array");
    }

    return {
      hash: commit.hash,
      author: commit.author,
      date: commit.date,
      message: commit.message,
      files: commit.files,
      embedding: commit.embedding
    };
  });

  return {
    version: 1,
    modelName: value.modelName,
    createdAt: value.createdAt,
    lastUpdatedAt: value.lastUpdatedAt,
    repositoryRoot: value.repositoryRoot,
    includePatch: value.includePatch,
    commits
  };
}

export function loadIndex(indexPath: string): SemanticIndex {
  const raw = readFileSync(indexPath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  return validateIndex(parsed);
}

export function saveIndex(indexPath: string, index: SemanticIndex): void {
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

export function getIndexSizeBytes(indexPath: string): number {
  return statSync(indexPath).size;
}
