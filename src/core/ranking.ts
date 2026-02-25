export interface ScoreWeights {
  semantic: number;
  lexical: number;
  recency: number;
  recencyBoostEnabled: boolean;
}

export interface Bm25Document {
  id: string;
  message: string;
  files: readonly string[];
}

function tokenizeTerms(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function tokenize(value: string): Set<string> {
  return new Set(tokenizeTerms(value));
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

function termFrequency(tokens: readonly string[]): Map<string, number> {
  const frequencies = new Map<string, number>();
  for (const token of tokens) {
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  }
  return frequencies;
}

export function bm25Scores(query: string, documents: readonly Bm25Document[]): Map<string, number> {
  const tokens = tokenizeTerms(query);
  if (tokens.length === 0 || documents.length === 0) {
    return new Map();
  }

  const k1 = 1.5;
  const b = 0.75;

  const docStats = documents.map((document) => {
    const docTokens = tokenizeTerms(`${document.message} ${document.files.join(" ")}`);
    return {
      id: document.id,
      length: docTokens.length,
      tf: termFrequency(docTokens),
    };
  });

  const avgdl = docStats.reduce((sum, doc) => sum + doc.length, 0) / docStats.length;
  const documentFrequency = new Map<string, number>();

  for (const doc of docStats) {
    for (const token of new Set(doc.tf.keys())) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  const scores = new Map<string, number>();
  let maxScore = 0;

  for (const doc of docStats) {
    let score = 0;

    for (const token of tokens) {
      const tf = doc.tf.get(token) ?? 0;
      if (tf === 0) {
        continue;
      }

      const df = documentFrequency.get(token) ?? 0;
      const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5));
      const denominator = tf + k1 * (1 - b + b * (doc.length / Math.max(1, avgdl)));
      score += idf * ((tf * (k1 + 1)) / denominator);
    }

    scores.set(doc.id, score);
    if (score > maxScore) {
      maxScore = score;
    }
  }

  if (maxScore <= 0) {
    return scores;
  }

  for (const [id, score] of scores) {
    scores.set(id, score / maxScore);
  }

  return scores;
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

export function combineScores(
  semantic: number,
  lexical: number,
  recency: number,
  weights: ScoreWeights,
): number {
  return semantic * weights.semantic + lexical * weights.lexical + recency * weights.recency;
}
