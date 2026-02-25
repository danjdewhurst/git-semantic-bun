export interface ScoreWeights {
  semantic: number;
  lexical: number;
  recency: number;
  recencyBoostEnabled: boolean;
}

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2),
  );
}

export function lexicalScore(query: string, message: string, files: readonly string[]): number {
  const queryTokens = tokenize(query);
  if (queryTokens.size === 0) {
    return 0;
  }

  const corpusTokens = tokenize(`${message} ${files.join(" ")}`);
  if (corpusTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of queryTokens) {
    if (corpusTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / queryTokens.size;
}

export function recencyScore(commitDate: string): number {
  const ageMs = Date.now() - new Date(commitDate).getTime();
  if (ageMs <= 0) {
    return 1;
  }

  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return Math.exp(-ageDays / 365);
}

export function normaliseWeights(weights: ScoreWeights): ScoreWeights {
  const total = weights.semantic + weights.lexical + weights.recency;
  if (total <= 0) {
    throw new Error("At least one search weight must be greater than zero.");
  }

  return {
    semantic: weights.semantic / total,
    lexical: weights.lexical / total,
    recency: weights.recency / total,
    recencyBoostEnabled: weights.recencyBoostEnabled,
  };
}
