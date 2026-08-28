#!/usr/bin/env node

import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

function option(name) {
  const prefix = `${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}
function required(value, code) {
  if (!value) throw new Error(code);
  return value;
}
function localOrigin(rawUrl) {
  const url = new URL(rawUrl);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) throw new Error("LOCAL_BASE_URL_REQUIRED");
  return url.origin;
}
async function sha256File(filePath) {
  const digest = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filePath)) digest.update(chunk);
  return digest.digest("hex");
}
function gitValue(args) {
  const result = spawnSync("git", args, { cwd: process.cwd(), encoding: "utf8", windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : null;
}
function runNode(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024
  });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  return { status: result.status === 0 ? "PASS" : "FAIL", exitCode: result.status, error: result.error?.message ?? null };
}
function readTargetState(targetPath) {
  const db = new Database(targetPath, { readonly: true, fileMustExist: true });
  try {
    return {
      integrity: db.pragma("integrity_check"),
      foreignKeyViolations: db.prepare("PRAGMA foreign_key_check").all(),
      authority: db.prepare("SELECT mode, expected_commit, schema_hash, row_version FROM pdm_workbench_state_authority_control WHERE id = 1").get() ?? null
    };
  } finally {
    db.close();
  }
}

const sourcePath = path.resolve(required(option("--source") || process.env.PDM_PRODUCTION_SNAPSHOT, "PRODUCTION_SNAPSHOT_SOURCE_REQUIRED: pass --source=<snapshot.sqlite> or set PDM_PRODUCTION_SNAPSHOT"));
const targetPath = path.resolve(option("--target") || process.env.PDM_CANONICAL_TARGET || "data/ai-pdm.sqlite");
const baseUrl = localOrigin(option("--base-url") || process.env.PDM_LOCAL_BASE_URL || "http://localhost:3000");
if (sourcePath.toLowerCase() === targetPath.toLowerCase()) throw new Error("SOURCE_TARGET_MUST_DIFFER");
if (!fs.existsSync(sourcePath)) throw new Error(`PRODUCTION_SNAPSHOT_NOT_FOUND: ${sourcePath}`);
if (!fs.existsSync(targetPath)) throw new Error(`CANONICAL_TARGET_NOT_FOUND: ${targetPath}`);
const runId = `production-snapshot-local-simulation-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const outputDir = path.resolve(option("--output-dir") || process.env.PDM_QC_OUTPUT_DIR || path.join(".artifacts", "AI_PDM", "production-snapshot-local-simulation", runId));
fs.mkdirSync(outputDir, { recursive: true });

const coverageScript = path.resolve("scripts/qc-production-snapshot-canonical-coverage.mjs");
const uiScript = path.resolve("scripts/qc-production-snapshot-ui-coverage.mjs");
const preCoverageDir = path.join(outputDir, "coverage-before-ui");
const postCoverageDir = path.join(outputDir, "coverage-after-ui");
const uiDir = path.join(outputDir, "ui");
const results = [];
const beforeTargetState = readTargetState(targetPath);
const sourceSha256 = await sha256File(sourcePath);

const preCoverageRun = runNode(coverageScript, [`--source=${sourcePath}`, `--target=${targetPath}`, `--output-dir=${preCoverageDir}`]);
results.push({ id: "coverage-before-ui", ...preCoverageRun });
const preCoveragePath = path.join(preCoverageDir, "coverage.json");
const preCoverage = fs.existsSync(preCoveragePath) ? JSON.parse(fs.readFileSync(preCoveragePath, "utf8")) : null;

let uiRun = { status: "SKIP", exitCode: null, error: "coverage-before-ui did not pass" };
if (preCoverageRun.status === "PASS" && preCoverage?.status === "PASS") {
  uiRun = runNode(uiScript, [`--source=${sourcePath}`, `--coverage-report=${preCoveragePath}`, `--base-url=${baseUrl}`, `--output-dir=${uiDir}`]);
}
results.push({ id: "local-api-ui", ...uiRun });

const postCoverageRun = runNode(coverageScript, [`--source=${sourcePath}`, `--target=${targetPath}`, `--output-dir=${postCoverageDir}`]);
results.push({ id: "coverage-after-ui", ...postCoverageRun });
const postCoveragePath = path.join(postCoverageDir, "coverage.json");
const postCoverage = fs.existsSync(postCoveragePath) ? JSON.parse(fs.readFileSync(postCoveragePath, "utf8")) : null;
const uiReportPath = path.join(uiDir, "report.json");
const uiReport = fs.existsSync(uiReportPath) ? JSON.parse(fs.readFileSync(uiReportPath, "utf8")) : null;
const afterTargetState = readTargetState(targetPath);

const fingerprintStable = Boolean(preCoverage?.targetBusinessFingerprint)
  && preCoverage.targetBusinessFingerprint === postCoverage?.targetBusinessFingerprint;
results.push({ id: "business-fingerprint-unchanged-by-ui", status: fingerprintStable ? "PASS" : "FAIL", before: preCoverage?.targetBusinessFingerprint ?? null, after: postCoverage?.targetBusinessFingerprint ?? null, exitCode: fingerprintStable ? 0 : 1, error: null });
const authorityStable = JSON.stringify(beforeTargetState.authority) === JSON.stringify(afterTargetState.authority);
results.push({ id: "authority-control-unchanged", status: authorityStable ? "PASS" : "FAIL", before: beforeTargetState.authority, after: afterTargetState.authority, exitCode: authorityStable ? 0 : 1, error: null });

let runtimeStatus = null;
try {
  const response = await fetch(`${baseUrl}/api/numbering/state-flow/status`, { signal: AbortSignal.timeout(10_000) });
  runtimeStatus = { statusCode: response.status, body: await response.json().catch(() => null) };
} catch (error) {
  runtimeStatus = { statusCode: null, error: error instanceof Error ? error.message : String(error) };
}
const runtimeHealthy = runtimeStatus.statusCode === 200;
results.push({ id: "local-runtime-health", status: runtimeHealthy ? "PASS" : "FAIL", detail: runtimeStatus, exitCode: runtimeHealthy ? 0 : 1, error: null });

const pass = results.every((result) => result.status === "PASS");
const manifest = {
  status: pass ? "PASS" : "FAIL",
  runId,
  generatedAt: new Date().toISOString(),
  scope: "local production-snapshot simulation QC only; no migration apply, deploy, release, or remote production access",
  source: { path: sourcePath, sha256: sourceSha256 },
  target: { path: targetPath, mutationScope: "local quick-login session/user/audit overlay only; business-data APIs read-only", before: beforeTargetState, after: afterTargetState },
  runtime: { baseUrl, ownership: "pre-existing local runtime; not started or stopped by this gate", health: runtimeStatus },
  git: { branch: gitValue(["branch", "--show-current"]), head: gitValue(["rev-parse", "HEAD"]), dirty: Boolean(gitValue(["status", "--porcelain"])) },
  businessFingerprintStable: fingerprintStable,
  expected: preCoverage?.expected ?? null,
  actual: postCoverage?.actual ?? null,
  evidence: { preCoveragePath, uiReportPath, postCoveragePath, partsScreenshot: path.join(uiDir, "parts-workbench.png"), drawingsScreenshot: path.join(uiDir, "drawings-workbench.png") },
  results,
  uiSummary: uiReport ? { status: uiReport.status, passed: uiReport.results.filter((result) => result.status === "PASS").length, failed: uiReport.results.filter((result) => result.status === "FAIL").map((result) => result.id), consoleErrors: uiReport.consoleErrors, failedRequests: uiReport.failedRequests, failedResponses: uiReport.failedResponses } : null
};
const manifestPath = path.join(outputDir, "manifest.json");
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
const markdown = [
  "# Production snapshot local simulation gate",
  "",
  `- Status: **${manifest.status}**`,
  `- Source SHA-256: \`${sourceSha256}\``,
  `- Local runtime: \`${baseUrl}\``,
  `- Business fingerprint stable across UI QC: **${fingerprintStable ? "yes" : "no"}**`,
  "",
  "| Gate | Result |",
  "|---|---:|",
  ...results.map((result) => `| ${result.id} | ${result.status} |`),
  "",
  `- Coverage before UI: \`${preCoveragePath}\``,
  `- UI report: \`${uiReportPath}\``,
  `- Coverage after UI: \`${postCoveragePath}\``,
  ""
];
const reportPath = path.join(outputDir, "report.md");
fs.writeFileSync(reportPath, `${markdown.join("\n")}\n`, "utf8");
console.log(JSON.stringify({ status: manifest.status, failed: results.filter((result) => result.status !== "PASS").map((result) => result.id), manifestPath, reportPath }, null, 2));
if (!pass) process.exitCode = 1;
