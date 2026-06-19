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

const packagePath = ".ai-doc/reports/pm/pm-supabase-runtime-gate-b-approval-package-2026-06-16.md";
const gatePlanPath = ".ai-doc/qa/qa-supabase-runtime-provider-gate-validation-plan-2026-06-16.md";
const rollbackPlanPath = ".ai-doc/qa/qa-supabase-runtime-rollback-readiness-plan-2026-06-16.md";
const dataPolicyPath = ".ai-doc/qa/qa-supabase-data-parity-policy-2026-06-16.md";
const devTaskPath = ".ai-doc/dev_task.md";
const readmePath = "supabase/README.md";
const smokePreflightPath = "scripts/qc-supabase-runtime-smoke-preflight.mjs";
const scriptPath = "scripts/qc-supabase-runtime-approval-package.mjs";

const packageJson = JSON.parse(read("package.json"));
const approvalPackage = exists(packagePath) ? read(packagePath) : "";
const gatePlan = exists(gatePlanPath) ? read(gatePlanPath) : "";
const rollbackPlan = exists(rollbackPlanPath) ? read(rollbackPlanPath) : "";
const dataPolicy = exists(dataPolicyPath) ? read(dataPolicyPath) : "";
const devTask = exists(devTaskPath) ? read(devTaskPath) : "";
const readme = exists(readmePath) ? read(readmePath) : "";
const smokePreflight = read(smokePreflightPath);
const scriptSource = read(scriptPath);

record(
  "SUPA-APPROVAL-001 package script is registered",
  packageJson.scripts?.["qc:supabase-runtime-approval-package"] ===
    "node scripts/qc-supabase-runtime-approval-package.mjs",
  "package.json"
);
record("SUPA-APPROVAL-002 approval package exists", exists(packagePath), packagePath);
record(
  "SUPA-APPROVAL-003 package identifies GATE-B approval and blocked execution state",
  includesAll(approvalPackage, [
    "DEV-SUPABASE-DB-001-GATE-B",
    "AI_PDM_STAGING",
    "PM approval received for AI_PDM_STAGING-only smoke; execution blocked by missing server-side staging credentials",
    "Approval Received",
    "Current execution state: blocked"
  ]),
  packagePath
);
record(
  "SUPA-APPROVAL-004 package defines PM decision choices and exact approval statement",
  includesAll(approvalPackage, [
    "Approve GATE-B staging runtime smoke",
    "Defer GATE-B",
    "Request more local evidence",
    "I approve DEV-SUPABASE-DB-001-GATE-B staging runtime smoke against AI_PDM_STAGING only"
  ]),
  packagePath
);
record(
  "SUPA-APPROVAL-005 package requires approval env, target, provider, and server-side credentials",
  includesAll(approvalPackage, [
    "Received for `AI_PDM_STAGING` staging runtime smoke only",
    "PDM_RUNTIME_SMOKE_APPROVED=true",
    "PDM_SUPABASE_TARGET_NAME=AI_PDM_STAGING",
    "PDM_DB_PROVIDER=postgres",
    "PDM_POSTGRES_URL",
    "PDM_POSTGRES_SHADOW_URL",
    "Server-side"
  ]),
  packagePath
);
record(
  "SUPA-APPROVAL-006 package requires local QC command set",
  includesAll(approvalPackage, [
    "qc:supabase-runtime-gate-b-local-suite",
    "qc:doc-paths",
    "qc:supabase-secret-boundary",
    "qc:supabase-runtime-migrations",
    "qc:supabase-migration-history-policy",
    "qc:supabase-runtime-rollback-readiness",
    "qc:supabase-data-parity-policy",
    "qc:supabase-runtime-approval-package",
    "qc:supabase-runtime-local-readiness",
    "qc:supabase-runtime-smoke-report-template",
    "qc:supabase-runtime-gate-b-runbook",
    "qc:supabase-runtime-smoke-api-matrix",
    "qc:supabase-runtime-gate-plan",
    "qc:supabase-runtime-smoke-preflight",
    "PDM_SUPABASE_SKIP_MIGRATION_LIST=true"
  ]),
  packagePath
);
record(
  "SUPA-APPROVAL-007 package defines runtime smoke matrix",
  includesAll(approvalPackage, [
    "db_provider_connection",
    "schema_rls_compare",
    "read_path_admin_matrix",
    "read_path_rule_simulator",
    "pre_write_duplicate_guard",
    "write_path_numbering_smoke_record",
    "readback_created_record",
    "cleanup_smoke_record",
    "rollback_sqlite_mode"
  ]),
  packagePath
);
record(
  "SUPA-APPROVAL-008 package blocks unsafe data classes and browser direct Data API",
  includesAll(approvalPackage, [
    "Production customer data.",
    "CAD files.",
    "Release packages.",
    "Handoff packages.",
    "Field-test artifacts.",
    "QC artifacts.",
    "File blobs.",
    "Browser-side direct Supabase Data API access to base tables."
  ]),
  packagePath
);
record(
  "SUPA-APPROVAL-008A package records no production and no cutover approval boundary",
  includesAll(approvalPackage, [
    "Do not touch production.",
    "Do not perform cutover.",
    "Production and cutover remain unapproved."
  ]),
  packagePath
);
record(
  "SUPA-APPROVAL-009 gate plan references approval package and QC",
  gatePlan.includes(packagePath) && gatePlan.includes("qc:supabase-runtime-approval-package"),
  gatePlanPath
);
record(
  "SUPA-APPROVAL-010 dev_task records approval package as prepared controlled evidence",
  devTask.includes(packagePath) &&
    (devTask.includes("GATE-B approval package prepared") || devTask.includes("GATE-B approval package")) &&
    devTask.includes("qc:supabase-runtime-approval-package"),
  devTaskPath
);
record(
  "SUPA-APPROVAL-011 Supabase README references approval package boundary",
  readme.includes(packagePath) &&
    readme.includes("Runtime Approval Package") &&
    readme.includes("qc:supabase-runtime-approval-package"),
  readmePath
);
record(
  "SUPA-APPROVAL-012 linked control docs do not contain live secrets",
  !hasLiveSecret(`${approvalPackage}\n${gatePlan}\n${rollbackPlan}\n${dataPolicy}\n${devTask}\n${readme}`),
  "approval package + linked control docs"
);
record(
  "SUPA-APPROVAL-013 QC script is local-only",
  !/from\s+["']pg["']/u.test(scriptSource) &&
    !/fetch\s*\(/u.test(scriptSource) &&
    !/createClient\s*\(/u.test(scriptSource) &&
    !/spawnSync\s*\(/u.test(scriptSource),
  scriptPath
);
record(
  "SUPA-APPROVAL-014 smoke preflight remains approval-gated",
  includesAll(smokePreflight, ["PDM_RUNTIME_SMOKE_APPROVED", "blocked_expected", "PDM_SUPABASE_TARGET_NAME"]),
  smokePreflightPath
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
