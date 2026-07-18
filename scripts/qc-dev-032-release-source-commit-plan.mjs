#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const planPath = path.join(root, "output", "dev-032-release-source", "commit-plan.json");
const includedPathspecPath = path.join(root, "output", "dev-032-release-source", "included-production-source.pathspec");
const excludedPathspecPath = path.join(root, "output", "dev-032-release-source", "excluded-generated-or-staging.pathspec");
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
}

function readNulPathspec(filePath) {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, "utf8")
    .split("\0")
    .filter(Boolean)
    .map((item) => item.replace(/^:\(literal\)/u, ""));
}

const exists = existsSync(planPath);
const plan = exists ? JSON.parse(readFileSync(planPath, "utf8")) : null;
const includedPathspec = readNulPathspec(includedPathspecPath);
const excludedPathspec = readNulPathspec(excludedPathspecPath);
const included = plan?.includedProductionSourcePaths ?? [];
const excluded = plan?.excludedGeneratedOrStagingPaths ?? [];

record("DEV032-COMMIT-PLAN-001 plan exists and identifies DEV-032", exists && plan?.schemaVersion === 1 && plan?.dev === "DEV-032");
record("DEV032-COMMIT-PLAN-002 plan is not a git or production action", plan?.productionActionPerformed === false && plan?.gitActionPerformed === false);
record("DEV032-COMMIT-PLAN-003 no unknown-risk paths are allowed", plan?.summary?.unknownRiskEntries === 0 && Array.isArray(plan?.unknownRiskPaths) && plan.unknownRiskPaths.length === 0);
record("DEV032-COMMIT-PLAN-004 included pathspec matches included source list", JSON.stringify(includedPathspec) === JSON.stringify(included));
record("DEV032-COMMIT-PLAN-005 excluded pathspec matches generated and staging list", JSON.stringify(excludedPathspec) === JSON.stringify(excluded));
record("DEV032-COMMIT-PLAN-006 included pathspec excludes output evidence", included.every((item) => !item.startsWith("output/") && !item.startsWith(".firebase/")));
record("DEV032-COMMIT-PLAN-007 included pathspec excludes staging-only provider config", included.every((item) => item !== ".firebaserc" && item !== "firebase.json" && !item.startsWith("firebase-hosting/") && !item.startsWith("infra/google-cloud/staging/") && item !== "config/platform/staging-preflight.template.json"));
record("DEV032-COMMIT-PLAN-008 included pathspec matches plan mode", plan?.releaseDecision?.exactReleaseCommitExists === true ? included.length === 0 : included.length > 0 && plan?.releaseDecision?.safeToStageIncludedSource === true);
record(
  "DEV032-COMMIT-PLAN-009 excluded list covers generated evidence and dirty staging-only config",
  excluded.some((item) => item.startsWith("output/")) &&
    (plan?.summary?.stagingOnlyEntries === 0 ||
      (excluded.includes(".firebaserc") &&
        excluded.includes("firebase.json") &&
        excluded.some((item) => item.startsWith("infra/google-cloud/staging/"))))
);
record("DEV032-COMMIT-PLAN-010 source decision state is coherent and safe-to-build remains false", plan?.releaseDecision?.safeToBuildForProduction === false && (plan?.releaseDecision?.exactReleaseCommitExists === true ? plan?.releaseDecision?.safeToStageIncludedSource === false && plan?.releaseDecision?.releaseCommitSha : plan?.releaseDecision?.safeToStageIncludedSource === true));
record("DEV032-COMMIT-PLAN-011 package exposes generator and QC scripts", packageJson.scripts["dev-032:release-source-commit-plan"] === "node scripts/generate-dev-032-release-source-commit-plan.mjs" && packageJson.scripts["qc:dev-032-release-source-commit-plan"] === "node scripts/qc-dev-032-release-source-commit-plan.mjs");

for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}

const failures = results.filter((result) => !result.passed);
console.log(`\nDEV-032 release source commit plan QC: ${results.length - failures.length}/${results.length} passed`);
if (failures.length > 0) process.exitCode = 1;
