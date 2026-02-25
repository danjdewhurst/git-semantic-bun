# Plugins

gsb supports an extensible plugin system. Plugins can add custom embedders, search strategies, scoring signals, output formatters, commit filters, lifecycle hooks, and CLI commands — all without forking.

For a complete working example demonstrating multiple extension points, see [`examples/gsb-plugin-example.ts`](../examples/gsb-plugin-example.ts).

## Quick start

A plugin is an ES module that default-exports a `GsbPlugin` object. Create a file at `.gsb/plugins/my-plugin.ts`:

```typescript
import type { GsbPlugin } from "git-semantic-bun/plugin";

const plugin: GsbPlugin = {
  meta: {
    name: "my-plugin",
    version: "1.0.0",
    description: "Example gsb plugin",
  },

  activate(context) {
    context.logger.info("Plugin activated");
  },

  outputFormatters: [
    {
      name: "csv",
      render(payload) {
        const header = "rank,score,hash,message";
        const rows = payload.results.map(
          (r) => `${r.rank},${r.score.toFixed(3)},${r.hash},${JSON.stringify(r.message)}`,
        );
        return [header, ...rows].join("\n");
      },
    },
  ],
};

export default plugin;
```

Then use it:

```bash
gsb search "refactor auth" --format csv
```

## Plugin interface

Every property except `meta` is optional:

```typescript
interface GsbPlugin {
  readonly meta: {
    name: string;
    version: string;
    description?: string;
    gsbVersion?: string;   // semver range — triggers a warning if incompatible
  };

  activate?(context: PluginContext): Promise<void> | void;
  deactivate?(): Promise<void> | void;

  createEmbedder?(modelName: string, cacheDir: string): Promise<Embedder> | undefined;
  createSearchStrategy?(commitCount: number, context: PluginContext): VectorSearchStrategy | undefined;
  scoringSignals?: readonly ScoringSignal[];
  outputFormatters?: readonly OutputFormatter[];
  commitFilters?: readonly CommitFilter[];
  hooks?: readonly PluginHook[];
  registerCommands?(program: Command, context: PluginContext): void;
}
```

Plugin authors import types via:

```typescript
import type { GsbPlugin, Embedder, PluginContext } from "git-semantic-bun/plugin";
```

## Discovery and loading

Plugins are discovered from two sources:

1. **Local files** — `.gsb/plugins/*.ts` (repo-level) and `~/.gsb/plugins/*.ts` (global)
2. **npm packages** — any `gsb-plugin-*` package in `node_modules`

Load order:

1. npm packages (alphabetical)
2. Global local plugins (`~/.gsb/plugins/`, alphabetical)
3. Repo local plugins (`.gsb/plugins/`, alphabetical)

Auto-discovery runs unless `.gsbrc.json` explicitly lists plugins. Use `--no-plugins` to disable all loading.

## Configuration

Create `.gsbrc.json` at the repo root (per-repo) or `~/.gsbrc.json` (global). Repo config takes precedence; configs are merged per-key.

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

### Plugin list

Omitting `plugins` enables auto-discovery. When present, only the listed plugins are loaded. Entries starting with `.` or `/` are resolved relative to the repo root; other entries are treated as npm package names.

### Environment variable interpolation

String values in `pluginConfig` support `$VAR_NAME` and `${VAR_NAME}` syntax, replaced at load time from `process.env`. Missing variables resolve to an empty string. Use `$$` to produce a literal `$`.

```json
{
  "pluginConfig": {
    "my-plugin": {
      "apiKey": "$MY_API_KEY",
      "price": "$$100"
    }
  }
}
```

The plugin receives `config.apiKey` as the environment variable value and `config.price` as `"$100"`.

## Extension points

### Custom embedder

Return a `Promise<Embedder>` for model names your plugin supports, or `undefined` to pass through to the next plugin or built-in embedder. First plugin to return a value wins.

```typescript
const plugin: GsbPlugin = {
  meta: { name: "ollama-embedder", version: "1.0.0" },

  createEmbedder(modelName, cacheDir) {
    if (!modelName.startsWith("ollama/")) return undefined;

    return Promise.resolve({
      modelName,
      async embedBatch(texts) {
        // Call your embedding API here
        return texts.map(() => new Array(384).fill(0));
      },
    });
  },
};
```

### Custom search strategy

Return a `VectorSearchStrategy` to replace the built-in exact/ANN search. First plugin to return a value wins.

```typescript
const plugin: GsbPlugin = {
  meta: { name: "custom-strategy", version: "1.0.0" },

  createSearchStrategy(commitCount, context) {
    if (commitCount < 50_000) return undefined;

    return {
      name: "custom",
      search(queryEmbedding, candidates, limit) {
        // Your search logic — return SemanticCandidate[]
        return [];
      },
    };
  },
};
```

### Scoring signals

Add extra scoring dimensions to the hybrid re-ranking step. All plugins contribute (additive). Each signal's `score()` is called per candidate commit and multiplied by `defaultWeight`.

```typescript
const plugin: GsbPlugin = {
  meta: { name: "file-count-scorer", version: "1.0.0" },

  scoringSignals: [
    {
      name: "file-count",
      defaultWeight: 0.05,
      score(commit, queryText) {
        // Prefer commits that touch fewer files (more focused changes)
        return 1 / (1 + commit.files.length);
      },
    },
  ],
};
```

### Output formatters

Add custom output formats selectable via `--format <name>`. The `render()` function receives the full `SearchOutputPayload` and returns a string.

```typescript
const plugin: GsbPlugin = {
  meta: { name: "csv-formatter", version: "1.0.0" },

  outputFormatters: [
    {
      name: "csv",
      render(payload) {
        const header = "rank,score,hash,author,date,message";
        const rows = payload.results.map(
          (r) => [r.rank, r.score.toFixed(3), r.hash, r.author, r.date, JSON.stringify(r.message)].join(","),
        );
        return [header, ...rows].join("\n");
      },
    },
  ],
};
```

### Commit filters

Filter the candidate commit list during search. All plugins contribute. Each filter's `apply()` receives the current commit list and returns a filtered subset.

```typescript
const plugin: GsbPlugin = {
  meta: { name: "merge-filter", version: "1.0.0" },

  commitFilters: [
    {
      name: "skip-merges",
      apply(commits) {
        return commits.filter((c) => !c.message.startsWith("Merge "));
      },
    },
  ],
};
```

### Hooks

Hooks form transform pipelines at four points in the execution lifecycle. Each hook receives the output of the previous one:

| Point | Data | When |
|---|---|---|
| `preSearch` | `{ query, filters }` | Before search executes — can rewrite the query or modify filters |
| `postSearch` | `{ query, results }` | After search — can transform the result payload |
| `preIndex` | `{ commits }` | Before indexing — can filter or modify the commit list |
| `postIndex` | `{ indexed }` | After indexing — can transform indexed commits before saving |

```typescript
const plugin: GsbPlugin = {
  meta: { name: "query-expander", version: "1.0.0" },

  hooks: [
    {
      point: "preSearch",
      execute(data) {
        if (data.point !== "preSearch") return data;
        return { ...data, query: `${data.query} (code change)` };
      },
    },
  ],
};
```

#### Soft failure

By default, a hook failure aborts the command. Set `softFail: true` to log a warning and continue the chain instead:

```typescript
{
  point: "postSearch",
  softFail: true,
  execute(data) {
    // If this throws, the chain continues with the previous data
    return data;
  },
}
```

### CLI commands

Register additional subcommands on the `gsb` program:

```typescript
const plugin: GsbPlugin = {
  meta: { name: "export-plugin", version: "1.0.0" },

  registerCommands(program, context) {
    program
      .command("export-csv")
      .description("Export the full index as CSV")
      .action(() => {
        context.logger.info("Exporting...");
        // Your command logic
      });
  },
};
```

## Qualified names

When multiple plugins register extensions with the same name (e.g. two formatters both named `"custom"`), the first-registered plugin wins the unqualified name. All registrations are always available via their qualified name: `pluginName:extensionName`.

```bash
# Unqualified — resolves to the first-registered "custom" formatter
gsb search "query" --format custom

# Qualified — explicitly select a specific plugin's formatter
gsb search "query" --format plugin-b:custom
```

## Error handling

### Load-time errors

- **Plugin file not found / import fails**: warning to stderr, plugin skipped
- **Invalid plugin shape** (missing `meta`, wrong types): warning, skipped
- **Version incompatibility** (`meta.gsbVersion` doesn't match): warning but still loaded

### Runtime errors

- **Extension point failure** (embedder throws, formatter throws): fails the command with an actionable error including the plugin name
- **Hook failure**: fails the command (hooks form a pipeline — a broken link stops the chain)
- **Hook with `softFail: true`**: logs a warning to stderr and continues with the previous data

## Diagnostics

`gsb doctor` shows loaded plugins, their versions, sources, and which extension points they provide:

```
OK   index                found at /path/to/index.json
OK   compact metadata     found at /path/to/index.meta.json
...

Plugins:
  csv-formatter v1.0.0 (repo:csv-formatter.ts) — formatter:csv
  query-expander v1.0.0 (npm:gsb-plugin-expander) — hook:preSearch

Doctor completed successfully.
```

## Disabling plugins

```bash
# Disable all plugins for a single command
gsb search "query" --no-plugins

# Or set an empty plugin list in .gsbrc.json
{ "plugins": [] }
```

## Publishing an npm plugin

Name your package `gsb-plugin-<name>` so it is auto-discovered. The package should default-export a `GsbPlugin` object.

```json
{
  "name": "gsb-plugin-ollama",
  "version": "1.0.0",
  "type": "module",
  "main": "./index.ts",
  "peerDependencies": {
    "git-semantic-bun": ">=0.5.0"
  }
}
```

```typescript
// index.ts
import type { GsbPlugin } from "git-semantic-bun/plugin";

const plugin: GsbPlugin = {
  meta: {
    name: "gsb-plugin-ollama",
    version: "1.0.0",
    gsbVersion: ">=0.5.0",
  },
  // ...extension points
};

export default plugin;
```

## Available types

All types needed for plugin authoring are exported from `git-semantic-bun/plugin`:

| Type | Purpose |
|---|---|
| `GsbPlugin` | Main plugin interface |
| `PluginContext` | Context passed to `activate()` and other lifecycle methods |
| `PluginLogger` | Logging interface (`info`, `warn`, `error`) |
| `Embedder` | Embedding model interface (`modelName`, `embedBatch`) |
| `VectorSearchStrategy` | Search strategy interface |
| `SemanticCandidate` | Single search result from a strategy |
| `ScoringSignal` | Custom scoring dimension |
| `OutputFormatter` | Custom output format renderer |
| `CommitFilter` | Custom commit filter |
| `PluginHook` | Lifecycle hook |
| `HookPoint` | `"preSearch" \| "postSearch" \| "preIndex" \| "postIndex"` |
| `HookData` | Discriminated union of hook data by point |
| `SearchOutputPayload` | Full search result payload |
| `RankedResult` | Single ranked result within a payload |
| `GitCommit` | Raw commit from git log |
| `IndexedCommit` | Commit with embedding vector |
| `SearchFilters` | Filter criteria (author, date, file) |
| `SearchOutputFormat` | Format string type |
