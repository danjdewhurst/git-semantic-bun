import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { SemanticIndex } from "./types.ts";

interface CompactMetaCommit {
  hash: string;
  author: string;
  date: string;
  message: string;
  files: string[];
  vectorOffset: number;
}

interface CompactIndexMeta {
  version: 2;
  modelName: string;
  createdAt: string;
  lastUpdatedAt: string;
  repositoryRoot: string;
  includePatch: boolean;
  checksum?: string;
  vector: {
    file: string;
    dtype: "float32";
    dimension: number;
    count: number;
    normalised: boolean;
  };
  commits: CompactMetaCommit[];
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number");
}

function computeChecksum(index: SemanticIndex): string {
  const hash = createHash("sha256");

  hash.update(index.modelName);
  hash.update(index.createdAt);
  hash.update(index.lastUpdatedAt);
  hash.update(index.repositoryRoot);
  hash.update(String(index.includePatch));

  for (const commit of index.commits) {
    hash.update(commit.hash);
    hash.update(commit.author);
    hash.update(commit.date);
    hash.update(commit.message);
    hash.update(commit.files.join("\n"));
  }

  return hash.digest("hex");
}

function validateIndex(parsed: unknown): SemanticIndex {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Index file is not a JSON object");
  }

  const value = parsed as Record<string, unknown>;

  if (value.version !== 1) {
    throw new Error(`Unsupported index version: ${String(value.version)} (expected 1)`);
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
      embedding: commit.embedding,
    };
  });

  const index: SemanticIndex = {
    version: 1,
    modelName: value.modelName,
    createdAt: value.createdAt,
    lastUpdatedAt: value.lastUpdatedAt,
    repositoryRoot: value.repositoryRoot,
    includePatch: value.includePatch,
    ...(typeof value.checksum === "string" ? { checksum: value.checksum } : {}),
    commits,
  };

  if (index.checksum !== undefined) {
    const expected = computeChecksum(index);
    if (index.checksum !== expected) {
      throw new Error("Index checksum mismatch: file may be corrupted or stale.");
    }
  }

  return index;
}

function validateCompactMeta(parsed: unknown): CompactIndexMeta {
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Compact index metadata is not a JSON object");
  }

  const value = parsed as Record<string, unknown>;
  if (value.version !== 2) {
    throw new Error(`Unsupported compact index version: ${String(value.version)} (expected 2)`);
  }

  const vector = value.vector as Record<string, unknown> | undefined;
  if (
    typeof value.modelName !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.lastUpdatedAt !== "string" ||
    typeof value.repositoryRoot !== "string" ||
    typeof value.includePatch !== "boolean" ||
    !Array.isArray(value.commits) ||
    !vector ||
    typeof vector.file !== "string" ||
    vector.dtype !== "float32" ||
    typeof vector.dimension !== "number" ||
    typeof vector.count !== "number" ||
    typeof vector.normalised !== "boolean"
  ) {
    throw new Error("Compact index metadata is invalid");
  }

  const commits: CompactMetaCommit[] = value.commits.map((commitRaw) => {
    if (typeof commitRaw !== "object" || commitRaw === null) {
      throw new Error("Compact index contains invalid commit entry");
    }

    const commit = commitRaw as Record<string, unknown>;
    if (
      typeof commit.hash !== "string" ||
      typeof commit.author !== "string" ||
      typeof commit.date !== "string" ||
      typeof commit.message !== "string" ||
      !isStringArray(commit.files) ||
      typeof commit.vectorOffset !== "number"
    ) {
      throw new Error("Compact index commit is invalid");
    }

    return {
      hash: commit.hash,
      author: commit.author,
      date: commit.date,
      message: commit.message,
      files: commit.files,
      vectorOffset: commit.vectorOffset,
    };
  });

  return {
    version: 2,
    modelName: value.modelName,
    createdAt: value.createdAt,
    lastUpdatedAt: value.lastUpdatedAt,
    repositoryRoot: value.repositoryRoot,
    includePatch: value.includePatch,
    ...(typeof value.checksum === "string" ? { checksum: value.checksum } : {}),
    vector: {
      file: vector.file,
      dtype: "float32",
      dimension: vector.dimension,
      count: vector.count,
      normalised: vector.normalised,
    },
    commits,
  };
}

function compactPathsFromIndexPath(indexPath: string): { metaPath: string; vectorPath: string } {
  const semanticDir = path.dirname(indexPath);
  return {
    metaPath: path.join(semanticDir, "index.meta.json"),
    vectorPath: path.join(semanticDir, "index.vec.f32"),
  };
}

function saveCompactIndex(indexPath: string, index: SemanticIndex): void {
  const { metaPath, vectorPath } = compactPathsFromIndexPath(indexPath);
  const dimension = index.commits[0]?.embedding.length ?? 0;

  const values = new Float32Array(index.commits.length * dimension);
  for (let row = 0; row < index.commits.length; row += 1) {
    const embedding = index.commits[row]?.embedding ?? [];
    for (let col = 0; col < dimension; col += 1) {
      values[row * dimension + col] = embedding[col] ?? 0;
    }
  }

  writeFileSync(vectorPath, Buffer.from(values.buffer));

  const meta: CompactIndexMeta = {
    version: 2,
    modelName: index.modelName,
    createdAt: index.createdAt,
    lastUpdatedAt: index.lastUpdatedAt,
    repositoryRoot: index.repositoryRoot,
    includePatch: index.includePatch,
    ...(index.checksum ? { checksum: index.checksum } : {}),
    vector: {
      file: path.basename(vectorPath),
      dtype: "float32",
      dimension,
      count: index.commits.length,
      normalised: true,
    },
    commits: index.commits.map((commit, vectorOffset) => ({
      hash: commit.hash,
      author: commit.author,
      date: commit.date,
      message: commit.message,
      files: commit.files,
      vectorOffset,
    })),
  };

  writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
}

function loadCompactIndex(indexPath: string): SemanticIndex {
  const { metaPath, vectorPath } = compactPathsFromIndexPath(indexPath);
  const meta = validateCompactMeta(JSON.parse(readFileSync(metaPath, "utf8")));
  const vectorData = readFileSync(vectorPath);

  const values = new Float32Array(vectorData.buffer, vectorData.byteOffset, vectorData.byteLength / 4);

  if (values.length !== meta.vector.dimension * meta.vector.count) {
    throw new Error("Compact vector file size does not match metadata");
  }

  const commits = meta.commits.map((commit) => {
    const start = commit.vectorOffset * meta.vector.dimension;
    const end = start + meta.vector.dimension;

    return {
      hash: commit.hash,
      author: commit.author,
      date: commit.date,
      message: commit.message,
      files: commit.files,
      embedding: Array.from(values.slice(start, end)),
    };
  });

  const index: SemanticIndex = {
    version: 1,
    modelName: meta.modelName,
    createdAt: meta.createdAt,
    lastUpdatedAt: meta.lastUpdatedAt,
    repositoryRoot: meta.repositoryRoot,
    includePatch: meta.includePatch,
    ...(meta.checksum ? { checksum: meta.checksum } : {}),
    commits,
  };

  if (index.checksum !== undefined) {
    const expected = computeChecksum(index);
    if (index.checksum !== expected) {
      throw new Error("Compact index checksum mismatch: sidecar may be corrupted.");
    }
  }

  return index;
}

export function loadIndex(indexPath: string): SemanticIndex {
  const { metaPath, vectorPath } = compactPathsFromIndexPath(indexPath);
  if (existsSync(metaPath) && existsSync(vectorPath)) {
    return loadCompactIndex(indexPath);
  }

  const raw = readFileSync(indexPath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  return validateIndex(parsed);
}

export function saveIndex(indexPath: string, index: SemanticIndex): void {
  const indexWithChecksum: SemanticIndex = {
    ...index,
    checksum: computeChecksum(index),
  };

  writeFileSync(indexPath, `${JSON.stringify(indexWithChecksum, null, 2)}\n`, "utf8");
  saveCompactIndex(indexPath, indexWithChecksum);
}

export function getIndexSizeBytes(indexPath: string): number {
  return statSync(indexPath).size;
}

export function getVectorSizeBytes(indexPath: string): number {
  const { vectorPath } = compactPathsFromIndexPath(indexPath);
  if (existsSync(vectorPath)) {
    return statSync(vectorPath).size;
  }

  return 0;
}
