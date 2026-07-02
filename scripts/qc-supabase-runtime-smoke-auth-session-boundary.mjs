#!/usr/bin/env node

import { projectFileExists, readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const results = [];

const boundaryPath = ".ai-doc/qa/qa-supabase-runtime-smoke-auth-session-boundary-2026-06-16.md";
const devTaskPath = ".ai-doc/dev_task.md";
const gatePlanPath = ".ai-doc/qa/qa-supabase-runtime-provider-gate-validation-plan-2026-06-16.md";
const approvalPackagePath = ".ai-doc/reports/pm/pm-supabase-runtime-gate-b-approval-package-2026-06-16.md";
const reportTemplatePath = ".ai-doc/reports/qc/qc-supabase-runtime-smoke-report-template-2026-06-16.md";
const runbookPath = ".ai-doc/runbooks/runbook-supabase-runtime-gate-b-2026-06-16.md";
const smokeApiMatrixPath = ".ai-doc/qa/qa-supabase-runtime-smoke-api-matrix-2026-06-16.md";
const readmePath = "supabase/README.md";
const localReadinessPath = "scripts/qc-supabase-runtime-local-readiness.mjs";
const scriptPath = "scripts/qc-supabase-runtime-smoke-auth-session-boundary.mjs";

const authRoutes = {
  login: "src/app/api/auth/login/route.ts",
  logout: "src/app/api/auth/logout/route.ts",
  me: "src/app/api/auth/me/route.ts"
};

const authLibs = {
  auth: "src/lib/auth.ts",
  authAsync: "src/lib/auth-async.ts",
  authConfig: "src/lib/auth-config.ts",
  numberingGuard: "src/lib/numbering-permission-guard.ts"
};

const smokeRoutes = [
  {
    path: "src/app/api/numbering/admin/matrix/route.ts",
    needles: ["requireNumberingPageAsync(request, \"settings.admin_matrix\")", "requireNumberingActionAsync(request, \"settings.admin_matrix\")", "auth.user.role !== \"Admin\""]
  },
  {
    path: "src/app/api/numbering/rule-simulator/route.ts",
    needles: ["requireNumberingActionAsync(request, \"settings.admin_matrix\")"]
  },
  {
    path: "src/app/api/numbering/duplicate-check/route.ts",
    needles: ["requireNumberingActionAsync(request, \"numbering.duplicate_check\")"]
  },
  {
    path: "src/app/api/numbering/records/route.ts",
    needles: ["requireNumberingActionAsync(request, \"numbering.create\")"]
  },
  {
    path: "src/app/api/numbering/roots/[rootCode]/route.ts",
    needles: ["requireNumberingPageAsync(request, \"numbering.search\")"]
  },
  {
    path: "src/app/api/numbering/records/[rootCode]/obsolete/route.ts",
    needles: ["requireNumberingActionAsync(request, \"numbering.draft.obsolete\")"]
  }
];

const linkedDocs = [
  devTaskPath,
  gatePlanPath,
  approvalPackagePath,
  reportTemplatePath,
  runbookPath,
  smokeApiMatrixPath,
  readmePath,
  localReadinessPath
];

const exists = (relativePath) => projectFileExists(root, relativePath);

const read = (relativePath) => readProjectFile(root, relativePath);

function includesAll(source, needles) {
  return needles.every((needle) => source.includes(needle));
}

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

function hasLiveSecret(value) {
  return [
    /postgres(?:ql)?:\/\/(?!<)/iu,
    /pdm_session=[A-Za-z0-9._-]{12,}/iu,
    /set-cookie:\s*pdm_session=/iu,
    /Authorization:\s*Bearer\s+[A-Za-z0-9._-]{12,}/u,
    /sb_secret_[a-z0-9_-]{12,}/iu,
    /service_role[=:]\s*["']?[a-z0-9._-]{20,}/iu,
    /PDM_AUTH_SECRET\s*=\s*["']?[^<\s"']{8,}/u,
    /password[=:]\s*["']?[^<\s"']{12,}/iu
  ].some((pattern) => pattern.test(value));
}

const packageJson = readProjectJson(root, "package.json");
const boundary = exists(boundaryPath) ? read(boundaryPath) : "";
const scriptSource = read(scriptPath);

record(
  "SUPA-AUTH-BOUNDARY-001 package script is registered",
  packageJson.scripts?.["qc:supabase-runtime-smoke-auth-session-boundary"] ===
    "node scripts/qc-supabase-runtime-smoke-auth-session-boundary.mjs",
  "package.json"
);

record(
  "SUPA-AUTH-BOUNDARY-002 boundary document exists",
  exists(boundaryPath),
  boundaryPath
);

record(
  "SUPA-AUTH-BOUNDARY-003 boundary is local-only and not executed",
  includesAll(boundary, [
    "Boundary only; GATE-B execution not performed",
    "local-only planning artifact",
    "does not approve runtime smoke",
    "does not approve runtime smoke, provider switching"
  ]),
  boundaryPath
);

record(
  "SUPA-AUTH-BOUNDARY-004 boundary defines app session routes and cookie name",
  includesAll(boundary, [
    "POST /api/auth/login",
    "GET /api/auth/me",
    "POST /api/auth/logout",
    "pdm_session",
    "Cookie name: `pdm_session`"
  ]),
  boundaryPath
);

record(
  "SUPA-AUTH-BOUNDARY-005 boundary forbids token and secret evidence",
  includesAll(boundary, [
    "`pdm_session=<value>`",
    "Full `set-cookie` header values",
    "`Authorization: Bearer <value>`",
    "Supabase anon, publishable, service role, or secret key values",
    "`PDM_AUTH_SECRET`, `PDM_POSTGRES_URL`, `PDM_POSTGRES_SHADOW_URL`"
  ]),
  boundaryPath
);

record(
  "SUPA-AUTH-BOUNDARY-006 boundary defines exact required permissions",
  includesAll(boundary, [
    "`settings.admin_matrix` page permission and `Admin` role",
    "`settings.admin_matrix` action permission",
    "`numbering.duplicate_check` action permission",
    "`numbering.create` action permission",
    "`numbering.search` page permission",
    "`numbering.draft.obsolete` action permission"
  ]),
  boundaryPath
);

record(
  "SUPA-AUTH-BOUNDARY-007 auth route handlers exist",
  Object.values(authRoutes).every((routePath) => exists(routePath)),
  Object.values(authRoutes).filter((routePath) => !exists(routePath)).join(", ")
);

const loginRoute = exists(authRoutes.login) ? read(authRoutes.login) : "";
const logoutRoute = exists(authRoutes.logout) ? read(authRoutes.logout) : "";
const meRoute = exists(authRoutes.me) ? read(authRoutes.me) : "";
record(
  "SUPA-AUTH-BOUNDARY-008 auth routes use app session helpers",
  includesAll(loginRoute, ["createSessionCookie", "getUserByEmailWithPasswordAsync"]) &&
    includesAll(logoutRoute, ["createLogoutCookie", "getSessionUserAsync"]) &&
    includesAll(meRoute, ["getSessionUserAsync"]),
  "login + me + logout routes"
);

const authLibSource = Object.values(authLibs).filter(exists).map(read).join("\n");
record(
  "SUPA-AUTH-BOUNDARY-009 auth libraries expose expected app-session boundary",
  includesAll(authLibSource, [
    "const cookieName = \"pdm_session\"",
    "HttpOnly",
    "SameSite=Lax",
    "getSessionUserAsync",
    "requireAuthAsync",
    "requireNumberingPermissionAsync"
  ]),
  "auth + auth-async + numbering guard"
);

const routeFailures = [];
for (const route of smokeRoutes) {
  if (!exists(route.path)) {
    routeFailures.push(`${route.path}: missing`);
    continue;
  }
  const source = read(route.path);
  if (source.includes("@/lib/db")) routeFailures.push(`${route.path}: direct @/lib/db import`);
  for (const needle of route.needles) {
    if (!source.includes(needle)) routeFailures.push(`${route.path}: missing ${needle}`);
  }
}
record(
  "SUPA-AUTH-BOUNDARY-010 smoke routes use app auth and exact permission guards",
  routeFailures.length === 0,
  routeFailures.join("; ")
);

const linkedDocFailures = linkedDocs.filter((docPath) => !exists(docPath) || !read(docPath).includes(boundaryPath) || !read(docPath).includes("qc:supabase-runtime-smoke-auth-session-boundary"));
record(
  "SUPA-AUTH-BOUNDARY-011 linked control docs reference boundary and QC",
  linkedDocFailures.length === 0,
  linkedDocFailures.join(", ")
);

const allLinkedContent = [boundaryPath, ...linkedDocs].filter(exists).map(read).join("\n");
record(
  "SUPA-AUTH-BOUNDARY-012 boundary and linked docs do not contain live secrets",
  !hasLiveSecret(allLinkedContent),
  "boundary + linked docs"
);

record(
  "SUPA-AUTH-BOUNDARY-013 this QC script is static and local-only",
  !/from\s+["']pg["']/u.test(scriptSource) &&
    !/\bfetch\s*\(/u.test(scriptSource) &&
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
