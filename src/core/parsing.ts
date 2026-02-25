export function parseDateOption(value: string, flagName: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${flagName} date: ${value}. Use ISO date format, e.g. 2025-01-31.`);
  }
  return parsed;
}

export function parseLimitOption(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid limit: ${value}. Limit must be a positive integer.`);
  }

  if (parsed > 200) {
    throw new Error(`Invalid limit: ${value}. Limit must be <= 200.`);
  }

  return parsed;
}

export function validateBatchSize(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Batch size must be a positive integer.");
  }

  if (value > 256) {
    throw new Error("Batch size must be <= 256.");
  }

  return value;
}

export type SearchOutputFormat = "text" | "markdown" | "json";

export function parseSearchOutputFormat(value: string): SearchOutputFormat {
  if (value === "text" || value === "markdown" || value === "json") {
    return value;
  }

  throw new Error(`Invalid format: ${value}. Allowed values: text, markdown, json.`);
}

export function parseWeightOption(value: string, flagName: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${flagName} weight: ${value}. Weight must be a number.`);
  }

  if (parsed < 0 || parsed > 1) {
    throw new Error(`Invalid ${flagName} weight: ${value}. Weight must be between 0 and 1.`);
  }

  return parsed;
}
