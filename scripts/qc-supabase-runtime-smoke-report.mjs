#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const results = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, ...relativePath.split("/")));
}

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

function includesAll(source, needles) {
  return needles.every((needle) => source.includes(needle));
}

function hasLiveSecret(value) {
  return [
    /postgres(?:ql)?:\/\/(?!<)/iu,
    /sb_secret_[a-z0-9_-]{12,}/iu,
    /service_role[=:]\s*["']?[a-z0-9._-]{20,}/iu,
    /password[=:]\s*["']?[^<\s"']{12,}/iu,
    /pdm_session=[^<\s;]+/iu
  ].some((pattern) => pattern.test(value));
}

const reportPath = ".ai-doc/reports/qc/qc-supabase-runtime-smoke-report-2026-06-16.md";
const devTaskPath = ".ai-doc/dev_task.md";
const packageJson = JSON.parse(read("package.json"));
const report = exists(reportPath) ? read(reportPath) : "";
const devTask = exists(devTaskPath) ? read(devTaskPath) : "";
const scriptSource = read("scripts/qc-supabase-runtime-smoke-report.mjs");

record(
  "SUPA-SMOKE-REPORT-001 package script is registered",
  packageJson.scripts?.["qc:supabase-runtime-smoke-report"] === "node scripts/qc-supabase-runtime-smoke-report.mjs",
  "package.json"
);
record("SUPA-SMOKE-REPORT-002 report exists", exists(reportPath), reportPath);
record(
  "SUPA-SMOKE-REPORT-003 strict PM scope is recorded",
  includesAll(report, [
    "Run `AI_PDM_STAGING` staging runtime smoke only.",
    "Do not touch production.",
    "Do not perform cutover.",
    "Do not write secrets"
  ]),
  reportPath
);
record(
  "SUPA-SMOKE-REPORT-004 final result is passed with app smoke and cleanup proof",
  includesAll(report, [
    "Status: Passed / full staging app API smoke and cleanup proof captured",
    "Final result: `pass`",
    "Smoke data `AI_PDM_GB_SMOKE_202606170939_JED`",
    "active smoke roots `0` and active smoke parts `0`"
  ]),
  reportPath
);
record(
  "SUPA-SMOKE-REPORT-005 target, schema, migration, provider, and rollback evidence are recorded",
  includesAll(report, [
    "`targetIdentity.safe` | `true`",
    "`safe` | `true`",
    "`mismatches` | `[]`",
    "20260615040619_harden_set_updated_at_search_path",
    "Passed 9/9",
    "PASS 10/10"
  ]),
  reportPath
);
record(
  "SUPA-SMOKE-REPORT-006 app smoke writes, reads back, cleans up, and production remains denied",
  includesAll(report, [
    "`auth_login` | PASS",
    "`auth_me_confirm` | PASS",
    "`read_path_admin_matrix` | PASS after permission repair",
    "`pre_write_duplicate_guard` | PASS after permission repair",
    "`write_path_numbering_smoke_record` | PASS after rule seed repair",
    "`readback_created_record` | PASS",
    "`cleanup_smoke_record` | PASS",
    "No production access.",
    "No production cutover.",
    "No direct DB edit to bypass app permissions."
  ]),
  reportPath
);
record(
  "SUPA-SMOKE-REPORT-007 dev_task references execution report and current state",
  devTask.includes(reportPath) &&
    devTask.includes("qc:supabase-runtime-smoke-report") &&
    devTask.includes("Staging GATE-B passed for `AI_PDM_STAGING`"),
  devTaskPath
);
record(
  "SUPA-SMOKE-REPORT-008 report and dev_task do not contain live secrets",
  !hasLiveSecret(`${report}\n${devTask}`),
  "report + dev_task"
);
record(
  "SUPA-SMOKE-REPORT-009 QC script is static and local-only",
  !/from\s+["']pg["']/u.test(scriptSource) &&
    !/fetch\s*\(/u.test(scriptSource) &&
    !/createClient\s*\(/u.test(scriptSource) &&
    !/spawnSync\s*\(/u.test(scriptSource),
  "scripts/qc-supabase-runtime-smoke-report.mjs"
);

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), total: results.length, passed: results.length - failed.length, failed: failed.length, results }, null, 2));

process.exitCode = failed.length === 0 ? 0 : 1;
