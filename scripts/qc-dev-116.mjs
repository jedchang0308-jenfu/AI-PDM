#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { cliValue, dev116EvidenceDir, dev116SourceIdentity } from "./dev-116-evidence-utils.mjs";

const root = process.cwd();
const supplied = cliValue("run-id", process.env.DEV116_RUN_ID?.trim() || "");
const runId = supplied || `DEV116-LOCAL-${new Date().toISOString().replace(/[:.]/gu, "-")}-${crypto.randomUUID().slice(0, 8)}`;
const evidenceDir = dev116EvidenceDir(runId);
const suppliedPrimaryDatabase = cliValue("primary-database", process.env.DEV116_PRIMARY_DATABASE?.trim() || "");
const primaryDatabasePath = path.resolve(suppliedPrimaryDatabase || path.join(root, "data", "ai-pdm.sqlite"));
if (!fs.existsSync(primaryDatabasePath)) {
  throw new Error(`DEV116_PRIMARY_DATABASE_MISSING:${suppliedPrimaryDatabase ? "explicit-task-owned" : "default-local-primary"}`);
}
if (fs.existsSync(evidenceDir)) throw new Error(`DEV116_EVIDENCE_DIR_ALREADY_EXISTS:${evidenceDir}`);
fs.mkdirSync(evidenceDir, { recursive: true });

const source = dev116SourceIdentity();
const protectedFile = path.join(root, "next-env.d.ts");
const sourceRecord = {
  schemaVersion: "dev-116-source/v1",
  runId,
  ...source,
  primaryInvariantDatabase: suppliedPrimaryDatabase ? "explicit-task-owned" : "default-local-primary",
  protectedFiles: {
    "next-env.d.ts": fs.existsSync(protectedFile)
      ? crypto.createHash("sha256").update(fs.readFileSync(protectedFile)).digest("hex")
      : null
  }
};
fs.writeFileSync(path.join(evidenceDir, "source.json"), `${JSON.stringify(sourceRecord, null, 2)}\n`, "utf8");

function node(script, args = []) {
  return spawnSync(process.execPath, ["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs", script, ...args], {
    cwd: root,
    env: { ...process.env, DEV116_RUN_ID: runId },
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024
  });
}

function primaryInvariant(target) {
  const result = spawnSync(process.execPath, ["scripts/qc-dev-095-primary-invariant.mjs", `--database=${primaryDatabasePath}`], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.status !== 0) throw new Error(`DEV116_PRIMARY_INVARIANT_FAILED:${result.stderr || result.stdout}`);
  const value = JSON.parse(result.stdout);
  delete value.databasePath;
  fs.writeFileSync(path.join(evidenceDir, target), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

primaryInvariant("primary-before.json");
const stages = [
  ["contract", "scripts/qc-dev-116-contract.mjs"],
  ["migration", "scripts/qc-dev-116-migration.mjs"],
  ["isolation-a", "scripts/qc-dev-116-isolation.mjs", "--phase=116-A"],
  ["isolation-b", "scripts/qc-dev-116-isolation-b.mjs"],
  ["browser-b", "scripts/qc-dev-116-browser.mjs"],
  ["isolation-c", "scripts/qc-dev-116-isolation-c.mjs"]
];
const stageResults = [];
for (const [name, script, ...args] of stages) {
  const result = node(script, [`--run-id=${runId}`, ...args]);
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  stageResults.push({ name, exitCode: result.status ?? 1 });
}
primaryInvariant("primary-after.json");
const aggregate = node("scripts/qc-dev-116-aggregate.mjs", [`--run-id=${runId}`]);
process.stdout.write(aggregate.stdout || "");
process.stderr.write(aggregate.stderr || "");
const status = stageResults.every((item) => item.exitCode === 0) && aggregate.status === 0 ? "PASS" : "FAIL";
console.log(JSON.stringify({ runId, evidenceDir, status, stages: stageResults, aggregateExitCode: aggregate.status ?? 1 }));
if (status !== "PASS") process.exitCode = 1;
