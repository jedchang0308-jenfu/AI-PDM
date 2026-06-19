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

const policyPath = ".ai-doc/decisions/ADR-SUPABASE-DB-002-migration-history-policy.md";
const devTaskPath = ".ai-doc/dev_task.md";
const gatePlanPath = ".ai-doc/qa/qa-supabase-runtime-provider-gate-validation-plan-2026-06-16.md";
const readmePath = "supabase/README.md";

const packageJson = JSON.parse(read("package.json"));
const policy = exists(policyPath) ? read(policyPath) : "";
const devTask = exists(devTaskPath) ? read(devTaskPath) : "";
const gatePlan = exists(gatePlanPath) ? read(gatePlanPath) : "";
const readme = exists(readmePath) ? read(readmePath) : "";

record(
  "SUPA-HISTORY-001 package script is registered",
  packageJson.scripts?.["qc:supabase-migration-history-policy"] ===
    "node scripts/qc-supabase-migration-history-policy.mjs",
  "package.json"
);
record("SUPA-HISTORY-002 policy file exists", exists(policyPath), policyPath);
record(
  "SUPA-HISTORY-003 policy identifies the raw psql staging exception",
  includesAll(policy, ["raw `psql -f`", "staging-only exception", "partial history"]),
  policyPath
);
record(
  "SUPA-HISTORY-004 policy requires official migration history evidence",
  includesAll(policy, [
    "supabase migration list",
    "Supabase MCP",
    "supabase_migrations.schema_migrations",
    "supabase migration repair --status applied"
  ]),
  policyPath
);
record(
  "SUPA-HISTORY-005 policy forbids unsafe repair",
  includesAll(policy, [
    "Never use migration repair to hide",
    "Target identity is missing",
    "ProJED",
    "ProJED_TEST",
    "do not repair history"
  ]),
  policyPath
);
record(
  "SUPA-HISTORY-006 policy requires parity and secret checks before repair",
  includesAll(policy, [
    "db:postgres:compare:schema-rls -- --no-write",
    "qc:supabase-runtime-migrations",
    "qc:supabase-secret-boundary",
    "source SHA"
  ]),
  policyPath
);
record(
  "SUPA-HISTORY-007 dev_task records policy as controlled evidence",
  devTask.includes(policyPath) &&
    devTask.includes("Migration history policy accepted") &&
    devTask.includes("qc:supabase-migration-history-policy"),
  devTaskPath
);
record(
  "SUPA-HISTORY-008 runtime gate plan references policy",
  gatePlan.includes(policyPath) &&
    gatePlan.includes("Migration History Policy") &&
    gatePlan.includes("qc:supabase-migration-history-policy"),
  gatePlanPath
);
record(
  "SUPA-HISTORY-009 Supabase README documents policy boundary",
  readme.includes(policyPath) &&
    readme.includes("Migration History Policy") &&
    readme.includes("supabase migration repair --status applied"),
  readmePath
);
record(
  "SUPA-HISTORY-010 policy and linked control docs do not contain live secrets",
  !hasLiveSecret(`${policy}\n${devTask}\n${gatePlan}\n${readme}`),
  "policy + dev_task + gate plan + README"
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
