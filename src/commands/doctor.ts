import { resolveRepoPaths } from "../core/paths.ts";
import { runDoctorChecks } from "../core/doctor.ts";

export async function runDoctor(): Promise<void> {
  const paths = resolveRepoPaths();
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
