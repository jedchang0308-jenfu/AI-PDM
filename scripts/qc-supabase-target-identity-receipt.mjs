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
    /password[=:]\s*["']?[^<\s"']{12,}/iu,
    /pdm_session=[^<\s;]+/iu
  ].some((pattern) => pattern.test(value));
}

const receiptPath = ".ai-doc/reports/qc/qc-supabase-target-identity-receipt-template-2026-06-16.md";
const filledReceiptPath = ".ai-doc/reports/qc/qc-supabase-target-identity-receipt-2026-06-17.md";
const devTaskPath = ".ai-doc/dev_task.md";
const packageJson = readProjectJson(root, "package.json");
const receipt = exists(receiptPath) ? read(receiptPath) : "";
const filledReceipt = exists(filledReceiptPath) ? read(filledReceiptPath) : "";
const devTask = exists(devTaskPath) ? read(devTaskPath) : "";
const scriptSource = read("scripts/qc-supabase-target-identity-receipt.mjs");

record(
  "SUPA-RECEIPT-001 package script is registered",
  packageJson.scripts?.["qc:supabase-target-identity-receipt"] === "node scripts/qc-supabase-target-identity-receipt.mjs",
  "package.json"
);
record("SUPA-RECEIPT-002 target identity receipt template exists", exists(receiptPath), receiptPath);
record("SUPA-RECEIPT-003 user-provided target identity receipt exists", exists(filledReceiptPath), filledReceiptPath);
record(
  "SUPA-RECEIPT-004 template keeps target, exposure, credential, and migration boundaries",
  includesAll(receipt, [
    "PDM_SUPABASE_TARGET_NAME",
    "AI_PDM_STAGING",
    "Target Postgres major version",
    "Data API / GraphQL table exposure used by GATE-B",
    "Secret values redacted",
    "supabase migration list"
  ]),
  receiptPath
);
record(
  "SUPA-RECEIPT-005 filled receipt records approved staging identity",
  includesAll(filledReceipt, [
    "`PDM_SUPABASE_TARGET_NAME` | `AI_PDM_STAGING` | `AI_PDM_STAGING`",
    "Supabase project ref | staging ref | `qerabudthnnpqvybpcsq`",
    "Organization | approved org | `Jenfu Machinery` / `ydxbtstvlunmpjdlrhml`",
    "Region | approved region | `ap-northeast-1`",
    "User confirmation | not production, not `ProJED`, not `ProJED_TEST` | yes",
    "Target Postgres major version | not Postgres 14 after 2026-07-01 unless PM explicitly accepts risk | `17`"
  ]),
  filledReceiptPath
);
record(
  "SUPA-RECEIPT-006 filled receipt records passed guard/schema and migration evidence",
  includesAll(filledReceipt, [
    "PASS; `targetIdentity.safe=true`, `safe=true`, `mode=ai_pdm_shadow_schema`",
    "PASS; `postgresTables=64`, `rlsMissingTables=[]`, `mismatches=[]`",
    "list_migrations` returned `20260615040619_harden_set_updated_at_search_path`"
  ]),
  filledReceiptPath
);
record(
  "SUPA-RECEIPT-007 filled receipt records permission repair, rule seed, smoke pass, and cleanup",
  includesAll(filledReceipt, [
    "Final result: `pass`",
    "Permission seed repair | PASS",
    "First protected smoke API after repair | PASS",
    "Minimal rule seed repair | PASS",
    "Write smoke API | PASS",
    "Smoke cleanup API | PASS",
    "active smoke roots `0`, active smoke parts `0`",
    "This receipt does not approve production cutover"
  ]),
  filledReceiptPath
);
record(
  "SUPA-RECEIPT-008 dev_task exposes receipt and current state",
  devTask.includes(receiptPath) &&
    devTask.includes(filledReceiptPath) &&
    devTask.includes("qc:supabase-target-identity-receipt") &&
    devTask.includes("Staging GATE-B passed for `AI_PDM_STAGING`"),
  devTaskPath
);
record(
  "SUPA-RECEIPT-009 receipt and dev_task do not contain live secrets",
  !hasLiveSecret(`${receipt}\n${filledReceipt}\n${devTask}`),
  "receipt + dev_task"
);
record(
  "SUPA-RECEIPT-010 QC script is static and local-only",
  !/from\s+["']pg["']/u.test(scriptSource) &&
    !/fetch\s*\(/u.test(scriptSource) &&
    !/createClient\s*\(/u.test(scriptSource) &&
    !/spawnSync\s*\(/u.test(scriptSource),
  "scripts/qc-supabase-target-identity-receipt.mjs"
);

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), total: results.length, passed: results.length - failed.length, failed: failed.length, results }, null, 2));

process.exitCode = failed.length === 0 ? 0 : 1;
