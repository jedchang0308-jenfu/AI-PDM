#!/usr/bin/env node

import { projectFileExists, readProjectFile } from "./qc-project-file-utils.mjs";

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

const planPath = ".ai-doc/qa/qa-supabase-gate-b-staging-validation-plan-2026-06-18.md";
const reportPath = ".ai-doc/reports/qc/qc-supabase-gate-b-staging-validation-report-2026-06-18.md";
const smokeReportPath = ".ai-doc/reports/qc/qc-supabase-runtime-smoke-report-2026-06-16.md";
const receiptPath = ".ai-doc/reports/qc/qc-supabase-target-identity-receipt-2026-06-17.md";
const devTaskPath = ".ai-doc/dev_task.md";

const plan = exists(planPath) ? read(planPath) : "";
const report = exists(reportPath) ? read(reportPath) : "";
const smokeReport = exists(smokeReportPath) ? read(smokeReportPath) : "";
const receipt = exists(receiptPath) ? read(receiptPath) : "";
const devTask = exists(devTaskPath) ? read(devTaskPath) : "";
const evidence = `${plan}\n${report}\n${smokeReport}\n${receipt}\n${devTask}`;

record(
  "SUPA-STG-001 validator script exists",
  exists("scripts/qc-supabase-gate-b-staging-validation.mjs"),
  "scripts/qc-supabase-gate-b-staging-validation.mjs"
);
record("SUPA-STG-002 QA plan exists", exists(planPath), planPath);
record("SUPA-STG-003 QC report exists", exists(reportPath), reportPath);
record(
  "SUPA-STG-004 plan locks staging-only boundary",
  includesAll(plan, [
    "Scope: `AI_PDM_STAGING` only",
    "This plan does not authorize production access",
    "Production access.",
    "Direct DB mutation during this validation pass."
  ]),
  planPath
);
record(
  "SUPA-STG-005 report records read-only QC scope",
  includesAll(report, [
    "Scope: `AI_PDM_STAGING` only",
    "QC performed read-only evidence inspection and read-only Supabase connector checks only.",
    "No direct DB mutation during this 2026-06-18 QC validation pass."
  ]),
  reportPath
);
record(
  "SUPA-STG-006 target identity evidence is exact",
  includesAll(report, [
    "Project ref | `qerabudthnnpqvybpcsq`",
    "Project name | `AI_PDM_STAGING`",
    "Organization id | `ydxbtstvlunmpjdlrhml`",
    "Region | `ap-northeast-1`",
    "Status | `ACTIVE_HEALTHY`",
    "Postgres engine | `17`"
  ]),
  reportPath
);
record(
  "SUPA-STG-007 seed and cleanup proof is recorded",
  includesAll(report, [
    "Active `numbering-rule-v1` rows | `1`",
    "Active smoke roots | `0`",
    "Active smoke parts | `0`",
    "Active smoke drawings | `0`",
    "Obsoleted smoke root proof for `AI_PDM_GB_SMOKE_202606170939_JED` | `1`",
    "Obsoleted smoke part proof for `AI_PDM_GB_SMOKE_202606170939_JED part` | `1`"
  ]),
  reportPath
);
record(
  "SUPA-STG-008 permission proof is recorded",
  includesAll(report, [
    "| `pdm_admin` | `43` | `6` |",
    "| `system_admin` | `43` | `6` |",
    "`settings.admin_matrix`",
    "`numbering.duplicate_check`",
    "`numbering.create`",
    "`numbering.search`",
    "`numbering.draft.obsolete`"
  ]),
  reportPath
);
record(
  "SUPA-STG-009 existing smoke report proves app API path",
  includesAll(smokeReport, [
    "Status: Passed / full staging app API smoke and cleanup proof captured",
    "`auth_login` | PASS; HTTP 200",
    "`write_path_numbering_smoke_record` | PASS after rule seed repair; HTTP 201",
    "`cleanup_smoke_record` | PASS; HTTP 200",
    "No production access.",
    "No production cutover."
  ]),
  smokeReportPath
);
record(
  "SUPA-STG-010 target identity receipt proves no production/cutover approval",
  includesAll(receipt, [
    "Approved target | `AI_PDM_STAGING`",
    "User confirmation | not production, not `ProJED`, not `ProJED_TEST` | yes",
    "This receipt does not approve production cutover"
  ]),
  receiptPath
);
record(
  "SUPA-STG-011 dev_task records QA/QC staging validation",
  includesAll(devTask, [
    "QA/QC staging validation passed for `AI_PDM_STAGING`",
    "`DEV-SUPABASE-DB-001-DATA-PARITY`",
    "`DEV-SUPABASE-DB-001-PROD-GATE`"
  ]),
  devTaskPath
);
record(
  "SUPA-STG-012 production/cutover remains denied across evidence",
  includesAll(evidence, [
    "No production access.",
    "No production cutover.",
    "production and cutover remain explicitly unapproved",
    "production/cutover remains unapproved and deferred"
  ]),
  "combined evidence"
);
record(
  "SUPA-STG-013 evidence does not contain live secrets",
  !hasLiveSecret(evidence),
  "combined evidence"
);

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), total: results.length, passed: results.length - failed.length, failed: failed.length, results }, null, 2));

process.exitCode = failed.length === 0 ? 0 : 1;
