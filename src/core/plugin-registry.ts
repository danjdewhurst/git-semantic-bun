import type { Command } from "commander";
import type { Embedder } from "./embeddings.ts";
import type { GsbConfig } from "./plugin-config.ts";
import { type LoadedPlugin, createPluginContext } from "./plugin-loader.ts";
import type {
  CommitFilter,
  HookData,
  HookPoint,
  OutputFormatter,
  PluginContext,
  PluginHook,
  ScoringSignal,
} from "./plugin-types.ts";
import type { VectorSearchStrategy } from "./vector-search.ts";

interface PluginInfo {
  name: string;
  version: string;
  source: string;
  extensionPoints: string[];
}

export class PluginRegistry {
  private readonly plugins: PluginInfo[] = [];
  private readonly embedderFactories = new Map<
    string,
    (modelName: string, cacheDir: string) => Promise<Embedder> | undefined
  >();
  private readonly searchStrategyFactories = new Map<
    string,
    (commitCount: number, context: PluginContext) => VectorSearchStrategy | undefined
  >();
  private readonly scoringSignals: Array<{ qualified: string; signal: ScoringSignal }> = [];
  private readonly outputFormatters = new Map<string, OutputFormatter>();
  private readonly commitFilters: Array<{ qualified: string; filter: CommitFilter }> = [];
  private readonly hooks = new Map<HookPoint, PluginHook[]>();
  private readonly commandRegistrars: Array<{
    pluginName: string;
    register: (program: Command, context: PluginContext) => void;
  }> = [];
  private readonly contexts = new Map<string, PluginContext>();

  private registerWithQualifiedName<T>(
    map: Map<string, T>,
    pluginName: string,
    extensionName: string,
    value: T,
  ): void {
    const qualified = `${pluginName}:${extensionName}`;
    map.set(qualified, value);

    // Register unqualified alias if no conflict
    if (!map.has(extensionName)) {
      map.set(extensionName, value);
    }
  }

  register(loaded: LoadedPlugin, context: PluginContext): void {
    const { plugin, source } = loaded;
    const pluginName = plugin.meta.name;
    const extensionPoints: string[] = [];

    this.contexts.set(pluginName, context);

    if (plugin.createEmbedder) {
      extensionPoints.push("embedder");
      this.registerWithQualifiedName(
        this.embedderFactories,
        pluginName,
        "embedder",
        plugin.createEmbedder.bind(plugin),
      );
    }

    if (plugin.createSearchStrategy) {
      extensionPoints.push("searchStrategy");
      this.registerWithQualifiedName(
        this.searchStrategyFactories,
        pluginName,
        "searchStrategy",
        plugin.createSearchStrategy.bind(plugin),
      );
    }

    if (plugin.scoringSignals) {
      for (const signal of plugin.scoringSignals) {
        extensionPoints.push(`scoring:${signal.name}`);
        this.scoringSignals.push({ qualified: `${pluginName}:${signal.name}`, signal });
      }
    }

    if (plugin.outputFormatters) {
      for (const formatter of plugin.outputFormatters) {
        extensionPoints.push(`formatter:${formatter.name}`);
        this.registerWithQualifiedName(
          this.outputFormatters,
          pluginName,
          formatter.name,
          formatter,
        );
      }
    }

    if (plugin.commitFilters) {
      for (const filter of plugin.commitFilters) {
        extensionPoints.push(`filter:${filter.name}`);
        this.commitFilters.push({ qualified: `${pluginName}:${filter.name}`, filter });
      }
    }

    if (plugin.hooks) {
      for (const hook of plugin.hooks) {
        extensionPoints.push(`hook:${hook.point}`);
        const existing = this.hooks.get(hook.point) ?? [];
        existing.push(hook);
        this.hooks.set(hook.point, existing);
      }
    }

    if (plugin.registerCommands) {
      extensionPoints.push("commands");
      this.commandRegistrars.push({
        pluginName,
        register: plugin.registerCommands.bind(plugin),
      });
    }

    this.plugins.push({
      name: pluginName,
      version: plugin.meta.version,
      source,
      extensionPoints,
    });
  }

  getEmbedder(modelName: string, cacheDir: string): Promise<Embedder> | undefined {
    // First wins — iterate in registration order
    for (const [, factory] of this.embedderFactories) {
      const result = factory(modelName, cacheDir);
      if (result !== undefined) {
        return result;
      }
    }
    return undefined;
  }

  getSearchStrategy(commitCount: number, pluginName?: string): VectorSearchStrategy | undefined {
    if (pluginName) {
      const factory = this.searchStrategyFactories.get(pluginName);
      const context = this.contexts.get(pluginName);
      if (factory && context) {
        return factory(commitCount, context);
      }
    }

    // First wins
    for (const [name, factory] of this.searchStrategyFactories) {
      const context = this.contexts.get(name.split(":")[0] ?? name);
      if (context) {
        const result = factory(commitCount, context);
        if (result !== undefined) {
          return result;
        }
      }
    }
    return undefined;
  }

  getScoringSignals(): readonly ScoringSignal[] {
    return this.scoringSignals.map((entry) => entry.signal);
  }

  getOutputFormatter(name: string): OutputFormatter | undefined {
    return this.outputFormatters.get(name);
  }

  getCommitFilters(): readonly CommitFilter[] {
    return this.commitFilters.map((entry) => entry.filter);
  }

  getHooks(point: HookPoint): readonly PluginHook[] {
    return this.hooks.get(point) ?? [];
  }

  registerCommands(program: Command): void {
    for (const { pluginName, register } of this.commandRegistrars) {
      const context = this.contexts.get(pluginName);
      if (context) {
        register(program, context);
      }
    }
  }

  listPlugins(): readonly PluginInfo[] {
    return this.plugins;
  }

  get size(): number {
    return this.plugins.length;
  }
}

export async function runHookChain<P extends HookPoint>(
  registry: PluginRegistry,
  point: P,
  data: Extract<HookData, { point: P }>,
): Promise<Extract<HookData, { point: P }>> {
  const hooks = registry.getHooks(point);
  let current: HookData = data;

  for (const hook of hooks) {
    if (hook.softFail) {
      try {
        current = await hook.execute(current);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[plugins] hook ${point} failed (softFail): ${message}`);
      }
    } else {
      current = await hook.execute(current);
    }
  }

  return current as Extract<HookData, { point: P }>;
}

export async function buildRegistry(
  loadedPlugins: LoadedPlugin[],
  repoRoot: string,
  semanticDir: string,
  cacheDir: string,
  config: GsbConfig,
): Promise<PluginRegistry> {
  const registry = new PluginRegistry();

  for (const loaded of loadedPlugins) {
    const pluginName = loaded.plugin.meta.name;
    const pluginConf = config.pluginConfig?.[pluginName] ?? {};
    const context = createPluginContext(repoRoot, semanticDir, cacheDir, pluginName, pluginConf);

    if (loaded.plugin.activate) {
      try {
        await loaded.plugin.activate(context);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[plugins] failed to activate ${pluginName}: ${message}`);
        continue;
      }
    }

    registry.register(loaded, context);
  }

  return registry;
}
