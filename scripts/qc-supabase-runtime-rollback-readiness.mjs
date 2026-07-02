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

function configured(name) {
  return Boolean(process.env[name]?.trim());
}

function collectPublicSecretEnvNames() {
  return Object.keys(process.env).filter((name) => /NEXT_PUBLIC_.*(?:POSTGRES|SERVICE_ROLE|SECRET|PASSWORD|TOKEN)/iu.test(name));
}

function hasLiveSecret(value) {
  return [
    /postgres(?:ql)?:\/\/(?!<)/iu,
    /sb_secret_[a-z0-9_-]{12,}/iu,
    /service_role[=:]\s*["']?[a-z0-9._-]{20,}/iu,
    /password[=:]\s*["']?[^<\s"']{12,}/iu
  ].some((pattern) => pattern.test(value));
}

const planPath = ".ai-doc/qa/qa-supabase-runtime-rollback-readiness-plan-2026-06-16.md";
const gatePlanPath = ".ai-doc/qa/qa-supabase-runtime-provider-gate-validation-plan-2026-06-16.md";
const devTaskPath = ".ai-doc/dev_task.md";
const scriptPath = "scripts/qc-supabase-runtime-rollback-readiness.mjs";

const packageJson = readProjectJson(root, "package.json");
const plan = projectFileExists(root, planPath) ? readProjectFile(root, planPath) : "";
const gatePlan = projectFileExists(root, gatePlanPath) ? readProjectFile(root, gatePlanPath) : "";
const devTask = projectFileExists(root, devTaskPath) ? readProjectFile(root, devTaskPath) : "";
const scriptSource = readProjectFile(root, scriptPath);

const provider = process.env.PDM_DB_PROVIDER?.trim() ?? "";
const publicSecretEnvNames = collectPublicSecretEnvNames();
const hazards = [];

if (provider && provider !== "sqlite") {
  hazards.push(`Rollback readiness requires PDM_DB_PROVIDER to be unset or sqlite; current value is ${provider}.`);
}
if (configured("PDM_POSTGRES_URL")) {
  hazards.push("Rollback readiness requires PDM_POSTGRES_URL to be absent from the checked runtime process.");
}
if (publicSecretEnvNames.length > 0) {
  hazards.push(`Public secret-like environment variables are configured: ${publicSecretEnvNames.join(", ")}`);
}

record(
  "SUPA-ROLLBACK-001 package script is registered",
  packageJson.scripts?.["qc:supabase-runtime-rollback-readiness"] ===
    "node scripts/qc-supabase-runtime-rollback-readiness.mjs",
  "package.json"
);
record("SUPA-ROLLBACK-002 rollback readiness plan exists", projectFileExists(root, planPath), planPath);
record(
  "SUPA-ROLLBACK-003 plan defines SQLite fallback rollback target",
  includesAll(plan, ["SQLite runtime mode", "PDM_DB_PROVIDER", "PDM_POSTGRES_URL", "fresh SQLite-mode app process"]),
  planPath
);
record(
  "SUPA-ROLLBACK-004 plan requires provider and secret checks after rollback",
  includesAll(plan, ["qc:db-provider-contract", "qc:supabase-secret-boundary", "qc:supabase-runtime-rollback-readiness"]),
  planPath
);
record(
  "SUPA-ROLLBACK-005 plan requires process restart and smoke cleanup evidence",
  includesAll(plan, ["Postgres-mode app process stopped", "Smoke-created staging records", "Do not reuse the same process"]),
  planPath
);
record(
  "SUPA-ROLLBACK-006 runtime gate plan references rollback readiness QC",
  gatePlan.includes(planPath) && gatePlan.includes("qc:supabase-runtime-rollback-readiness"),
  gatePlanPath
);
record(
  "SUPA-ROLLBACK-007 dev_task records rollback readiness as controlled evidence",
  devTask.includes(planPath) &&
    devTask.includes("Rollback readiness prepared") &&
    devTask.includes("qc:supabase-runtime-rollback-readiness"),
  devTaskPath
);
record(
  "SUPA-ROLLBACK-008 current process is rollback-ready SQLite/unset mode",
  hazards.length === 0,
  hazards.join(" ")
);
record(
  "SUPA-ROLLBACK-009 linked control docs do not contain live secrets",
  !hasLiveSecret(`${plan}\n${gatePlan}\n${devTask}`),
  "rollback plan + gate plan + dev_task"
);
record(
  "SUPA-ROLLBACK-010 QC script is local-only",
  !/from\s+["']pg["']/u.test(scriptSource) && !/fetch\s*\(/u.test(scriptSource) && !/createClient\s*\(/u.test(scriptSource),
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
      runtime: {
        PDM_DB_PROVIDER: provider || "<unset>",
        PDM_POSTGRES_URL: configured("PDM_POSTGRES_URL") ? "<configured>" : "<missing>",
        publicSecretEnvNames
      },
      results
    },
    null,
    2
  )
);

process.exitCode = failed.length === 0 ? 0 : 1;
