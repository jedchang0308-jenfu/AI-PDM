#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { projectFileExists, projectPath, readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const results = [];

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

function devTaskPreservesSupabaseGateState(devTask) {
  return includesAll(devTask, [
    "DEV-SUPABASE-DB-001",
    "AI_PDM_STAGING",
    "Production gate"
  ]) &&
    /staging GATE-B (?:remains )?passed/iu.test(devTask) &&
    /production\/cutover remains (?:unapproved and )?deferred/iu.test(devTask);
}

function listApiRouteDbImports() {
  const apiDir = projectPath(root, "src/app/api");
  const matches = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      if (entry.isFile() && entry.name === "route.ts") {
        const relativePath = path.relative(root, fullPath).replaceAll(path.sep, "/");
        if (readProjectFile(root, relativePath).includes("@/lib/db")) matches.push(relativePath);
      }
    }
  }
  if (fs.existsSync(apiDir)) visit(apiDir);
  return matches;
}

const paths = {
  devTask: ".ai-doc/dev_task.md",
  gatePlan: ".ai-doc/qa/qa-supabase-runtime-provider-gate-validation-plan-2026-06-16.md",
  approvalPackage: ".ai-doc/reports/pm/pm-supabase-runtime-gate-b-approval-package-2026-06-16.md",
  smokeReportTemplate: ".ai-doc/reports/qc/qc-supabase-runtime-smoke-report-template-2026-06-16.md",
  smokeReport: ".ai-doc/reports/qc/qc-supabase-runtime-smoke-report-2026-06-16.md",
  runbook: ".ai-doc/runbooks/runbook-supabase-runtime-gate-b-2026-06-16.md",
  smokeApiMatrix: ".ai-doc/qa/qa-supabase-runtime-smoke-api-matrix-2026-06-16.md",
  authSessionBoundary: ".ai-doc/qa/qa-supabase-runtime-smoke-auth-session-boundary-2026-06-16.md",
  targetReceipt: ".ai-doc/reports/qc/qc-supabase-target-identity-receipt-2026-06-17.md",
  currentChangeAudit: ".ai-doc/qa/qa-supabase-current-change-impact-audit-2026-06-16.md",
  rollbackPlan: ".ai-doc/qa/qa-supabase-runtime-rollback-readiness-plan-2026-06-16.md",
  dataPolicy: ".ai-doc/qa/qa-supabase-data-parity-policy-2026-06-16.md",
  readme: "supabase/README.md",
  manifest: "supabase/migrations/manifest.json"
};

const packageJson = readProjectJson(root, "package.json");
const docs = Object.fromEntries(
  Object.entries(paths).map(([key, value]) => [key, projectFileExists(root, value) ? readProjectFile(root, value) : ""])
);
const directRouteImports = listApiRouteDbImports();

record(
  "SUPA-LOCAL-READY-001 package scripts are registered",
  packageJson.scripts?.["qc:supabase-runtime-local-readiness"] === "node scripts/qc-supabase-runtime-local-readiness.mjs" &&
    packageJson.scripts?.["qc:supabase-runtime-gate-b-local-suite"] === "node scripts/qc-supabase-runtime-gate-b-local-suite.mjs" &&
    packageJson.scripts?.["qc:supabase-runtime-smoke-report"] === "node scripts/qc-supabase-runtime-smoke-report.mjs" &&
    packageJson.scripts?.["qc:supabase-runtime-smoke-api-matrix"] ===
      "node scripts/qc-supabase-runtime-smoke-api-matrix.mjs" &&
    packageJson.scripts?.["qc:supabase-runtime-smoke-auth-session-boundary"] ===
      "node scripts/qc-supabase-runtime-smoke-auth-session-boundary.mjs" &&
    packageJson.scripts?.["qc:supabase-current-change-impact"] === "node scripts/qc-supabase-current-change-impact.mjs" &&
    packageJson.scripts?.["qc:supabase-runtime-gate-b-runbook"] ===
      "node scripts/qc-supabase-runtime-gate-b-runbook.mjs" &&
    packageJson.scripts?.["qc:supabase-runtime-smoke-report-template"] ===
      "node scripts/qc-supabase-runtime-smoke-report-template.mjs",
  "package.json"
);
record(
  "SUPA-LOCAL-READY-002 required evidence files exist",
  Object.values(paths).every((filePath) => projectFileExists(root, filePath)),
  Object.values(paths).filter((filePath) => !projectFileExists(root, filePath)).join(", ")
);
record(
  "SUPA-LOCAL-READY-003 dev_task preserves staging pass and deferred production state",
  devTaskPreservesSupabaseGateState(docs.devTask),
  paths.devTask
);
record(
  "SUPA-LOCAL-READY-004 smoke report records full staging smoke pass",
  includesAll(docs.smokeReport, [
    "Status: Passed / full staging app API smoke and cleanup proof captured",
    "`targetIdentity.safe` | `true`",
    "`mismatches` | `[]`",
    "Passed 9/9",
    "`read_path_admin_matrix` | PASS after permission repair",
    "`write_path_numbering_smoke_record` | PASS after rule seed repair",
    "active smoke roots `0` and active smoke parts `0`"
  ]),
  paths.smokeReport
);
record(
  "SUPA-LOCAL-READY-005 target receipt records staging identity and smoke pass",
  includesAll(docs.targetReceipt, [
    "`PDM_SUPABASE_TARGET_NAME` | `AI_PDM_STAGING` | `AI_PDM_STAGING`",
    "Supabase project ref | staging ref | `qerabudthnnpqvybpcsq`",
    "Target Postgres major version",
    "Permission seed repair | PASS",
    "Minimal rule seed repair | PASS",
    "Smoke data cleanup proof | PASS"
  ]),
  paths.targetReceipt
);
record(
  "SUPA-LOCAL-READY-006 runbook/matrix/auth boundary still define controlled smoke",
  includesAll(docs.runbook, ["Live Target Setup", "Runtime Provider Smoke Setup", "Smoke API Sequence", "Cleanup", "Rollback"]) &&
    includesAll(docs.smokeApiMatrix, ["/api/numbering/admin/matrix", "/api/numbering/records", "/api/numbering/records/<rootCode>/obsolete"]) &&
    includesAll(docs.authSessionBoundary, ["POST /api/auth/login", "GET /api/auth/me", "pdm_session"]),
  "runbook + matrix + auth boundary"
);
record(
  "SUPA-LOCAL-READY-007 policy docs preserve rollback/data/secret boundaries",
  includesAll(`${docs.rollbackPlan}\n${docs.dataPolicy}\n${docs.gatePlan}`, [
    "qc:supabase-runtime-rollback-readiness",
    "full_data",
    "Browser-side direct Supabase Data API access",
    "Service role, secret keys, database passwords, and pooler URLs must never be exposed through `NEXT_PUBLIC_*`."
  ]),
  "policy docs"
);
record(
  "SUPA-LOCAL-READY-008 manifest and README remain linked",
  docs.readme.includes("qc:supabase-runtime-local-readiness") &&
    docs.devTask.includes("supabase/migrations/manifest.json") &&
    JSON.parse(docs.manifest).migrations?.length === 3,
  "README + manifest"
);
record(
  "SUPA-LOCAL-READY-009 direct API routes have no sync db imports",
  directRouteImports.length === 0,
  directRouteImports.join(", ")
);
record(
  "SUPA-LOCAL-READY-010 linked docs do not contain live secrets",
  !hasLiveSecret(Object.values(docs).join("\n")),
  "runtime gate docs"
);

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), total: results.length, passed: results.length - failed.length, failed: failed.length, results }, null, 2));

process.exitCode = failed.length === 0 ? 0 : 1;
