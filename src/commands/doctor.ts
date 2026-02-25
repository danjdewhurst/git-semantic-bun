import { runDoctorChecks, runDoctorFixes } from "../core/doctor.ts";
import { resolveModelIndexPaths, resolveTargetIndexPaths } from "../core/model-paths.ts";
import { resolveRepoPaths } from "../core/paths.ts";
import type { PluginRegistry } from "../core/plugin-registry.ts";

export interface DoctorOptions {
  model?: string;
  fix?: boolean;
}

export interface RunDoctorContext {
  registry?: PluginRegistry | undefined;
}

export async function runDoctor(
  options: DoctorOptions = {},
  context: RunDoctorContext = {},
): Promise<void> {
  const { registry } = context;
  const paths = resolveRepoPaths();
  const targetPaths = options.model
    ? resolveModelIndexPaths(paths, options.model)
    : resolveTargetIndexPaths(paths);
  const doctorPaths = {
    ...paths,
    indexPath: targetPaths.indexPath,
    compactMetaPath: targetPaths.compactMetaPath,
    compactVectorPath: targetPaths.compactVectorPath,
    benchmarkHistoryPath: targetPaths.benchmarkHistoryPath,
    annIndexPath: targetPaths.annIndexPath,
  };

  if (options.fix) {
    const fixed = await runDoctorFixes(doctorPaths);
    console.log("Applied fixes:");
    for (const action of fixed.actions) {
      console.log(`- ${action}`);
    }
    for (const warning of fixed.warnings) {
      console.log(`- warning: ${warning}`);
    }
    console.log("");
  }

  const checks = runDoctorChecks(doctorPaths);

  let failures = 0;
  for (const check of checks) {
    const icon = check.ok ? "OK" : "WARN";
    if (!check.ok) {
      failures += 1;
    }
    console.log(`${icon.padEnd(4)} ${check.name.padEnd(20)} ${check.detail}`);
  }

  // Show loaded plugins
  if (registry && registry.size > 0) {
    console.log("");
    console.log("Plugins:");
    for (const plugin of registry.listPlugins()) {
      const extensions =
        plugin.extensionPoints.length > 0 ? plugin.extensionPoints.join(", ") : "none";
      console.log(`  ${plugin.name} v${plugin.version} (${plugin.source}) — ${extensions}`);
    }
  }

  if (failures > 0) {
    console.log(`\nDoctor completed with ${failures} warning(s).`);
    return;
  }

  console.log("\nDoctor completed successfully.");
}
