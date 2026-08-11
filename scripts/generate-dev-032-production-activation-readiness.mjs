#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const outputDir = path.join(root, "output", "dev-032-production-activation-readiness");
const jsonPath = path.join(outputDir, "report.json");
const mdPath = path.join(outputDir, "report.md");

function readJson(relativePath) {
  const filePath = path.join(root, ...relativePath.split("/"));
  if (!existsSync(filePath)) return { path: relativePath, exists: false, parsed: null, error: null };
  try {
    return { path: relativePath, exists: true, parsed: JSON.parse(readFileSync(filePath, "utf8")), error: null };
  } catch (error) {
    return { path: relativePath, exists: true, parsed: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function gate(id, status, evidence = {}, blockers = []) {
  return { id, status, passed: status === "passed", evidence, blockers };
}

function blocker(code, message, evidence = {}) {
  return { code, message, evidence };
}

function passedOrBlocked(passed, missingCode, missingMessage) {
  return passed ? [] : [blocker(missingCode, missingMessage)];
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

const sources = {
  checklist: readJson("config/platform/production-activation-checklist.template.json"),
  evidence: readJson("config/platform/production-activation-evidence.json"),
  live: readJson("output/dev-032-production-live-readback/report.json"),
  release: readJson("output/dev-032-production-slice-activation/github-f70c8982-release-evidence.json"),
  historicalClosure: readJson("output/dev-032-production-activation-readiness/historical-activation-closure-hotfix-1936e93d.json"),
  secretExposure: readJson("output/dev-032-production-auth-activation/secret-exposure-review.json"),
  sanitizedReadback: readJson("output/dev-032-production-auth-activation/provider-readback-sanitized.json"),
  historicalLevel4: readJson("output/dev-032-production-slice-activation/hotfix-1936e93d-level4-ui.json")
};

const checklist = sources.checklist.parsed ?? {};
const evidence = sources.evidence.parsed ?? {};
const live = sources.live.parsed ?? {};
const release = sources.release.parsed ?? {};
const historicalClosure = sources.historicalClosure.parsed ?? {};
const secretExposure = sources.secretExposure.parsed ?? {};
const sanitizedReadback = sources.sanitizedReadback.parsed ?? {};
const historicalLevel4 = sources.historicalLevel4.parsed ?? {};
const currentRelease = evidence.currentRelease ?? {};
const wave0 = evidence.wave0 ?? {};
const artifact = evidence.artifact ?? {};
const releaseRuntime = release.runtime ?? {};
const candidateSmoke = release.candidateSmoke ?? {};
const canonicalSmoke = release.canonicalSmoke ?? {};
const trafficValidation = release.trafficValidation ?? {};
const trafficPromotion = release.trafficPromotion ?? {};
const historicalGates = historicalClosure.gates ?? {};
const historicalGatePassed = (id) => historicalGates[id]?.status === "passed";

const sourceReady = sources.evidence.exists
  && sources.release.exists
  && live.allChecksPassed === true
  && release.allChecksPassed === true
  && currentRelease.sourceRevision === artifact.applicationSourceRevision
  && currentRelease.imageDigest === artifact.applicationImageDigest
  && currentRelease.revision === live.runtime?.latestReadyRevision
  && releaseRuntime.sourceRevision === artifact.applicationSourceRevision
  && releaseRuntime.revision === currentRelease.revision
  && releaseRuntime.imageDigest === artifact.applicationImageDigest
  && releaseRuntime.ociProvenance?.revision === artifact.applicationSourceRevision
  && releaseRuntime.ociProvenance?.runtimeDigestIsLinuxAmd64Child === true
  && live.artifact?.applicationSourceRevision === artifact.applicationSourceRevision
  && live.artifact?.applicationImageDigest === artifact.applicationImageDigest
  && live.artifact?.liveRuntimeImage?.endsWith(`@${artifact.applicationImageDigest}`)
  && isNonEmptyString(artifact.migrationSourceRevision)
  && isNonEmptyString(artifact.migrationImageDigest);

const targetReady = live.allChecksPassed === true
  && live.target?.projectId === evidence.target?.projectId
  && live.target?.region === evidence.target?.region
  && live.recovery?.sourceInstance === evidence.target?.cloudSqlInstance
  && live.runtime?.service === evidence.target?.runtimeService
  && live.checks?.sourceCloudSqlReady === true
  && live.checks?.runtimeReady === true;

const providerSecretExposureResolved = sources.secretExposure.exists
  && secretExposure?.requiredResolution?.status === "resolved"
  && sanitizedReadback?.assertions?.noSecretFieldsReturned === true
  && sanitizedReadback?.google?.clientSecretRead === false;
const providerReady = historicalGatePassed("A2-provider-and-env-readback")
  && providerSecretExposureResolved
  && historicalGates["A2-provider-and-env-readback"]?.googleEnabled === true
  && historicalGates["A2-provider-and-env-readback"]?.anonymousEnabled === false
  && historicalGates["A2-provider-and-env-readback"]?.secretMetadataReadable === true
  && live.runtime?.canonicalBaseUrl === evidence.target?.canonicalBaseUrl;

const planClosure = historicalGates["A3-credentialled-terraform-plan-review"] ?? {};
const planReady = historicalGatePassed("A3-credentialled-terraform-plan-review")
  && planClosure.delete === 0
  && planClosure.replace === 0
  && planClosure.estimatedMonthlyCostUsd <= (checklist.costGate?.credentialledPlanReviewStopUsd ?? 240);

const applyClosure = historicalGates["A4-production-resource-apply"] ?? {};
const applyReady = historicalGatePassed("A4-production-resource-apply")
  && applyClosure.terraformNoDrift === true
  && applyClosure.fileAuthorityBucketAbsent === true
  && live.checks?.runtimeReady === true
  && live.runtime?.latestReadyRevision === currentRelease.revision
  && live.runtime?.trafficPercent === 100;

const seedClosure = historicalGates["A5-clean-seed-and-principal-bootstrap"] ?? {};
const seedReady = historicalGatePassed("A5-clean-seed-and-principal-bootstrap")
  && live.principal?.passed === true
  && live.principal?.pdmUserId === seedClosure.pdmUserId
  && live.principal?.roleCount === seedClosure.roleCount
  && live.principal?.permissionCount === seedClosure.permissionCount
  && live.reconciliation?.migrationCount === seedClosure.migrationCount
  && live.reconciliation?.preCanaryPassed === true
  && Object.values(live.reconciliation?.counts ?? {}).every((count) => count === 0);

const restoreClosure = historicalGates["A6-hd84-restore-reconciliation"] ?? {};
const restoreReady = historicalGatePassed("A6-hd84-restore-reconciliation")
  && live.recovery?.backupStatus === "SUCCESSFUL"
  && live.recovery?.backupId === restoreClosure.backupId
  && live.recovery?.restoreTarget === restoreClosure.restoreTarget
  && live.recovery?.separateTarget === true
  && live.recovery?.privateOnly === true
  && live.reconciliation?.restorePassed === true
  && live.reconciliation?.sourceNumberingSnapshotSha256 === restoreClosure.numberingSnapshotSha256
  && live.checks?.numberingSnapshotMatched === true;

const level3Ready = candidateSmoke.schemaVersion === "ai-pdm-production-release-smoke/v1"
  && candidateSmoke.kind === "candidate"
  && candidateSmoke.passed >= 13
  && candidateSmoke.failed === 0
  && candidateSmoke.sourceRevision === artifact.applicationSourceRevision
  && candidateSmoke.revision === currentRelease.revision
  && candidateSmoke.imageDigest === artifact.applicationImageDigest
  && trafficValidation.allChecksPassed === true
  && trafficValidation.validateOnlyAccepted === true
  && trafficValidation.expectedLatestRevision === currentRelease.revision
  && live.runtime?.productionSliceMode === "official-numbering-draft";

const canonicalReady = canonicalSmoke.schemaVersion === "ai-pdm-production-release-smoke/v1"
  && canonicalSmoke.kind === "canonical"
  && canonicalSmoke.passed >= 13
  && canonicalSmoke.failed === 0
  && canonicalSmoke.baseUrl === evidence.target?.canonicalBaseUrl
  && canonicalSmoke.sourceRevision === artifact.applicationSourceRevision
  && canonicalSmoke.revision === currentRelease.revision
  && canonicalSmoke.imageDigest === artifact.applicationImageDigest
  && trafficPromotion.allChecksPassed === true
  && trafficPromotion.expectedLatestRevision === currentRelease.revision
  && trafficPromotion.trafficPercent === 100;

const authenticatedEvidenceCurrent = historicalLevel4.sourceRevision === artifact.applicationSourceRevision
  && historicalLevel4.revision === currentRelease.revision
  && historicalLevel4.imageDigest === artifact.applicationImageDigest;
const level4Ready = canonicalReady
  && currentRelease.authenticatedLevel4Status === "passed_current_release"
  && wave0.authenticatedLevel4Status === "passed_current_release"
  && authenticatedEvidenceCurrent
  && historicalLevel4.failed === 0
  && historicalLevel4.uiAcceptanceResult?.partNumber
  && historicalLevel4.uiAcceptanceResult?.drawingNumber
  && historicalLevel4.uiAcceptanceResult?.seriesCode;
const namedUsers = Array.isArray(wave0.namedUsers) ? wave0.namedUsers : [];
const wave0Ready = level4Ready
  && namedUsers.length >= (wave0.minimumNamedUsers ?? 3)
  && namedUsers.length <= (wave0.maximumNamedUsers ?? 5)
  && wave0.failClosed === true
  && wave0.productOwnerDecision === "go";

const gates = [
  gate("A0-release-source", sourceReady ? "passed" : "missing_evidence", {
    evidenceContractPath: sources.evidence.path,
    githubReleaseEvidencePath: sources.release.path,
    applicationSourceRevision: artifact.applicationSourceRevision ?? null,
    applicationImageDigest: artifact.applicationImageDigest ?? null,
    liveRuntimeImage: live.artifact?.liveRuntimeImage ?? null,
    revision: currentRelease.revision ?? null,
    workflowRunId: currentRelease.workflowRunId ?? null,
    workflowArtifactId: currentRelease.workflowArtifactId ?? null,
    ociSourceRevision: releaseRuntime.ociProvenance?.revision ?? null,
    migrationSourceRevision: artifact.migrationSourceRevision ?? null
  }, passedOrBlocked(sourceReady, "ARTIFACT_PROVENANCE_INCOMPLETE", "The live revision, GitHub release artifact, OCI provenance or activation contract is missing or inconsistent.")),
  gate("A1-production-target-readback", targetReady ? "passed" : "missing_evidence", {
    liveReadbackPath: sources.live.path,
    projectId: live.target?.projectId ?? null,
    region: live.target?.region ?? null,
    runtimeService: live.runtime?.service ?? null,
    cloudSqlInstance: live.recovery?.sourceInstance ?? null
  }, passedOrBlocked(targetReady, "PRODUCTION_TARGET_READBACK_INCOMPLETE", "Live production target readback is missing or failed.")),
  gate("A2-provider-and-env-readback", providerReady ? "passed" : "blocked", {
    historicalClosurePath: sources.historicalClosure.path,
    sanitizedReadbackPath: sources.sanitizedReadback.path,
    googleEnabled: historicalGates["A2-provider-and-env-readback"]?.googleEnabled ?? null,
    anonymousEnabled: historicalGates["A2-provider-and-env-readback"]?.anonymousEnabled ?? null,
    secretMetadataReadable: historicalGates["A2-provider-and-env-readback"]?.secretMetadataReadable ?? null,
    canonicalBaseUrl: live.runtime?.canonicalBaseUrl ?? null,
    secretExposureReviewPath: sources.secretExposure.path,
    secretExposureStatus: secretExposure?.requiredResolution?.status ?? null
  }, passedOrBlocked(providerReady, "PROVIDER_ENV_READBACK_INCOMPLETE", "The closed provider baseline, sanitized readback or canonical runtime environment evidence is incomplete.")),
  gate("A3-credentialled-terraform-plan-review", planReady ? "passed" : "blocked", {
    historicalClosurePath: sources.historicalClosure.path,
    create: planClosure.create ?? null,
    update: planClosure.update ?? null,
    delete: planClosure.delete ?? null,
    replace: planClosure.replace ?? null,
    estimatedMonthlyCostUsd: planClosure.estimatedMonthlyCostUsd ?? null,
    stopUsd: checklist.costGate?.credentialledPlanReviewStopUsd ?? 240,
    productionSlicePlanSha256: planClosure.productionSlicePlanSha256 ?? null
  }, passedOrBlocked(planReady, "PRODUCTION_PLAN_GATE_FAILED", "The archived credentialled infrastructure plan closure exceeds a safety boundary or is incomplete.")),
  gate("A4-production-resource-apply", applyReady ? "passed" : "blocked", {
    historicalClosurePath: sources.historicalClosure.path,
    stateResourceCount: applyClosure.stateResourceCount ?? null,
    terraformNoDriftAtClosure: applyClosure.terraformNoDrift ?? null,
    latestReadyRevision: live.runtime?.latestReadyRevision ?? null,
    trafficPercent: live.runtime?.trafficPercent ?? null,
    fileAuthorityBucketAbsentAtClosure: applyClosure.fileAuthorityBucketAbsent ?? null
  }, passedOrBlocked(applyReady, "PRODUCTION_APPLY_READBACK_FAILED", "The archived infrastructure closure or current live runtime readback failed.")),
  gate("A5-clean-seed-and-principal-bootstrap", seedReady ? "passed" : "blocked", {
    historicalClosurePath: sources.historicalClosure.path,
    liveReadbackPath: sources.live.path,
    pdmUserId: live.principal?.pdmUserId ?? null,
    roleCount: live.principal?.roleCount ?? null,
    permissionCount: live.principal?.permissionCount ?? null,
    migrationCount: live.reconciliation?.migrationCount ?? null,
    businessObjectCounts: live.reconciliation?.counts ?? null
  }, passedOrBlocked(seedReady, "CLEAN_SEED_BOOTSTRAP_FAILED", "The archived bootstrap closure no longer matches current principal or reconciliation readback.")),
  gate("A6-hd84-restore-reconciliation", restoreReady ? "passed" : "blocked", {
    historicalClosurePath: sources.historicalClosure.path,
    liveReadbackPath: sources.live.path,
    backupId: live.recovery?.backupId ?? null,
    restoreTarget: live.recovery?.restoreTarget ?? null,
    separateTarget: live.recovery?.separateTarget ?? null,
    numberingSnapshotSha256: live.reconciliation?.sourceNumberingSnapshotSha256 ?? null
  }, passedOrBlocked(restoreReady, "HD84_RESTORE_RECONCILIATION_FAILED", "The archived restore closure no longer matches the current separate-target recovery readback.")),
  gate("A7-level3-production-like-smoke", level3Ready ? "passed" : "blocked", {
    githubReleaseEvidencePath: sources.release.path,
    schemaVersion: candidateSmoke.schemaVersion ?? null,
    kind: candidateSmoke.kind ?? null,
    passed: candidateSmoke.passed ?? null,
    failed: candidateSmoke.failed ?? null,
    sourceRevision: candidateSmoke.sourceRevision ?? null,
    revision: candidateSmoke.revision ?? null,
    imageDigest: candidateSmoke.imageDigest ?? null,
    trafficValidationPassed: trafficValidation.allChecksPassed ?? null
  }, passedOrBlocked(level3Ready, "LEVEL3_PRODUCTION_LIKE_SMOKE_FAILED", "Current GitHub candidate smoke, traffic validation or provenance evidence is missing, stale or failed.")),
  gate("A8-production-deploy-and-level4-smoke", level4Ready ? "passed" : "pending_human", {
    githubReleaseEvidencePath: sources.release.path,
    canonicalBaseUrl: evidence.target?.canonicalBaseUrl ?? null,
    productionDeploymentObserved: canonicalReady,
    unauthenticatedProductionChecksPassed: canonicalSmoke.failed === 0,
    canonicalSmokePassed: canonicalSmoke.passed ?? null,
    sourceRevision: canonicalSmoke.sourceRevision ?? null,
    revision: canonicalSmoke.revision ?? null,
    imageDigest: canonicalSmoke.imageDigest ?? null,
    authenticatedLevel4Status: currentRelease.authenticatedLevel4Status ?? "missing_evidence",
    authenticatedEvidenceCurrent,
    historicalLevel4EvidencePath: sources.historicalLevel4.path,
    historicalLevel4SourceRevision: historicalLevel4.sourceRevision ?? null,
    requiredChecks: ["authenticated-ui-session", "permissions-by-successful-official-numbering", "official-numbering", "optional-series-code", "detail-persistence", "file-cad-bom-fail-closed"]
  }, level4Ready ? [] : [blocker("AUTHENTICATED_LEVEL4_CURRENT_RELEASE_PENDING", "Authenticated Level 4 evidence must match the current source revision, Cloud Run revision and image digest; the retained hotfix evidence is historical only.")]),
  gate("A9-wave0-go-no-go", wave0Ready ? "passed" : "pending_human", {
    allowlistMode: wave0.allowlistMode ?? null,
    failClosed: wave0.failClosed ?? null,
    minimumNamedUsers: wave0.minimumNamedUsers ?? 3,
    maximumNamedUsers: wave0.maximumNamedUsers ?? 5,
    namedUsers,
    namedUserCount: namedUsers.length,
    productOwnerDecision: wave0.productOwnerDecision ?? "pending",
    fixedFiveBusinessDayObservationCancelled: evidence.decisions?.fixedFiveBusinessDayObservationCancelled === true
  }, wave0Ready ? [] : [blocker("WAVE0_NAMED_CANARY_AND_GO_NO_GO_PENDING", "Wave 0 still needs current authenticated Level 4 evidence, 3-5 explicitly named users, fail-closed negative access evidence and product-owner go/no-go.")])
];

const firstBlockedGate = gates.find((item) => item.status !== "passed") ?? null;
const blockerCodes = gates.flatMap((item) => item.blockers.map((itemBlocker) => itemBlocker.code));
const releaseReady = gates.every((item) => item.passed);
const status = releaseReady
  ? "release_ready"
  : firstBlockedGate?.status === "pending_human"
    ? "pending_human_activation_readiness"
    : "blocked_activation_readiness";
const report = {
  schemaVersion: 3,
  dev: "DEV-032",
  generatedAt: new Date().toISOString(),
  generationReadOnly: true,
  productionActionPerformed: true,
  releaseReady,
  status,
  target: evidence.target ?? checklist.target ?? {},
  sourceCommit: artifact.applicationSourceRevision ?? null,
  artifact,
  currentRelease,
  gateSummary: {
    total: gates.length,
    passed: gates.filter((item) => item.passed).length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    missingEvidence: gates.filter((item) => item.status === "missing_evidence").length,
    pendingHuman: gates.filter((item) => item.status === "pending_human").length,
    firstBlockedGate: firstBlockedGate?.id ?? null,
    blockerCodes
  },
  gates,
  nextRequiredAction: releaseReady
    ? "Record final release closure and preserve the evidence package."
    : firstBlockedGate?.id === "A8-production-deploy-and-level4-smoke"
      ? `Capture authenticated Level 4 evidence for the current release ${artifact.applicationSourceRevision ?? "unknown"} at the canonical URL under the separately approved production-smoke procedure; the evidence must match source revision, Cloud Run revision and image digest. Then provide 3-5 explicitly named Wave 0 users and product-owner go/no-go.`
      : firstBlockedGate?.id === "A9-wave0-go-no-go"
        ? "Provide 3-5 explicitly named Wave 0 users and product-owner go/no-go; do not reintroduce the cancelled fixed five-business-day observation gate."
        : `Close gate ${firstBlockedGate?.id ?? "unknown"} with machine evidence; do not bypass its stop conditions.`,
  stopConditions: checklist.stopConditions ?? []
};

function writeMarkdown(reportData) {
  const lines = [
    "# DEV-032 Production Activation Readiness",
    "",
    `Generated: ${reportData.generatedAt}`,
    `Status: \`${reportData.status}\``,
    `Target: \`${reportData.target.projectId}\` / \`${reportData.target.region}\``,
    `Source commit: \`${reportData.sourceCommit ?? "missing"}\``,
    `Release ready: \`${reportData.releaseReady}\``,
    "",
    "## Gate Summary",
    "",
    `- Passed: ${reportData.gateSummary.passed}/${reportData.gateSummary.total}`,
    `- Blocked: ${reportData.gateSummary.blocked}`,
    `- Missing evidence: ${reportData.gateSummary.missingEvidence}`,
    `- Pending human: ${reportData.gateSummary.pendingHuman}`,
    `- First incomplete gate: \`${reportData.gateSummary.firstBlockedGate ?? "none"}\``,
    "",
    "## Gates",
    "",
    ...reportData.gates.map((item) => `- \`${item.id}\`: ${item.status}`),
    "",
    "## Next Required Action",
    "",
    reportData.nextRequiredAction
  ];
  return `${lines.join("\n")}\n`;
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(mdPath, writeMarkdown(report), "utf8");
console.log(JSON.stringify({
  outputPath: path.relative(root, jsonPath).replaceAll("\\", "/"),
  markdownPath: path.relative(root, mdPath).replaceAll("\\", "/"),
  status: report.status,
  firstBlockedGate: report.gateSummary.firstBlockedGate,
  passed: report.gateSummary.passed,
  total: report.gateSummary.total,
  nextRequiredAction: report.nextRequiredAction
}, null, 2));
