#!/usr/bin/env node

import { runProductionReadinessReport } from "./qc-production-readiness-report-runner.mjs";

const root = process.cwd();
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

const { run: reportRun, report } = runProductionReadinessReport(root);
const productionBlocker = report?.blockers?.find((blocker) => blocker.task.includes("DEV-PDM-ERP-GOOGLE-CLOUDSQL-001"));
const supabaseBlocker = report?.blockers?.find((blocker) => blocker.category === "external_supabase_shadow" || blocker.task.includes("DEV-IND-007"));

record("PR-IND-001 readiness report exits 0 in allow-open mode", reportRun.status === 0, reportRun.status === 0 ? "exit 0" : reportRun.stderr || reportRun.stdout);
record("PR-IND-002 readiness report parses as JSON", Boolean(report), report ? "parsed" : reportRun.stdout);
record(
  "PR-IND-003 current external blocker board is included in tracked tasks",
  Number(report?.summary?.trackedTasks ?? 0) >= 3,
  String(report?.summary?.trackedTasks ?? "")
);
record("PR-IND-004 closed GCP production release gate is not reported as a blocker", !productionBlocker, JSON.stringify(report?.blockers ?? []));
record("PR-IND-005 production readiness is true after first-version release closure", report?.ready === true, String(report?.ready));
record(
  "PR-IND-006 retired Supabase shadow work is not a release blocker",
  !supabaseBlocker,
  JSON.stringify({ blocker: supabaseBlocker ?? null, evidenceReady: report?.summary?.supabaseShadowEvidenceReady })
);
record("PR-IND-007 no first-version production blocker remains", Number(report?.summary?.blockers ?? 0) === 0, String(report?.summary?.blockers ?? ""));

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exitCode = 1;
