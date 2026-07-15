#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const outputDir = path.join(root, "output", "dev-032-production-activation-readiness");
const jsonPath = path.join(outputDir, "report.json");
const mdPath = path.join(outputDir, "report.md");

function relativePath(filePath) {
  return filePath.replace(root, "").replace(/^[/\\]/u, "").replaceAll("\\", "/");
}

function readJson(relativePathValue) {
  const filePath = path.join(root, ...relativePathValue.split("/"));
  if (!existsSync(filePath)) return { path: relativePathValue, exists: false, parsed: null, error: null };
  try {
    return {
      path: relativePathValue,
      exists: true,
      parsed: JSON.parse(readFileSync(filePath, "utf8")),
      error: null
    };
  } catch (error) {
    return {
      path: relativePathValue,
      exists: true,
      parsed: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function gate(id, status, evidence = {}, blockers = []) {
  return {
    id,
    status,
    passed: status === "passed",
    evidence,
    blockers
  };
}

function blocker(code, message, evidence = {}) {
  return { code, message, evidence };
}

const activationChecklist = readJson("config/platform/production-activation-checklist.template.json");
const productionTarget = readJson("config/platform/production-target.template.json");
const cleanSeed = readJson("config/platform/clean-production-seed.template.json");
const releaseManifest = readJson("output/dev-032-release-source/manifest.json");
const targetPreflight = readJson("output/dev-032-production-target-preflight/report.json");

const release = releaseManifest.parsed ?? {};
const preflight = targetPreflight.parsed ?? {};
const checklist = activationChecklist.parsed ?? {};
const seed = cleanSeed.parsed ?? {};
const target = productionTarget.parsed ?? {};
const targetBlockers = new Set((preflight.blockers ?? []).map((item) => item.code));
const envSourceExists = Array.isArray(preflight.envSources) && preflight.envSources.some((source) => source.exists === true);
const secretsMissing = (preflight.secrets?.missingRequiredSecretIds ?? []).length > 0;
const exactReleaseSourceReady = release.releaseDecision?.exactReleaseCommitExists === true
  && release.summary?.includedProductionSourceEntries === 0
  && release.summary?.unknownRiskEntries === 0;
const productionTargetReady = preflight.activeIdentity?.project === preflight.targetProject
  && Boolean(preflight.project)
  && preflight.cloudRun?.expectedServiceFound === true
  && preflight.cloudSql?.expectedInstanceFound === true
  && preflight.secrets?.commandOk === true
  && secretsMissing === false;
const providerEnvReady = preflight.providerConfig?.firebaseHasProductionAlias === true
  && preflight.providerConfig?.firebaseDefaultIsProduction === true
  && envSourceExists
  && secretsMissing === false;

const gates = [
  gate(
    "A0-release-source",
    exactReleaseSourceReady ? "passed" : "blocked",
    {
      manifestPath: releaseManifest.path,
      exactReleaseCommitExists: release.releaseDecision?.exactReleaseCommitExists ?? null,
      releaseCommitSha: release.releaseDecision?.releaseCommitSha ?? null,
      includedProductionSourceEntries: release.summary?.includedProductionSourceEntries ?? null,
      unknownRiskEntries: release.summary?.unknownRiskEntries ?? null
    },
    exactReleaseSourceReady ? [] : [blocker("RELEASE_SOURCE_NOT_EXACT_COMMIT", "Release source is not an exact committed source boundary.")]
  ),
  gate(
    "A1-production-target-readback",
    productionTargetReady ? "passed" : "blocked",
    {
      preflightPath: targetPreflight.path,
      activeProject: preflight.activeIdentity?.project ?? null,
      targetProject: preflight.targetProject ?? checklist.target?.projectId ?? target.target?.projectId ?? null,
      projectReadable: Boolean(preflight.project),
      expectedRunServiceFound: preflight.cloudRun?.expectedServiceFound ?? null,
      expectedCloudSqlInstanceFound: preflight.cloudSql?.expectedInstanceFound ?? null,
      requiredSecretMetadataReadable: preflight.secrets?.commandOk === true && secretsMissing === false
    },
    (preflight.blockers ?? []).filter((item) => [
      "ACTIVE_GCLOUD_PROJECT_IS_NOT_PRODUCTION",
      "PRODUCTION_PROJECT_UNAVAILABLE",
      "PRODUCTION_CLOUD_RUN_SERVICE_UNPROVEN",
      "PRODUCTION_CLOUD_SQL_INSTANCE_UNPROVEN",
      "PRODUCTION_SECRET_SOURCE_UNPROVEN"
    ].includes(item.code))
  ),
  gate(
    "A2-provider-and-env-readback",
    providerEnvReady ? "passed" : "blocked",
    {
      firebaseHasProductionAlias: preflight.providerConfig?.firebaseHasProductionAlias ?? null,
      firebaseDefaultIsProduction: preflight.providerConfig?.firebaseDefaultIsProduction ?? null,
      envSourceExists,
      missingRequiredSecretIds: preflight.secrets?.missingRequiredSecretIds ?? []
    },
    (preflight.blockers ?? []).filter((item) => [
      "FIREBASE_CONFIG_NOT_PRODUCTION_READY",
      "PRODUCTION_ENV_SOURCE_MISSING",
      "PRODUCTION_SECRET_SOURCE_UNPROVEN"
    ].includes(item.code))
  ),
  gate(
    "A3-credentialled-terraform-plan-review",
    "missing_evidence",
    {
      required: true,
      monthlyEstimateStopUsd: checklist.costGate?.credentialledPlanReviewStopUsd ?? 240,
      stopOnDelete: checklist.costGate?.stopOnAnyDeleteAction === true,
      stopOnReplace: checklist.costGate?.stopOnAnyReplaceAction === true
    },
    [blocker("CREDENTIALLED_PRODUCTION_PLAN_MISSING", "No credentialled production Terraform plan review evidence exists.")]
  ),
  gate(
    "A4-production-resource-apply",
    "missing_evidence",
    {
      separateApprovalRequired: true,
      acknowledgement: "DEV-032-PRODUCTION-RESOURCE-CREATION-APPROVED"
    },
    [blocker("PRODUCTION_RESOURCE_APPLY_NOT_EXECUTED", "Production apply has not been approved or executed.")]
  ),
  gate(
    "A5-clean-seed-and-principal-bootstrap",
    "missing_evidence",
    {
      cleanSeedTemplatePath: cleanSeed.path,
      templateOnly: seed.fixtureOnly === true,
      releaseReady: seed.releaseReady === true,
      productionMutationAllowed: seed.releaseGate?.productionMutationAllowed === true
    },
    [blocker("REAL_CLEAN_SEED_AND_BOOTSTRAP_MISSING", "Clean production seed and principal bootstrap evidence is still template-only.")]
  ),
  gate(
    "A6-hd84-restore-reconciliation",
    "missing_evidence",
    {
      decision: seed.preCanaryRestoreReconciliation?.decision ?? "HD-8-4 / 1A",
      requiredBeforeCanary: seed.preCanaryRestoreReconciliation?.requiredBeforeCanary === true,
      currentStatus: seed.preCanaryRestoreReconciliation?.status ?? "missing_evidence"
    },
    [blocker("HD84_RESTORE_RECONCILIATION_MISSING", "Separate-target restore and numbering reconciliation has not been executed.")]
  ),
  gate(
    "A7-level3-production-like-smoke",
    targetBlockers.has("LEVEL3_LEVEL4_SMOKE_NOT_POSSIBLE") ? "blocked" : "missing_evidence",
    {
      productionLikeSmokeRequired: true,
      productionRuntimeDatabaseTargetProven: productionTargetReady
    },
    [blocker("LEVEL3_PRODUCTION_LIKE_SMOKE_MISSING", "Production-like smoke cannot pass until production runtime/database target is proven.")]
  ),
  gate(
    "A8-production-deploy-and-level4-smoke",
    "missing_evidence",
    {
      productionActionPerformed: false,
      postDeploySmokeRequired: true
    },
    [blocker("LEVEL4_POST_DEPLOY_SMOKE_MISSING", "Production deploy and post-deploy smoke have not been executed.")]
  ),
  gate(
    "A9-wave0-go-no-go",
    "missing_evidence",
    {
      namedUserCanaryRequired: true,
      zeroOpenP0P1Required: true,
      rollbackOperationalRequired: true
    },
    [blocker("WAVE0_GO_NO_GO_MISSING", "Wave 0 go/no-go cannot be decided until release gates and smoke evidence pass.")]
  )
];

const firstBlockedGate = gates.find((item) => item.status !== "passed") ?? null;
const blockerCodes = gates.flatMap((item) => item.blockers.map((gateBlocker) => gateBlocker.code));
const report = {
  schemaVersion: 1,
  dev: "DEV-032",
  generatedAt: new Date().toISOString(),
  productionActionPerformed: false,
  readOnly: true,
  releaseReady: false,
  status: firstBlockedGate ? "blocked_activation_readiness" : "ready_for_separate_production_approval",
  target: {
    projectId: checklist.target?.projectId ?? target.target?.projectId ?? "jenfu-ai-pdm-prod",
    region: checklist.target?.region ?? target.target?.region ?? "asia-east1",
    runtimeService: checklist.target?.runtimeService ?? target.target?.runtimeService ?? "ai-pdm-prod",
    cloudSqlInstance: checklist.target?.cloudSqlInstance ?? target.target?.cloudSqlInstance ?? "ai-pdm-prod-postgres",
    publicBaseUrl: checklist.target?.publicBaseUrl ?? target.target?.publicBaseUrl ?? "https://pdm.jenfu.com.tw"
  },
  sourceCommit: release.releaseDecision?.releaseCommitSha ?? null,
  gateSummary: {
    total: gates.length,
    passed: gates.filter((item) => item.passed).length,
    blocked: gates.filter((item) => item.status === "blocked").length,
    missingEvidence: gates.filter((item) => item.status === "missing_evidence").length,
    firstBlockedGate: firstBlockedGate?.id ?? null,
    blockerCodes
  },
  gates,
  nextRequiredAction: firstBlockedGate?.id === "A1-production-target-readback"
    ? "Create or grant read access to jenfu-ai-pdm-prod, intentionally set active gcloud project to the production target, then rerun preflight:dev-032-production-target."
    : firstBlockedGate?.id === "A2-provider-and-env-readback"
      ? "Provide production Firebase/provider config, production env source and Secret Manager metadata readback without secret values."
      : firstBlockedGate
        ? `Close gate ${firstBlockedGate.id} with required evidence.`
        : "Request separate production approval for the next release-gate action.",
  stopConditions: checklist.stopConditions ?? []
};

function writeMarkdown(reportData) {
  const lines = [
    "# DEV-032 Production Activation Readiness",
    "",
    `Generated: ${reportData.generatedAt}`,
    `Status: \`${reportData.status}\``,
    `Production action performed: \`${reportData.productionActionPerformed}\``,
    `Target: \`${reportData.target.projectId}\` / \`${reportData.target.region}\``,
    `Source commit: \`${reportData.sourceCommit ?? "missing"}\``,
    "",
    "## Gate Summary",
    "",
    `- Passed: ${reportData.gateSummary.passed}/${reportData.gateSummary.total}`,
    `- Blocked: ${reportData.gateSummary.blocked}`,
    `- Missing evidence: ${reportData.gateSummary.missingEvidence}`,
    `- First blocked gate: \`${reportData.gateSummary.firstBlockedGate ?? "none"}\``,
    "",
    "## Gates",
    "",
    ...reportData.gates.map((item) => `- \`${item.id}\`: ${item.status}`),
    "",
    "## Next Required Action",
    "",
    reportData.nextRequiredAction,
    "",
    "## Stop Conditions",
    "",
    ...reportData.stopConditions.map((item) => `- ${item}`),
    ""
  ];
  return `${lines.join("\n")}\n`;
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(mdPath, writeMarkdown(report), "utf8");

console.log(JSON.stringify({
  outputPath: relativePath(jsonPath),
  markdownPath: relativePath(mdPath),
  status: report.status,
  productionActionPerformed: report.productionActionPerformed,
  firstBlockedGate: report.gateSummary.firstBlockedGate,
  passed: report.gateSummary.passed,
  total: report.gateSummary.total,
  nextRequiredAction: report.nextRequiredAction
}, null, 2));
