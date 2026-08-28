#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

const root = process.cwd();
const runId = `DEV101-REPOSITORY-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-101", runId);
const sourceDbPath = path.join(root, "data", "ai-pdm.sqlite");
const loader = ["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs"];
const lanes = [
  { id: "DEV101-REPOSITORY-001", name: "strict package builder/integrity", args: [...loader, "scripts/qc-dev-101-package-builder.mjs"], marker: "DEV-101 package builder summary: 15/15 PASS" },
  { id: "DEV101-REPOSITORY-002", name: "canonical inbox/filter/cursor/mutant", args: [...loader, "scripts/qc-dev-101-inbox-repository.mjs"], marker: "PASS DEV101-INBOX-007" },
  { id: "DEV101-REPOSITORY-003", name: "canonical workbench repository regression", args: [...loader, "scripts/qc-dev-087-repository.mjs"], marker: "DEV-087 repository: PASS (38 checks)" },
  { id: "DEV101-REPOSITORY-004", name: "transaction/idempotency/decision regression", args: [...loader, "scripts/qc-dev-087-commands.mjs"], marker: "DEV-087 commands: PASS (54 checks)" }
];

function stableHash(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function primaryFingerprint() {
  const database = new Database(sourceDbPath, { readonly: true, fileMustExist: true });
  try {
    const payload = {
      schema: database.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all(),
      roots: database.prepare("SELECT id,company_id,root_code FROM part_roots ORDER BY company_id,id").all(),
      parts: database.prepare("SELECT id,company_id,part_root_id,part_number FROM part_numbers ORDER BY company_id,id").all(),
      drawings: database.prepare("SELECT id,company_id,drawing_number,formal_drawing_number_id FROM drawings ORDER BY company_id,id").all(),
      residue: database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%migration%' OR name LIKE '%backup%' OR name LIKE '%_old') ORDER BY name").all(),
      foreignKeys: database.pragma("foreign_key_check")
    };
    return { hash: stableHash(payload), foreignKeys: payload.foreignKeys };
  } finally { database.close(); }
}

console.log(JSON.stringify({ runtimeDeclaration: {
  project: root,
  purpose: "DEV-101 isolated repository, package, cursor, transaction and regression evidence",
  port: "none",
  owningProcessTree: `repository runner ${process.pid} -> sequential task-owned node child lanes`,
  cleanupCondition: "each child exits and removes its own isolated data/repository path before the next lane",
  PDM_DATA_DIR: "task-owned child paths; primary is read-only fingerprinted",
  PDM_REPOSITORY_DIR: "task-owned child paths",
  mutationScope: "child temp paths plus this repository receipt"
} }));

const before = primaryFingerprint();
const results = [];
for (const lane of lanes) {
  const execution = spawnSync(process.execPath, lane.args, { cwd: root, encoding: "utf8", stdio: "pipe", maxBuffer: 64 * 1024 * 1024, env: { ...process.env } });
  process.stdout.write(execution.stdout || "");
  process.stderr.write(execution.stderr || "");
  const output = `${execution.stdout || ""}\n${execution.stderr || ""}`;
  const pass = execution.status === 0 && output.includes(lane.marker);
  results.push({ id: lane.id, name: lane.name, status: pass ? "PASS" : "FAIL", exitCode: execution.status, marker: lane.marker, outputSha256: crypto.createHash("sha256").update(output).digest("hex") });
  if (!pass) break;
}
const after = primaryFingerprint();
const primaryUnchanged = before.hash === after.hash && before.foreignKeys.length === 0 && after.foreignKeys.length === 0;
results.push({ id: "DEV101-REPOSITORY-005", name: "primary schema/identity/residue/FK invariant", status: primaryUnchanged ? "PASS" : "FAIL", detail: { before: before.hash, after: after.hash } });
const pass = results.length === lanes.length + 1 && results.every((item) => item.status === "PASS");
const report = { dev: "DEV-101", runId, evidenceClass: "RD_SUPPORTING_ONLY_NOT_INDEPENDENT_QC", result: pass ? "PASS" : "FAIL", results, primaryInvariant: { before, after, unchanged: primaryUnchanged }, completedAt: new Date().toISOString() };
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "receipt.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
for (const item of results) console.log(`${item.status} ${item.id} ${item.name}`);
console.log(`${report.result} DEV-101 repository supporting lane — ${results.filter((item) => item.status === "PASS").length}/${lanes.length + 1}`);
if (!pass) process.exitCode = 1;
