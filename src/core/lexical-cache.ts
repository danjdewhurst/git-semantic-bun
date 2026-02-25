import type { IndexedCommit, SemanticIndex } from "./types.ts";

interface CachedDocument {
  length: number;
  tf: Map<string, number>;
}

export interface LexicalCache {
  docs: Map<string, CachedDocument>;
  df: Map<string, number>;
  avgdl: number;
  totalDocs: number;
}

const INDEX_CACHE_LIMIT = 4;
const lexicalCacheByChecksum = new Map<string, LexicalCache>();

function tokenizeTerms(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function termFrequency(tokens: readonly string[]): Map<string, number> {
  const frequencies = new Map<string, number>();
  for (const token of tokens) {
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  }
  return frequencies;
}

export function buildLexicalCache(commits: readonly IndexedCommit[]): LexicalCache {
  const docs = new Map<string, CachedDocument>();
  const df = new Map<string, number>();
  let totalLength = 0;

  for (const commit of commits) {
    const tokens = tokenizeTerms(`${commit.message} ${commit.files.join(" ")}`);
    const tf = termFrequency(tokens);
    docs.set(commit.hash, {
      length: tokens.length,
      tf,
    });
    totalLength += tokens.length;

    for (const token of new Set(tf.keys())) {
      df.set(token, (df.get(token) ?? 0) + 1);
    }
  }

  return {
    docs,
    df,
    avgdl: commits.length > 0 ? totalLength / commits.length : 0,
    totalDocs: commits.length,
  };
}

export function getLexicalCacheForIndex(index: SemanticIndex): LexicalCache {
  const cacheKey = index.checksum;
  if (cacheKey && lexicalCacheByChecksum.has(cacheKey)) {
    return lexicalCacheByChecksum.get(cacheKey) as LexicalCache;
  }

  const built = buildLexicalCache(index.commits);

  if (cacheKey) {
    lexicalCacheByChecksum.set(cacheKey, built);

    if (lexicalCacheByChecksum.size > INDEX_CACHE_LIMIT) {
      const oldest = lexicalCacheByChecksum.keys().next().value;
      if (typeof oldest === "string") {
        lexicalCacheByChecksum.delete(oldest);
      }
    }
  }

  return built;
}

export function bm25ScoresFromCache(
  query: string,
  cache: LexicalCache,
  commitHashes: readonly string[],
): Map<string, number> {
  const queryTokens = tokenizeTerms(query);
  if (queryTokens.length === 0 || commitHashes.length === 0 || cache.totalDocs === 0) {
    return new Map();
  }

  const k1 = 1.5;
  const b = 0.75;

  const scores = new Map<string, number>();
  let maxScore = 0;

  for (const hash of commitHashes) {
    const doc = cache.docs.get(hash);
    if (!doc) {
      continue;
    }

    let score = 0;
    for (const token of queryTokens) {
      const tf = doc.tf.get(token) ?? 0;
      if (tf === 0) {
        continue;
      }

      const df = cache.df.get(token) ?? 0;
      const idf = Math.log(1 + (cache.totalDocs - df + 0.5) / (df + 0.5));
      const denominator = tf + k1 * (1 - b + b * (doc.length / Math.max(1, cache.avgdl)));
      score += idf * ((tf * (k1 + 1)) / denominator);
    }

    scores.set(hash, score);
    if (score > maxScore) {
      maxScore = score;
    }
  }

  if (maxScore <= 0) {
    return scores;
  }

  for (const [hash, score] of scores) {
    scores.set(hash, score / maxScore);
  }

  return scores;
}
