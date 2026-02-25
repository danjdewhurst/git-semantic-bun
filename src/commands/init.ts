import { existsSync } from "node:fs";
import { DEFAULT_MODEL } from "../core/constants.ts";
import { saveMetadata } from "../core/metadata.ts";
import { ensureSemanticDirectories, resolveRepoPaths } from "../core/paths.ts";

export interface InitOptions {
  model: string;
}

export async function runInit(options: InitOptions): Promise<void> {
  const model = options.model || DEFAULT_MODEL;
  const paths = resolveRepoPaths();
  ensureSemanticDirectories(paths);
  const metadata = saveMetadata(paths.metadataPath, model);

  const indexExists = existsSync(paths.indexPath);

  console.log(`Initialized semantic index directory at ${paths.semanticDir}`);
  console.log(`Model metadata written to ${paths.metadataPath}`);
  console.log(`Model: ${metadata.modelName}`);
  console.log(indexExists ? `Existing index found: ${paths.indexPath}` : "No index found yet. Run `gsb index`.");
}
