/** Minimum token length to include in BM25 scoring. */
const MIN_TOKEN_LENGTH = 2;

/**
 * Standard BM25 tuning parameters.
 * k1 controls term-frequency saturation (higher = slower saturation).
 * b controls document-length normalisation (0 = none, 1 = full).
 * These are the widely-used defaults from the original Robertson & Walker paper.
 */
export const BM25_K1 = 1.5;
export const BM25_B = 0.75;

export function tokenizeTerms(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= MIN_TOKEN_LENGTH);
}

export function termFrequency(tokens: readonly string[]): Map<string, number> {
  const frequencies = new Map<string, number>();
  for (const token of tokens) {
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  }
  return frequencies;
}
