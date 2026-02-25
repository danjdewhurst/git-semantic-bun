import { existsSync, readFileSync } from "node:fs";
import { getVectorSizeBytes, loadIndex, saveIndex } from "./index-store.ts";
import { saveMetadata } from "./metadata.ts";
import { ensureSemanticDirectories, type RepoPaths } from "./paths.ts";
import type { SemanticIndex } from "./types.ts";

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface DoctorFixResult {
  actions: string[];
  warnings: string[];
}

function indexReadable(paths: RepoPaths): { ok: boolean; detail: string } {
  if (!existsSync(paths.indexPath)) {
    return { ok: false, detail: "index file missing" };
  }

  try {
    loadIndex(paths.indexPath);
    return { ok: true, detail: "index can be loaded" };
  } catch (error) {
    return {
      ok: false,
      detail: `index failed to load: ${(error as Error).message}`,
    };
  }
}

function parseLegacyIndexJson(indexPath: string): SemanticIndex {
  const raw = JSON.parse(readFileSync(indexPath, "utf8")) as Record<string, unknown>;

  if (
    raw.version !== 1 ||
    typeof raw.modelName !== "string" ||
    typeof raw.createdAt !== "string" ||
    typeof raw.lastUpdatedAt !== "string" ||
    typeof raw.repositoryRoot !== "string" ||
    typeof raw.includePatch !== "boolean" ||
    !Array.isArray(raw.commits)
  ) {
    throw new Error("index.json is not in a recognised legacy format");
  }

  const commits = raw.commits.map((entry) => {
    const commit = entry as Record<string, unknown>;
    if (
      typeof commit.hash !== "string" ||
      typeof commit.author !== "string" ||
      typeof commit.date !== "string" ||
      typeof commit.message !== "string" ||
      !Array.isArray(commit.files) ||
      !Array.isArray(commit.embedding)
    ) {
      throw new Error("legacy index contains invalid commit entries");
    }

    return {
      hash: commit.hash,
      author: commit.author,
      date: commit.date,
      message: commit.message,
      files: commit.files as string[],
      embedding: commit.embedding as number[],
    };
  });

  return {
    version: 1,
    modelName: raw.modelName,
    createdAt: raw.createdAt,
    lastUpdatedAt: raw.lastUpdatedAt,
    repositoryRoot: raw.repositoryRoot,
    includePatch: raw.includePatch,
    vectorDtype: raw.vectorDtype === "f16" ? "f16" : "f32",
    commits,
  };
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

  let vectorBytes = 0;
  let vectorDetail = "missing compact vectors";
  try {
    vectorBytes = getVectorSizeBytes(paths.indexPath);
    vectorDetail = vectorBytes > 0 ? `found compact vectors (${vectorBytes} bytes)` : "missing compact vectors";
  } catch (error) {
    vectorDetail = `compact vectors unreadable: ${(error as Error).message}`;
  }

  checks.push({
    name: "compact vectors",
    ok: vectorBytes > 0,
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

  const readability = indexReadable(paths);
  checks.push({
    name: "index readability",
    ok: readability.ok,
    detail: readability.detail,
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
  let vectorBytes = 0;
  try {
    vectorBytes = getVectorSizeBytes(paths.indexPath);
  } catch {
    vectorBytes = 0;
  }

  let loadedIndex: SemanticIndex | undefined;
  if (indexExists) {
    try {
      loadedIndex = loadIndex(paths.indexPath);
    } catch (error) {
      warnings.push(`loadIndex failed: ${(error as Error).message}`);
      try {
        loadedIndex = parseLegacyIndexJson(paths.indexPath);
        actions.push("parsed legacy index.json directly for recovery");
      } catch (legacyError) {
        warnings.push(`legacy parse failed: ${(legacyError as Error).message}`);
      }
    }
  }

  if (loadedIndex && (!compactMetaExists || vectorBytes <= 0)) {
    saveIndex(paths.indexPath, loadedIndex);
    actions.push("regenerated compact index sidecars from index.json");
  }

  if (!existsSync(paths.metadataPath)) {
    if (loadedIndex) {
      saveMetadata(paths.metadataPath, loadedIndex.modelName);
      actions.push("recreated metadata.json from current index model");
    } else {
      warnings.push("metadata.json still missing (no readable index available to infer model)");
    }
  }

  if (actions.length === 0) {
    actions.push("no changes needed");
  }

  return { actions, warnings };
}
