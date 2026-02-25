import { existsSync, statSync } from "node:fs";
import type { RepoPaths } from "./paths.ts";

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
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
