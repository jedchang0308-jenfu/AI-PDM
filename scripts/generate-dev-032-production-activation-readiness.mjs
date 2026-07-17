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

const sources = {
  checklist: readJson("config/platform/production-activation-checklist.template.json"),
  evidence: readJson("config/platform/production-activation-evidence.json"),
  live: readJson("output/dev-032-production-live-readback/report.json"),
  terraformReview: readJson("output/dev-032-production-terraform-plan/review-summary.json"),
  terraformReadback: readJson("output/dev-032-production-terraform-plan/corrective/post-apply-readback.json"),
  auth: readJson("output/dev-032-production-auth-activation/summary.json"),
  secretExposure: readJson("output/dev-032-production-auth-activation/secret-exposure-review.json"),
  bootstrap: readJson("output/dev-032-live-migration/admin-bootstrap-summary.json"),
  migration: readJson("output/dev-032-live-migration/migration-execution-retry-result.json"),
  idempotence: readJson("output/dev-032-live-migration/migration-execution-idempotence-result.json"),
  migrationProvenance: readJson("output/dev-032-live-migration/migration-runner-provenance.json"),
  runtimeProvenance: readJson("output/dev-032-aal1-pilot-plan/runtime-manifest-provenance.json"),
  runtimeHotfixProvenance: readJson("output/dev-032-aal1-pilot-plan/runtime-manifest-provenance-hotfix-3ab5cffa.json"),
  rollback: readJson("output/dev-032-rollback-drill/v2-api-closure.json"),
  hosting: readJson("output/dev-032-production-hosting-plan/summary.json"),
  slicePlan: readJson("output/dev-032-production-slice-activation/plan-review.json"),
  level3: readJson("output/dev-032-production-slice-activation/level3-smoke.json"),
  level3Current: readJson("output/dev-032-production-slice-activation/hotfix-3ab5cffa-post-traffic-smoke.json"),
  level4: readJson("output/dev-032-production-slice-activation/hotfix-3ab5cffa-level4-ui.json"),
  gateE: readJson("output/dev-032-gate-e-automation/gate-e-automation-readback.json"),
  gateEHumanWorkPackage: readJson("output/dev-032-gate-e-automation/human-work-package.json")
};
const checklist = sources.checklist.parsed ?? {};
const evidence = sources.evidence.parsed ?? {};
const live = sources.live.parsed ?? {};
const terraformReview = sources.terraformReview.parsed ?? {};
const terraformReadback = sources.terraformReadback.parsed ?? {};
const auth = sources.auth.parsed ?? {};
const secretExposure = sources.secretExposure.parsed ?? {};
const bootstrap = sources.bootstrap.parsed ?? {};
const migration = sources.migration.parsed ?? {};
const idempotence = sources.idempotence.parsed ?? {};
const migrationProvenance = sources.migrationProvenance.parsed ?? {};
const runtimeProvenance = sources.runtimeProvenance.parsed ?? {};
const currentRuntimeProvenance = sources.runtimeHotfixProvenance.parsed ?? runtimeProvenance;
const rollback = sources.rollback.parsed ?? {};
const hosting = sources.hosting.parsed ?? {};
const slicePlan = sources.slicePlan.parsed ?? {};
const level3 = sources.level3Current.parsed ?? sources.level3.parsed ?? {};
const level4 = sources.level4.parsed ?? {};
const gateE = sources.gateE.parsed ?? {};
const wave0 = evidence.wave0 ?? {};
const currentRelease = evidence.currentRelease ?? {};
const currentReleaseCandidateSource = readJson(currentRelease.candidateSmokePath ?? "output/dev-032-current-release/missing-candidate-smoke.json");
const currentReleaseCanonicalSource = readJson(currentRelease.canonicalSmokePath ?? "output/dev-032-current-release/missing-canonical-smoke.json");
const currentReleaseClosureSource = readJson(currentRelease.closureEvidencePath ?? "output/dev-032-gate-e-closure/report.json");
const currentReleaseCandidate = currentReleaseCandidateSource.parsed ?? {};
const currentReleaseCanonical = currentReleaseCanonicalSource.parsed ?? {};
const currentReleaseClosure = currentReleaseClosureSource.parsed ?? {};
const level3ManifestDigest = level3.manifestDigest ?? level3.imageDigest ?? null;
const level3RuntimeDigest = level3.runtimeDigest ?? level3.imageDigest ?? null;
const hotfix = evidence.hotfix ?? {};
const baseActivationSourceReady = hotfix.baseActivationSourceRevision
  ? terraformReview.applicationSourceCommit === hotfix.baseActivationSourceRevision
  : terraformReview.applicationSourceCommit === evidence.artifact?.applicationSourceRevision;
const liveActivationBaselineSourceRevision = live.artifact?.activationBaselineSourceRevision
  ?? live.artifact?.applicationSourceRevision;
const liveActivationBaselineImageDigest = live.artifact?.activationBaselineImageDigest
  ?? live.artifact?.applicationImageDigest;

const baseSourceReady = sources.evidence.exists
  && live.allChecksPassed === true
  && baseActivationSourceReady
  && liveActivationBaselineSourceRevision === evidence.artifact?.applicationSourceRevision
  && liveActivationBaselineImageDigest === evidence.artifact?.applicationImageDigest
  && live.artifact?.migrationSourceRevision === evidence.artifact?.migrationSourceRevision
  && migrationProvenance.sourceRevision === evidence.artifact?.migrationSourceRevision
  && migrationProvenance.registryDigestReadback === evidence.artifact?.migrationImageDigest
  && currentRuntimeProvenance.indexDigest === evidence.artifact?.applicationImageDigest
  && currentRuntimeProvenance.runtimeDigest === evidence.artifact?.runtimeLinuxAmd64Digest
  && currentRuntimeProvenance.runtimeDigestIsLinuxAmd64Child === true;
const currentReleaseReady = currentReleaseCandidateSource.exists
  && currentReleaseCanonicalSource.exists
  && currentReleaseClosureSource.exists
  && currentReleaseCandidate.failed === 0
  && currentReleaseCandidate.passed === 13
  && currentReleaseCandidate.sourceRevision === currentRelease.sourceRevision
  && currentReleaseCandidate.imageDigest === currentRelease.applicationImageDigest
  && currentReleaseCandidate.revision === currentRelease.activeRevision
  && currentReleaseCanonical.failed === 0
  && currentReleaseCanonical.passed === 13
  && currentReleaseCanonical.sourceRevision === currentRelease.sourceRevision
  && currentReleaseCanonical.imageDigest === currentRelease.applicationImageDigest
  && currentReleaseCanonical.revision === currentRelease.activeRevision
  && currentReleaseClosure.release?.sourceRevision === currentRelease.sourceRevision
  && currentReleaseClosure.release?.imageDigest === currentRelease.applicationImageDigest
  && currentReleaseClosure.release?.activeRevision === currentRelease.activeRevision
  && currentReleaseClosure.release?.trafficPercent === 100;
const liveCurrentReleaseReady = live.artifact?.applicationSourceRevision === currentRelease.sourceRevision
  && live.artifact?.applicationImageDigest === currentRelease.applicationImageDigest
  && live.runtime?.latestReadyRevision === currentRelease.activeRevision
  && live.runtime?.trafficRevision === currentRelease.activeRevision
  && live.runtime?.trafficPercent === 100;
const sourceReady = baseSourceReady && currentReleaseReady && liveCurrentReleaseReady;
const targetReady = live.allChecksPassed === true
  && live.target?.projectId === evidence.target?.projectId
  && live.target?.region === evidence.target?.region
  && live.recovery?.sourceInstance === evidence.target?.cloudSqlInstance
  && live.runtime?.service === evidence.target?.runtimeService
  && live.checks?.sourceCloudSqlReady === true
  && live.checks?.runtimeReady === true;
const providerReady = auth.deployPassed === true
  && auth.readback?.googleEnabled === true
  && auth.readback?.anonymousEnabled === false
  && terraformReadback.checks?.sessionSecretMetadata === true
  && live.runtime?.canonicalBaseUrl === evidence.target?.canonicalBaseUrl;
const providerSecretExposureBlocked = sources.secretExposure.exists
  && secretExposure?.impact?.releaseStopConditionMatched === true
  && secretExposure?.requiredResolution?.status !== "resolved";
const planReady = terraformReview.costGatePassed === true
  && terraformReview.actions?.delete === 0
  && terraformReview.actions?.replace === 0
  && terraformReview.estimatedMonthlyCostUsd <= (checklist.costGate?.credentialledPlanReviewStopUsd ?? 240)
  && Array.isArray(terraformReview.gcsFileAuthorityResources)
  && terraformReview.gcsFileAuthorityResources.length === 0
  && slicePlan.safeToApply === true
  && slicePlan.delete === 0
  && slicePlan.replace === 0
  && slicePlan.imageDigestUnchanged === true;
const applyReady = Array.isArray(terraformReadback.failed)
  && terraformReadback.failed.length === 0
  && terraformReadback.checks?.terraformNoDrift === true
  && terraformReadback.checks?.cloudSqlRunnable === true
  && terraformReadback.checks?.cloudRunReady === true
  && terraformReadback.checks?.fileAuthorityBucketAbsent === true
  && hosting.safeToApply === true
  && hosting.stopConditions?.hasDelete === false
  && hosting.stopConditions?.hasReplace === false
  && liveCurrentReleaseReady;
const seedReady = bootstrap.bootstrapSucceeded === true
  && bootstrap.readbackAssertionsSucceeded === true
  && bootstrap.staticCredentialUsed === false
  && migration.allExpectedApplied === true
  && migration.schemaMigrationCount === 18
  && idempotence.success === true
  && idempotence.idempotenceVerified === true
  && Array.isArray(idempotence.appliedVersions)
  && idempotence.appliedVersions.length === 0
  && live.principal?.passed === true
  && live.reconciliation?.preCanaryPassed === true
  && Object.values(live.reconciliation?.counts ?? {}).every((count) => count === 0);
const restoreReady = live.recovery?.backupStatus === "SUCCESSFUL"
  && live.recovery?.separateTarget === true
  && live.recovery?.privateOnly === true
  && live.reconciliation?.restorePassed === true
  && live.checks?.numberingSnapshotMatched === true
  && rollback.allChecksPassed === true
  && rollback.rollbackApplied === true;
const level3Ready = currentReleaseReady
  && currentReleaseCandidate.kind === "candidate"
  && live.runtime?.productionSliceMode === "official-numbering-draft";
const historicalLevel4Ready = wave0.authenticatedLevel4Status === "passed"
  && level4.failed === 0
  && Boolean(level4.revision)
  && level4.imageDigest === evidence.artifact?.applicationImageDigest
  && level4.uiAcceptanceResult?.partNumber
  && level4.uiAcceptanceResult?.drawingNumber
  && level4.uiAcceptanceResult?.seriesCode;
const level4Ready = historicalLevel4Ready
  && currentReleaseReady
  && liveCurrentReleaseReady
  && currentReleaseCanonical.kind === "canonical"
  && currentReleaseClosure.authenticatedUi?.status === "passed"
  && currentReleaseClosure.authenticatedUi?.unopenedFeaturesRemainDisabled === true;
const namedUsers = Array.isArray(wave0.namedUsers) ? wave0.namedUsers : [];
const gateEReady = sources.gateE.exists
  && [
    "machine_gate_e_passed_human_closure_pending",
    "machine_gate_e_passed_release_closure_complete",
    "machine_gate_e_passed_product_owner_no_go"
  ].includes(gateE.status)
  && gateE.summary?.machineChecksPassed === true
  && gateE.summary?.failed === 0
  && gateE.target?.projectId === evidence.target?.projectId
  && gateE.target?.canonicalBaseUrl === evidence.target?.canonicalBaseUrl;
const wave0PrerequisitesReady = level4Ready
  && gateEReady
  && namedUsers.length >= (wave0.minimumNamedUsers ?? 3)
  && namedUsers.length <= (wave0.maximumNamedUsers ?? 5)
  && wave0.failClosed === true
  && wave0.humanAcceptanceStatus === "passed"
  && wave0.nonAllowlistNegativeAccessStatus === "passed"
  && wave0.openP0P1Count === 0;
const wave0Ready = wave0PrerequisitesReady
  && wave0.productOwnerDecision === "go";
const productOwnerNoGo = wave0.productOwnerDecision === "no-go";

const gates = [
  gate("A0-release-source", sourceReady ? "passed" : "missing_evidence", {
    evidenceContractPath: sources.evidence.path,
    applicationSourceRevision: currentRelease.sourceRevision ?? null,
    applicationImageDigest: currentRelease.applicationImageDigest ?? null,
    runtimeRevision: currentRelease.activeRevision ?? null,
    workflowRunId: currentRelease.workflowRunId ?? null,
    workflowArtifactDigest: currentRelease.workflowArtifactDigest ?? null,
    baseActivationEvidencePreserved: baseSourceReady,
    baseActivationSourceRevision: hotfix.baseActivationSourceRevision ?? null,
    hotfixId: hotfix.id ?? null,
    cloudBuildId: hotfix.cloudBuildId ?? null,
    migrationSourceRevision: live.artifact?.migrationSourceRevision ?? null
  }, passedOrBlocked(sourceReady, "ARTIFACT_PROVENANCE_INCOMPLETE", "Application or migration artifact provenance does not match the release evidence contract.")),
  gate("A1-production-target-readback", targetReady ? "passed" : "missing_evidence", {
    liveReadbackPath: sources.live.path,
    projectId: live.target?.projectId ?? null,
    region: live.target?.region ?? null,
    runtimeService: live.runtime?.service ?? null,
    cloudSqlInstance: live.recovery?.sourceInstance ?? null
  }, passedOrBlocked(targetReady, "PRODUCTION_TARGET_READBACK_INCOMPLETE", "Live production target readback is missing or failed.")),
  gate("A2-provider-and-env-readback", providerReady && !providerSecretExposureBlocked ? "passed" : providerSecretExposureBlocked ? "blocked" : "missing_evidence", {
    authEvidencePath: sources.auth.path,
    googleEnabled: auth.readback?.googleEnabled ?? null,
    anonymousEnabled: auth.readback?.anonymousEnabled ?? null,
    secretMetadataReadable: terraformReadback.checks?.sessionSecretMetadata ?? null,
    canonicalBaseUrl: live.runtime?.canonicalBaseUrl ?? null,
    secretExposureReviewPath: sources.secretExposure.exists ? sources.secretExposure.path : null,
    secretExposureStatus: secretExposure?.requiredResolution?.status ?? null
  }, providerSecretExposureBlocked
    ? [blocker("PROVIDER_SECRET_EXPOSURE_REVIEW_PENDING", "Provider config readback returned OAuth client secret material in command output; rotate the affected secret or explicitly accept the residual risk before release closure.", {
      secretExposureReviewPath: sources.secretExposure.path,
      plaintextStoredInWorkspace: secretExposure?.finding?.plaintextStoredInWorkspace ?? null
    })]
    : passedOrBlocked(providerReady, "PROVIDER_ENV_READBACK_INCOMPLETE", "Production provider, secret metadata or canonical runtime environment evidence is incomplete.")),
  gate("A3-credentialled-terraform-plan-review", planReady ? "passed" : "blocked", {
    planEvidencePath: sources.terraformReview.path,
    create: terraformReview.actions?.create ?? null,
    update: terraformReview.actions?.update ?? null,
    delete: terraformReview.actions?.delete ?? null,
    replace: terraformReview.actions?.replace ?? null,
    estimatedMonthlyCostUsd: terraformReview.estimatedMonthlyCostUsd ?? null,
    stopUsd: checklist.costGate?.credentialledPlanReviewStopUsd ?? 240,
    productionSlicePlanSha256: slicePlan.planSha256 ?? null
  }, passedOrBlocked(planReady, "PRODUCTION_PLAN_GATE_FAILED", "Credentialled plan exceeds a safety boundary or lacks required review evidence.")),
  gate("A4-production-resource-apply", applyReady ? "passed" : "blocked", {
    postApplyReadbackPath: sources.terraformReadback.path,
    stateResourceCount: terraformReadback.stateResourceCount ?? null,
    terraformNoDrift: terraformReadback.checks?.terraformNoDrift ?? null,
    latestReadyRevision: live.runtime?.latestReadyRevision ?? null,
    fileAuthorityBucketAbsent: terraformReadback.checks?.fileAuthorityBucketAbsent ?? null
  }, passedOrBlocked(applyReady, "PRODUCTION_APPLY_READBACK_FAILED", "Production apply readback, no-drift or file-authority boundary failed.")),
  gate("A5-clean-seed-and-principal-bootstrap", seedReady ? "passed" : "blocked", {
    bootstrapEvidencePath: sources.bootstrap.path,
    migrationEvidencePath: sources.migration.path,
    idempotenceEvidencePath: sources.idempotence.path,
    pdmUserId: live.principal?.pdmUserId ?? null,
    roleCount: live.principal?.roleCount ?? null,
    permissionCount: live.principal?.permissionCount ?? null,
    migrationCount: live.reconciliation?.migrationCount ?? null,
    businessObjectCounts: live.reconciliation?.counts ?? null
  }, passedOrBlocked(seedReady, "CLEAN_SEED_BOOTSTRAP_FAILED", "Clean seed, principal bootstrap, migration or idempotence evidence failed.")),
  gate("A6-hd84-restore-reconciliation", restoreReady ? "passed" : "blocked", {
    liveReadbackPath: sources.live.path,
    backupId: live.recovery?.backupId ?? null,
    restoreTarget: live.recovery?.restoreTarget ?? null,
    separateTarget: live.recovery?.separateTarget ?? null,
    numberingSnapshotSha256: live.reconciliation?.sourceNumberingSnapshotSha256 ?? null,
    rollbackClosurePath: sources.rollback.path
  }, passedOrBlocked(restoreReady, "HD84_RESTORE_RECONCILIATION_FAILED", "Separate-target restore, numbering reconciliation or rollback evidence failed.")),
  gate("A7-level3-production-like-smoke", level3Ready ? "passed" : "blocked", {
    smokePath: currentReleaseCandidateSource.path,
    passed: currentReleaseCandidate.passed ?? null,
    failed: currentReleaseCandidate.failed ?? null,
    revision: currentReleaseCandidate.revision ?? null,
    manifestDigest: currentReleaseCandidate.imageDigest ?? null,
    runtimeDigest: currentReleaseCandidate.imageDigest ?? null,
    sourceRevision: currentReleaseCandidate.sourceRevision ?? null
  }, passedOrBlocked(level3Ready, "LEVEL3_PRODUCTION_LIKE_SMOKE_FAILED", "Level 3 production-like smoke is missing, stale or failed.")),
  gate("A8-production-deploy-and-level4-smoke", level4Ready ? "passed" : "pending_human", {
    canonicalBaseUrl: evidence.target?.canonicalBaseUrl ?? null,
    productionDeploymentObserved: live.checks?.runtimeReady === true && level3.passed >= 14,
    unauthenticatedProductionChecksPassed: currentReleaseCanonical.failed === 0,
    authenticatedLevel4Status: wave0.authenticatedLevel4Status ?? "missing_evidence",
    level4EvidencePath: currentReleaseClosureSource.path,
    canonicalSmokePath: currentReleaseCanonicalSource.path,
    level4Passed: currentReleaseCanonical.passed ?? null,
    level4Failed: currentReleaseCanonical.failed ?? null,
    uiAcceptanceResult: currentReleaseClosure.authenticatedUi?.persistedObject ?? null,
    requiredChecks: ["authenticated-ui-session", "permissions-by-successful-official-numbering", "official-numbering", "optional-series-code", "detail-persistence", "file-cad-bom-fail-closed"]
  }, level4Ready ? [] : [blocker("AUTHENTICATED_LEVEL4_PENDING", "A human must complete the production Google account chooser before authenticated Level 4 can run.")]),
  gate("A9-wave0-go-no-go", wave0Ready ? "passed" : productOwnerNoGo ? "blocked" : "pending_human", {
    allowlistMode: wave0.allowlistMode ?? null,
    failClosed: wave0.failClosed ?? null,
    minimumNamedUsers: wave0.minimumNamedUsers ?? 3,
    maximumNamedUsers: wave0.maximumNamedUsers ?? 5,
    namedUsers,
    namedUserCount: namedUsers.length,
    gateEAutomationStatus: wave0.gateEAutomationStatus ?? gateE.status ?? "missing_evidence",
    gateEMachineChecksPassed: gateEReady,
    gateEAutomationEvidencePath: wave0.gateEAutomationEvidencePath ?? sources.gateE.path,
    humanWorkPackagePath: wave0.humanWorkPackagePath ?? sources.gateEHumanWorkPackage.path,
    humanAcceptanceStatus: wave0.humanAcceptanceStatus ?? "missing_evidence",
    humanAcceptanceEvidencePath: wave0.humanAcceptanceEvidencePath ?? null,
    nonAllowlistNegativeAccessStatus: wave0.nonAllowlistNegativeAccessStatus ?? "missing_evidence",
    nonAllowlistNegativeAccessAccount: wave0.nonAllowlistNegativeAccessAccount ?? null,
    openP0P1Count: wave0.openP0P1Count ?? null,
    productOwnerDecision: wave0.productOwnerDecision ?? "pending",
    fixedFiveBusinessDayObservationCancelled: evidence.decisions?.fixedFiveBusinessDayObservationCancelled === true
  }, wave0Ready
    ? []
    : wave0PrerequisitesReady
      ? [blocker(productOwnerNoGo ? "PRODUCT_OWNER_NO_GO" : "PRODUCT_OWNER_GO_NO_GO_PENDING", productOwnerNoGo
        ? "Product owner recorded NO-GO for the official numbering / draft production slice."
        : "All Wave 0 evidence is closed; the product owner must record the final GO or NO-GO decision.")]
      : [blocker("WAVE0_CLOSURE_EVIDENCE_INCOMPLETE", "Wave 0 named-user acceptance, non-allowlist denial, zero P0/P1 or Gate E machine evidence is incomplete.")])
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
  schemaVersion: 2,
  dev: "DEV-032",
  generatedAt: new Date().toISOString(),
  generationReadOnly: true,
  productionActionPerformed: true,
  releaseReady,
  status,
  target: evidence.target ?? checklist.target ?? {},
  sourceCommit: currentRelease.sourceRevision ?? evidence.artifact?.applicationSourceRevision ?? null,
  artifact: {
    activationBaseline: evidence.artifact ?? {},
    currentRelease
  },
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
    : firstBlockedGate?.id === "A2-provider-and-env-readback"
      ? "Resolve the provider secret exposure review by rotating the affected OAuth client secret or recording explicit product-owner residual-risk acceptance, then regenerate readiness."
    : firstBlockedGate?.id === "A8-production-deploy-and-level4-smoke"
      ? "Complete the production Google account chooser for jedchang0308@jenfu.com.tw, then run authenticated Level 4. Provide the remaining explicitly named Wave 0 users and product-owner go/no-go in the same closure response."
      : firstBlockedGate?.id === "A9-wave0-go-no-go"
        ? "Record the product-owner final GO or NO-GO decision for the official numbering / draft production slice; all other Wave 0 closure inputs are complete. Do not reintroduce the cancelled fixed five-business-day observation gate."
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
