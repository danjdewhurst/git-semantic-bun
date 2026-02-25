import { describe, expect, it } from "bun:test";
import type { LoadedPlugin } from "../src/core/plugin-loader.ts";
import { PluginRegistry, runHookChain } from "../src/core/plugin-registry.ts";
import type {
  CommitFilter,
  GsbPlugin,
  HookData,
  OutputFormatter,
  PluginContext,
  PluginHook,
  ScoringSignal,
} from "../src/core/plugin-types.ts";

function makeContext(_pluginName: string): PluginContext {
  return {
    repoRoot: "/tmp/test",
    semanticDir: "/tmp/test/.git/semantic-index",
    cacheDir: "/tmp/test/.git/semantic-index/cache",
    config: {},
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  };
}

function makePlugin(overrides: Partial<GsbPlugin> & { meta: GsbPlugin["meta"] }): GsbPlugin {
  return overrides as GsbPlugin;
}

function makeLoaded(plugin: GsbPlugin, source = "test"): LoadedPlugin {
  return { plugin, source };
}

describe("plugin registry", () => {
  it("registers and lists plugins", () => {
    const registry = new PluginRegistry();
    const plugin = makePlugin({ meta: { name: "test-plugin", version: "1.0.0" } });
    registry.register(makeLoaded(plugin), makeContext("test-plugin"));

    expect(registry.size).toBe(1);
    expect(registry.listPlugins()[0]?.name).toBe("test-plugin");
  });

  it("returns scoring signals from all plugins", () => {
    const registry = new PluginRegistry();

    const signal1: ScoringSignal = {
      name: "freshness",
      defaultWeight: 0.1,
      score: () => 0.5,
    };

    const signal2: ScoringSignal = {
      name: "file-count",
      defaultWeight: 0.2,
      score: () => 0.8,
    };

    registry.register(
      makeLoaded(
        makePlugin({
          meta: { name: "plugin-a", version: "1.0.0" },
          scoringSignals: [signal1],
        }),
      ),
      makeContext("plugin-a"),
    );

    registry.register(
      makeLoaded(
        makePlugin({
          meta: { name: "plugin-b", version: "1.0.0" },
          scoringSignals: [signal2],
        }),
      ),
      makeContext("plugin-b"),
    );

    const signals = registry.getScoringSignals();
    expect(signals).toHaveLength(2);
    expect(signals[0]?.name).toBe("freshness");
    expect(signals[1]?.name).toBe("file-count");
  });

  it("returns output formatter by name", () => {
    const registry = new PluginRegistry();
    const formatter: OutputFormatter = {
      name: "csv",
      render: (payload) => `query,${payload.query}`,
    };

    registry.register(
      makeLoaded(
        makePlugin({
          meta: { name: "csv-plugin", version: "1.0.0" },
          outputFormatters: [formatter],
        }),
      ),
      makeContext("csv-plugin"),
    );

    expect(registry.getOutputFormatter("csv")).toBeDefined();
    expect(registry.getOutputFormatter("csv")?.name).toBe("csv");
    expect(registry.getOutputFormatter("nonexistent")).toBeUndefined();
  });

  it("returns commit filters from all plugins", () => {
    const registry = new PluginRegistry();
    const filter: CommitFilter = {
      name: "recent-only",
      apply: (commits) => commits.filter(() => true),
    };

    registry.register(
      makeLoaded(
        makePlugin({
          meta: { name: "filter-plugin", version: "1.0.0" },
          commitFilters: [filter],
        }),
      ),
      makeContext("filter-plugin"),
    );

    expect(registry.getCommitFilters()).toHaveLength(1);
    expect(registry.getCommitFilters()[0]?.name).toBe("recent-only");
  });

  it("returns hooks by point", () => {
    const registry = new PluginRegistry();
    const hook: PluginHook = {
      point: "preSearch",
      execute: (data) => data,
    };

    registry.register(
      makeLoaded(
        makePlugin({
          meta: { name: "hook-plugin", version: "1.0.0" },
          hooks: [hook],
        }),
      ),
      makeContext("hook-plugin"),
    );

    expect(registry.getHooks("preSearch")).toHaveLength(1);
    expect(registry.getHooks("postSearch")).toHaveLength(0);
  });

  it("uses qualified names when formatters collide", () => {
    const registry = new PluginRegistry();

    const formatter1: OutputFormatter = {
      name: "custom",
      render: () => "plugin-a output",
    };
    const formatter2: OutputFormatter = {
      name: "custom",
      render: () => "plugin-b output",
    };

    registry.register(
      makeLoaded(
        makePlugin({
          meta: { name: "plugin-a", version: "1.0.0" },
          outputFormatters: [formatter1],
        }),
      ),
      makeContext("plugin-a"),
    );

    registry.register(
      makeLoaded(
        makePlugin({
          meta: { name: "plugin-b", version: "1.0.0" },
          outputFormatters: [formatter2],
        }),
      ),
      makeContext("plugin-b"),
    );

    // Unqualified name resolves to first-registered
    const unqualified = registry.getOutputFormatter("custom");
    expect(unqualified?.render({} as never)).toBe("plugin-a output");

    // Qualified names always resolve correctly
    const qualifiedA = registry.getOutputFormatter("plugin-a:custom");
    expect(qualifiedA?.render({} as never)).toBe("plugin-a output");

    const qualifiedB = registry.getOutputFormatter("plugin-b:custom");
    expect(qualifiedB?.render({} as never)).toBe("plugin-b output");
  });

  it("getEmbedder returns first non-undefined factory result", () => {
    const registry = new PluginRegistry();

    const plugin = makePlugin({
      meta: { name: "embedder-plugin", version: "1.0.0" },
      createEmbedder: (modelName: string, _cacheDir: string) => {
        if (modelName === "custom-model") {
          return Promise.resolve({
            modelName: "custom-model",
            embedBatch: async (texts: string[]) => texts.map(() => [0, 1, 0]),
          });
        }
        return undefined;
      },
    });

    registry.register(makeLoaded(plugin), makeContext("embedder-plugin"));

    // Known model returns a promise
    expect(registry.getEmbedder("custom-model", "/tmp/cache")).toBeDefined();

    // Unknown model returns undefined (plugin returns undefined)
    expect(registry.getEmbedder("unknown-model", "/tmp/cache")).toBeUndefined();
  });
});

describe("hook chaining", () => {
  it("chains preSearch hooks sequentially", async () => {
    const registry = new PluginRegistry();

    const hook1: PluginHook = {
      point: "preSearch",
      execute: (data) => {
        const d = data as Extract<HookData, { point: "preSearch" }>;
        return { ...d, query: `${d.query} expanded` };
      },
    };

    const hook2: PluginHook = {
      point: "preSearch",
      execute: (data) => {
        const d = data as Extract<HookData, { point: "preSearch" }>;
        return { ...d, query: d.query.toUpperCase() };
      },
    };

    registry.register(
      makeLoaded(
        makePlugin({
          meta: { name: "hook-a", version: "1.0.0" },
          hooks: [hook1],
        }),
      ),
      makeContext("hook-a"),
    );

    registry.register(
      makeLoaded(
        makePlugin({
          meta: { name: "hook-b", version: "1.0.0" },
          hooks: [hook2],
        }),
      ),
      makeContext("hook-b"),
    );

    const result = await runHookChain(registry, "preSearch", {
      point: "preSearch",
      query: "test",
      filters: {},
    });

    expect(result.query).toBe("TEST EXPANDED");
  });

  it("returns original data when no hooks exist", async () => {
    const registry = new PluginRegistry();
    const result = await runHookChain(registry, "preSearch", {
      point: "preSearch",
      query: "unchanged",
      filters: {},
    });

    expect(result.query).toBe("unchanged");
  });

  it("softFail hook logs warning and continues chain", async () => {
    const registry = new PluginRegistry();

    const failingHook: PluginHook = {
      point: "preSearch",
      softFail: true,
      execute: () => {
        throw new Error("hook broke");
      },
    };

    const passingHook: PluginHook = {
      point: "preSearch",
      execute: (data) => {
        const d = data as Extract<HookData, { point: "preSearch" }>;
        return { ...d, query: `${d.query} modified` };
      },
    };

    registry.register(
      makeLoaded(
        makePlugin({
          meta: { name: "fail-plugin", version: "1.0.0" },
          hooks: [failingHook],
        }),
      ),
      makeContext("fail-plugin"),
    );

    registry.register(
      makeLoaded(
        makePlugin({
          meta: { name: "pass-plugin", version: "1.0.0" },
          hooks: [passingHook],
        }),
      ),
      makeContext("pass-plugin"),
    );

    const result = await runHookChain(registry, "preSearch", {
      point: "preSearch",
      query: "test",
      filters: {},
    });

    // softFail hook didn't abort — second hook still ran
    expect(result.query).toBe("test modified");
  });

  it("non-softFail hook failure propagates", async () => {
    const registry = new PluginRegistry();

    const failingHook: PluginHook = {
      point: "preSearch",
      execute: () => {
        throw new Error("fatal hook error");
      },
    };

    registry.register(
      makeLoaded(
        makePlugin({
          meta: { name: "fatal-plugin", version: "1.0.0" },
          hooks: [failingHook],
        }),
      ),
      makeContext("fatal-plugin"),
    );

    expect(
      runHookChain(registry, "preSearch", {
        point: "preSearch",
        query: "test",
        filters: {},
      }),
    ).rejects.toThrow("fatal hook error");
  });
});
