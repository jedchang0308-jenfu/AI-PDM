#!/usr/bin/env node

import { projectFileExists, readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

function includesAll(source, needles) {
  return needles.every((needle) => source.includes(needle));
}

function devTaskRecordsSmokeReportTemplate(devTask) {
  return (
    /Runtime smoke report template[\s\S]*Prepared/iu.test(devTask) &&
    devTask.includes("qc:supabase-runtime-smoke-report-template")
  );
}

function hasLiveSecret(value) {
  return [
    /postgres(?:ql)?:\/\/(?!<)/iu,
    /sb_secret_[a-z0-9_-]{12,}/iu,
    /service_role[=:]\s*["']?[a-z0-9._-]{20,}/iu,
    /password[=:]\s*["']?[^<\s"']{12,}/iu
  ].some((pattern) => pattern.test(value));
}

const templatePath = ".ai-doc/reports/qc/qc-supabase-runtime-smoke-report-template-2026-06-16.md";
const devTaskPath = ".ai-doc/dev_task.md";
const gatePlanPath = ".ai-doc/qa/qa-supabase-runtime-provider-gate-validation-plan-2026-06-16.md";
const approvalPackagePath = ".ai-doc/reports/pm/pm-supabase-runtime-gate-b-approval-package-2026-06-16.md";
const smokeApiMatrixPath = ".ai-doc/qa/qa-supabase-runtime-smoke-api-matrix-2026-06-16.md";
const authSessionBoundaryPath = ".ai-doc/qa/qa-supabase-runtime-smoke-auth-session-boundary-2026-06-16.md";
const readmePath = "supabase/README.md";
const localReadinessPath = "scripts/qc-supabase-runtime-local-readiness.mjs";
const scriptPath = "scripts/qc-supabase-runtime-smoke-report-template.mjs";

const packageJson = readProjectJson(root, "package.json");
const template = projectFileExists(root, templatePath) ? readProjectFile(root, templatePath) : "";
const devTask = projectFileExists(root, devTaskPath) ? readProjectFile(root, devTaskPath) : "";
const gatePlan = projectFileExists(root, gatePlanPath) ? readProjectFile(root, gatePlanPath) : "";
const approvalPackage = projectFileExists(root, approvalPackagePath) ? readProjectFile(root, approvalPackagePath) : "";
const smokeApiMatrix = projectFileExists(root, smokeApiMatrixPath) ? readProjectFile(root, smokeApiMatrixPath) : "";
const authSessionBoundary = projectFileExists(root, authSessionBoundaryPath) ? readProjectFile(root, authSessionBoundaryPath) : "";
const readme = projectFileExists(root, readmePath) ? readProjectFile(root, readmePath) : "";
const localReadiness = readProjectFile(root, localReadinessPath);
const scriptSource = readProjectFile(root, scriptPath);

record(
  "SUPA-SMOKE-REPORT-001 package script is registered",
  packageJson.scripts?.["qc:supabase-runtime-smoke-report-template"] ===
    "node scripts/qc-supabase-runtime-smoke-report-template.mjs",
  "package.json"
);
record("SUPA-SMOKE-REPORT-002 report template exists", projectFileExists(root, templatePath), templatePath);
record(
  "SUPA-SMOKE-REPORT-003 template is clearly not an executed report",
  includesAll(template, [
    "Template only; GATE-B execution not performed",
    "Final result: `<pass/fail/blocked>`",
    "This report does not approve production cutover"
  ]),
  templatePath
);
record(
  "SUPA-SMOKE-REPORT-004 template captures approval, target, env, commands, smoke, data, rollback, risks, disposition",
  includesAll(template, [
    "## 1. Approval Record",
    "## 2. Target Identity Evidence",
    "## 3. Redacted Runtime Environment",
    "## 4. Auth Session Evidence",
    "## 5. Preflight And Command Evidence",
    "## 6. Smoke API Matrix",
    "## 7. Smoke Data Ledger",
    "## 8. Rollback Verification",
    "## 9. Advisor And Residual Risk",
    "## 10. Final Disposition"
  ]),
  templatePath
);
record(
  "SUPA-SMOKE-REPORT-005 template records required GATE-B commands and target controls",
  includesAll(template, [
    "PDM_RUNTIME_SMOKE_APPROVED",
    "PDM_SUPABASE_TARGET_NAME",
    "AI_PDM_STAGING",
    "PDM_DB_PROVIDER",
    "PDM_POSTGRES_URL",
    "PDM_POSTGRES_SHADOW_URL",
    "npm.cmd run qc:supabase-runtime-smoke-preflight",
    "npm.cmd run db:postgres:guard -- --phase compare",
    "supabase migration list",
    "npm.cmd run db:postgres:compare:schema-rls -- --no-write",
    "npm.cmd run qc:db-provider-postgres"
  ]),
  templatePath
);
record(
  "SUPA-SMOKE-REPORT-006 template includes full smoke matrix and cleanup proof",
  includesAll(template, [
    "db_provider_connection",
    "schema_rls_compare",
    "read_path_admin_matrix",
    "read_path_rule_simulator",
    "pre_write_duplicate_guard",
    "write_path_numbering_smoke_record",
    "readback_created_record",
    "cleanup_smoke_record",
    "rollback_sqlite_mode",
    "Smoke prefix",
    "Cleanup result",
    "Remaining known residue"
  ]),
  templatePath
);
record(
  "SUPA-SMOKE-REPORT-007 template preserves data and secret boundaries",
  includesAll(template, [
    "Record only environment variable names and configured/missing status. Do not record values.",
    "Secret values redacted",
    "production customer data",
    "browser-side direct Supabase Data API access to base tables",
    "repository secret commits"
  ]),
  templatePath
);
record(
  "SUPA-SMOKE-REPORT-008 gate plan references template and QC",
  gatePlan.includes(templatePath) && gatePlan.includes("qc:supabase-runtime-smoke-report-template"),
  gatePlanPath
);
record(
  "SUPA-SMOKE-REPORT-009 approval package references template and QC",
  approvalPackage.includes(templatePath) && approvalPackage.includes("qc:supabase-runtime-smoke-report-template"),
  approvalPackagePath
);
record(
  "SUPA-SMOKE-REPORT-009A smoke API matrix is linked from template and package",
  template.includes(smokeApiMatrixPath) &&
    template.includes("qc:supabase-runtime-smoke-api-matrix") &&
    approvalPackage.includes(smokeApiMatrixPath) &&
    approvalPackage.includes("qc:supabase-runtime-smoke-api-matrix") &&
    smokeApiMatrix.includes("Matrix only; GATE-B execution not performed"),
  smokeApiMatrixPath
);
record(
  "SUPA-SMOKE-REPORT-009B auth/session boundary is linked from template and package",
  template.includes(authSessionBoundaryPath) &&
    template.includes("qc:supabase-runtime-smoke-auth-session-boundary") &&
    approvalPackage.includes(authSessionBoundaryPath) &&
    approvalPackage.includes("qc:supabase-runtime-smoke-auth-session-boundary") &&
    authSessionBoundary.includes("Boundary only; GATE-B execution not performed"),
  authSessionBoundaryPath
);
record(
  "SUPA-SMOKE-REPORT-010 dev_task records template as controlled evidence",
  devTaskRecordsSmokeReportTemplate(devTask),
  devTaskPath
);
record(
  "SUPA-SMOKE-REPORT-011 local readiness gate includes report template",
  localReadiness.includes(templatePath) &&
    localReadiness.includes("qc:supabase-runtime-smoke-report-template"),
  localReadinessPath
);
record(
  "SUPA-SMOKE-REPORT-012 README references report template workflow",
  readme.includes(templatePath) && readme.includes("qc:supabase-runtime-smoke-report-template"),
  readmePath
);
record(
  "SUPA-SMOKE-REPORT-013 template and linked control docs do not contain live secrets",
  !hasLiveSecret(`${template}\n${gatePlan}\n${approvalPackage}\n${smokeApiMatrix}\n${authSessionBoundary}\n${devTask}\n${readme}`),
  "template + linked docs"
);
record(
  "SUPA-SMOKE-REPORT-014 QC script is local-only",
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
