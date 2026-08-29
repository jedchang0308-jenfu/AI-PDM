#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const contractPath = path.join(root, "config", "platform", "production-target.template.json");
const packagePath = path.join(root, "package.json");
const contract = JSON.parse(readFileSync(contractPath, "utf8"));
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
}

const requiredSecretIds = contract.secrets?.requiredSecretIds ?? [];
const forbiddenEnvValues = contract.runtimeEnvironment?.forbiddenEnvValues ?? [];
const gates = contract.releaseGates ?? {};

record("DEV032-PROD-TARGET-001 contract identifies the DEV-069 prelaunch production slice", contract.schemaVersion === 1 && contract.dev === "DEV-032" && contract.phase === "DEV-069-prelaunch-low-cost-production");
record("DEV032-PROD-TARGET-002 contract is template-only and grants no production action", contract.templateOnly === true && contract.releaseReady === false && contract.productionActionAllowed === false);
record("DEV032-PROD-TARGET-003 target identity is dedicated production", contract.target?.projectId === "jenfu-ai-pdm-prod" && contract.target?.region === "asia-east1" && contract.target?.runtimeService === "ai-pdm-prod" && contract.target?.cloudSqlInstance === "ai-pdm-prod-postgres");
record("DEV032-PROD-TARGET-004 production pilot uses only the dedicated Firebase Hosting site", contract.target?.publicBaseUrl === "https://jenfu-ai-pdm-prod.web.app" && contract.edge?.type === "firebase-hosting-cloud-run-rewrite" && contract.edge?.firebaseHostingSite === "jenfu-ai-pdm-prod" && contract.edge?.firebaseHostingGatewayAllowed === true && contract.edge?.firebaseHostingOwnsBusinessLogic === false);
record("DEV032-PROD-TARGET-005 production pilot records the direct endpoint risk and rejects staging defaults", contract.edge?.cloudRunIngress === "all" && contract.edge?.cloudRunDefaultUrlDisabled === false && contract.edge?.directRunAppOriginSessionExchange === "denied-by-canonical-origin" && contract.edge?.directRunAppResidualRiskAccepted === true && forbiddenEnvValues.some((value) => value.includes("stg")));
record("DEV032-PROD-TARGET-006 Cloud SQL production posture is prelaunch micro, zonal and private", contract.database?.tier === "db-f1-micro" && contract.database?.availabilityType === "ZONAL" && contract.database?.serviceLevelAgreement === false && contract.database?.privateIpRequired === true && contract.database?.automaticIamDatabaseAuthenticationRequired === true && contract.database?.staticDatabasePasswordAllowed === false);
record("DEV032-PROD-TARGET-007 backup, PITR and deletion protection are required", contract.database?.automatedBackupRequired === true && contract.database?.pitrRequired === true && contract.database?.deletionProtectionRequired === true);
record("DEV032-PROD-TARGET-008 Firebase remains identity-only", contract.identity?.provider === "Firebase Authentication with Identity Platform" && contract.identity?.firestoreAuthorityAllowed === false && contract.identity?.firebaseStorageAuthorityAllowed === false && contract.identity?.firebaseFunctionsAuthorityAllowed === false);
record("DEV032-PROD-TARGET-009 production access policy matches Phase 3A without rollout-wave validation", contract.identity?.productionAccess?.googleWorkspaceOnly === true && contract.identity?.productionAccess?.controlledNonGoogleAllowed === false && contract.identity?.futureNonGoogleAccess?.controlledNonGoogleRequired === true && contract.identity?.futureNonGoogleAccess?.requiresSeparateSecurityApproval === true && !Object.hasOwn(contract.identity ?? {}, "wave0") && !Object.hasOwn(contract.identity ?? {}, "wave1"));
record("DEV032-PROD-TARGET-010 session secrets are metadata-only and value-safe", contract.secrets?.valuesMustNotBeCommitted === true && requiredSecretIds.includes("pdm-session-signing-current") && requiredSecretIds.includes("pdm-session-signing-previous"));
record("DEV032-PROD-TARGET-011 release gates include source, access policy, restore, rollback and smoke", gates.exactReleaseCommitRequired === true && gates.cleanSeedAndProductionAccessPolicyRequired === true && gates.hd84SeparateTargetRestoreRequired === true && gates.rollbackReadinessRequired === true && gates.level3ProductionLikeSmokeRequired === true && gates.level4PostDeploySmokeRequired === true);
record("DEV032-PROD-TARGET-012 stop conditions forbid wrong Hosting sites and staging/provider shortcuts", contract.stopConditions?.some((item) => item.includes("jenfu-ai-pdm-prod.web.app")) && contract.stopConditions?.some((item) => item.includes("direct run.app")) && contract.stopConditions?.some((item) => item.includes("staging Firebase project")) && contract.stopConditions?.some((item) => item.includes("Do not create")));
record("DEV032-PROD-TARGET-013 package exposes contract QC", packageJson.scripts?.["qc:dev-032-production-target-contract"] === "node scripts/qc-dev-032-production-target-contract.mjs");

for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}

const failures = results.filter((result) => !result.passed);
console.log(`\nDEV-032 production target contract QC: ${results.length - failures.length}/${results.length} passed`);
if (failures.length > 0) process.exitCode = 1;
