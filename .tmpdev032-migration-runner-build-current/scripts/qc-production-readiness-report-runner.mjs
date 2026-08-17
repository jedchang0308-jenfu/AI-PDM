import { spawnSync } from "node:child_process";

export function runProductionReadinessReport(root, options = {}) {
  const args = ["scripts/qc-production-readiness-test.mjs"];
  if (options.allowOpen ?? true) args.push("--allow-open");

  const run = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });

  if (run.status !== 0) return { run, report: null };

  try {
    return { run, report: JSON.parse(run.stdout) };
  } catch {
    return { run, report: null };
  }
}
