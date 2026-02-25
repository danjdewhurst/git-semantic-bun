import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { SemanticIndex, VectorDtype } from "./types.ts";

interface CompactMetaCommit {
  hash: string;
  author: string;
  date: string;
  message: string;
  files: string[];
  vectorOffset: number;
}

interface AnnIndexMeta {
  file: string;
  metric: string;
  connectivity: number;
  commitCount: number;
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
    dtype: "float32" | "float16";
    dimension: number;
    count: number;
    normalised: boolean;
  };
  ann?: AnnIndexMeta;
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

function float32ToFloat16(value: number): number {
  const floatView = new Float32Array(1);
  const intView = new Uint32Array(floatView.buffer);
  floatView[0] = value;
  const x = intView[0] ?? 0;

  const sign = (x >>> 31) & 0x1;
  const exponent = (x >>> 23) & 0xff;
  const mantissa = x & 0x7fffff;

  if (exponent === 0xff) {
    return (sign << 15) | (mantissa ? 0x7e00 : 0x7c00);
  }

  const halfExponent = exponent - 127 + 15;
  if (halfExponent >= 0x1f) {
    return (sign << 15) | 0x7c00;
  }

  if (halfExponent <= 0) {
    if (halfExponent < -10) {
      return sign << 15;
    }

    const subnormal = (mantissa | 0x800000) >> (1 - halfExponent + 13);
    return (sign << 15) | subnormal;
  }

  return (sign << 15) | (halfExponent << 10) | (mantissa >> 13);
}

function float16ToFloat32(value: number): number {
  const sign = (value & 0x8000) << 16;
  const exponent = (value >> 10) & 0x1f;
  const mantissa = value & 0x03ff;

  let bits: number;
  if (exponent === 0) {
    if (mantissa === 0) {
      bits = sign;
    } else {
      let e = -1;
      let m = mantissa;
      while ((m & 0x0400) === 0) {
        m <<= 1;
        e -= 1;
      }
      m &= 0x03ff;
      bits = sign | ((e + 127) << 23) | (m << 13);
    }
  } else if (exponent === 0x1f) {
    bits = sign | 0x7f800000 | (mantissa << 13);
  } else {
    bits = sign | ((exponent - 15 + 127) << 23) | (mantissa << 13);
  }

  const intView = new Uint32Array(1);
  const floatView = new Float32Array(intView.buffer);
  intView[0] = bits;
  return floatView[0] ?? 0;
}

function toCompactDtype(dtype: VectorDtype | undefined): "float32" | "float16" {
  return dtype === "f16" ? "float16" : "float32";
}

function fromCompactDtype(dtype: "float32" | "float16"): VectorDtype {
  return dtype === "float16" ? "f16" : "f32";
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
    ...(value.vectorDtype === "f16" || value.vectorDtype === "f32"
      ? { vectorDtype: value.vectorDtype }
      : {}),
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
    (vector.dtype !== "float32" && vector.dtype !== "float16") ||
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
      dtype: vector.dtype,
      dimension: vector.dimension,
      count: vector.count,
      normalised: vector.normalised,
    },
    commits,
  };
}

function compactMetaPathFromIndexPath(indexPath: string): string {
  const semanticDir = path.dirname(indexPath);
  return path.join(semanticDir, "index.meta.json");
}

function saveCompactIndex(indexPath: string, index: SemanticIndex): void {
  const metaPath = compactMetaPathFromIndexPath(indexPath);
  const compactDtype = toCompactDtype(index.vectorDtype);
  const vectorExtension = compactDtype === "float16" ? "f16" : "f32";
  const vectorFile = `index.vec.${vectorExtension}`;
  const vectorPath = path.join(path.dirname(metaPath), vectorFile);
  const dimension = index.commits[0]?.embedding.length ?? 0;

  if (compactDtype === "float16") {
    const values = new Uint16Array(index.commits.length * dimension);
    for (let row = 0; row < index.commits.length; row += 1) {
      const embedding = index.commits[row]?.embedding ?? [];
      for (let col = 0; col < dimension; col += 1) {
        values[row * dimension + col] = float32ToFloat16(embedding[col] ?? 0);
      }
    }
    writeFileSync(vectorPath, Buffer.from(values.buffer));
  } else {
    const values = new Float32Array(index.commits.length * dimension);
    for (let row = 0; row < index.commits.length; row += 1) {
      const embedding = index.commits[row]?.embedding ?? [];
      for (let col = 0; col < dimension; col += 1) {
        values[row * dimension + col] = embedding[col] ?? 0;
      }
    }
    writeFileSync(vectorPath, Buffer.from(values.buffer));
  }

  const meta: CompactIndexMeta = {
    version: 2,
    modelName: index.modelName,
    createdAt: index.createdAt,
    lastUpdatedAt: index.lastUpdatedAt,
    repositoryRoot: index.repositoryRoot,
    includePatch: index.includePatch,
    ...(index.checksum ? { checksum: index.checksum } : {}),
    vector: {
      file: vectorFile,
      dtype: compactDtype,
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
  const metaPath = compactMetaPathFromIndexPath(indexPath);
  const meta = validateCompactMeta(JSON.parse(readFileSync(metaPath, "utf8")));
  const vectorPath = path.join(path.dirname(metaPath), meta.vector.file);
  const vectorData = readFileSync(vectorPath);

  const expectedLength = meta.vector.dimension * meta.vector.count;
  const vectorDtype = fromCompactDtype(meta.vector.dtype);

  const valuesF16 =
    meta.vector.dtype === "float16"
      ? new Uint16Array(vectorData.buffer, vectorData.byteOffset, vectorData.byteLength / 2)
      : undefined;
  const valuesF32 =
    meta.vector.dtype === "float32"
      ? new Float32Array(vectorData.buffer, vectorData.byteOffset, vectorData.byteLength / 4)
      : undefined;

  const actualLength = valuesF16?.length ?? valuesF32?.length ?? 0;
  if (actualLength !== expectedLength) {
    throw new Error("Compact vector file size does not match metadata");
  }

  const commits = meta.commits.map((commit) => {
    const start = commit.vectorOffset * meta.vector.dimension;
    const end = start + meta.vector.dimension;
    let cachedEmbedding: number[] | undefined;

    return {
      hash: commit.hash,
      author: commit.author,
      date: commit.date,
      message: commit.message,
      files: commit.files,
      get embedding(): number[] {
        if (cachedEmbedding) {
          return cachedEmbedding;
        }

        if (valuesF16) {
          cachedEmbedding = Array.from(valuesF16.slice(start, end)).map((value) =>
            float16ToFloat32(value),
          );
          return cachedEmbedding;
        }

        if (valuesF32) {
          cachedEmbedding = Array.from(valuesF32.slice(start, end));
          return cachedEmbedding;
        }

        return [];
      },
    };
  });

  const index: SemanticIndex = {
    version: 1,
    modelName: meta.modelName,
    createdAt: meta.createdAt,
    lastUpdatedAt: meta.lastUpdatedAt,
    repositoryRoot: meta.repositoryRoot,
    includePatch: meta.includePatch,
    vectorDtype,
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
  const metaPath = compactMetaPathFromIndexPath(indexPath);
  if (existsSync(metaPath)) {
    return loadCompactIndex(indexPath);
  }

  const raw = readFileSync(indexPath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  return validateIndex(parsed);
}

export function saveIndex(indexPath: string, index: SemanticIndex): void {
  const indexWithChecksum: SemanticIndex = {
    ...index,
    vectorDtype: index.vectorDtype ?? "f32",
    checksum: computeChecksum(index),
  };

  writeFileSync(indexPath, `${JSON.stringify(indexWithChecksum, null, 2)}\n`, "utf8");
  saveCompactIndex(indexPath, indexWithChecksum);
}

export async function saveIndexWithAnn(indexPath: string, index: SemanticIndex): Promise<void> {
  saveIndex(indexPath, index);
  await buildAndSaveAnnIndex(indexPath, index);
}

async function buildAndSaveAnnIndex(indexPath: string, index: SemanticIndex): Promise<void> {
  const { isAnnAvailable, buildAnnIndex } = await import("./ann-index.ts");

  if (!(await isAnnAvailable())) {
    return;
  }

  const dimension = index.commits[0]?.embedding.length ?? 0;
  if (dimension === 0 || index.commits.length === 0) {
    return;
  }

  const count = index.commits.length;
  const vectors = new Float32Array(count * dimension);
  for (let i = 0; i < count; i += 1) {
    const embedding = index.commits[i]?.embedding ?? [];
    for (let d = 0; d < dimension; d += 1) {
      vectors[i * dimension + d] = embedding[d] ?? 0;
    }
  }

  const annHandle = await buildAnnIndex(vectors, dimension, count);
  const semanticDir = path.dirname(indexPath);
  const annPath = path.join(semanticDir, "index.ann.usearch");
  annHandle.save(annPath);

  // Update compact meta with ANN info
  const metaPath = compactMetaPathFromIndexPath(indexPath);
  if (existsSync(metaPath)) {
    const meta = JSON.parse(readFileSync(metaPath, "utf8")) as CompactIndexMeta;
    meta.ann = {
      file: "index.ann.usearch",
      metric: "ip",
      connectivity: 16,
      commitCount: count,
    };
    writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  }
}

export function getIndexSizeBytes(indexPath: string): number {
  return statSync(indexPath).size;
}

export function getVectorSizeBytes(indexPath: string): number {
  const metaPath = compactMetaPathFromIndexPath(indexPath);
  if (!existsSync(metaPath)) {
    return 0;
  }

  const meta = validateCompactMeta(JSON.parse(readFileSync(metaPath, "utf8")));
  const vectorPath = path.join(path.dirname(metaPath), meta.vector.file);
  if (existsSync(vectorPath)) {
    return statSync(vectorPath).size;
  }

  return 0;
}

export function getAnnIndexInfo(indexPath: string): {
  exists: boolean;
  sizeBytes: number;
  commitCount: number;
} {
  const metaPath = compactMetaPathFromIndexPath(indexPath);
  if (!existsSync(metaPath)) {
    return { exists: false, sizeBytes: 0, commitCount: 0 };
  }

  try {
    const meta = validateCompactMeta(JSON.parse(readFileSync(metaPath, "utf8")));
    if (!meta.ann) {
      return { exists: false, sizeBytes: 0, commitCount: 0 };
    }

    const annPath = path.join(path.dirname(metaPath), meta.ann.file);
    if (!existsSync(annPath)) {
      return { exists: false, sizeBytes: 0, commitCount: meta.ann.commitCount };
    }

    return {
      exists: true,
      sizeBytes: statSync(annPath).size,
      commitCount: meta.ann.commitCount,
    };
  } catch {
    return { exists: false, sizeBytes: 0, commitCount: 0 };
  }
}

export function getVectorDtype(indexPath: string): VectorDtype {
  const metaPath = compactMetaPathFromIndexPath(indexPath);
  if (existsSync(metaPath)) {
    const meta = validateCompactMeta(JSON.parse(readFileSync(metaPath, "utf8")));
    return fromCompactDtype(meta.vector.dtype);
  }

  if (existsSync(indexPath)) {
    const index = validateIndex(JSON.parse(readFileSync(indexPath, "utf8")));
    return index.vectorDtype ?? "f32";
  }

  return "f32";
}
