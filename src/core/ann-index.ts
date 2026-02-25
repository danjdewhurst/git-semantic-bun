import type { AnnIndexHandle } from "./vector-search.ts";

const ANN_CONNECTIVITY = 16;
const ANN_EXPANSION_ADD = 128;
const ANN_EXPANSION_SEARCH = 64;

interface UsearchModule {
  Index: new (config: {
    metric: string;
    connectivity: number;
    dimensions: number;
    expansion_add: number;
    expansion_search: number;
  }) => UsearchIndex;
  MetricKind: { IP: string };
}

interface UsearchIndex {
  add(keys: bigint | bigint[], vectors: Float32Array, threads?: number): void;
  search(
    vectors: Float32Array,
    k: number,
    threads: number,
  ): {
    keys: BigUint64Array;
    distances: Float32Array;
  };
  save(path: string): void;
  load(path: string): void;
  size(): number;
}

let usearchModule: UsearchModule | null | false = null;

async function getUsearch(): Promise<UsearchModule | null> {
  if (usearchModule === false) return null;
  if (usearchModule !== null) return usearchModule;

  try {
    usearchModule = (await import("usearch")) as unknown as UsearchModule;
    return usearchModule;
  } catch {
    usearchModule = false;
    return null;
  }
}

export async function isAnnAvailable(): Promise<boolean> {
  return (await getUsearch()) !== null;
}

export async function buildAnnIndex(
  vectors: Float32Array,
  dimension: number,
  count: number,
): Promise<AnnIndexHandle> {
  const usearch = await getUsearch();
  if (!usearch) {
    throw new Error("usearch is not available. Install it with: bun add usearch");
  }

  const index = new usearch.Index({
    metric: usearch.MetricKind.IP,
    connectivity: ANN_CONNECTIVITY,
    dimensions: dimension,
    expansion_add: ANN_EXPANSION_ADD,
    expansion_search: ANN_EXPANSION_SEARCH,
  });

  for (let i = 0; i < count; i += 1) {
    const offset = i * dimension;
    const vector = vectors.subarray(offset, offset + dimension);
    index.add(BigInt(i), vector);
  }

  return wrapIndex(index);
}

export async function loadAnnIndex(filePath: string, dimension: number): Promise<AnnIndexHandle> {
  const usearch = await getUsearch();
  if (!usearch) {
    throw new Error("usearch is not available. Install it with: bun add usearch");
  }

  const index = new usearch.Index({
    metric: usearch.MetricKind.IP,
    connectivity: ANN_CONNECTIVITY,
    dimensions: dimension,
    expansion_add: ANN_EXPANSION_ADD,
    expansion_search: ANN_EXPANSION_SEARCH,
  });

  index.load(filePath);
  return wrapIndex(index);
}

function wrapIndex(index: UsearchIndex): AnnIndexHandle {
  return {
    search(query: Float32Array, limit: number) {
      const result = index.search(query, limit, 0);
      return {
        keys: Array.from(result.keys).map((k) => BigInt(k)),
        distances: Array.from(result.distances),
      };
    },
    save(filePath: string) {
      index.save(filePath);
    },
    size() {
      return index.size();
    },
  };
}
