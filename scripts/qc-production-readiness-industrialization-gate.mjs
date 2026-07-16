#!/usr/bin/env node

import { runProductionReadinessReport } from "./qc-production-readiness-report-runner.mjs";

const root = process.cwd();
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

const { run: reportRun, report } = runProductionReadinessReport(root);
const supabaseBlocker = report?.blockers?.find((blocker) => blocker.task.includes("DEV-IND-007"));

record("PR-IND-001 readiness report exits 0 in allow-open mode", reportRun.status === 0, reportRun.status === 0 ? "exit 0" : reportRun.stderr || reportRun.stdout);
record("PR-IND-002 readiness report parses as JSON", Boolean(report), report ? "parsed" : reportRun.stdout);
record(
  "PR-IND-003 current external blocker board is included in tracked tasks",
  Number(report?.summary?.trackedTasks ?? 0) >= 5,
  String(report?.summary?.trackedTasks ?? "")
);
record("PR-IND-004 DEV-IND-007 is reported as a blocker", Boolean(supabaseBlocker), supabaseBlocker ? `line ${supabaseBlocker.line}` : JSON.stringify(report?.blockers ?? []));
record("PR-IND-005 DEV-IND-007 uses Supabase shadow category", supabaseBlocker?.category === "external_supabase_shadow", supabaseBlocker?.category ?? "");
record(
  "PR-IND-006 Supabase shadow evidence remains not ready without disposable target",
  supabaseBlocker?.evidence?.ready === false && supabaseBlocker?.evidence?.issues?.some((issue) => issue.type === "missing_disposable_supabase_target"),
  JSON.stringify(supabaseBlocker?.evidence ?? {})
);
record("PR-IND-007 total blockers include external evidence plus Supabase shadow gate", Number(report?.summary?.blockers ?? 0) >= 5, String(report?.summary?.blockers ?? ""));

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exitCode = 1;
