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
    /password[=:]\s*["']?[^<\s"']{12,}/iu,
    /pdm_session=[^<\s;]+/iu
  ].some((pattern) => pattern.test(value));
}

const planPath = ".ai-doc/qa/qa-supabase-runtime-provider-gate-validation-plan-2026-06-16.md";
const devTaskPath = ".ai-doc/dev_task.md";
const packageJson = JSON.parse(read("package.json"));
const plan = exists(planPath) ? read(planPath) : "";
const devTask = exists(devTaskPath) ? read(devTaskPath) : "";

record(
  "SUPA-GATE-001 package script is registered",
  packageJson.scripts?.["qc:supabase-runtime-gate-plan"] === "node scripts/qc-supabase-runtime-gate-plan.mjs",
  "package.json"
);
record("SUPA-GATE-002 runtime gate QA plan exists", exists(planPath), planPath);
record("SUPA-GATE-003 dev_task references runtime gate QA plan", devTask.includes(planPath), devTaskPath);
record(
  "SUPA-GATE-004 GATE-A remains preparation and GATE-B is passed for staging",
  includesAll(devTask, [
    "`DEV-SUPABASE-DB-001-GATE-A` | Done for preparation",
    "`DEV-SUPABASE-DB-001-GATE-B`",
    "Staging GATE-B passed for `AI_PDM_STAGING`"
  ]),
  devTaskPath
);
record(
  "SUPA-GATE-005 plan preserves approval, staging, rollback, security, and no-go sections",
  includesAll(plan, [
    "## 4. Approval Preconditions",
    "## 5. Staging Smoke Scope After Approval",
    "## 6. Post-Approval Command Sequence",
    "## 7. Rollback Proof",
    "## 9. Security Gates",
    "## 10. Go / No-Go Criteria"
  ]),
  planPath
);
record(
  "SUPA-GATE-006 plan locks target and server-side env boundary",
  includesAll(plan, [
    "AI_PDM_STAGING",
    "PDM_POSTGRES_URL",
    "PDM_POSTGRES_SHADOW_URL",
    "PDM_SUPABASE_TARGET_NAME=AI_PDM_STAGING",
    "PDM_DB_PROVIDER = \"postgres\""
  ]),
  planPath
);
record(
  "SUPA-GATE-007 plan and dev_task deny production/cost/secret expansion",
  includesAll(`${plan}\n${devTask}`, [
    "Production target setup or production cutover",
    "Cost-incurring actions",
    "No repository file contains runtime secrets",
    "Service role, secret keys, database passwords, and pooler URLs must never be exposed through `NEXT_PUBLIC_*`."
  ]),
  "plan + dev_task"
);
record(
  "SUPA-GATE-008 dev_task exposes current required next task",
  includesAll(devTask, [
    "`DEV-SUPABASE-DB-001-DATA-PARITY`",
    "`DEV-SUPABASE-DB-001-PROD-GATE`",
    "production/cutover remains unapproved and deferred"
  ]),
  devTaskPath
);
record(
  "SUPA-GATE-009 plan and dev_task do not contain live secrets",
  !hasLiveSecret(`${plan}\n${devTask}`),
  "plan + dev_task"
);

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), total: results.length, passed: results.length - failed.length, failed: failed.length, results }, null, 2));

process.exitCode = failed.length === 0 ? 0 : 1;
