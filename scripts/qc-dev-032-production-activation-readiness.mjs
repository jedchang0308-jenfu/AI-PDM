#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const reportPath = path.join(root, "output", "dev-032-production-activation-readiness", "report.json");
const livePath = path.join(root, "output", "dev-032-production-live-readback", "report.json");
const secretExposurePath = path.join(root, "output", "dev-032-production-auth-activation", "secret-exposure-review.json");
const sanitizedReadbackPath = path.join(root, "output", "dev-032-production-auth-activation", "provider-readback-sanitized.json");
const gateEPath = path.join(root, "output", "dev-032-gate-e-automation", "gate-e-automation-readback.json");
const gateEHumanPath = path.join(root, "output", "dev-032-gate-e-automation", "human-work-package.json");
const gateEClosurePath = path.join(root, "output", "dev-032-gate-e-closure", "report.json");
const generatorPath = path.join(root, "scripts", "generate-dev-032-production-activation-readiness.mjs");
const capturePath = path.join(root, "scripts", "capture-dev-032-production-live-readback.mjs");
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
}

const reportExists = existsSync(reportPath);
const liveExists = existsSync(livePath);
const secretExposureExists = existsSync(secretExposurePath);
const sanitizedReadbackExists = existsSync(sanitizedReadbackPath);
const gateEExists = existsSync(gateEPath);
const gateEHumanExists = existsSync(gateEHumanPath);
const gateEClosureExists = existsSync(gateEClosurePath);
const report = reportExists ? JSON.parse(readFileSync(reportPath, "utf8")) : null;
const live = liveExists ? JSON.parse(readFileSync(livePath, "utf8")) : null;
const secretExposure = secretExposureExists ? JSON.parse(readFileSync(secretExposurePath, "utf8")) : null;
const sanitizedReadback = sanitizedReadbackExists ? JSON.parse(readFileSync(sanitizedReadbackPath, "utf8")) : null;
const gateE = gateEExists ? JSON.parse(readFileSync(gateEPath, "utf8")) : null;
const gateEHuman = gateEHumanExists ? JSON.parse(readFileSync(gateEHumanPath, "utf8")) : null;
const gateEClosure = gateEClosureExists ? JSON.parse(readFileSync(gateEClosurePath, "utf8")) : null;
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
const provider = gateMap.get("A2-provider-and-env-readback") ?? {};
const wave0NamedUsers = Array.isArray(wave0.evidence?.namedUsers) ? wave0.evidence.namedUsers : [];
const wave0NamedUserSet = new Set(wave0NamedUsers);
const wave0NamedUsersExplicit =
  wave0NamedUsers.length === wave0.evidence?.namedUserCount &&
  wave0NamedUserSet.size === wave0NamedUsers.length &&
  wave0NamedUsers.length >= 3 &&
  wave0NamedUsers.length <= wave0.evidence?.maximumNamedUsers &&
  wave0NamedUsers.includes("jedchang0308@jenfu.com.tw") &&
  wave0NamedUsers.includes("dani@jenfu.com.tw") &&
  wave0NamedUsers.includes("info@jenfu.com.tw") &&
  wave0NamedUsers.every((email) => typeof email === "string" && /^[a-z0-9._%+-]+@jenfu\.com\.tw$/u.test(email));

record("DEV032-ACT-READY-001 report exists and identifies the evidence-driven schema", reportExists && report?.schemaVersion === 2 && report?.dev === "DEV-032");
record("DEV032-ACT-READY-002 generation is read-only while prior production actions are represented", report?.generationReadOnly === true && report?.productionActionPerformed === true && report?.releaseReady === true);
record("DEV032-ACT-READY-003 target is the dedicated Firebase Hosting production target", report?.target?.projectId === "jenfu-ai-pdm-prod" && report?.target?.runtimeService === "ai-pdm-prod" && report?.target?.cloudSqlInstance === "ai-pdm-prod-postgres" && report?.target?.canonicalBaseUrl === "https://jenfu-ai-pdm-prod.web.app");
record("DEV032-ACT-READY-004 live readback exists, is read-only and passed", liveExists && live?.readOnlyCapture === true && live?.productionMutationPerformed === false && live?.allChecksPassed === true && Array.isArray(live?.failed) && live.failed.length === 0);
record("DEV032-ACT-READY-005 machine-verifiable gates A0-A7 pass after provider secret rotation closure", provider.status === "passed" && passedMachineGates.every((id) => gateMap.get(id)?.status === "passed"), JSON.stringify(passedMachineGates.map((id) => [id, gateMap.get(id)?.status])));
record("DEV032-ACT-READY-006 all activation gates are closed", report?.status === "release_ready" && report?.gateSummary?.firstBlockedGate === null && report?.gateSummary?.blocked === 0 && report?.gateSummary?.missingEvidence === 0 && report?.gateSummary?.pendingHuman === 0 && report?.gateSummary?.passed === 10);
record("DEV032-ACT-READY-006B provider secret exposure review is resolved by rotation plus sanitized readback", secretExposure?.requiredResolution?.status === "resolved" && secretExposure.requiredResolution?.resolutionType === "human_confirmed_secret_rotation_plus_sanitized_readback" && sanitizedReadback?.assertions?.noSecretFieldsReturned === true && sanitizedReadback?.google?.clientSecretRead === false);
record("DEV032-ACT-READY-007 Level 3 evidence is exact and current", level3.passed === 13 && level3.failed === 0 && level3.revision === "ai-pdm-prod-gh-6dc24ebe-29516917660" && level3.sourceRevision === "6dc24ebe1c1fcca9da9ff06c66996f6754652057" && level3.manifestDigest === "sha256:469df95bd6aa5b6a473f0a7fe4dcf986da44765eceac5afbd7ea1f83ecdd6079" && level3.runtimeDigest === "sha256:469df95bd6aa5b6a473f0a7fe4dcf986da44765eceac5afbd7ea1f83ecdd6079");
record("DEV032-ACT-READY-008 authenticated Level 4 has concrete current-release UI evidence", level4.status === "passed" && level4.evidence?.productionDeploymentObserved === true && level4.evidence?.unauthenticatedProductionChecksPassed === true && level4.evidence?.authenticatedLevel4Status === "passed" && level4.evidence?.level4Failed === 0 && level4.evidence?.uiAcceptanceResult?.partNumber === "A0001-P01" && level4.evidence?.uiAcceptanceResult?.seriesCode === "DEV032-HF" && level4.evidence?.canonicalSmokePath === "output/dev-032-current-release/ci-6dc24ebe-29516917660/canonical-smoke.json" && (level4.blockers ?? []).length === 0);
record("DEV032-ACT-READY-009 Wave 0 and product-owner GO are closed", wave0.status === "passed" && wave0.evidence?.minimumNamedUsers === 3 && wave0.evidence?.maximumNamedUsers === 5 && wave0NamedUsersExplicit && wave0.evidence?.humanAcceptanceStatus === "passed" && wave0.evidence?.nonAllowlistNegativeAccessStatus === "passed" && wave0.evidence?.nonAllowlistNegativeAccessAccount === "nokai520@gmail.com" && wave0.evidence?.openP0P1Count === 0 && wave0.evidence?.productOwnerDecision === "go" && wave0.evidence?.fixedFiveBusinessDayObservationCancelled === true);
record("DEV032-ACT-READY-009B Gate E machine and human closure evidence are complete", gateE?.status === "machine_gate_e_passed_release_closure_complete" && gateE?.summary?.machineChecksPassed === true && gateE?.summary?.failed === 0 && gateE?.summary?.requiresHumanClosure === false && gateEClosureExists && gateEClosure?.wave0?.namedUserCount === 3 && gateEClosure?.nonAllowlistNegativeAccess?.sessionExchangeStatus === 403 && gateEClosure?.productOwnerDecision === "go" && gateEClosure?.remainingHumanInputs?.length === 0 && gateEHuman?.requiredHumanInputs?.length === 0 && wave0.evidence?.gateEMachineChecksPassed === true && wave0.evidence?.gateEAutomationEvidencePath === "output/dev-032-gate-e-automation/gate-e-automation-readback.json" && wave0.evidence?.humanWorkPackagePath === "output/dev-032-gate-e-automation/human-work-package.md");
record("DEV032-ACT-READY-010 next action is final evidence preservation only", report?.nextRequiredAction === "Record final release closure and preserve the evidence package." && !/terraform\s+apply|Google account chooser|GO or NO-GO|3-5 explicitly named/iu.test(report.nextRequiredAction));
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
