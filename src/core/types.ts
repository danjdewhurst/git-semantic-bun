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

export interface SemanticIndex {
  version: 1;
  modelName: string;
  createdAt: string;
  lastUpdatedAt: string;
  repositoryRoot: string;
  includePatch: boolean;
  commits: IndexedCommit[];
}

export interface SearchFilters {
  author?: string;
  after?: Date;
  before?: Date;
  file?: string;
}

export interface InitMetadata {
  modelName: string;
  initializedAt: string;
}
