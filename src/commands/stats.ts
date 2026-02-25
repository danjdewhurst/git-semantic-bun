import { performance } from "node:perf_hooks";
import { formatBytes } from "../core/format.ts";
import {
  getAnnIndexInfo,
  getIndexSizeBytes,
  getVectorDtype,
  getVectorSizeBytes,
  loadIndex,
} from "../core/index-store.ts";
import { resolveModelIndexPaths, resolveTargetIndexPaths } from "../core/model-paths.ts";
import { resolveRepoPaths } from "../core/paths.ts";

export interface StatsOptions {
  model?: string;
}

export async function runStats(options: StatsOptions = {}): Promise<void> {
  const paths = resolveRepoPaths();
  const targetPaths = options.model
    ? resolveModelIndexPaths(paths, options.model)
    : resolveTargetIndexPaths(paths);

  const loadStart = performance.now();
  const index = loadIndex(targetPaths.indexPath);
  const loadEnd = performance.now();

  const bytes = getIndexSizeBytes(targetPaths.indexPath);
  const vectorBytes = getVectorSizeBytes(targetPaths.indexPath);
  const vectorDtype = getVectorDtype(targetPaths.indexPath);
  const annInfo = getAnnIndexInfo(targetPaths.indexPath);

  console.log(`Indexed commits : ${index.commits.length}`);
  console.log(`Model           : ${index.modelName}`);
  console.log(`Index size      : ${formatBytes(bytes)} (${bytes} bytes)`);
  console.log(`Vector size     : ${formatBytes(vectorBytes)} (${vectorBytes} bytes)`);
  console.log(`Vector dtype    : ${vectorDtype}`);
  if (annInfo.exists) {
    console.log(
      `ANN index       : ${formatBytes(annInfo.sizeBytes)} (${annInfo.commitCount} vectors)`,
    );
  } else {
    console.log("ANN index       : not built");
  }
  console.log(`Load time       : ${(loadEnd - loadStart).toFixed(2)} ms`);
  console.log(`Include patch   : ${index.includePatch}`);
  console.log(`Created at      : ${index.createdAt}`);
  console.log(`Last updated    : ${index.lastUpdatedAt}`);
}
