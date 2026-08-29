#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const reportPath = path.join(root, "output", "dev-032-production-activation-readiness", "report.json");
const livePath = path.join(root, "output", "dev-032-production-live-readback", "report.json");
const releasePath = path.join(root, "output", "dev-032-production-slice-activation", "github-f70c8982-release-evidence.json");
const historicalClosurePath = path.join(root, "output", "dev-032-production-activation-readiness", "historical-activation-closure-hotfix-1936e93d.json");
const historicalLevel4Path = path.join(root, "output", "dev-032-production-slice-activation", "hotfix-1936e93d-level4-ui.json");
const configPath = path.join(root, "config", "platform", "production-activation-evidence.json");
const secretExposurePath = path.join(root, "output", "dev-032-production-auth-activation", "secret-exposure-review.json");
const sanitizedReadbackPath = path.join(root, "output", "dev-032-production-auth-activation", "provider-readback-sanitized.json");
const generatorPath = path.join(root, "scripts", "generate-dev-032-production-activation-readiness.mjs");
const capturePath = path.join(root, "scripts", "capture-dev-032-production-live-readback.mjs");
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const results = [];

function readJson(filePath) {
  return existsSync(filePath) ? JSON.parse(readFileSync(filePath, "utf8")) : null;
}

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
}

const report = readJson(reportPath);
const live = readJson(livePath);
const release = readJson(releasePath);
const historicalClosure = readJson(historicalClosurePath);
const historicalLevel4 = readJson(historicalLevel4Path);
const config = readJson(configPath);
const secretExposure = readJson(secretExposurePath);
const sanitizedReadback = readJson(sanitizedReadbackPath);
const generator = readFileSync(generatorPath, "utf8");
const capture = readFileSync(capturePath, "utf8");
const gates = report?.gates ?? [];
const gateMap = new Map(gates.map((gate) => [gate.id, gate]));
const reportText = report ? JSON.stringify(report) : "";
const artifact = config?.artifact ?? {};
const currentRelease = config?.currentRelease ?? {};
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
const productionGo = gateMap.get("A9-production-go-no-go") ?? {};
const provider = gateMap.get("A2-provider-and-env-readback") ?? {};

record("DEV032-ACT-READY-001 report exists and identifies the current-release schema", report?.schemaVersion === 3 && report?.dev === "DEV-032");
record("DEV032-ACT-READY-002 generation is read-only while the observed deployment is represented", report?.generationReadOnly === true && report?.productionActionPerformed === true && report?.releaseReady === false);
record("DEV032-ACT-READY-003 target is the dedicated Firebase Hosting production target", report?.target?.projectId === "jenfu-ai-pdm-prod" && report?.target?.runtimeService === "ai-pdm-prod" && report?.target?.cloudSqlInstance === "ai-pdm-prod-postgres" && report?.target?.canonicalBaseUrl === "https://jenfu-ai-pdm-prod.web.app");
record("DEV032-ACT-READY-004 live readback exists, is read-only and passed", live?.readOnlyCapture === true && live?.productionMutationPerformed === false && live?.allChecksPassed === true && Array.isArray(live?.failed) && live.failed.length === 0);
record("DEV032-ACT-READY-005 machine-verifiable gates A0-A7 pass", provider.status === "passed" && passedMachineGates.every((id) => gateMap.get(id)?.status === "passed"), JSON.stringify(passedMachineGates.map((id) => [id, gateMap.get(id)?.status])));
record("DEV032-ACT-READY-006 first incomplete gate is current-release authenticated Level 4", report?.status === "pending_human_activation_readiness" && report?.gateSummary?.firstBlockedGate === "A8-production-deploy-and-level4-smoke" && report?.gateSummary?.blocked === 0 && report?.gateSummary?.missingEvidence === 0 && report?.gateSummary?.pendingHuman === 2 && report?.gateSummary?.passed === 8);
record("DEV032-ACT-READY-006B provider secret exposure review is resolved by rotation plus sanitized readback", secretExposure?.requiredResolution?.status === "resolved" && secretExposure.requiredResolution?.resolutionType === "human_confirmed_secret_rotation_plus_sanitized_readback" && sanitizedReadback?.assertions?.noSecretFieldsReturned === true && sanitizedReadback?.google?.clientSecretRead === false);
record("DEV032-ACT-READY-007 current candidate smoke and provenance are exact", level3.schemaVersion === "ai-pdm-production-release-smoke/v1" && level3.kind === "candidate" && level3.passed >= 13 && level3.failed === 0 && level3.sourceRevision === artifact.applicationSourceRevision && level3.revision === currentRelease.revision && level3.imageDigest === artifact.applicationImageDigest && level3.trafficValidationPassed === true);
record("DEV032-ACT-READY-008 canonical smoke passed but stale authenticated evidence is rejected", level4.status === "pending_human" && level4.evidence?.productionDeploymentObserved === true && level4.evidence?.unauthenticatedProductionChecksPassed === true && level4.evidence?.canonicalSmokePassed >= 13 && level4.evidence?.sourceRevision === artifact.applicationSourceRevision && level4.evidence?.revision === currentRelease.revision && level4.evidence?.imageDigest === artifact.applicationImageDigest && level4.evidence?.authenticatedLevel4Status === "pending_current_release" && level4.evidence?.authenticatedEvidenceCurrent === false && level4.evidence?.historicalLevel4SourceRevision === historicalLevel4?.sourceRevision && (level4.blockers ?? []).some((item) => item.code === "AUTHENTICATED_LEVEL4_CURRENT_RELEASE_PENDING"));
record("DEV032-ACT-READY-009 production go/no-go retires Wave 0 test and waiver inputs", productionGo.status === "pending_human" && productionGo.evidence?.namedUserCanaryGateRetired === true && productionGo.evidence?.productOwnerDecision === "pending" && productionGo.evidence?.promotionApprovalStatus === "pending" && !Object.hasOwn(productionGo.evidence ?? {}, "namedUsers") && !Object.keys(config ?? {}).some((key) => /wave0|waiver/iu.test(key)) && (productionGo.blockers ?? []).some((item) => item.code === "PRODUCTION_GO_NO_GO_PENDING"));
record("DEV032-ACT-READY-010 next action requests exact current-release human evidence without redeployment", report?.nextRequiredAction?.includes("authenticated Level 4 evidence for the current release") && report.nextRequiredAction.includes(artifact.applicationSourceRevision) && report.nextRequiredAction.includes("source revision, Cloud Run revision and image digest") && !/terraform\s+apply|deploy|redeploy/iu.test(report.nextRequiredAction));
record("DEV032-ACT-READY-011 report does not persist secret values", !/private_key|client_secret|DATABASE_URL|BEGIN PRIVATE KEY|secretValue/iu.test(reportText));
record("DEV032-ACT-READY-012 readiness generator performs no cloud or production command", !generator.includes("node:child_process") && !generator.includes("execFileSync") && !generator.includes("spawnSync") && !generator.includes("gcloud "));
record("DEV032-ACT-READY-013 live capture is read-only and contains no mutation verb", capture.includes("readOnlyCapture: true") && capture.includes("productionMutationPerformed: false") && !/"run",\s*"jobs",\s*"execute"|terraform\s+apply|sql",\s*"backups",\s*"restore"|run",\s*"services",\s*"update"/iu.test(capture));
record("DEV032-ACT-READY-014 package exposes capture, readiness and QC commands", packageJson.scripts?.["dev-032:production-live-readback"] === "node scripts/capture-dev-032-production-live-readback.mjs" && packageJson.scripts?.["dev-032:production-activation-readiness"] === "node scripts/generate-dev-032-production-activation-readiness.mjs" && packageJson.scripts?.["qc:dev-032-production-activation-readiness"] === "node scripts/qc-dev-032-production-activation-readiness.mjs");
record("DEV032-ACT-READY-015 GitHub workflow evidence matches the live activation contract", release?.allChecksPassed === true && release?.workflowRun?.conclusion === "success" && release?.workflowRun?.headSha === artifact.applicationSourceRevision && release?.runtime?.sourceRevision === artifact.applicationSourceRevision && release?.runtime?.revision === currentRelease.revision && release?.runtime?.imageDigest === artifact.applicationImageDigest && release?.candidateSmoke?.failed === 0 && release?.canonicalSmoke?.failed === 0 && release?.trafficPromotion?.trafficPercent === 100);
record("DEV032-ACT-READY-016 historical closure is scoped to reusable infrastructure invariants", historicalClosure?.schemaVersion === "dev-032-historical-activation-closure/v1" && historicalClosure?.sourceRevision === historicalLevel4?.sourceRevision && historicalClosure?.gates?.["A2-provider-and-env-readback"]?.status === "passed" && historicalClosure?.gates?.["A6-hd84-restore-reconciliation"]?.status === "passed" && !Object.hasOwn(historicalClosure?.gates ?? {}, "A7-level3-production-like-smoke") && !Object.hasOwn(historicalClosure?.gates ?? {}, "A8-production-deploy-and-level4-smoke"));
record("DEV032-ACT-READY-017 current activation contract cannot claim the historical Level 4 result", !Object.hasOwn(config ?? {}, "wave0") && currentRelease.authenticatedLevel4Status === "pending_current_release" && historicalLevel4?.sourceRevision !== artifact.applicationSourceRevision && historicalLevel4?.revision !== currentRelease.revision && historicalLevel4?.imageDigest !== artifact.applicationImageDigest);

for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}
const failures = results.filter((result) => !result.passed);
console.log(`\nDEV-032 production activation readiness QC: ${results.length - failures.length}/${results.length} passed`);
if (failures.length > 0) process.exitCode = 1;
