import { runDoctorChecks, runDoctorFixes } from "../core/doctor.ts";
import { resolveRepoPaths } from "../core/paths.ts";

export interface DoctorOptions {
  fix?: boolean;
}

export async function runDoctor(options: DoctorOptions = {}): Promise<void> {
  const paths = resolveRepoPaths();

  if (options.fix) {
    const fixed = await runDoctorFixes(paths);
    console.log("Applied fixes:");
    for (const action of fixed.actions) {
      console.log(`- ${action}`);
    }
    for (const warning of fixed.warnings) {
      console.log(`- warning: ${warning}`);
    }
    console.log("");
  }

  const checks = runDoctorChecks(paths);

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
