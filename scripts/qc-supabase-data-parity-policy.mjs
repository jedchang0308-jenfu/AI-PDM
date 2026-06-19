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

const policyPath = ".ai-doc/qa/qa-supabase-data-parity-policy-2026-06-16.md";
const gatePlanPath = ".ai-doc/qa/qa-supabase-runtime-provider-gate-validation-plan-2026-06-16.md";
const devTaskPath = ".ai-doc/dev_task.md";
const compareScriptPath = "scripts/compare-sqlite-postgres-shadow.mjs";
const readmePath = "supabase/README.md";
const scriptPath = "scripts/qc-supabase-data-parity-policy.mjs";

const packageJson = JSON.parse(read("package.json"));
const policy = exists(policyPath) ? read(policyPath) : "";
const gatePlan = exists(gatePlanPath) ? read(gatePlanPath) : "";
const devTask = exists(devTaskPath) ? read(devTaskPath) : "";
const compareScript = read(compareScriptPath);
const readme = exists(readmePath) ? read(readmePath) : "";
const scriptSource = read(scriptPath);

record(
  "SUPA-DATA-PARITY-001 package script is registered",
  packageJson.scripts?.["qc:supabase-data-parity-policy"] === "node scripts/qc-supabase-data-parity-policy.mjs",
  "package.json"
);
record("SUPA-DATA-PARITY-002 policy file exists", exists(policyPath), policyPath);
record(
  "SUPA-DATA-PARITY-003 policy defines parity tiers",
  includesAll(policy, ["schema_rls_only", "smoke_seed", "full_data"]),
  policyPath
);
record(
  "SUPA-DATA-PARITY-004 policy allows schema/RLS-only compare without data proof",
  includesAll(policy, [
    "npm.cmd run db:postgres:compare:schema-rls -- --no-write",
    "Does not compare row counts.",
    "Does not compare key hashes.",
    "Does not prove full data migration."
  ]),
  policyPath
);
record(
  "SUPA-DATA-PARITY-005 policy blocks unsafe data classes",
  includesAll(policy, [
    "Production customer data.",
    "CAD files.",
    "Release packages.",
    "Handoff packages.",
    "Field-test artifacts.",
    "QC artifacts",
    "File blobs",
    "Browser-side direct Supabase Data API access"
  ]),
  policyPath
);
record(
  "SUPA-DATA-PARITY-006 policy requires target, credential, source, cleanup, and QC controls",
  includesAll(policy, [
    "AI_PDM_STAGING",
    "PDM_POSTGRES_SHADOW_URL",
    "PDM_SHADOW_SQLITE_PATH",
    "Rollback / cleanup owner assigned.",
    "qc:supabase-data-parity-policy",
    "qc:supabase-secret-boundary"
  ]),
  policyPath
);
record(
  "SUPA-DATA-PARITY-007 policy records current Supabase references",
  includesAll(policy, [
    "https://supabase.com/changelog",
    "https://supabase.com/docs/guides/deployment/branching/troubleshooting",
    "https://supabase.com/docs/guides/deployment/branching/working-with-branches",
    "https://supabase.com/docs/guides/deployment/branching/github-integration",
    "https://supabase.com/docs/guides/database/postgres/row-level-security",
    "https://supabase.com/docs/guides/database/secure-data"
  ]),
  policyPath
);
record(
  "SUPA-DATA-PARITY-008 compare script supports schema-only and data compare mechanics",
  includesAll(compareScript, ["--schema-rls-only", "dataCompareSkipped", "keyHash", "COUNT(*)", "schema_rls_only"]),
  compareScriptPath
);
record(
  "SUPA-DATA-PARITY-009 runtime gate plan references policy and QC",
  gatePlan.includes(policyPath) &&
    gatePlan.includes("Data Parity Policy") &&
    gatePlan.includes("qc:supabase-data-parity-policy"),
  gatePlanPath
);
record(
  "SUPA-DATA-PARITY-010 dev_task records policy as controlled evidence",
  devTask.includes(policyPath) &&
    devTask.includes("Data parity policy prepared") &&
    devTask.includes("qc:supabase-data-parity-policy"),
  devTaskPath
);
record(
  "SUPA-DATA-PARITY-011 Supabase README documents data parity policy boundary",
  readme.includes(policyPath) &&
    readme.includes("Data Parity Policy") &&
    readme.includes("schema_rls_only") &&
    readme.includes("full_data"),
  readmePath
);
record(
  "SUPA-DATA-PARITY-012 policy and linked control docs do not contain live secrets",
  !hasLiveSecret(`${policy}\n${gatePlan}\n${devTask}\n${readme}`),
  "policy + gate plan + dev_task + README"
);
record(
  "SUPA-DATA-PARITY-013 QC script is local-only",
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
