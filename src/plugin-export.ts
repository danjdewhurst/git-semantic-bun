// Public type exports for plugin authors.
// Plugin authors import via: import type { GsbPlugin, Embedder } from "git-semantic-bun/plugin";

// Plugin contract
export type {
  GsbPlugin,
  PluginContext,
  PluginLogger,
  ScoringSignal,
  OutputFormatter,
  CommitFilter,
  PluginHook,
  HookPoint,
  HookData,
  RankedResult,
  SearchOutputPayload,
} from "./core/plugin-types.ts";

// Core types plugin authors need
export type { Embedder } from "./core/embeddings.ts";
export type { VectorSearchStrategy, SemanticCandidate } from "./core/vector-search.ts";
export type {
  GitCommit,
  IndexedCommit,
  SemanticIndex,
  SearchFilters,
} from "./core/types.ts";
export type { SearchOutputFormat } from "./core/parsing.ts";
