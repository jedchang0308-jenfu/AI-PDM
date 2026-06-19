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
    /password[=:]\s*["']?[^<\s"']{12,}/iu
  ].some((pattern) => pattern.test(value));
}

const reportPath = ".ai-doc/reports/qc/qc-supabase-runtime-gate-b-local-suite-report-2026-06-16.md";
const localSuitePath = ".ai-doc/qa/qa-supabase-runtime-gate-b-local-suite-2026-06-16.md";
const devTaskPath = ".ai-doc/dev_task.md";
const approvalPackagePath = ".ai-doc/reports/pm/pm-supabase-runtime-gate-b-approval-package-2026-06-16.md";
const readmePath = "supabase/README.md";
const localSuiteScriptPath = "scripts/qc-supabase-runtime-gate-b-local-suite.mjs";
const localReadinessPath = "scripts/qc-supabase-runtime-local-readiness.mjs";
const scriptPath = "scripts/qc-supabase-runtime-gate-b-local-suite-report.mjs";

const packageJson = JSON.parse(read("package.json"));
const report = exists(reportPath) ? read(reportPath) : "";
const localSuite = exists(localSuitePath) ? read(localSuitePath) : "";
const devTask = exists(devTaskPath) ? read(devTaskPath) : "";
const approvalPackage = exists(approvalPackagePath) ? read(approvalPackagePath) : "";
const readme = exists(readmePath) ? read(readmePath) : "";
const localSuiteScript = exists(localSuiteScriptPath) ? read(localSuiteScriptPath) : "";
const localReadiness = exists(localReadinessPath) ? read(localReadinessPath) : "";
const scriptSource = read(scriptPath);

record(
  "SUPA-LOCAL-SUITE-REPORT-001 package script is registered",
  packageJson.scripts?.["qc:supabase-runtime-gate-b-local-suite-report"] ===
    "node scripts/qc-supabase-runtime-gate-b-local-suite-report.mjs",
  "package.json"
);
record("SUPA-LOCAL-SUITE-REPORT-002 report exists", exists(reportPath), reportPath);
record(
  "SUPA-LOCAL-SUITE-REPORT-003 report is clearly local-only and not executed GATE-B",
  includesAll(report, [
    "Report only; GATE-B execution not performed",
    "does not approve or run staging smoke",
    "live Supabase target commands",
    "`DEV-SUPABASE-DB-001-GATE-B` remains blocked"
  ]),
  reportPath
);
record(
  "SUPA-LOCAL-SUITE-REPORT-004 report captures blocked preflight expectations",
  includesAll(report, [
    "`blocked_expected`",
    "`readyForRuntimeSmoke`",
    "`false` before PM approval",
    "Preflight hazards",
    "`0`"
  ]),
  reportPath
);
record(
  "SUPA-LOCAL-SUITE-REPORT-005 report captures command and migration-list boundaries",
  includesAll(report, [
    "npm.cmd run qc:supabase-runtime-gate-b-local-suite",
    "PDM_SUPABASE_SKIP_MIGRATION_LIST=true",
    "supabase migration list",
    "db:postgres:guard -- --phase compare",
    "db:postgres:compare:schema-rls -- --no-write",
    "qc:db-provider-postgres",
    "PDM_DB_PROVIDER=postgres",
    "PDM_RUNTIME_SMOKE_APPROVED=true"
  ]),
  reportPath
);
record(
  "SUPA-LOCAL-SUITE-REPORT-006 report lists full local suite coverage",
  [
    "qc:doc-paths",
    "qc:supabase-secret-boundary",
    "qc:supabase-runtime-migrations",
    "qc:supabase-migration-history-policy",
    "qc:supabase-runtime-rollback-readiness",
    "qc:supabase-data-parity-policy",
    "qc:supabase-runtime-approval-package",
    "qc:supabase-runtime-local-readiness",
    "qc:supabase-runtime-gate-b-local-suite-report",
    "qc:supabase-runtime-smoke-report-template",
    "qc:supabase-runtime-gate-b-runbook",
    "qc:supabase-runtime-smoke-api-matrix",
    "qc:supabase-runtime-smoke-auth-session-boundary",
    "qc:supabase-runtime-gate-plan",
    "qc:supabase-current-change-impact",
    "qc:supabase-target-identity-receipt",
    "qc:supabase-runtime-smoke-preflight",
    'rg -n "@/lib/db" src/app/api --glob route.ts'
  ].every((needle) => report.includes(needle)),
  reportPath
);
record(
  "SUPA-LOCAL-SUITE-REPORT-007 local suite docs and runner include report validator",
  localSuite.includes("qc:supabase-runtime-gate-b-local-suite-report") &&
    localSuite.includes(reportPath) &&
    localSuiteScript.includes("qc:supabase-runtime-gate-b-local-suite-report"),
  `${localSuitePath} + ${localSuiteScriptPath}`
);
record(
  "SUPA-LOCAL-SUITE-REPORT-008 dev_task and approval package reference report evidence",
  devTask.includes(reportPath) &&
    devTask.includes("qc:supabase-runtime-gate-b-local-suite-report") &&
    approvalPackage.includes(reportPath) &&
    approvalPackage.includes("qc:supabase-runtime-gate-b-local-suite-report"),
  "dev_task + approval package"
);
record(
  "SUPA-LOCAL-SUITE-REPORT-009 README and local readiness include report evidence",
  readme.includes(reportPath) &&
    readme.includes("qc:supabase-runtime-gate-b-local-suite-report") &&
    localReadiness.includes(reportPath) &&
    localReadiness.includes("qc:supabase-runtime-gate-b-local-suite-report"),
  "README + local readiness"
);
record(
  "SUPA-LOCAL-SUITE-REPORT-010 report and linked controls do not contain live secrets",
  !hasLiveSecret(`${report}\n${localSuite}\n${devTask}\n${approvalPackage}\n${readme}`),
  "report + linked docs"
);
record(
  "SUPA-LOCAL-SUITE-REPORT-011 QC script is static and local-only",
  !/from\s+["']pg["']/u.test(scriptSource) &&
    !/fetch\s*\(/u.test(scriptSource) &&
    !/createClient\s*\(/u.test(scriptSource) &&
    !/spawnSync\s*\(/u.test(scriptSource),
  scriptPath
);

const failed = results.filter((result) => !result.passed);
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      results
    },
    null,
    2
  )
);

process.exitCode = failed.length === 0 ? 0 : 1;
