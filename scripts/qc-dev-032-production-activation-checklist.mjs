#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const results = [];

function read(relativePath) {
  return readFileSync(path.join(root, ...relativePath.split("/")), "utf8");
}

function json(relativePath) {
  return JSON.parse(read(relativePath));
}

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
}

const checklist = json("config/platform/production-activation-checklist.template.json");
const productionTarget = json("config/platform/production-target.template.json");
const cleanSeed = json("config/platform/clean-production-seed.template.json");
const runbook = read(".ai-doc/runbooks/runbook-dev-032-production-activation-2026-07-15.md");
const restoreRunbook = read(".ai-doc/runbooks/runbook-dev-032-production-canary-restore-reconciliation-2026-07-15.md");
const iacReadme = read("infra/google-cloud/production/README.md");
const packageJson = json("package.json");

const approvals = checklist.approvalBoundaries ?? [];
const sequence = checklist.activationSequence ?? [];
const shortcutText = (checklist.prohibitedShortcuts ?? []).join("\n");
const stopText = (checklist.stopConditions ?? []).join("\n");

function hasSequence(id) {
  return sequence.some((item) => item.id === id);
}

function approval(id) {
  return approvals.find((item) => item.id === id) ?? {};
}

record("DEV032-ACTIVATION-001 checklist identifies DEV-032 production activation", checklist.schemaVersion === 1 && checklist.dev === "DEV-032" && checklist.phase === "DEV-046-Phase-3A.0-production-activation");
record("DEV032-ACTIVATION-002 checklist is template-only and grants no production action", checklist.templateOnly === true && checklist.releaseReady === false && checklist.productionActionAllowed === false);
record("DEV032-ACTIVATION-003 target matches production target contract", checklist.target?.projectId === productionTarget.target?.projectId && checklist.target?.runtimeService === productionTarget.target?.runtimeService && checklist.target?.cloudSqlInstance === productionTarget.target?.cloudSqlInstance && checklist.target?.publicBaseUrl === productionTarget.target?.publicBaseUrl);
record("DEV032-ACTIVATION-004 cost gate preserves USD 300 cap and USD 240 plan stop", checklist.costGate?.monthlyBudgetCapUsd === 300 && checklist.costGate?.credentialledPlanReviewStopUsd === 240 && checklist.costGate?.stopOnAnyDeleteAction === true && checklist.costGate?.stopOnAnyReplaceAction === true);
record("DEV032-ACTIVATION-005 plan approval does not authorize apply or deploy", approval("credentialled-plan-review").separateApprovalRequired === true && (approval("credentialled-plan-review").approvalDoesNotAuthorize ?? []).includes("terraform-apply") && (approval("credentialled-plan-review").approvalDoesNotAuthorize ?? []).includes("deploy"));
record("DEV032-ACTIVATION-006 apply gate requires exact acknowledgement and stop rules", approval("production-resource-apply").acknowledgement === "DEV-032-PRODUCTION-RESOURCE-CREATION-APPROVED" && (approval("production-resource-apply").mustStopIf ?? []).includes("plan-has-delete") && (approval("production-resource-apply").mustStopIf ?? []).includes("monthly-estimate-above-240-usd"));
record("DEV032-ACTIVATION-007 data gates require separate bootstrap and live migration approval", approval("production-admin-bootstrap").separateApprovalRequired === true && approval("production-live-migration").separateApprovalRequired === true && (approval("production-admin-bootstrap").mustStopIf ?? []).includes("source-row-inclusion") && (approval("production-live-migration").mustStopIf ?? []).includes("backup-missing"));
record("DEV032-ACTIVATION-008 deployment gate requires Level 3, provenance and rollback", approval("production-deploy").separateApprovalRequired === true && ["level3-smoke-missing", "artifact-provenance-missing", "rollback-readiness-missing"].every((item) => (approval("production-deploy").mustStopIf ?? []).includes(item)));
record("DEV032-ACTIVATION-009 activation sequence covers source, target, env, plan, apply, seed, restore, smoke and go/no-go", ["A0-release-source", "A1-production-target-readback", "A2-provider-and-env-readback", "A3-credentialled-terraform-plan-review", "A4-production-resource-apply", "A5-clean-seed-and-principal-bootstrap", "A6-hd84-restore-reconciliation", "A7-level3-production-like-smoke", "A8-production-deploy-and-level4-smoke", "A9-wave0-go-no-go"].every(hasSequence));
record("DEV032-ACTIVATION-010 all write actions remain missing evidence", sequence.filter((item) => item.mode.includes("separate-approval") || item.mode === "deploy-separate-approval").every((item) => item.status === "missing_evidence"));
record("DEV032-ACTIVATION-011 clean seed stays template-only and forbids source rows", cleanSeed.fixtureOnly === true && cleanSeed.releaseReady === false && cleanSeed.releaseGate?.productionMutationAllowed === false && cleanSeed.excludedRows?.businessRows?.length === 0 && cleanSeed.sameEmailAutoLinkAllowed === false);
record("DEV032-ACTIVATION-012 checklist prohibits staging shortcuts, GCS Phase 3A and DEV-047 scope creep", shortcutText.includes("Firebase Hosting web.app") && shortcutText.includes("staging project") && shortcutText.includes("GCS file authority") && shortcutText.includes("DEV-047"));
record("DEV032-ACTIVATION-013 stop conditions include secret safety, source cleanliness, cost and smoke", stopText.includes("USD 240") && stopText.includes("secret value") && stopText.includes("source business") && stopText.includes("Level 4 post-deploy smoke"));
record("DEV032-ACTIVATION-014 runbook is handoff-only and requires separate approvals", runbook.includes("not an approval") && runbook.includes("separate explicit authorization") && runbook.includes("does not authorize production apply") && runbook.includes("does not start DEV-047"));
record("DEV032-ACTIVATION-015 runbook and restore runbook both require HD-8-4 separate isolated restore", runbook.includes("HD-8-4 / 1A") && runbook.includes("separate isolated target") && restoreRunbook.includes("separate isolated"));
record("DEV032-ACTIVATION-016 IaC README still treats plan as non-approval", iacReadme.includes("A plan file is not an apply approval.") && iacReadme.includes("After explicit release-gate approval"));
record("DEV032-ACTIVATION-017 package exposes checklist QC", packageJson.scripts?.["qc:dev-032-production-activation-checklist"] === "node scripts/qc-dev-032-production-activation-checklist.mjs");

for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}

const failures = results.filter((result) => !result.passed);
console.log(`\nDEV-032 production activation checklist QC: ${results.length - failures.length}/${results.length} passed`);
if (failures.length > 0) process.exitCode = 1;
