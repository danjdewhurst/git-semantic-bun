# Plugin System for git-semantic-bun

## Context

The project is a ~2,500-line CLI with clean separation between commands (`src/commands/`) and core logic (`src/core/`). It already has natural extension points — strategy pattern for search, `Embedder` interface, modular scoring, pluggable output formats. This plan formalises those into a plugin system so external authors can extend gsb without forking.

---

## Plugin Interface

A plugin is an ES module that default-exports a `GsbPlugin` object. Single flat interface; every property except `meta` is optional:

```typescript
interface GsbPlugin {
  readonly meta: {
    name: string;
    version: string;
    description?: string;
    gsbVersion?: string; // semver range for compatibility warnings
  };

  // Lifecycle
  activate?(context: PluginContext): Promise<void> | void;
  deactivate?(): Promise<void> | void;

  // Extension points (all optional)
  createEmbedder?(modelName: string, cacheDir: string): Promise<Embedder> | undefined;
  createSearchStrategy?(commitCount: number, context: PluginContext): VectorSearchStrategy | undefined;
  scoringSignals?: readonly ScoringSignal[];
  outputFormatters?: readonly OutputFormatter[];
  commitFilters?: readonly CommitFilter[];
  hooks?: readonly PluginHook[];
  registerCommands?(program: Command, context: PluginContext): void;
}
```

### Supporting Types

```typescript
interface PluginContext {
  repoRoot: string;
  semanticDir: string;
  cacheDir: string;
  config: Record<string, unknown>; // per-plugin config from .gsbrc.json
  logger: PluginLogger;
}

interface PluginLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

interface ScoringSignal {
  readonly name: string;
  readonly defaultWeight: number;
  score(commit: IndexedCommit, queryText: string): number;
}

interface OutputFormatter {
  readonly name: string;
  render(payload: SearchOutputPayload): string;
}

interface CommitFilter {
  readonly name: string;
  apply(commits: readonly IndexedCommit[], value: unknown): IndexedCommit[];
}

// Pre/post hooks for composable pipelines
type HookPoint = "preSearch" | "postSearch" | "preIndex" | "postIndex";

interface PluginHook {
  readonly point: HookPoint;
  execute(data: HookData): Promise<HookData> | HookData;
}

// Hook data varies by point
type HookData =
  | { point: "preSearch"; query: string; filters: SearchFilters }
  | { point: "postSearch"; query: string; results: SearchOutputPayload }
  | { point: "preIndex"; commits: GitCommit[] }
  | { point: "postIndex"; indexed: IndexedCommit[] };
```

---

## Discovery & Loading

Two sources, handled by Bun's native `import()`:

1. **Local files**: `.gsb/plugins/*.ts` (repo-level) and `~/.gsb/plugins/*.ts` (global)
2. **npm packages**: any `gsb-plugin-*` in `node_modules`

Auto-discovery runs unless `.gsbrc.json` explicitly lists plugins. A `--no-plugins` CLI flag disables all loading.

### Qualified Name Registration

To avoid collisions when multiple plugins register the same extension name, all registrations are stored with a qualified key (`pluginName:extensionName`). An unqualified alias is also registered if no conflict exists. Lookups try the unqualified name first, then fall back to qualified.

### Load Order

1. npm packages (alphabetical)
2. Global local plugins (`~/.gsb/plugins/`, alphabetical)
3. Repo local plugins (`.gsb/plugins/`, alphabetical)

Later registrations for "first-wins" extension points (embedder, search strategy) lose; for additive points (scoring signals, formatters, filters, hooks, commands) all contribute.

---

## Configuration

`.gsbrc.json` at repo root (per-repo) or `~/.gsbrc.json` (global). Repo takes precedence; configs are merged (repo overrides global per-key).

```json
{
  "plugins": ["gsb-plugin-ollama", "./.gsb/plugins/team-filters.ts"],
  "pluginConfig": {
    "gsb-plugin-ollama": {
      "endpoint": "http://localhost:11434",
      "apiKey": "$OLLAMA_API_KEY"
    }
  }
}
```

Omitting `plugins` enables auto-discovery.

### Environment Variable Interpolation

String values in `pluginConfig` support `$VAR_NAME` and `${VAR_NAME}` syntax, replaced at load time from `process.env`. This keeps secrets out of config files.

---

## Registry

`PluginRegistry` is a plain data container built once at startup. Not a singleton — created and passed explicitly.

### Accessor Methods

| Method | Resolution | Behaviour |
|--------|-----------|-----------|
| `getEmbedder(name)` | First plugin wins | Returns factory or `undefined` |
| `getSearchStrategy(commitCount, ctx)` | First plugin wins | Returns strategy or `undefined` |
| `getScoringSignals()` | All plugins contribute | Returns merged array |
| `getOutputFormatter(name)` | Lookup by name | Returns formatter or `undefined` |
| `getCommitFilters()` | All plugins contribute | Returns merged array |
| `getHooks(point)` | All plugins contribute | Returns hooks for a given point, ordered by load order |
| `getCommands()` | All plugins contribute | Returns command modules |
| `listPlugins()` | — | For stats/doctor display |

---

## Error Handling Policy

### Load-time Errors

- **Plugin file not found / import fails**: warn to stderr, skip plugin, continue loading others
- **Invalid plugin shape** (missing `meta`, `meta.name` not a string, `register` wrong type): warn, skip
- **Version incompatibility** (`meta.gsbVersion` doesn't match current gsb version): warn but still load (soft warning, not fatal)

All diagnostics include the plugin name and source path.

### Runtime Errors

- **Extension point failure** (embedder throws, formatter throws, etc.): fail the command with an actionable error message including the plugin name and the original error
- **Hook failure**: fail the command. Hooks form a pipeline — a broken link stops the chain
- **Future consideration**: optional `softFail` flag on hooks to warn and continue

---

## Hook Execution (Transform Chaining)

Hooks at each point execute in load order. Each hook receives the output of the previous one, forming a composable pipeline:

```
preSearch: query → hook1(query) → hook2(modifiedQuery) → final query used for search
postSearch: results → hook1(results) → hook2(modifiedResults) → final results rendered
preIndex: commits → hook1(commits) → hook2(modifiedCommits) → final commits indexed
postIndex: indexed → hook1(indexed) → hook2(modifiedIndexed) → final indexed stored
```

Built-in behaviour always runs first; hooks transform its input/output.

---

## Integration Points (existing file changes)

### `src/commands/search.ts`

- Add `registry?: PluginRegistry` to `SearchExecutionContext`
- In `runSearch`: try `registry.getEmbedder()` before built-in `createEmbedder()`
- In `executeSearch`:
  - Run `preSearch` hooks on query + filters before search
  - Apply plugin commit filters after `applyFilters()`
  - Use plugin search strategy if provided
  - Add plugin scoring signals to re-ranking via `combineScores`
  - Check plugin output formatters before built-in renderers
  - Run `postSearch` hooks on results before rendering
- Relax format type to accept plugin-provided format names

### `src/cli.ts`

- Add `--no-plugins` global option
- Load config → discover plugins → build registry → activate → register commands
- Call before `program.parseAsync()`

### `src/commands/serve.ts`

- Thread registry into `executeSearch` context (~5 lines)

### `src/core/parsing.ts`

- Accept plugin format names in `parseSearchOutputFormat` when registry is available

### `src/commands/doctor.ts`

- Show loaded plugins, their versions, and extension points in `gsb doctor` output

---

## New Files

| File | ~Lines | Purpose |
|------|--------|---------|
| `src/core/plugin-types.ts` | 80 | All plugin interfaces and supporting types |
| `src/core/plugin-config.ts` | 50 | `.gsbrc.json` loading, merging, env var interpolation |
| `src/core/plugin-loader.ts` | 80 | Discovery (local + npm), dynamic import, validation |
| `src/core/plugin-registry.ts` | 100 | Registry with accessor methods, qualified name handling |
| `src/plugin-export.ts` | 30 | Public type exports barrel for plugin authors |

### `src/plugin-export.ts` — Public Exports for Plugin Authors

```typescript
// Plugin contract
export type { GsbPlugin, PluginContext, PluginLogger } from "./core/plugin-types.ts";
export type { ScoringSignal, OutputFormatter, CommitFilter } from "./core/plugin-types.ts";
export type { PluginHook, HookPoint, HookData } from "./core/plugin-types.ts";

// Core types plugin authors need
export type { Embedder } from "./core/embeddings.ts";
export type { VectorSearchStrategy, SemanticCandidate } from "./core/vector-search.ts";
export type { SearchOutputPayload } from "./commands/search.ts";
export type { GitCommit, IndexedCommit, SemanticIndex, SearchFilters } from "./core/types.ts";
```

Add `"./plugin"` export map entry in `package.json`:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./plugin": "./src/plugin-export.ts"
  }
}
```

Plugin authors import via:

```typescript
import type { GsbPlugin, Embedder } from "git-semantic-bun/plugin";
```

---

## Implementation Steps

1. **Plugin types** — Create `src/core/plugin-types.ts` with all interfaces
2. **Config loader** — Create `src/core/plugin-config.ts` for `.gsbrc.json` with env var interpolation
3. **Plugin loader** — Create `src/core/plugin-loader.ts` with discovery, validation, qualified name registration
4. **Plugin registry** — Create `src/core/plugin-registry.ts`
5. **CLI bootstrap** — Wire loading into `src/cli.ts`, add `--no-plugins`
6. **Search integration** — Thread registry through `executeSearch` in `src/commands/search.ts`, including hook chain execution
7. **Index integration** — Add `preIndex`/`postIndex` hooks in `src/commands/index.ts`
8. **Serve integration** — Pass registry in `src/commands/serve.ts`
9. **Public exports** — Create `src/plugin-export.ts`, add export map to `package.json`
10. **Doctor integration** — Show loaded plugins in `gsb doctor` output
11. **Tests** — Plugin loading, registry methods, config merging, env var interpolation, hook chaining, invalid plugin handling, qualified name collision resolution, `--no-plugins` flag
12. **Documentation** — Plugin authoring guide with examples

---

## Verification

1. `bun test` — all existing tests pass (no plugins = no behaviour change)
2. Create a test plugin in `.gsb/plugins/test-csv.ts` that adds a CSV formatter; verify `gsb search "query" --format csv` works
3. Create a test scoring signal plugin; verify `--explain` shows the additional signal
4. Create a test `preSearch` hook that rewrites queries; verify the rewritten query is used
5. Verify `gsb doctor` lists loaded plugins
6. Verify `--no-plugins` suppresses all plugin loading
7. Verify invalid plugin files are skipped with a warning
8. Verify two plugins registering the same embedder name resolves via qualified names

---

## Non-goals for v1

- Full plugin sandboxing / permissions model
- Remote plugin registry
- Hot reload
- Hook concurrency controls
- Plugin API versioning (defer until there's a breaking change)

---

## Future Extensions

- `softFail` flag on hooks for non-critical pipelines
- Additional hook points (`onFilter`, `onRank`, `onFormatOutput`)
- Capability negotiation (`capabilities: []`)
- Plugin API v2 with compatibility shim
- `gsb plugin list` / `gsb plugin add` CLI commands
