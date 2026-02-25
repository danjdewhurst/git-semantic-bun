import { existsSync, statSync } from "node:fs";
import { saveMetadata } from "./metadata.ts";
import type { RepoPaths } from "./paths.ts";
import { ensureSemanticDirectories } from "./paths.ts";
import { loadIndex, saveIndex } from "./index-store.ts";

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface DoctorFixResult {
  actions: string[];
  warnings: string[];
}

export function runDoctorChecks(paths: RepoPaths): DoctorCheck[] {
  const checks: DoctorCheck[] = [];

  const indexExists = existsSync(paths.indexPath);
  checks.push({
    name: "index",
    ok: indexExists,
    detail: indexExists ? `found at ${paths.indexPath}` : `missing at ${paths.indexPath}`,
  });

  const compactMetaExists = existsSync(paths.compactMetaPath);
  checks.push({
    name: "compact metadata",
    ok: compactMetaExists,
    detail: compactMetaExists ? `found at ${paths.compactMetaPath}` : `missing at ${paths.compactMetaPath}`,
  });

  const compactVectorExists = existsSync(paths.compactVectorPath);
  let vectorDetail = `missing at ${paths.compactVectorPath}`;
  if (compactVectorExists) {
    const bytes = statSync(paths.compactVectorPath).size;
    vectorDetail = `found at ${paths.compactVectorPath} (${bytes} bytes)`;
  }
  checks.push({
    name: "compact vectors",
    ok: compactVectorExists,
    detail: vectorDetail,
  });

  const metadataExists = existsSync(paths.metadataPath);
  checks.push({
    name: "model metadata",
    ok: metadataExists,
    detail: metadataExists ? `found at ${paths.metadataPath}` : `missing at ${paths.metadataPath}`,
  });

  const cacheDirExists = existsSync(paths.cacheDir);
  checks.push({
    name: "model cache directory",
    ok: cacheDirExists,
    detail: cacheDirExists ? `found at ${paths.cacheDir}` : `missing at ${paths.cacheDir}`,
  });

  return checks;
}

export function runDoctorFixes(paths: RepoPaths): DoctorFixResult {
  const actions: string[] = [];
  const warnings: string[] = [];

  ensureSemanticDirectories(paths);
  actions.push(`ensured semantic directories at ${paths.semanticDir}`);

  const indexExists = existsSync(paths.indexPath);
  const compactMetaExists = existsSync(paths.compactMetaPath);
  const compactVectorExists = existsSync(paths.compactVectorPath);

  if (indexExists && (!compactMetaExists || !compactVectorExists)) {
    const index = loadIndex(paths.indexPath);
    saveIndex(paths.indexPath, index);
    actions.push("regenerated compact index sidecars from index.json");
  }

  if (!existsSync(paths.metadataPath)) {
    if (indexExists) {
      const index = loadIndex(paths.indexPath);
      saveMetadata(paths.metadataPath, index.modelName);
      actions.push("recreated metadata.json from current index model");
    } else {
      warnings.push("metadata.json still missing (no index available to infer model)");
    }
  }

  if (actions.length === 0) {
    actions.push("no changes needed");
  }

  return { actions, warnings };
}
