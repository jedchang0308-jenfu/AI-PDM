#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const reportPath = path.join(root, "output", "dev-032-production-activation-readiness", "report.json");
const livePath = path.join(root, "output", "dev-032-production-live-readback", "report.json");
const generatorPath = path.join(root, "scripts", "generate-dev-032-production-activation-readiness.mjs");
const capturePath = path.join(root, "scripts", "capture-dev-032-production-live-readback.mjs");
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
}

const reportExists = existsSync(reportPath);
const liveExists = existsSync(livePath);
const report = reportExists ? JSON.parse(readFileSync(reportPath, "utf8")) : null;
const live = liveExists ? JSON.parse(readFileSync(livePath, "utf8")) : null;
const generator = readFileSync(generatorPath, "utf8");
const capture = readFileSync(capturePath, "utf8");
const gates = report?.gates ?? [];
const gateMap = new Map(gates.map((gate) => [gate.id, gate]));
const reportText = report ? JSON.stringify(report) : "";
const passedMachineGates = [
  "A0-release-source",
  "A1-production-target-readback",
  "A2-provider-and-env-readback",
  "A3-credentialled-terraform-plan-review",
  "A4-production-resource-apply",
  "A5-clean-seed-and-principal-bootstrap",
  "A6-hd84-restore-reconciliation",
  "A7-level3-production-like-smoke"
];
const level3 = gateMap.get("A7-level3-production-like-smoke")?.evidence ?? {};
const level4 = gateMap.get("A8-production-deploy-and-level4-smoke") ?? {};
const wave0 = gateMap.get("A9-wave0-go-no-go") ?? {};

record("DEV032-ACT-READY-001 report exists and identifies the evidence-driven schema", reportExists && report?.schemaVersion === 2 && report?.dev === "DEV-032");
record("DEV032-ACT-READY-002 generation is read-only while prior production actions are represented", report?.generationReadOnly === true && report?.productionActionPerformed === true && report?.releaseReady === false);
record("DEV032-ACT-READY-003 target is the dedicated Firebase Hosting production target", report?.target?.projectId === "jenfu-ai-pdm-prod" && report?.target?.runtimeService === "ai-pdm-prod" && report?.target?.cloudSqlInstance === "ai-pdm-prod-postgres" && report?.target?.canonicalBaseUrl === "https://jenfu-ai-pdm-prod.web.app");
record("DEV032-ACT-READY-004 live readback exists, is read-only and passed", liveExists && live?.readOnlyCapture === true && live?.productionMutationPerformed === false && live?.allChecksPassed === true && Array.isArray(live?.failed) && live.failed.length === 0);
record("DEV032-ACT-READY-005 machine-verifiable A0-A7 gates pass", passedMachineGates.every((id) => gateMap.get(id)?.status === "passed"), JSON.stringify(passedMachineGates.map((id) => [id, gateMap.get(id)?.status])));
record("DEV032-ACT-READY-006 first incomplete gate is authenticated Level 4", report?.status === "pending_human_activation_readiness" && report?.gateSummary?.firstBlockedGate === "A8-production-deploy-and-level4-smoke" && level4.status === "pending_human" && report?.gateSummary?.blocked === 0 && report?.gateSummary?.missingEvidence === 0);
record("DEV032-ACT-READY-007 Level 3 evidence is exact and current", level3.passed === 14 && level3.failed === 0 && level3.revision === "ai-pdm-prod-00006-lx5" && level3.manifestDigest === "sha256:b4fb8e9ffd45da987cab42241811194b45556e4316bc52cbed04c7d0f768aaa3" && level3.runtimeDigest === "sha256:570dd9f0fb268110d61aea3dd05d70e9e914c131f072a1928269cc10ddd2a779");
record("DEV032-ACT-READY-008 authenticated Level 4 is not inferred from unauthenticated checks", level4.evidence?.productionDeploymentObserved === true && level4.evidence?.unauthenticatedProductionChecksPassed === true && level4.evidence?.authenticatedLevel4Status === "pending_human_google_login" && (level4.blockers ?? []).some((item) => item.code === "AUTHENTICATED_LEVEL4_PENDING"));
record("DEV032-ACT-READY-009 Wave 0 does not guess users or restore the cancelled five-day gate", wave0.status === "pending_human" && wave0.evidence?.minimumNamedUsers === 3 && wave0.evidence?.maximumNamedUsers === 5 && wave0.evidence?.namedUserCount === 1 && wave0.evidence?.namedUsers?.[0] === "jedchang0308@jenfu.com.tw" && wave0.evidence?.fixedFiveBusinessDayObservationCancelled === true);
record("DEV032-ACT-READY-010 next action consolidates human login, named users and go/no-go without apply", report?.nextRequiredAction?.includes("Google account chooser") && report.nextRequiredAction.includes("remaining explicitly named Wave 0 users") && report.nextRequiredAction.includes("go/no-go") && !/terraform\s+apply/iu.test(report.nextRequiredAction));
record("DEV032-ACT-READY-011 report does not persist secret values", !/private_key|client_secret|DATABASE_URL|BEGIN PRIVATE KEY|secretValue/iu.test(reportText));
record("DEV032-ACT-READY-012 readiness generator performs no cloud or production command", !generator.includes("node:child_process") && !generator.includes("execFileSync") && !generator.includes("spawnSync") && !generator.includes("gcloud "));
record("DEV032-ACT-READY-013 live capture is read-only and contains no mutation verb", capture.includes("readOnlyCapture: true") && capture.includes("productionMutationPerformed: false") && !/"run",\s*"jobs",\s*"execute"|terraform\s+apply|sql",\s*"backups",\s*"restore|run",\s*"services",\s*"update/iu.test(capture));
record("DEV032-ACT-READY-014 package exposes capture, readiness and QC commands", packageJson.scripts?.["dev-032:production-live-readback"] === "node scripts/capture-dev-032-production-live-readback.mjs" && packageJson.scripts?.["dev-032:production-activation-readiness"] === "node scripts/generate-dev-032-production-activation-readiness.mjs" && packageJson.scripts?.["qc:dev-032-production-activation-readiness"] === "node scripts/qc-dev-032-production-activation-readiness.mjs");

for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}
const failures = results.filter((result) => !result.passed);
console.log(`\nDEV-032 production activation readiness QC: ${results.length - failures.length}/${results.length} passed`);
if (failures.length > 0) process.exitCode = 1;
