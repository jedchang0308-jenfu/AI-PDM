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
record("PR-IND-004 GCP production release readiness is reported as the active blocker", Boolean(productionBlocker), productionBlocker ? `line ${productionBlocker.line}` : JSON.stringify(report?.blockers ?? []));
record("PR-IND-005 production blocker uses the release readiness category", productionBlocker?.category === "release_readiness_gate", productionBlocker?.category ?? "");
record(
  "PR-IND-006 retired Supabase shadow work is not a release blocker",
  !supabaseBlocker && report?.summary?.supabaseShadowEvidenceReady === true,
  JSON.stringify({ blocker: supabaseBlocker ?? null, evidenceReady: report?.summary?.supabaseShadowEvidenceReady })
);
record(
  "PR-IND-007 only the current GCP production evidence gate remains blocking",
  Number(report?.summary?.blockers ?? 0) === 1 && report?.blockers?.every((blocker) => blocker.category === "release_readiness_gate"),
  String(report?.summary?.blockers ?? "")
);

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exitCode = 1;
