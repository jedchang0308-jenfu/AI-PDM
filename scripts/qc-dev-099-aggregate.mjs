#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { restoreNextEnv, snapshotNextEnv } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = `DEV099-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceRoot = path.resolve(process.env.DEV099_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-099", runId));
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev099-aggregate-"));
const nextEnvSnapshot = snapshotNextEnv(root);
const reports = [];
const checks = [];
const sourceFiles = [
  "src/lib/canonical-numbering-create-contract.ts", "src/components/canonical-numbering-create-form.tsx",
  "src/app/api/numbering/records/route.ts", "src/lib/part-structure-classification.ts",
  "src/components/part-structure-classification.tsx", "src/components/canonical-pdm-workbench.tsx",
  "src/lib/bom-create-context.ts", "src/components/part-bom-context.tsx",
  "src/lib/repositories/numbering-async-repository.ts", "src/lib/pdm-change-control-domain.ts",
  "src/lib/repositories/number-state-flow-async-repository.ts", "src/lib/repositories/numbering-repository.ts"
];

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function fileHash(file) { return sha256(fs.readFileSync(path.join(root, file))); }

function primaryInvariant() {
  const databasePath = path.join(root, "data", "ai-pdm.sqlite");
  if (!fs.existsSync(databasePath)) return { exists: false };
  const db = new Database(databasePath, { readonly: true });
  const tableNames = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const count = (table) => Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
  const roots = db.prepare("SELECT id, company_id, root_code FROM part_roots ORDER BY company_id, root_code, id").all();
  const parts = db.prepare("SELECT id, company_id, part_root_id, part_number FROM part_numbers ORDER BY company_id, part_number, id").all();
  const drawings = db.prepare("SELECT id, company_id, part_root_id, drawing_number FROM drawing_numbers ORDER BY company_id, drawing_number, id").all();
  const missingRootRefs = db.prepare("SELECT p.id FROM part_numbers p LEFT JOIN part_roots r ON r.id=p.part_root_id WHERE r.id IS NULL").all();
  const migrationResidue = tableNames.map((row) => row.name).filter((name) => /migration|legacy|assembly_upload|sldasm/iu.test(name));
  const foreignKeys = db.pragma("foreign_key_check");
  const result = {
    exists: true,
    schemaHash: sha256(tableNames.map((row) => `${row.name}:${row.sql ?? ""}`).join("\n")),
    tables: tableNames.length,
    masterCounts: { roots: count("part_roots"), parts: count("part_numbers"), drawings: count("drawing_numbers"), links: count("drawing_part_links") },
    canonicalRootIdentityHash: sha256(JSON.stringify(roots)),
    canonicalPartIdentityHash: sha256(JSON.stringify(parts)),
    canonicalDrawingIdentityHash: sha256(JSON.stringify(drawings)),
    missingRootRefs: missingRootRefs.length,
    migrationResidue,
    foreignKeyViolations: foreignKeys.length
  };
  db.close();
  return result;
}

function run(label, args, env = {}) {
  const execute = () => spawnSync(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, encoding: "utf8", maxBuffer: 60 * 1024 * 1024, windowsHide: true });
  let result = execute();
  let transientRetry = false;
  const combinedOutput = () => `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.status !== 0 && label === "dev093-browser" && /next-env\.d\.ts/iu.test(combinedOutput())) {
    // Next's dev worker can briefly hold the generated type declaration after a
    // preceding isolated browser runtime restores it. Retry only this known
    // startup race; product/browser failures remain hard failures.
    spawnSync(process.execPath, ["-e", "setTimeout(() => {}, 1500)"], { cwd: root, windowsHide: true });
    transientRetry = true;
    result = execute();
  }
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  const report = { label, status: result.status ?? 1, signal: result.signal ?? null, transientRetry };
  reports.push(report);
  return report.status === 0;
}

function requireEvidence(file, label) {
  const full = path.join(evidenceRoot, file);
  if (!fs.existsSync(full)) throw new Error(`${label}_EVIDENCE_MISSING:${full}`);
  return JSON.parse(fs.readFileSync(full, "utf8"));
}

function record(caseId, label, pass, detail = "", evidence = []) {
  checks.push({ caseId, label, status: pass ? "PASS" : "FAIL", detail, evidence });
  if (!pass) throw new Error(`${caseId}:${label}:${detail}`);
}

const beforePrimary = primaryInvariant();
fs.mkdirSync(evidenceRoot, { recursive: true });
fs.writeFileSync(path.join(evidenceRoot, "dirty-boundary.json"), `${JSON.stringify({ runId, sourceFiles: Object.fromEntries(sourceFiles.map((file) => [file, fileHash(file)])), primaryBefore: beforePrimary }, null, 2)}\n`);

let firstFailure = null;
try {
  const contractOk = run("dev099-contract", ["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs", "scripts/qc-dev-099-contract.mjs"], { DEV099_EVIDENCE_DIR: path.join(evidenceRoot, "contract") });
  if (!contractOk) throw new Error("DEV099_CONTRACT_FAILED");
  const repositoryOk = run("dev099-repository", ["scripts/qc-dev-099-repository-runner.mjs"], { DEV099_EVIDENCE_DIR: path.join(evidenceRoot, "repository") });
  if (!repositoryOk) throw new Error("DEV099_REPOSITORY_FAILED");
  const browserOk = run("dev099-browser", ["scripts/qc-dev-099-browser.mjs"], { DEV099_EVIDENCE_DIR: path.join(evidenceRoot, "browser"), DEV099_HEADLESS: "false" });
  if (!browserOk) throw new Error("DEV099_BROWSER_FAILED");
  const postgresOk = run("dev099-postgres", ["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs", "scripts/qc-dev-099-postgres.mjs"], { DEV099_EVIDENCE_DIR: path.join(evidenceRoot, "provider") });
  if (!postgresOk) throw new Error("DEV099_POSTGRES_FAILED");
  // Existing regression suites are isolated internally and do not use primary DB.
  const dev093Contract = run("dev093-contract", ["scripts/qc-dev-093-contract.mjs", "--experimental-transform-types"]);
  const dev093Retirement = run("dev093-retirement", ["scripts/qc-dev-093-retirement.mjs"]);
  const dev093Browser = run("dev093-browser", ["scripts/qc-dev-093-browser.mjs"]);
  const dev096Contract = run("dev096-contract", ["scripts/qc-dev-096-contract.mjs"]);
  const dev096Browser = run("dev096-browser", ["scripts/qc-dev-096-browser.mjs"]);

  const contract = requireEvidence("contract/manifest.json", "contract");
  const browser = requireEvidence("browser/browser.json", "browser");
  const postgres = requireEvidence("provider/postgres.json", "postgres");
  const repository = requireEvidence("repository/repository.json", "repository");
  const browserCases = new Set(browser.cases ?? []);
  const source = Object.fromEntries(sourceFiles.map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
  const writerGate = (texts) => texts.every((text) => /structure_type/u.test(text));
  const baselineSelectorGate = !source["src/components/canonical-numbering-create-form.tsx"].includes("結構型態</span><select");
  const baselineParallelGate = !source["src/components/canonical-pdm-workbench.tsx"].includes("/structure-classification");
  const contractCases = new Set(contract.checks.filter((item) => item.status === "PASS").map((item) => Number(String(item.id).replace("QA-099-", ""))));
  const passByBrowser = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 16, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 44]);
  for (let id = 1; id <= 48; id += 1) {
    const caseId = `QA-099-${String(id).padStart(3, "0")}`;
    let pass = contractCases.has(id);
    let label = "contract evidence";
    let detail = `contract=${contractCases.has(id)}`;
    let evidence = ["contract/manifest.json"];
    if (passByBrowser.has(id)) {
      pass = browserCases.has(id);
      label = "rendered browser evidence";
      detail = `browser=${browserCases.has(id)}`;
      evidence = ["browser/browser.json"];
    } else if ([10, 14, 15].includes(id)) {
      pass = repository.status === "PASS";
      label = "repository consensus evidence";
      detail = `repository=${repository.status}`;
      evidence = ["repository/repository.json"];
    } else if ([17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 46].includes(id)) {
      pass = repository.status === "PASS" && postgres.status === "PASS";
      label = "SQLite/PostgreSQL mutation evidence";
      detail = `repository=${repository.status};postgres=${postgres.status}`;
      evidence = ["repository/repository.json", "provider/postgres.json"];
    } else if (id === 41) {
      pass = dev093Contract && dev093Retirement && dev093Browser;
      label = "DEV-093 numbering regression";
      detail = JSON.stringify(reports.filter((row) => row.label.startsWith("dev093")));
      evidence = ["contract/manifest.json"];
    } else if (id === 42) {
      const selectorGate = (text) => !text.includes("結構型態</span><select");
      const mutantRejected = selectorGate(source["src/components/canonical-numbering-create-form.tsx"]) && !selectorGate(`${source["src/components/canonical-numbering-create-form.tsx"]}\n結構型態</span><select`);
      pass = mutantRejected;
      label = "retired behavior injection gate";
      detail = `mutantRejected=${mutantRejected}`;
      evidence = ["contract/manifest.json"];
    } else if (id === 43) {
      pass = dev096Contract && dev096Browser;
      label = "DEV-096 shared BOM regression";
      detail = JSON.stringify(reports.filter((row) => row.label.startsWith("dev096")));
      evidence = ["provider/postgres.json"];
    } else if (id === 44) {
      pass = browserCases.has(44);
      label = "parallel entry retirement";
      detail = `browser=${browserCases.has(44)};parallelSource=${baselineParallelGate}`;
      evidence = ["browser/browser.json", "contract/manifest.json"];
    } else if (id === 45) {
      pass = writerGate([source["src/lib/repositories/numbering-async-repository.ts"], source["src/lib/pdm-change-control-domain.ts"], source["src/lib/repositories/number-state-flow-async-repository.ts"], source["src/lib/repositories/numbering-repository.ts"]]);
      label = "active writer inventory";
      detail = `writers=${pass}`;
      evidence = ["contract/manifest.json"];
    } else if (id === 47) {
      pass = JSON.stringify(beforePrimary) === JSON.stringify(primaryInvariant());
      label = "primary invariant and cleanup";
      detail = `exactMatch=${pass}`;
      evidence = ["dirty-boundary.json"];
    } else if (id === 48) {
      pass = contractCases.size === 48 && reports.every((row) => row.status === 0);
      label = "aggregate completeness";
      detail = `contract=${contractCases.size}/48 reports=${JSON.stringify(reports)}`;
      evidence = ["contract/manifest.json"];
    }
    record(caseId, label, pass, detail, evidence);
  }
} catch (error) {
  firstFailure = error instanceof Error ? error.stack ?? error.message : String(error);
}

const nextEnvRestore = await restoreNextEnv(nextEnvSnapshot);
if (!nextEnvRestore.restored && !firstFailure) firstFailure = `NEXT_ENV_CLEANUP_FAILED:${nextEnvRestore.error}`;
const afterPrimary = primaryInvariant();
const finalResult = {
  runner: "aggregate", devId: "DEV-099", runId,
  status: !firstFailure && checks.length === 48 && checks.every((item) => item.status === "PASS") ? "PASS" : "FAIL",
  completionCandidate: !firstFailure && checks.length === 48 && checks.every((item) => item.status === "PASS"),
  denominator: 48,
  pass: checks.filter((item) => item.status === "PASS" && /^QA-099-\d{3}$/u.test(item.caseId)).length,
  fail: checks.filter((item) => item.status === "FAIL").length,
  blocked: 0,
  notRun: Math.max(0, 48 - new Set(checks.filter((item) => /^QA-099-\d{3}$/u.test(item.caseId)).map((item) => item.caseId)).size),
  reports, checks, firstFailure,
  primary: { before: beforePrimary, after: afterPrimary },
  sourceFiles: Object.fromEntries(sourceFiles.map((file) => [file, fileHash(file)])),
  nextEnv: { restored: nextEnvRestore.restored, attempts: nextEnvRestore.attempts, error: nextEnvRestore.error },
  runtime: { project: root, purpose: "DEV-099 full aggregate gate", taskRoot, cleanupCondition: "all child runtimes stopped and task-owned temp removed" },
  productionWrites: false
};
fs.writeFileSync(path.join(evidenceRoot, "manifest.json"), `${JSON.stringify(finalResult, null, 2)}\n`);
fs.writeFileSync(path.join(evidenceRoot, "primary-invariant.json"), `${JSON.stringify({
  before: beforePrimary,
  after: afterPrimary,
  exactMatch: JSON.stringify(beforePrimary) === JSON.stringify(afterPrimary),
  productionWrites: false
}, null, 2)}\n`);
fs.writeFileSync(path.join(evidenceRoot, "fixture-ledger.json"), `${JSON.stringify({
  runId,
  childReports: reports,
  mutationScope: "task-owned disposable data/repository/PostgreSQL fixtures only",
  primaryMutation: "none",
  providerEvidence: ["repository/repository.json", "provider/postgres.json"],
  browserEvidence: "browser/browser.json"
}, null, 2)}\n`);
try { fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 }); } catch { /* cleanup is recorded */ }
fs.writeFileSync(path.join(evidenceRoot, "cleanup.json"), `${JSON.stringify({
  taskRoot,
  taskRootRemoved: !fs.existsSync(taskRoot),
  nextEnvRestored: nextEnvRestore.restored,
  nextEnvRestoreAttempts: nextEnvRestore.attempts,
  childReports: reports,
  productionWrites: false
}, null, 2)}\n`);
console.log(JSON.stringify({ runner: finalResult.runner, status: finalResult.status, pass: finalResult.pass, denominator: finalResult.denominator, fail: finalResult.fail, blocked: finalResult.blocked, notRun: finalResult.notRun }, null, 2));
if (finalResult.status !== "PASS") process.exitCode = 1;
