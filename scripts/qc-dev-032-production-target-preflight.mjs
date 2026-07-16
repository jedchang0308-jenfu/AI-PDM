#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const reportPath = path.join(root, "output", "dev-032-production-target-preflight", "report.json");
const scriptPath = path.join(root, "scripts", "dev-032-production-target-preflight.mjs");
const packagePath = path.join(root, "package.json");
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

const reportExists = existsSync(reportPath);
const report = reportExists ? readJson(reportPath) : null;
const script = readFileSync(scriptPath, "utf8");
const packageJson = readJson(packagePath);
const commands = report?.commands ?? [];
const commandStrings = commands.map((item) => item.command.join(" "));
const blockers = new Set((report?.blockers ?? []).map((item) => item.code));
const activeProject = report?.activeIdentity?.project ?? null;
const targetProject = report?.targetProject ?? null;
const activeProjectMatchesTarget = Boolean(activeProject && targetProject && activeProject === targetProject);

record("DEV032-TARGET-001 report exists and identifies DEV-032", reportExists && report?.dev === "DEV-032" && report?.schemaVersion === 1);
record("DEV032-TARGET-002 preflight is read-only and records no production action", report?.readOnly === true && report?.productionActionPerformed === false);
record("DEV032-TARGET-003 target defaults to dedicated production project", report?.targetProject === "jenfu-ai-pdm-prod" && report?.region === "asia-east1" && report?.expectedRunService === "ai-pdm-prod" && report?.expectedCloudSqlInstance === "ai-pdm-prod-postgres");
record(
  "DEV032-TARGET-004 active project mismatch is fail-closed when present",
  activeProjectMatchesTarget
    ? !blockers.has("ACTIVE_GCLOUD_PROJECT_IS_NOT_PRODUCTION")
    : blockers.has("ACTIVE_GCLOUD_PROJECT_IS_NOT_PRODUCTION"),
  JSON.stringify({ activeProject, targetProject, activeProjectMatchesTarget })
);
record(
  "DEV032-TARGET-005 production project readback is explicit",
  report?.project
    ? !blockers.has("PRODUCTION_PROJECT_UNAVAILABLE") && report.project.projectId === report.targetProject
    : blockers.has("PRODUCTION_PROJECT_UNAVAILABLE"),
  JSON.stringify({ projectId: report?.project?.projectId ?? null, targetProject: report?.targetProject ?? null })
);
record("DEV032-TARGET-006 dedicated production Firebase Hosting config is recognized", !blockers.has("FIREBASE_CONFIG_NOT_PRODUCTION_READY") && report?.providerConfig?.firebaseProductionConfigReady === true && report?.providerConfig?.productionFirebaseHostingSite === "jenfu-ai-pdm-prod");
record("DEV032-TARGET-007 production env source is present without exposing values", !blockers.has("PRODUCTION_ENV_SOURCE_MISSING") && report?.envSources?.some((item) => item.path.endsWith("production.auto.tfvars.json") && item.exists === true));
record("DEV032-TARGET-008 production runtime/database are readable for subsequent smoke", !blockers.has("LEVEL3_LEVEL4_SMOKE_NOT_POSSIBLE") && report?.cloudRun?.expectedServiceFound === true && report?.cloudSql?.expectedInstanceFound === true);
record("DEV032-TARGET-009 release source exact commit is read from manifest", !blockers.has("RELEASE_SOURCE_NOT_SELECTED_OR_COMMITTED") && report?.releaseSource?.exactReleaseCommitExists === true && report?.releaseSource?.includedProductionSourceEntries === 0 && report?.releaseSource?.unknownRiskEntries === 0 && report?.releaseSource?.safeToBuildForProduction === false);
record("DEV032-TARGET-010 production target contract loads the acknowledged Hosting pilot fail-closed", !blockers.has("PRODUCTION_TARGET_CONTRACT_MISSING") && report?.productionTargetContract?.templateOnly === true && report?.productionTargetContract?.productionActionAllowed === false && report?.productionTargetContract?.firebaseHostingGatewayAllowed === true && report?.productionTargetContract?.publicBaseUrl === "https://jenfu-ai-pdm-prod.web.app");
record("DEV032-TARGET-011 required production secrets are checked by ID and present", Array.isArray(report?.secrets?.requiredSecretIds) && report.secrets.requiredSecretIds.includes("pdm-session-signing-current") && report.secrets.requiredSecretIds.includes("pdm-session-signing-previous") && !blockers.has("PRODUCTION_SECRET_SOURCE_UNPROVEN"));
record("DEV032-TARGET-012 commands are read-only discovery commands", commands.length >= 5 && commands.every((item) => item.readOnly === true) && commandStrings.every((command) => /^gcloud (config get-value|projects describe|run services list|sql instances list|secrets list)/u.test(command)));
record("DEV032-TARGET-013 script does not contain live mutation gcloud verbs", !/\bgcloud\b.*\b(apply|deploy|delete|create|update|import|execute)\b/u.test(script));
record("DEV032-TARGET-014 report does not persist secret values", Array.isArray(report?.secrets?.namesOnly) && !JSON.stringify(report).match(/private_key|client_secret|SESSION_SIGNING|PASSWORD|DATABASE_URL/u));
record("DEV032-TARGET-015 package exposes preflight and QC scripts", packageJson.scripts["preflight:dev-032-production-target"] === "node scripts/dev-032-production-target-preflight.mjs --allow-blocked" && packageJson.scripts["qc:dev-032-production-target-preflight"] === "node scripts/qc-dev-032-production-target-preflight.mjs");

for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}

const failures = results.filter((result) => !result.passed);
console.log(`\nDEV-032 production target preflight QC: ${results.length - failures.length}/${results.length} passed`);
if (failures.length > 0) process.exitCode = 1;
