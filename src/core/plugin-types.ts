import type { Command } from "commander";
import type { Embedder } from "./embeddings.ts";
import type { SearchOutputFormat } from "./parsing.ts";
import type { GitCommit, IndexedCommit, SearchFilters } from "./types.ts";
import type { VectorSearchStrategy } from "./vector-search.ts";

export interface PluginLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface PluginContext {
  repoRoot: string;
  semanticDir: string;
  cacheDir: string;
  config: Record<string, unknown>;
  logger: PluginLogger;
}

export interface ScoringSignal {
  readonly name: string;
  readonly defaultWeight: number;
  score(commit: IndexedCommit, queryText: string): number;
}

export interface RankedResult {
  rank: number;
  score: number;
  semanticScore: number;
  lexicalScore: number;
  recencyScore: number;
  hash: string;
  date: string;
  author: string;
  message: string;
  files: string[];
  snippet?: string;
}

export interface SearchOutputPayload {
  query: string;
  model: string;
  format: SearchOutputFormat;
  explain: boolean;
  totalIndexedCommits: number;
  matchedCommits: number;
  returnedResults: number;
  scoreWeights: {
    semantic: number;
    lexical: number;
    recency: number;
    recencyBoostEnabled: boolean;
  };
  filters: {
    author?: string;
    after?: string;
    before?: string;
    file?: string;
    limit: number;
  };
  results: RankedResult[];
}

export interface OutputFormatter {
  readonly name: string;
  render(payload: SearchOutputPayload): string;
}

export interface CommitFilter {
  readonly name: string;
  apply(commits: readonly IndexedCommit[], value: unknown): IndexedCommit[];
}

export type HookPoint = "preSearch" | "postSearch" | "preIndex" | "postIndex";

export type HookData =
  | { point: "preSearch"; query: string; filters: SearchFilters }
  | { point: "postSearch"; query: string; results: SearchOutputPayload }
  | { point: "preIndex"; commits: GitCommit[] }
  | { point: "postIndex"; indexed: IndexedCommit[] };

export interface PluginHook {
  readonly point: HookPoint;
  /** When true, hook failures log a warning and continue the chain instead of aborting. */
  readonly softFail?: boolean;
  execute(data: HookData): Promise<HookData> | HookData;
}

export interface GsbPlugin {
  readonly meta: {
    name: string;
    version: string;
    description?: string;
    gsbVersion?: string;
  };

  activate?(context: PluginContext): Promise<void> | void;
  deactivate?(): Promise<void> | void;

  createEmbedder?(modelName: string, cacheDir: string): Promise<Embedder> | undefined;
  createSearchStrategy?(
    commitCount: number,
    context: PluginContext,
  ): VectorSearchStrategy | undefined;
  scoringSignals?: readonly ScoringSignal[];
  outputFormatters?: readonly OutputFormatter[];
  commitFilters?: readonly CommitFilter[];
  hooks?: readonly PluginHook[];
  registerCommands?(program: Command, context: PluginContext): void;
}
