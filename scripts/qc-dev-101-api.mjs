#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const startedAt = Date.now();
const runId = `DEV101-API-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-101", runId);
const childScript = path.join(root, "scripts", "qc-dev-101-owner-flow-browser.mjs");
const requiredCases = ["DEV101-API-V2-001", "DEV101-API-V2-002", "DEV101-API-V2-003", "DEV101-API-V2-004", "DEV101-API-V2-005"];

console.log(JSON.stringify({ runtimeDeclaration: {
  project: root,
  purpose: "DEV-101 authenticated API permission, strict-body, immutable-file and terminal-state evidence",
  port: "allocated and declared by the child owner-flow runner",
  owningProcessTree: `API runner ${process.pid} -> task-owned owner-flow runner -> isolated Next child`,
  cleanupCondition: "child receipt reports port release and runtime-project removal before this parent accepts evidence",
  PDM_DATA_DIR: "task-owned path declared by child",
  PDM_REPOSITORY_DIR: "task-owned path declared by child",
  mutationScope: "child task-owned SQLite/repository/runtime project plus this API receipt"
} }));

const child = spawnSync(process.execPath, [childScript, "--schema=v2"], {
  cwd: root,
  encoding: "utf8",
  stdio: "pipe",
  maxBuffer: 64 * 1024 * 1024,
  env: { ...process.env, DEV101_PARENT_RUN_ID: runId }
});
process.stdout.write(child.stdout || "");
process.stderr.write(child.stderr || "");

const candidates = fs.readdirSync(path.join(root, "output", "qa", "dev-101"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("DEV101-OWNER-V2-"))
  .map((entry) => path.join(root, "output", "qa", "dev-101", entry.name, "receipt.json"))
  .filter((file) => {
    if (!fs.existsSync(file) || fs.statSync(file).mtimeMs < startedAt - 2_000) return false;
    try { return JSON.parse(fs.readFileSync(file, "utf8")).parentRunId === runId; } catch { return false; }
  })
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
if (child.status !== 0 || candidates.length !== 1) throw new Error(`DEV101_API_CHILD_INVALID:${JSON.stringify({ exitCode: child.status, candidates })}`);
const childReceiptPath = candidates[0];
const childReceiptBytes = fs.readFileSync(childReceiptPath);
const childReceipt = JSON.parse(childReceiptBytes.toString("utf8"));
const byId = new Map(childReceipt.checks.map((item) => [item.id, item]));
const caseResults = requiredCases.map((caseId) => ({ caseId, status: byId.get(caseId)?.status ?? "NOT_RUN", detail: byId.get(caseId)?.detail ?? null }));
const cleanupPass = byId.get("DEV101-OWNER-v2-PORT")?.status === "PASS"
  && byId.get("DEV101-OWNER-v2-RUNTIME-PROJECT")?.status === "PASS"
  && byId.get("DEV101-OWNER-v2-PRIMARY")?.status === "PASS";
const pass = childReceipt.result === "PASS" && caseResults.every((item) => item.status === "PASS") && cleanupPass;
const report = {
  dev: "DEV-101",
  runId,
  evidenceClass: "RD_SUPPORTING_ONLY_NOT_INDEPENDENT_QC",
  result: pass ? "PASS" : "FAIL",
  caseResults,
  child: {
    path: path.relative(root, childReceiptPath).replaceAll(path.sep, "/"),
    sha256: crypto.createHash("sha256").update(childReceiptBytes).digest("hex"),
    runId: childReceipt.runId,
    result: childReceipt.result
  },
  cleanupPass,
  completedAt: new Date().toISOString()
};
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "receipt.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
for (const item of caseResults) console.log(`${item.status} ${item.caseId}`);
console.log(`${report.result} DEV-101 API supporting lane — ${caseResults.filter((item) => item.status === "PASS").length}/${caseResults.length}`);
if (!pass) process.exitCode = 1;
