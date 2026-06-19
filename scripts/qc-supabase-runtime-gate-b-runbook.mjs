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

const runbookPath = ".ai-doc/runbooks/runbook-supabase-runtime-gate-b-2026-06-16.md";
const devTaskPath = ".ai-doc/dev_task.md";
const gatePlanPath = ".ai-doc/qa/qa-supabase-runtime-provider-gate-validation-plan-2026-06-16.md";
const approvalPackagePath = ".ai-doc/reports/pm/pm-supabase-runtime-gate-b-approval-package-2026-06-16.md";
const reportTemplatePath = ".ai-doc/reports/qc/qc-supabase-runtime-smoke-report-template-2026-06-16.md";
const smokeApiMatrixPath = ".ai-doc/qa/qa-supabase-runtime-smoke-api-matrix-2026-06-16.md";
const readmePath = "supabase/README.md";
const localReadinessPath = "scripts/qc-supabase-runtime-local-readiness.mjs";
const scriptPath = "scripts/qc-supabase-runtime-gate-b-runbook.mjs";

const packageJson = JSON.parse(read("package.json"));
const runbook = exists(runbookPath) ? read(runbookPath) : "";
const devTask = exists(devTaskPath) ? read(devTaskPath) : "";
const gatePlan = exists(gatePlanPath) ? read(gatePlanPath) : "";
const approvalPackage = exists(approvalPackagePath) ? read(approvalPackagePath) : "";
const reportTemplate = exists(reportTemplatePath) ? read(reportTemplatePath) : "";
const smokeApiMatrix = exists(smokeApiMatrixPath) ? read(smokeApiMatrixPath) : "";
const readme = exists(readmePath) ? read(readmePath) : "";
const localReadiness = read(localReadinessPath);
const scriptSource = read(scriptPath);

record(
  "SUPA-RUNBOOK-001 package script is registered",
  packageJson.scripts?.["qc:supabase-runtime-gate-b-runbook"] ===
    "node scripts/qc-supabase-runtime-gate-b-runbook.mjs",
  "package.json"
);
record("SUPA-RUNBOOK-002 runbook exists", exists(runbookPath), runbookPath);
record(
  "SUPA-RUNBOOK-003 runbook is clearly not an execution approval or execution claim",
  includesAll(runbook, [
    "Runbook only; execution not approved or performed",
    "It does not approve execution.",
    "Do not run any live command in this runbook until PM has approved"
  ]),
  runbookPath
);
record(
  "SUPA-RUNBOOK-004 runbook defines full execution sequence",
  includesAll(runbook, [
    "## 3. Pre-Approval Local Verification",
    "## 4. Approval Gate",
    "## 5. Live Target Setup",
    "## 6. Runtime Provider Smoke Setup",
    "## 7. Smoke API Sequence",
    "## 8. Cleanup",
    "## 9. Rollback",
    "## 10. Report And Closeout"
  ]),
  runbookPath
);
record(
  "SUPA-RUNBOOK-005 runbook includes approval-gated target and provider commands",
  includesAll(runbook, [
    "PDM_RUNTIME_SMOKE_APPROVED",
    "PDM_SUPABASE_TARGET_NAME",
    "AI_PDM_STAGING",
    "PDM_POSTGRES_SHADOW_URL",
    "PDM_DB_PROVIDER",
    "PDM_POSTGRES_URL",
    "PDM_POSTGRES_POOLER_MODE",
    "npm.cmd run qc:supabase-runtime-smoke-preflight",
    "npm.cmd run db:postgres:guard -- --phase compare",
    "supabase migration list",
    "npm.cmd run db:postgres:compare:schema-rls -- --no-write",
    "npm.cmd run qc:db-provider-postgres"
  ]),
  runbookPath
);
record(
  "SUPA-RUNBOOK-006 runbook includes smoke, cleanup, rollback, and report proof",
  includesAll(runbook, [
    "AI_PDM_GB_SMOKE_",
    "pre_write_duplicate_guard",
    "write_path_numbering_smoke_record",
    "readback_created_record",
    "cleanup_smoke_record",
    "rollback_sqlite_mode",
    "Remove-Item Env:\\PDM_DB_PROVIDER",
    "npm.cmd run qc:db-provider-contract",
    "Final disposition: `pass`, `fail`, or `blocked`"
  ]),
  runbookPath
);
record(
  "SUPA-RUNBOOK-007 runbook preserves data and secret boundaries",
  includesAll(runbook, [
    "Non-production smoke records only",
    "Do not write secrets into repository files.",
    "production customer data",
    "browser-side direct Supabase Data API access to base tables",
    "repository secret commits"
  ]),
  runbookPath
);
record(
  "SUPA-RUNBOOK-008 gate plan references runbook and QC",
  gatePlan.includes(runbookPath) && gatePlan.includes("qc:supabase-runtime-gate-b-runbook"),
  gatePlanPath
);
record(
  "SUPA-RUNBOOK-009 approval package references runbook and QC",
  approvalPackage.includes(runbookPath) && approvalPackage.includes("qc:supabase-runtime-gate-b-runbook"),
  approvalPackagePath
);
record(
  "SUPA-RUNBOOK-010 report template cross-reference remains intact",
  runbook.includes(reportTemplatePath) && reportTemplate.includes("Template only; GATE-B execution not performed"),
  reportTemplatePath
);
record(
  "SUPA-RUNBOOK-010A runbook references smoke API matrix and QC",
  runbook.includes(smokeApiMatrixPath) &&
    runbook.includes("qc:supabase-runtime-smoke-api-matrix") &&
    smokeApiMatrix.includes("Matrix only; GATE-B execution not performed"),
  smokeApiMatrixPath
);
record(
  "SUPA-RUNBOOK-011 dev_task records runbook as controlled evidence",
  devTask.includes(runbookPath) &&
    (devTask.includes("GATE-B execution runbook prepared") || devTask.includes("GATE-B execution runbook")) &&
    devTask.includes("qc:supabase-runtime-gate-b-runbook"),
  devTaskPath
);
record(
  "SUPA-RUNBOOK-012 local readiness gate includes runbook",
  localReadiness.includes(runbookPath) && localReadiness.includes("qc:supabase-runtime-gate-b-runbook"),
  localReadinessPath
);
record(
  "SUPA-RUNBOOK-013 README references runbook workflow",
  readme.includes(runbookPath) && readme.includes("qc:supabase-runtime-gate-b-runbook"),
  readmePath
);
record(
  "SUPA-RUNBOOK-014 runbook and linked docs do not contain live secrets",
  !hasLiveSecret(`${runbook}\n${devTask}\n${gatePlan}\n${approvalPackage}\n${reportTemplate}\n${smokeApiMatrix}\n${readme}`),
  "runbook + linked docs"
);
record(
  "SUPA-RUNBOOK-015 QC script is local-only",
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
