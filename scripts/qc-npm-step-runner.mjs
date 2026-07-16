import { runQcCommand } from "./qc-command-runner.mjs";
import { assertNoDisallowedProcessWarnings } from "./qc-process-warning-guard.mjs";

function resolveNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

async function runNpmCommand(root, record, logPrefix, name, args, options = {}) {
  const npm = resolveNpmCommand();
  console.log(`\n[${logPrefix}] ${name}`);
  const result = await runQcCommand(root, npm, args, options);
  const passed = result.code === 0;
  record(name, passed, passed ? "exit 0" : `exit ${result.code}`);
  if (!passed) {
    throw new Error(`${name} failed with exit ${result.code}`);
  }
  assertNoDisallowedProcessWarnings(record, name, result.output);
}

export function createNpmStepRunner(root, record, logPrefix) {
  return {
    runNpmStep(name, script, options = {}) {
      return runNpmCommand(root, record, logPrefix, name, ["run", script], options);
    },
    runNpmCommandStep(name, args, options = {}) {
      return runNpmCommand(root, record, logPrefix, name, args, options);
    }
  };
}
