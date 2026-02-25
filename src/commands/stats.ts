import { performance } from "node:perf_hooks";
import { formatBytes } from "../core/format.ts";
import { getIndexSizeBytes, getVectorDtype, getVectorSizeBytes, loadIndex } from "../core/index-store.ts";
import { resolveRepoPaths } from "../core/paths.ts";

export async function runStats(): Promise<void> {
  const paths = resolveRepoPaths();

  const loadStart = performance.now();
  const index = loadIndex(paths.indexPath);
  const loadEnd = performance.now();

  const bytes = getIndexSizeBytes(paths.indexPath);
  const vectorBytes = getVectorSizeBytes(paths.indexPath);
  const vectorDtype = getVectorDtype(paths.indexPath);

  console.log(`Indexed commits : ${index.commits.length}`);
  console.log(`Model           : ${index.modelName}`);
  console.log(`Index size      : ${formatBytes(bytes)} (${bytes} bytes)`);
  console.log(`Vector size     : ${formatBytes(vectorBytes)} (${vectorBytes} bytes)`);
  console.log(`Vector dtype    : ${vectorDtype}`);
  console.log(`Load time       : ${(loadEnd - loadStart).toFixed(2)} ms`);
  console.log(`Include patch   : ${index.includePatch}`);
  console.log(`Created at      : ${index.createdAt}`);
  console.log(`Last updated    : ${index.lastUpdatedAt}`);
}
