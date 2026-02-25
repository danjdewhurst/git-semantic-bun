import { getIndexSizeBytes, loadIndex } from "../core/index-store.ts";
import { resolveRepoPaths } from "../core/paths.ts";
import { formatBytes } from "../core/format.ts";

export async function runStats(): Promise<void> {
  const paths = resolveRepoPaths();
  const index = loadIndex(paths.indexPath);
  const bytes = getIndexSizeBytes(paths.indexPath);

  console.log(`Indexed commits : ${index.commits.length}`);
  console.log(`Model           : ${index.modelName}`);
  console.log(`Index size      : ${formatBytes(bytes)} (${bytes} bytes)`);
  console.log(`Include patch   : ${index.includePatch}`);
  console.log(`Created at      : ${index.createdAt}`);
  console.log(`Last updated    : ${index.lastUpdatedAt}`);
}
