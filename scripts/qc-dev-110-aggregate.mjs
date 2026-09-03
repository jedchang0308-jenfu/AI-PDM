#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const runId = `DEV110-aggregate-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceDir = path.join(root, "output", "qa", "dev-110", runId);
fs.mkdirSync(evidenceDir, { recursive: true });
const primaryDb = path.join(root, "data", "ai-pdm.sqlite");
const snapshotScript = path.join(root, "scripts", "dev-087-primary-snapshot.mjs");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const nodeArgs = ["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs"];
const checks = [];
const failures = [];

function snapshot() {
  const result = spawnSync(process.execPath, [snapshotScript, `--db=${primaryDb}`], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`PRIMARY_SNAPSHOT_FAILED:${result.stderr || result.stdout}`);
  return result.stdout.trim();
}
function run(id, command, args, env = {}) {
  // Windows cannot spawn .cmd files directly with spawnSync (EINVAL). Route
  // the task-owned npm commands through cmd.exe while keeping the command
  // and arguments static and fully controlled by this runner.
  const spawnCommand = process.platform === "win32" && command.toLowerCase().endsWith(".cmd")
    ? (process.env.ComSpec || "cmd.exe")
    : command;
  const spawnArgs = spawnCommand === (process.env.ComSpec || "cmd.exe") && process.platform === "win32"
    ? ["/d", "/s", "/c", [command, ...args].join(" ")]
    : args;
  const result = spawnSync(spawnCommand, spawnArgs, { cwd: root, stdio: "inherit", env: { ...process.env, DEV110_EVIDENCE_DIR: evidenceDir, ...env }, windowsHide: true });
  const pass = result.status === 0;
  checks.push({ id, status: pass ? "PASS" : "FAIL", exitCode: result.status, error: result.error?.message ?? null });
  if (!pass) failures.push({ id, exitCode: result.status, error: result.error?.message ?? null });
  return pass;
}
function report(name) {
  const file = path.join(evidenceDir, `${name}.json`);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}
function gate(id, condition, detail) {
  checks.push({ id, status: condition ? "PASS" : "FAIL", detail });
  if (!condition) failures.push({ id, detail });
}

const primaryBefore = snapshot();
try {
  run("C01-C08", process.execPath, [...nodeArgs, "scripts/qc-dev-110-contract.mjs"]);
  run("R01-R16", process.execPath, [...nodeArgs, "scripts/qc-dev-110-repository.mjs"]);
  run("P01-P08", process.execPath, [...nodeArgs, "scripts/qc-dev-110-postgres.mjs"]);
  run("B01-B16", process.execPath, ["scripts/qc-dev-110-browser-real.mjs"]);
  run("I01-I08", process.execPath, ["scripts/qc-dev-110-integration.mjs"]);

  const contractPass = checks.some((item) => item.id === "C01-C08" && item.status === "PASS");
  const repository = report("repository");
  const postgres = report("postgres");
  const browser = report("browser");
  const integration = report("integration");
  gate("G01", contractPass && repository?.status === "PASS" && repository?.denominator === 16, "contract plus SQLite R01-R16 reports are complete");
  gate("G02", postgres?.status === "PASS" && postgres?.denominator === 8, "PostgreSQL P01-P08 provider/lock/rollback evidence is complete");
  gate("G03", browser?.status === "PASS" && browser?.denominator === 16 && integration?.status === "PASS" && integration?.denominator === 8, "real browser B01-B16 and integration I01-I08 evidence are complete");

  const beforeBuild = snapshot();
  const typecheck = run("G04-typecheck", npmCommand, ["run", "typecheck:app"]);
  const lint = run("G04-lint", npmCommand, ["exec", "--", "eslint", "src/lib/drawing-recognition-part-work-handoff-contract.ts", "src/lib/drawing-recognition-part-work-handoff.ts", "src/lib/drawing-recognition-part-work-access.ts", "src/lib/repositories/drawing-recognition-part-work-handoff-async-repository.ts", "src/lib/repositories/part-change-work-async-repository.ts", "src/components/drawing-recognition-workspace-panel.tsx", "src/components/canonical-drawing-change-workspace.tsx", "scripts/qc-dev-110-contract.mjs", "scripts/qc-dev-110-repository.mjs", "scripts/qc-dev-110-postgres.mjs", "scripts/qc-dev-110-browser-real.mjs", "scripts/qc-dev-110-integration.mjs", "scripts/qc-dev-110-aggregate.mjs"]);
  const build = run("G04-build", npmCommand, ["run", "build:isolated"]);
  const afterBuild = snapshot();
  gate("G04", typecheck && lint && build && beforeBuild === afterBuild, "typecheck, affected lint, isolated Next build, and primary SQLite invariants pass");
} catch (error) {
  failures.push({ id: "aggregate", detail: error instanceof Error ? error.message : String(error) });
} finally {
  let primaryAfter = null;
  try { primaryAfter = snapshot(); } catch (error) { failures.push({ id: "G04-primary-snapshot", detail: error instanceof Error ? error.message : String(error) }); }
  gate("G04-primary", primaryAfter === primaryBefore, "primary SQLite snapshot is unchanged after all isolated lanes");
  const report = {
    runner: "aggregate",
    status: failures.length ? "FAIL" : "PASS",
    denominator: 60,
    checks,
    failures,
    evidenceDir,
    runtimeDeclaration: {
      project: root,
      purpose: "DEV-110 full contract/repository/provider/browser/integration engineering gate",
      port: null,
      owningProcessTree: "aggregate runner -> task-owned child runners; each child owns and cleans its runtime",
      cleanupCondition: "child runners complete; no task-owned runtime remains",
      PDM_DATA_DIR: "per-child task-owned temp directory",
      PDM_REPOSITORY_DIR: "per-child task-owned temp directory",
      mutationScope: "task-owned disposable fixtures only",
      primarySnapshotUnchanged: primaryAfter === primaryBefore
    }
  };
  fs.writeFileSync(path.join(evidenceDir, "aggregate.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`DEV-110 full aggregate: ${report.status} (${checks.filter((item) => item.status === "PASS").length}/${checks.length} gates; ${report.denominator} checks declared)`);
  if (failures.length) process.exitCode = 1;
}
