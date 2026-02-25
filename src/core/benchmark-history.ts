import { appendFileSync, existsSync, readFileSync } from "node:fs";

export interface BenchmarkHistoryEntry {
  timestamp: string;
  query: string;
  candidates: number;
  limit: number;
  iterations: number;
  baselineMs: number;
  optimisedMs: number;
  speedup: number;
}

export function saveBenchmarkHistory(path: string, entry: BenchmarkHistoryEntry): void {
  appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf8");
}

export function loadBenchmarkHistory(path: string): BenchmarkHistoryEntry[] {
  if (!existsSync(path)) {
    return [];
  }

  const raw = readFileSync(path, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as BenchmarkHistoryEntry);
}

export function renderBenchmarkHistorySummary(entries: readonly BenchmarkHistoryEntry[]): string {
  if (entries.length === 0) {
    return "No benchmark history yet.";
  }

  const recent = entries.slice(-10).reverse();
  const lines = ["Recent benchmark runs:"];

  for (const entry of recent) {
    lines.push(
      `${entry.timestamp} · speedup ${entry.speedup.toFixed(2)}x · baseline ${entry.baselineMs.toFixed(3)} ms · optimised ${entry.optimisedMs.toFixed(3)} ms · query=\"${entry.query}\"`,
    );
  }

  return lines.join("\n");
}
