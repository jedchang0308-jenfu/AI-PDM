#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const reportPath = path.join(root, "output", "dev-032-production-activation-readiness", "report.json");
const generatorPath = path.join(root, "scripts", "generate-dev-032-production-activation-readiness.mjs");
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
}

const reportExists = existsSync(reportPath);
const report = reportExists ? JSON.parse(readFileSync(reportPath, "utf8")) : null;
const generator = readFileSync(generatorPath, "utf8");
const gates = report?.gates ?? [];
const gateMap = new Map(gates.map((gate) => [gate.id, gate]));
const blockerCodes = new Set(report?.gateSummary?.blockerCodes ?? []);
const reportText = report ? JSON.stringify(report) : "";

record("DEV032-ACT-READY-001 report exists and identifies DEV-032", reportExists && report?.schemaVersion === 1 && report?.dev === "DEV-032");
record("DEV032-ACT-READY-002 report is read-only and grants no production action", report?.readOnly === true && report?.productionActionPerformed === false && report?.releaseReady === false);
record("DEV032-ACT-READY-003 target is dedicated production target", report?.target?.projectId === "jenfu-ai-pdm-prod" && report?.target?.runtimeService === "ai-pdm-prod" && report?.target?.cloudSqlInstance === "ai-pdm-prod-postgres");
record("DEV032-ACT-READY-004 source gate is passed by exact release commit", gateMap.get("A0-release-source")?.status === "passed" && typeof report?.sourceCommit === "string" && /^[a-f0-9]{40}$/u.test(report.sourceCommit));
record("DEV032-ACT-READY-005 first blocker is production target readback", report?.gateSummary?.firstBlockedGate === "A1-production-target-readback" && gateMap.get("A1-production-target-readback")?.status === "blocked");
record("DEV032-ACT-READY-006 production target blockers are surfaced", ["ACTIVE_GCLOUD_PROJECT_IS_NOT_PRODUCTION", "PRODUCTION_PROJECT_UNAVAILABLE", "PRODUCTION_CLOUD_RUN_SERVICE_UNPROVEN", "PRODUCTION_CLOUD_SQL_INSTANCE_UNPROVEN", "PRODUCTION_SECRET_SOURCE_UNPROVEN"].every((code) => blockerCodes.has(code)));
record("DEV032-ACT-READY-007 provider and env gate remains blocked", gateMap.get("A2-provider-and-env-readback")?.status === "blocked" && blockerCodes.has("FIREBASE_CONFIG_NOT_PRODUCTION_READY") && blockerCodes.has("PRODUCTION_ENV_SOURCE_MISSING"));
record("DEV032-ACT-READY-008 credentialled plan/apply/bootstrap/restore/deploy gates remain missing evidence", ["A3-credentialled-terraform-plan-review", "A4-production-resource-apply", "A5-clean-seed-and-principal-bootstrap", "A6-hd84-restore-reconciliation", "A8-production-deploy-and-level4-smoke", "A9-wave0-go-no-go"].every((id) => gateMap.get(id)?.status === "missing_evidence"));
record("DEV032-ACT-READY-009 Level 3 smoke is blocked by missing production runtime/database", gateMap.get("A7-level3-production-like-smoke")?.status === "blocked" && blockerCodes.has("LEVEL3_PRODUCTION_LIKE_SMOKE_MISSING"));
record("DEV032-ACT-READY-010 next action directs production target readback, not apply", typeof report?.nextRequiredAction === "string" && report.nextRequiredAction.includes("jenfu-ai-pdm-prod") && report.nextRequiredAction.includes("preflight:dev-032-production-target") && !report.nextRequiredAction.includes("apply"));
record("DEV032-ACT-READY-011 report does not persist secret values", !/private_key|client_secret|DATABASE_URL|BEGIN PRIVATE KEY|secretValue/u.test(reportText));
record("DEV032-ACT-READY-012 generator does not execute production CLIs", !generator.includes("node:child_process") && !generator.includes("execFileSync") && !generator.includes("spawnSync") && !generator.includes("spawn("));
record("DEV032-ACT-READY-013 package exposes readiness generator and QC", packageJson.scripts?.["dev-032:production-activation-readiness"] === "node scripts/generate-dev-032-production-activation-readiness.mjs" && packageJson.scripts?.["qc:dev-032-production-activation-readiness"] === "node scripts/qc-dev-032-production-activation-readiness.mjs");

for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}

const failures = results.filter((result) => !result.passed);
console.log(`\nDEV-032 production activation readiness QC: ${results.length - failures.length}/${results.length} passed`);
if (failures.length > 0) process.exitCode = 1;
