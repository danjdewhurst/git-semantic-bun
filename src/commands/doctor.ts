import { runDoctorChecks, runDoctorFixes } from "../core/doctor.ts";
import { resolveModelIndexPaths, resolveTargetIndexPaths } from "../core/model-paths.ts";
import { resolveRepoPaths } from "../core/paths.ts";

export interface DoctorOptions {
  model?: string;
  fix?: boolean;
}

export async function runDoctor(options: DoctorOptions = {}): Promise<void> {
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

  if (failures > 0) {
    console.log(`\nDoctor completed with ${failures} warning(s).`);
    return;
  }

  console.log("\nDoctor completed successfully.");
}
