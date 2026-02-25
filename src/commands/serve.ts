import { existsSync } from "node:fs";
import readline from "node:readline";
import { loadAnnIndex } from "../core/ann-index.ts";
import { createEmbedder } from "../core/embeddings.ts";
import { loadIndex } from "../core/index-store.ts";
import { getLexicalCacheForIndex } from "../core/lexical-cache.ts";
import { resolveModelIndexPaths, resolveTargetIndexPaths } from "../core/model-paths.ts";
import { resolveRepoPaths } from "../core/paths.ts";
import type { PluginRegistry } from "../core/plugin-registry.ts";
import type { AnnIndexHandle } from "../core/vector-search.ts";
import { type SearchOptions, executeSearch } from "./search.ts";

export interface ServeOptions extends SearchOptions {
  jsonl?: boolean;
}

export interface RunServeContext {
  registry?: PluginRegistry | undefined;
}

async function tryLoadAnn(annPath: string, dimension: number): Promise<AnnIndexHandle | undefined> {
  if (!existsSync(annPath)) return undefined;
  try {
    return await loadAnnIndex(annPath, dimension);
  } catch {
    return undefined;
  }
}

export async function runServe(
  options: ServeOptions,
  context: RunServeContext = {},
): Promise<void> {
  const { registry } = context;
  const paths = resolveRepoPaths();
  const targetPaths = options.model
    ? resolveModelIndexPaths(paths, options.model)
    : resolveTargetIndexPaths(paths);
  let index = loadIndex(targetPaths.indexPath);

  const pluginEmbedder = registry?.getEmbedder(index.modelName, paths.cacheDir);
  let embedder = pluginEmbedder
    ? await pluginEmbedder
    : await createEmbedder(index.modelName, paths.cacheDir);

  let lexicalCache = getLexicalCacheForIndex(index);
  let annHandle = await tryLoadAnn(targetPaths.annIndexPath, 384);

  const strategyLabel = annHandle ? "ann available" : "exact only";
  console.error(
    `gsb serve ready (model=${index.modelName}, commits=${index.commits.length}, ${strategyLabel})`,
  );
  console.error("Type a query per line. Commands: :reload, :quit/:exit");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  for await (const line of rl) {
    const input = line.trim();
    if (input.length === 0) {
      continue;
    }

    if (input === ":quit" || input === ":exit") {
      break;
    }

    if (input === ":reload") {
      index = loadIndex(targetPaths.indexPath);
      const reloadedPluginEmbedder = registry?.getEmbedder(index.modelName, paths.cacheDir);
      embedder = reloadedPluginEmbedder
        ? await reloadedPluginEmbedder
        : await createEmbedder(index.modelName, paths.cacheDir);
      lexicalCache = getLexicalCacheForIndex(index);
      annHandle = await tryLoadAnn(targetPaths.annIndexPath, 384);
      const label = annHandle ? "ann available" : "exact only";
      console.error(
        `reloaded (model=${index.modelName}, commits=${index.commits.length}, ${label})`,
      );
      continue;
    }

    try {
      const payload = await executeSearch(
        input,
        { ...options, format: "json" },
        {
          index,
          embedder,
          repoRoot: paths.repoRoot,
          lexicalCache,
          annHandle,
          registry,
        },
      );

      if (!payload) {
        if (options.jsonl) {
          console.log(JSON.stringify({ query: input, results: [] }));
        } else {
          console.log(JSON.stringify({ query: input, message: "No results" }, null, 2));
        }
        continue;
      }

      if (options.jsonl) {
        console.log(JSON.stringify(payload));
      } else {
        console.log(JSON.stringify(payload, null, 2));
      }
    } catch (error) {
      const message = (error as Error).message;
      if (options.jsonl) {
        console.log(JSON.stringify({ query: input, error: message }));
      } else {
        console.log(JSON.stringify({ query: input, error: message }, null, 2));
      }
    }
  }
}
