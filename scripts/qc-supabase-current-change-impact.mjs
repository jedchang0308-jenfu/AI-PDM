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

function devTaskRecordsCurrentChangeAudit(devTask) {
  return (
    devTask.includes("DEV-SUPABASE-DB-001") &&
    devTask.includes("Current Supabase change impact audit") &&
    devTask.includes("qc:supabase-current-change-impact")
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

const auditPath = ".ai-doc/qa/qa-supabase-current-change-impact-audit-2026-06-16.md";
const devTaskPath = ".ai-doc/dev_task.md";
const gatePlanPath = ".ai-doc/qa/qa-supabase-runtime-provider-gate-validation-plan-2026-06-16.md";
const approvalPackagePath = ".ai-doc/reports/pm/pm-supabase-runtime-gate-b-approval-package-2026-06-16.md";
const runbookPath = ".ai-doc/runbooks/runbook-supabase-runtime-gate-b-2026-06-16.md";
const smokeReportTemplatePath = ".ai-doc/reports/qc/qc-supabase-runtime-smoke-report-template-2026-06-16.md";
const readmePath = "supabase/README.md";
const localReadinessPath = "scripts/qc-supabase-runtime-local-readiness.mjs";
const scriptPath = "scripts/qc-supabase-current-change-impact.mjs";

const packageJson = readProjectJson(root, "package.json");
const audit = projectFileExists(root, auditPath) ? readProjectFile(root, auditPath) : "";
const devTask = projectFileExists(root, devTaskPath) ? readProjectFile(root, devTaskPath) : "";
const gatePlan = projectFileExists(root, gatePlanPath) ? readProjectFile(root, gatePlanPath) : "";
const approvalPackage = projectFileExists(root, approvalPackagePath) ? readProjectFile(root, approvalPackagePath) : "";
const runbook = projectFileExists(root, runbookPath) ? readProjectFile(root, runbookPath) : "";
const smokeReportTemplate = projectFileExists(root, smokeReportTemplatePath) ? readProjectFile(root, smokeReportTemplatePath) : "";
const readme = projectFileExists(root, readmePath) ? readProjectFile(root, readmePath) : "";
const localReadiness = projectFileExists(root, localReadinessPath) ? readProjectFile(root, localReadinessPath) : "";
const scriptSource = readProjectFile(root, scriptPath);

record(
  "SUPA-CURRENT-001 package script is registered",
  packageJson.scripts?.["qc:supabase-current-change-impact"] === "node scripts/qc-supabase-current-change-impact.mjs",
  "package.json"
);
record("SUPA-CURRENT-002 current-change audit exists", projectFileExists(root, auditPath), auditPath);
record(
  "SUPA-CURRENT-003 audit records official current Supabase sources",
  includesAll(audit, [
    "https://supabase.com/changelog",
    "https://supabase.com/changelog/45827-deprecation-notice-support-for-postgres-14-ending-on-1st-july-2026",
    "https://supabase.com/docs/guides/database/secure-data",
    "https://supabase.com/docs/guides/database/postgres/row-level-security",
    "https://supabase.com/docs/guides/api/securing-your-api",
    "https://supabase.com/docs/guides/deployment/maturity-model",
    "https://supabase.com/docs/guides/local-development/cli/testing-and-linting"
  ]),
  auditPath
);
record(
  "SUPA-CURRENT-004 audit maps 2026 platform changes to GATE-B decisions",
  includesAll(audit, [
    "New public tables are not automatically exposed to the Data API / GraphQL API",
    "Postgres 14 support ends on 2026-07-01",
    "Direct database connections are server-side credentials",
    "Service role and secret keys are never frontend-safe",
    "Production maturity guidance requires version-controlled migration workflow"
  ]),
  auditPath
);
record(
  "SUPA-CURRENT-005 audit keeps Data API, RLS, and grant boundaries explicit",
  includesAll(audit, [
    "Do not use browser-side direct Supabase Data API access",
    "explicit `GRANT` and RLS policy review must happen together",
    "deny-by-default",
    "least-privilege RLS policies"
  ]),
  auditPath
);
record(
  "SUPA-CURRENT-006 audit requires Postgres major version evidence before approved smoke",
  includesAll(audit, [
    "record target Postgres major version",
    "Treat Postgres 14 as no-go",
    "after the 2026-07-01 support cutoff"
  ]),
  auditPath
);
record(
  "SUPA-CURRENT-007 runtime gate plan references current-change audit and QC",
  gatePlan.includes(auditPath) && gatePlan.includes("qc:supabase-current-change-impact"),
  gatePlanPath
);
record(
  "SUPA-CURRENT-008 approval package requires current-change audit",
  approvalPackage.includes(auditPath) &&
    approvalPackage.includes("qc:supabase-current-change-impact") &&
    approvalPackage.includes("Target Postgres major version"),
  approvalPackagePath
);
record(
  "SUPA-CURRENT-009 smoke report template captures current-change evidence",
  smokeReportTemplate.includes("Target Postgres major version") &&
    smokeReportTemplate.includes("Data API / GraphQL table exposure used") &&
    smokeReportTemplate.includes("Postgres 14"),
  smokeReportTemplatePath
);
record(
  "SUPA-CURRENT-010 runbook includes current-change pre-approval check",
  runbook.includes("qc:supabase-current-change-impact") && runbook.includes("Target Postgres major version"),
  runbookPath
);
record(
  "SUPA-CURRENT-011 dev_task exposes current-change audit as local evidence",
  devTaskRecordsCurrentChangeAudit(devTask),
  devTaskPath
);
record(
  "SUPA-CURRENT-012 README references current-change audit workflow",
  readme.includes(auditPath) && readme.includes("qc:supabase-current-change-impact"),
  readmePath
);
record(
  "SUPA-CURRENT-013 local readiness gate includes current-change evidence",
  localReadiness.includes(auditPath) && localReadiness.includes("qc:supabase-current-change-impact"),
  localReadinessPath
);
record(
  "SUPA-CURRENT-014 linked docs do not contain live secrets",
  !hasLiveSecret(`${audit}\n${devTask}\n${gatePlan}\n${approvalPackage}\n${runbook}\n${smokeReportTemplate}\n${readme}`),
  "current-change audit + linked docs"
);
record(
  "SUPA-CURRENT-015 QC script is static and local-only",
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
