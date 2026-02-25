import readline from "node:readline";
import { createEmbedder } from "../core/embeddings.ts";
import { loadIndex } from "../core/index-store.ts";
import { resolveRepoPaths } from "../core/paths.ts";
import { type SearchOptions, executeSearch } from "./search.ts";

export interface ServeOptions extends SearchOptions {
  jsonl?: boolean;
}

export async function runServe(options: ServeOptions): Promise<void> {
  const paths = resolveRepoPaths();
  let index = loadIndex(paths.indexPath);
  let embedder = await createEmbedder(index.modelName, paths.cacheDir);

  console.error(`gsb serve ready (model=${index.modelName}, commits=${index.commits.length})`);
  console.error("Type a query per line. Commands: :reload, :quit");

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
      index = loadIndex(paths.indexPath);
      embedder = await createEmbedder(index.modelName, paths.cacheDir);
      console.error(`reloaded (model=${index.modelName}, commits=${index.commits.length})`);
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
