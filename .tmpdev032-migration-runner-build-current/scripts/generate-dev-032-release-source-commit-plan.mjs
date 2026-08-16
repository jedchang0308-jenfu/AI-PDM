#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildDev032ReleaseSourceManifest } from "./dev-032-release-source-manifest-utils.mjs";

const root = process.cwd();
const outputDir = path.join(root, "output", "dev-032-release-source");
const jsonPath = path.join(outputDir, "commit-plan.json");
const mdPath = path.join(outputDir, "commit-plan.md");
const includedPathspecPath = path.join(outputDir, "included-production-source.pathspec");
const excludedPathspecPath = path.join(outputDir, "excluded-generated-or-staging.pathspec");

function relativePath(filePath) {
  return filePath.replace(root, "").replace(/^[/\\]/u, "").replaceAll("\\", "/");
}

function writeNulPathspec(filePath, paths) {
  const body = paths.map((item) => `:(literal)${item}`).join("\0");
  writeFileSync(filePath, Buffer.from(paths.length > 0 ? `${body}\0` : "", "utf8"));
}

function writeMarkdown(plan) {
  const nextStep = plan.releaseDecision.exactReleaseCommitExists
    ? [
        "The included production-source pathspec is empty because the release source already exists as an exact commit. Do not create another source-only commit from this plan.",
        "",
        `Exact release commit: \`${plan.releaseDecision.releaseCommitSha}\``,
        "",
        "Next work is production-target/env/secret/restore/rollback/smoke gate closure. No production build, push or deploy is authorized by this plan."
      ]
    : [
        "This plan does not stage or commit. After release-owner review, create an exact release commit by staging the included pathspec only. Generated evidence and staging-only provider config must stay outside the production release source unless a separate decision changes the boundary.",
        "",
        "Suggested command after explicit release-source selection:",
        "",
        "```powershell",
        "git add --pathspec-from-file=output/dev-032-release-source/included-production-source.pathspec --pathspec-file-nul",
        "git commit -m \"chore: prepare DEV-032 production release candidate\"",
        "```"
      ];
  const lines = [
    "# DEV-032 Release Source Commit Plan",
    "",
    `Generated: ${plan.generatedAt}`,
    `Status: \`${plan.status}\``,
    `Production action performed: \`${plan.productionActionPerformed}\``,
    "",
    "## Release Source Boundary",
    "",
    `- Included production-source candidate paths: ${plan.summary.includedProductionSourceEntries}`,
    `- Excluded generated evidence paths: ${plan.summary.generatedEvidenceEntries}`,
    `- Excluded staging-only paths: ${plan.summary.stagingOnlyEntries}`,
    `- Unknown-risk paths: ${plan.summary.unknownRiskEntries}`,
    `- Source snapshot SHA-256: \`${plan.sourceSnapshotSha256}\``,
    "",
    "## Generated Pathspecs",
    "",
    `- Included pathspec: \`${plan.pathspecs.includedProductionSourcePathspec}\``,
    `- Excluded pathspec: \`${plan.pathspecs.excludedGeneratedOrStagingPathspec}\``,
    "",
    "## Next Step",
    "",
    ...nextStep,
    "",
    "## Stop Conditions",
    "",
    ...plan.stopConditions.map((item) => `- ${item}`),
    ""
  ];
  return `${lines.join("\n")}\n`;
}

const manifest = buildDev032ReleaseSourceManifest(root);
const included = manifest.files.filter((file) => file.includedInProductionSource).map((file) => file.path).sort();
const excludedGeneratedOrStaging = manifest.files
  .filter((file) => file.bucket === "generated_evidence_excluded" || file.bucket === "staging_only_excluded_from_production_config")
  .map((file) => file.path)
  .sort();
const unknown = manifest.files.filter((file) => file.bucket === "unknown_risk").map((file) => file.path).sort();
const exactReleaseCommitExists = included.length === 0 && unknown.length === 0;

const plan = {
  schemaVersion: 1,
  dev: "DEV-032",
  generatedAt: new Date().toISOString(),
  status: exactReleaseCommitExists ? "release_source_commit_plan_applied_exact_commit_exists" : "release_source_commit_plan_ready_not_applied",
  productionActionPerformed: false,
  gitActionPerformed: false,
  git: manifest.git,
  sourceSnapshotSha256: manifest.releaseDecision.sourceSnapshotSha256,
  classificationSha256: manifest.releaseDecision.classificationSha256,
  summary: {
    totalDirtyEntries: manifest.summary.totalDirtyEntries,
    includedProductionSourceEntries: included.length,
    excludedGeneratedOrStagingEntries: excludedGeneratedOrStaging.length,
    generatedEvidenceEntries: manifest.summary.generatedEvidenceEntries,
    stagingOnlyEntries: manifest.summary.stagingOnlyEntries,
    unknownRiskEntries: unknown.length
  },
  pathspecs: {
    includedProductionSourcePathspec: relativePath(includedPathspecPath),
    excludedGeneratedOrStagingPathspec: relativePath(excludedPathspecPath),
    format: "git-pathspec-file-nul-literal"
  },
  releaseDecision: {
    currentDirtySnapshotSelectedByOwner: exactReleaseCommitExists,
    exactReleaseCommitExists,
    releaseCommitSha: exactReleaseCommitExists ? manifest.git.head : null,
    safeToStageIncludedSource: unknown.length === 0 && included.length > 0,
    safeToBuildForProduction: false,
    blocker: exactReleaseCommitExists
      ? "PRODUCTION_TARGET_ENV_RESTORE_ROLLBACK_AND_SMOKE_MISSING"
      : "RELEASE_OWNER_SELECTION_AND_EXACT_COMMIT_STILL_REQUIRED"
  },
  includedProductionSourcePaths: included,
  excludedGeneratedOrStagingPaths: excludedGeneratedOrStaging,
  unknownRiskPaths: unknown,
  stopConditions: [
    "This plan is not a release approval and does not create an exact release commit.",
    "Do not stage generated evidence, staging-only Firebase config or staging Terraform as production source.",
    exactReleaseCommitExists
      ? "Do not build, push or deploy production until production target, env/secret source, HD-8-4 restore evidence, rollback and Level 3/4 smoke gates are closed."
      : "Do not build, push or deploy production until the release owner selects the source boundary and an exact release commit exists.",
    "Do not proceed while production target, env/secret source, HD-8-4 restore evidence, rollback and Level 3/4 smoke are missing."
  ]
};

mkdirSync(outputDir, { recursive: true });
writeFileSync(jsonPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
writeFileSync(mdPath, writeMarkdown(plan), "utf8");
writeNulPathspec(includedPathspecPath, included);
writeNulPathspec(excludedPathspecPath, excludedGeneratedOrStaging);

console.log(JSON.stringify({
  outputPath: relativePath(jsonPath),
  markdownPath: relativePath(mdPath),
  includedPathspecPath: relativePath(includedPathspecPath),
  excludedPathspecPath: relativePath(excludedPathspecPath),
  status: plan.status,
  includedProductionSourceEntries: plan.summary.includedProductionSourceEntries,
  excludedGeneratedOrStagingEntries: plan.summary.excludedGeneratedOrStagingEntries,
  unknownRiskEntries: plan.summary.unknownRiskEntries,
  safeToStageIncludedSource: plan.releaseDecision.safeToStageIncludedSource,
  safeToBuildForProduction: plan.releaseDecision.safeToBuildForProduction
}, null, 2));
