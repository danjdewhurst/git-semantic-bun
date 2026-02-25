import { createHash } from "node:crypto";
import path from "node:path";
import { env, pipeline } from "@xenova/transformers";

interface TensorLike {
  data: Float32Array | number[];
  dims: number[];
}

export interface Embedder {
  modelName: string;
  embedBatch(texts: string[]): Promise<number[][]>;
}

type Extractor = (input: string | string[], options: Record<string, unknown>) => Promise<unknown>;

function isTensorLike(value: unknown): value is TensorLike {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.dims) && (candidate.data instanceof Float32Array || Array.isArray(candidate.data));
}

function toVectors(output: unknown, expectedRows: number): number[][] {
  if (!isTensorLike(output)) {
    throw new Error("Unexpected embedding output format from transformers pipeline.");
  }

  const dims = output.dims;
  const data = output.data instanceof Float32Array ? Array.from(output.data) : output.data;

  if (dims.length !== 2) {
    throw new Error(`Expected 2D embedding tensor, got dims=${JSON.stringify(dims)}`);
  }

  const rows = dims[0] ?? 0;
  const cols = dims[1] ?? 0;

  if (rows !== expectedRows || rows <= 0 || cols <= 0) {
    throw new Error(`Unexpected embedding tensor shape [${rows}, ${cols}] for ${expectedRows} rows.`);
  }

  const vectors: number[][] = [];
  for (let row = 0; row < rows; row += 1) {
    const start = row * cols;
    vectors.push(data.slice(start, start + cols));
  }

  return vectors;
}

function fakeVector(text: string, dimensions: number = 32): number[] {
  const digest = createHash("sha256").update(text).digest();
  const values: number[] = [];

  for (let i = 0; i < dimensions; i += 1) {
    const byte = digest[i % digest.length] ?? 0;
    values.push((byte / 255) * 2 - 1);
  }

  let norm = 0;
  for (const value of values) {
    norm += value * value;
  }

  if (norm === 0) {
    return values;
  }

  const scale = 1 / Math.sqrt(norm);
  return values.map((value) => value * scale);
}

export async function createEmbedder(modelName: string, cacheDir: string): Promise<Embedder> {
  if (process.env.GSB_FAKE_EMBEDDINGS === "1") {
    return {
      modelName: `${modelName}-fake`,
      async embedBatch(texts: string[]): Promise<number[][]> {
        return texts.map((text) => fakeVector(text));
      },
    };
  }

  env.cacheDir = path.resolve(cacheDir);
  env.allowLocalModels = true;

  const extractor = (await pipeline("feature-extraction", modelName)) as unknown as Extractor;

  return {
    modelName,
    async embedBatch(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) {
        return [];
      }

      const output = await extractor(texts, {
        pooling: "mean",
        normalize: true,
      });

      return toVectors(output, texts.length);
    },
  };
}
