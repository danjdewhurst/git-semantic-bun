export interface GitCommit {
  hash: string;
  author: string;
  date: string;
  message: string;
  files: string[];
  patch?: string;
}

export interface IndexedCommit {
  hash: string;
  author: string;
  date: string;
  message: string;
  files: string[];
  embedding: number[];
}

export type VectorDtype = "f32" | "f16";

export interface SemanticIndex {
  version: 1;
  modelName: string;
  createdAt: string;
  lastUpdatedAt: string;
  repositoryRoot: string;
  includePatch: boolean;
  vectorDtype?: VectorDtype;
  checksum?: string;
  commits: IndexedCommit[];
}

export interface SearchFilters {
  author?: string;
  after?: Date;
  before?: Date;
  file?: string;
}

export type SearchStrategyName = "auto" | "exact" | "ann";

export interface InitMetadata {
  modelName: string;
  initializedAt: string;
}
