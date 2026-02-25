import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export interface GsbConfig {
  plugins?: string[];
  pluginConfig?: Record<string, Record<string, unknown>>;
}

const CONFIG_FILENAME = ".gsbrc.json";

function interpolateEnvVars(value: unknown): unknown {
  if (typeof value === "string") {
    // Replace $$ with a placeholder, interpolate env vars, then restore literal $
    const PLACEHOLDER = "\x00DOLLAR\x00";
    return value
      .replaceAll("$$", PLACEHOLDER)
      .replace(/\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)/g, (_match, braced, bare) => {
        const varName = braced ?? bare;
        return process.env[varName] ?? "";
      })
      .replaceAll(PLACEHOLDER, "$");
  }

  if (Array.isArray(value)) {
    return value.map(interpolateEnvVars);
  }

  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = interpolateEnvVars(val);
    }
    return result;
  }

  return value;
}

function loadConfigFile(filePath: string): GsbConfig | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const raw = readFileSync(filePath, "utf8");
    return JSON.parse(raw) as GsbConfig;
  } catch {
    return null;
  }
}

export function loadGsbConfig(repoRoot: string): GsbConfig {
  const globalPath = path.join(homedir(), CONFIG_FILENAME);
  const repoPath = path.join(repoRoot, CONFIG_FILENAME);

  const globalConfig = loadConfigFile(globalPath);
  const repoConfig = loadConfigFile(repoPath);

  if (!repoConfig && !globalConfig) {
    return {};
  }

  if (repoConfig && !globalConfig) {
    return interpolatePluginConfig(repoConfig);
  }

  if (globalConfig && !repoConfig) {
    return interpolatePluginConfig(globalConfig);
  }

  // Both configs exist — merge: repo overrides global per-key
  const repo = repoConfig as GsbConfig;
  const global = globalConfig as GsbConfig;
  const merged: GsbConfig = {};

  // plugins list: repo takes precedence entirely if present
  const plugins = repo.plugins ?? global.plugins;
  if (plugins !== undefined) {
    merged.plugins = plugins;
  }

  // pluginConfig: merge per-plugin, repo overrides global per-key
  if (global.pluginConfig || repo.pluginConfig) {
    merged.pluginConfig = { ...global.pluginConfig };
    if (repo.pluginConfig) {
      for (const [pluginName, pluginConf] of Object.entries(repo.pluginConfig)) {
        merged.pluginConfig[pluginName] = {
          ...merged.pluginConfig[pluginName],
          ...pluginConf,
        };
      }
    }
  }

  return interpolatePluginConfig(merged);
}

function interpolatePluginConfig(config: GsbConfig): GsbConfig {
  if (!config.pluginConfig) {
    return config;
  }

  return {
    ...config,
    pluginConfig: interpolateEnvVars(config.pluginConfig) as Record<
      string,
      Record<string, unknown>
    >,
  };
}
