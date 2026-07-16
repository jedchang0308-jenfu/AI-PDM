#!/usr/bin/env node

import { projectFileExists, readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const results = [];

const read = (relativePath) => readProjectFile(root, relativePath);

const exists = (relativePath) => projectFileExists(root, relativePath);

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

const matrixPath = ".ai-doc/qa/qa-supabase-runtime-smoke-api-matrix-2026-06-16.md";
const devTaskPath = ".ai-doc/dev_task.md";
const gatePlanPath = ".ai-doc/qa/qa-supabase-runtime-provider-gate-validation-plan-2026-06-16.md";
const approvalPackagePath = ".ai-doc/reports/pm/pm-supabase-runtime-gate-b-approval-package-2026-06-16.md";
const reportTemplatePath = ".ai-doc/reports/qc/qc-supabase-runtime-smoke-report-template-2026-06-16.md";
const runbookPath = ".ai-doc/runbooks/runbook-supabase-runtime-gate-b-2026-06-16.md";
const readmePath = "supabase/README.md";
const localReadinessPath = "scripts/qc-supabase-runtime-local-readiness.mjs";
const scriptPath = "scripts/qc-supabase-runtime-smoke-api-matrix.mjs";

const routePaths = [
  "src/app/api/numbering/admin/matrix/route.ts",
  "src/app/api/numbering/rule-simulator/route.ts",
  "src/app/api/numbering/duplicate-check/route.ts",
  "src/app/api/numbering/records/route.ts",
  "src/app/api/numbering/roots/[rootCode]/route.ts",
  "src/app/api/numbering/records/[rootCode]/obsolete/route.ts"
];

const packageJson = readProjectJson(root, "package.json");
const matrix = exists(matrixPath) ? read(matrixPath) : "";
const devTask = exists(devTaskPath) ? read(devTaskPath) : "";
const gatePlan = exists(gatePlanPath) ? read(gatePlanPath) : "";
const approvalPackage = exists(approvalPackagePath) ? read(approvalPackagePath) : "";
const reportTemplate = exists(reportTemplatePath) ? read(reportTemplatePath) : "";
const runbook = exists(runbookPath) ? read(runbookPath) : "";
const readme = exists(readmePath) ? read(readmePath) : "";
const localReadiness = exists(localReadinessPath) ? read(localReadinessPath) : "";
const scriptSource = read(scriptPath);

const routeSources = routePaths.map((routePath) => ({
  routePath,
  source: exists(routePath) ? read(routePath) : ""
}));

record(
  "SUPA-SMOKE-API-001 package script is registered",
  packageJson.scripts?.["qc:supabase-runtime-smoke-api-matrix"] ===
    "node scripts/qc-supabase-runtime-smoke-api-matrix.mjs",
  "package.json"
);
record("SUPA-SMOKE-API-002 matrix document exists", exists(matrixPath), matrixPath);
record(
  "SUPA-SMOKE-API-003 matrix is clearly local-only and not executed",
  includesAll(matrix, [
    "Matrix only; GATE-B execution not performed",
    "It is a local-only planning artifact.",
    "does not approve runtime smoke",
    "production cutover"
  ]),
  matrixPath
);
record(
  "SUPA-SMOKE-API-004 matrix defines exact API steps",
  includesAll(matrix, [
    "read_path_admin_matrix",
    "GET",
    "/api/numbering/admin/matrix",
    "read_path_rule_simulator",
    "POST",
    "/api/numbering/rule-simulator",
    "pre_write_duplicate_guard",
    "/api/numbering/duplicate-check",
    "write_path_numbering_smoke_record",
    "/api/numbering/records",
    "readback_created_record",
    "/api/numbering/roots/<rootCode>",
    "cleanup_smoke_record",
    "/api/numbering/records/<rootCode>/obsolete"
  ]),
  matrixPath
);
record(
  "SUPA-SMOKE-API-005 matrix preserves smoke data and cleanup boundaries",
  includesAll(matrix, [
    "AI_PDM_GB_SMOKE_<YYYYMMDDHHmm>_<operator>",
    "Non-production numbering smoke records only",
    "soft cleanup only",
    "retain with owner, expiry, and reason",
    "Rollback proof"
  ]),
  matrixPath
);
record(
  "SUPA-SMOKE-API-006 matrix forbids direct browser Data API and unsafe data",
  includesAll(matrix, [
    "Browser-side direct Supabase Data API access to base tables",
    "Supabase anon, publishable, service role, or secret key use from browser code",
    "Production customer data",
    "CAD files",
    "release packages",
    "handoff packages",
    "file blobs"
  ]),
  matrixPath
);
record(
  "SUPA-SMOKE-API-007 route handlers exist",
  routePaths.every((routePath) => exists(routePath)),
  routePaths.filter((routePath) => !exists(routePath)).join(", ")
);
record(
  "SUPA-SMOKE-API-008 route handlers use server-side async provider path",
  routeSources.every(({ source }) => source.includes("@/lib/numbering-async") || source.includes("@/lib/numbering-permission-guard")) &&
    routeSources.every(({ source }) => !source.includes("@/lib/db")),
  routeSources.filter(({ source }) => source.includes("@/lib/db")).map(({ routePath }) => routePath).join(", ")
);
record(
  "SUPA-SMOKE-API-009 route handlers expose expected methods",
  routeSources.find((item) => item.routePath.includes("admin/matrix"))?.source.includes("export async function GET") &&
    routeSources.find((item) => item.routePath.includes("rule-simulator"))?.source.includes("export async function POST") &&
    routeSources.find((item) => item.routePath.includes("duplicate-check"))?.source.includes("export async function POST") &&
    routeSources.find((item) => item.routePath.endsWith("numbering/records/route.ts"))?.source.includes("export async function POST") &&
    routeSources.find((item) => item.routePath.includes("roots/[rootCode]"))?.source.includes("export async function GET") &&
    routeSources.find((item) => item.routePath.includes("obsolete"))?.source.includes("export async function POST"),
  "route method exports"
);
record(
  "SUPA-SMOKE-API-010 linked control docs reference matrix and QC",
  [devTask, gatePlan, approvalPackage, reportTemplate, runbook, readme, localReadiness].every((source) =>
    source.includes(matrixPath) && source.includes("qc:supabase-runtime-smoke-api-matrix")
  ),
  "dev_task + gate plan + approval package + report template + runbook + README + local readiness"
);
record(
  "SUPA-SMOKE-API-011 linked docs do not contain live secrets",
  !hasLiveSecret(`${matrix}\n${devTask}\n${gatePlan}\n${approvalPackage}\n${reportTemplate}\n${runbook}\n${readme}`),
  "matrix + linked docs"
);
record(
  "SUPA-SMOKE-API-012 this QC script is static and local-only",
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
