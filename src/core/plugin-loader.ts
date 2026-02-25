import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { GsbConfig } from "./plugin-config.ts";
import type { GsbPlugin, PluginContext, PluginLogger } from "./plugin-types.ts";

export interface LoadedPlugin {
  plugin: GsbPlugin;
  source: string;
}

function createPluginLogger(pluginName: string): PluginLogger {
  return {
    info(message: string) {
      console.error(`[plugin:${pluginName}] ${message}`);
    },
    warn(message: string) {
      console.error(`[plugin:${pluginName}] warn: ${message}`);
    },
    error(message: string) {
      console.error(`[plugin:${pluginName}] error: ${message}`);
    },
  };
}

function isValidPlugin(value: unknown): value is GsbPlugin {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.meta !== "object" || candidate.meta === null) {
    return false;
  }

  const meta = candidate.meta as Record<string, unknown>;
  return typeof meta.name === "string" && typeof meta.version === "string";
}

async function importPlugin(specifier: string): Promise<GsbPlugin | null> {
  try {
    const mod = await import(specifier);
    const exported = mod.default ?? mod;

    if (!isValidPlugin(exported)) {
      console.error(`[plugins] skipping ${specifier}: invalid plugin shape (missing meta)`);
      return null;
    }

    return exported;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[plugins] failed to load ${specifier}: ${message}`);
    return null;
  }
}

function discoverLocalPlugins(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  try {
    return readdirSync(dir)
      .filter((file) => file.endsWith(".ts") || file.endsWith(".js"))
      .sort()
      .map((file) => path.join(dir, file));
  } catch {
    return [];
  }
}

function discoverNpmPlugins(repoRoot: string): string[] {
  const nodeModulesDir = path.join(repoRoot, "node_modules");
  if (!existsSync(nodeModulesDir)) {
    return [];
  }

  try {
    return readdirSync(nodeModulesDir)
      .filter((name) => name.startsWith("gsb-plugin-"))
      .sort();
  } catch {
    return [];
  }
}

export async function discoverAndLoadPlugins(
  repoRoot: string,
  config: GsbConfig,
): Promise<LoadedPlugin[]> {
  const specifiers: Array<{ specifier: string; source: string }> = [];

  if (config.plugins) {
    // Explicit plugin list — resolve relative paths against repo root
    for (const entry of config.plugins) {
      if (entry.startsWith(".") || entry.startsWith("/")) {
        specifiers.push({
          specifier: path.resolve(repoRoot, entry),
          source: entry,
        });
      } else {
        specifiers.push({ specifier: entry, source: `npm:${entry}` });
      }
    }
  } else {
    // Auto-discovery: npm → global → repo
    for (const name of discoverNpmPlugins(repoRoot)) {
      specifiers.push({ specifier: name, source: `npm:${name}` });
    }

    const globalPluginDir = path.join(homedir(), ".gsb", "plugins");
    for (const filePath of discoverLocalPlugins(globalPluginDir)) {
      specifiers.push({ specifier: filePath, source: `global:${path.basename(filePath)}` });
    }

    const repoPluginDir = path.join(repoRoot, ".gsb", "plugins");
    for (const filePath of discoverLocalPlugins(repoPluginDir)) {
      specifiers.push({ specifier: filePath, source: `repo:${path.basename(filePath)}` });
    }
  }

  const loaded: LoadedPlugin[] = [];

  for (const { specifier, source } of specifiers) {
    const plugin = await importPlugin(specifier);
    if (plugin) {
      loaded.push({ plugin, source });
    }
  }

  return loaded;
}

export function createPluginContext(
  repoRoot: string,
  semanticDir: string,
  cacheDir: string,
  pluginName: string,
  pluginConfig: Record<string, unknown>,
): PluginContext {
  return {
    repoRoot,
    semanticDir,
    cacheDir,
    config: pluginConfig,
    logger: createPluginLogger(pluginName),
  };
}
