function ensureSameLength(a: readonly number[], b: readonly number[]): void {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} !== ${b.length}`);
  }
}

export function normaliseVector(vector: readonly number[]): number[] {
  let norm = 0;
  for (let i = 0; i < vector.length; i += 1) {
    const value = vector[i] ?? 0;
    norm += value * value;
  }

  if (norm === 0) {
    return vector.map(() => 0);
  }

  const scale = 1 / Math.sqrt(norm);
  return vector.map((value) => (value ?? 0) * scale);
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  ensureSameLength(a, b);

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function cosineSimilarityUnit(a: readonly number[], b: readonly number[]): number {
  ensureSameLength(a, b);

  let dot = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
  }

  return dot;
}
