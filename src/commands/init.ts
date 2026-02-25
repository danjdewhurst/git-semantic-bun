import { existsSync } from "node:fs";
import { DEFAULT_MODEL } from "../core/constants.ts";
import { saveMetadata } from "../core/metadata.ts";
import { resolveModelIndexPaths } from "../core/model-paths.ts";
import { ensureSemanticDirectories, resolveRepoPaths } from "../core/paths.ts";

export interface InitOptions {
  model: string;
}

export async function runInit(options: InitOptions): Promise<void> {
  const model = options.model || DEFAULT_MODEL;
  const paths = resolveRepoPaths();
  ensureSemanticDirectories(paths);
  const metadata = saveMetadata(paths.metadataPath, model);

  const modelPaths = resolveModelIndexPaths(paths, model);
  const modelIndexExists = existsSync(modelPaths.indexPath);
  const legacyIndexExists = existsSync(paths.indexPath);

  console.log(`Initialized semantic index directory at ${paths.semanticDir}`);
  console.log(`Model metadata written to ${paths.metadataPath}`);
  console.log(`Model: ${metadata.modelName}`);
  if (modelIndexExists) {
    console.log(`Existing model index found: ${modelPaths.indexPath}`);
  } else if (legacyIndexExists) {
    console.log(`Existing legacy index found: ${paths.indexPath}`);
  } else {
    console.log("No index found yet. Run `gsb index`.");
  }
}
