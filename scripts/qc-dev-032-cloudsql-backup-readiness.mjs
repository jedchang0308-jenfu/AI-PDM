#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { evaluateCurrentRehearsal } from "./lib/dev-032-cloudsql-backup-rehearsal-contract.mjs";

const root = process.cwd();
const reportPath = path.join(root, "output", "dev-032-cloudsql-backup-readiness", "report.json");
const markdownPath = path.join(root, "output", "dev-032-cloudsql-backup-readiness", "report.md");
const report = JSON.parse(readFileSync(reportPath, "utf8"));
const markdown = readFileSync(markdownPath, "utf8");
const source = readFileSync(path.join(root, "scripts", "dev-032-cloudsql-backup-readiness.mjs"), "utf8");
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const rehearsalPath = path.join(root, "output", "dev-032-cloudsql-native-backup-rehearsal", "execution-summary.json");
const rehearsal = existsSync(rehearsalPath) ? JSON.parse(readFileSync(rehearsalPath, "utf8")) : null;
const blockers = new Set(report.blockers.map((item) => item.code));
const results = [];
const record = (name, passed, detail = "") => results.push({ name, passed: Boolean(passed), detail });

const evaluationInput = {
  projectId: report.target.projectId,
  instanceName: report.target.sourceInstance,
  candidateManifestSha256: report.candidate.manifestSha256,
  candidateSchemaMigrationCount: report.candidate.schemaMigrationCount
};
const evaluate = (evidence) => evaluateCurrentRehearsal({ evidence, ...evaluationInput });
const mutate = (mutator) => {
  if (!rehearsal) return { candidateMatches: false, cleanupVerified: false, matchesCandidate: false };
  const copy = structuredClone(rehearsal);
  mutator(copy);
  return evaluate(copy);
};

record("DEV032-BACKUP-001 report identifies read-only DEV-032 preflight", report.schemaVersion === 2 && report.dev === "DEV-032" && report.readOnly === true && report.productionActionPerformed === false);
record("DEV032-BACKUP-002 target is exact production Cloud SQL", report.target.projectId === "jenfu-ai-pdm-prod" && report.target.region === "asia-east1" && report.target.sourceInstance === "ai-pdm-prod-postgres");
record("DEV032-BACKUP-003 candidate is immutable and counted", /^[a-f0-9]{64}$/u.test(report.candidate.manifestSha256) && report.candidate.schemaMigrationCount >= 47);
record("DEV032-BACKUP-004 command failures remain fail-closed", report.commands.every((command) => command.ok || report.blockers.length > 0));
record("DEV032-BACKUP-005 all cloud commands are read-only metadata verbs", report.commands.length === 3 && report.commands.every((command) => command.readOnly === true) && report.commands.every((command) => /^gcloud (config get-value|sql instances describe|sql backups list)/u.test(command.command.join(" "))));
record("DEV032-BACKUP-006 source protection state is coherent", report.sourceProtection.ready ? report.sourceProtection.readable && report.sourceProtection.privateOnly && report.sourceProtection.automatedBackupEnabled && report.sourceProtection.pitrEnabled && report.sourceProtection.deletionProtectionEnabled : blockers.has("PRODUCTION_CLOUD_SQL_SOURCE_UNREADABLE") || blockers.has("PRODUCTION_BACKUP_PITR_PROTECTION_UNPROVEN") || blockers.has("GCLOUD_REAUTH_REQUIRED"));
record("DEV032-BACKUP-007 recent backup state is coherent", report.backups.recentWithin48Hours ? report.backups.latestSuccessful?.status === "SUCCESSFUL" : blockers.has("RECENT_SUCCESSFUL_NATIVE_BACKUP_UNPROVEN"));
record("DEV032-BACKUP-008 retired historical target is absent from the active gate", !Object.hasOwn(report, "historicalRestoreEvidence") && !blockers.has("HISTORICAL_SEPARATE_RESTORE_TARGET_UNPROVEN") && !source.includes("HISTORICAL_SEPARATE_RESTORE_TARGET_UNPROVEN"));
record("DEV032-BACKUP-009 current candidate rehearsal and cleanup are exact or explicitly blocked", report.currentCandidateRehearsal.matchesCandidate ? !blockers.has("CURRENT_CANDIDATE_NATIVE_BACKUP_RESTORE_REHEARSAL_MISSING_OR_MISMATCHED") && !blockers.has("CURRENT_CANDIDATE_REHEARSAL_CLEANUP_UNPROVEN") : blockers.has("CURRENT_CANDIDATE_NATIVE_BACKUP_RESTORE_REHEARSAL_MISSING_OR_MISMATCHED") || blockers.has("CURRENT_CANDIDATE_REHEARSAL_CLEANUP_UNPROVEN"));
record("DEV032-BACKUP-010 source contains no mutation command", !/\["sql",\s*"(?:backups",\s*"create|instances",\s*"(?:clone|create|delete|patch|restore))"/u.test(source) && !/terraform\s+(?:apply|destroy)|gcloud\s+.*\b(?:create|delete|restore|clone|import)\b/iu.test(source));
record("DEV032-BACKUP-011 report does not persist secrets", !/(private_key|client_secret|refresh_token|password|database_url|session_signing)/iu.test(JSON.stringify(report)));
record("DEV032-BACKUP-012 scripts are registered", packageJson.scripts["preflight:dev-032-cloudsql-backup-readiness"] === "node scripts/dev-032-cloudsql-backup-readiness.mjs" && packageJson.scripts["qc:dev-032-cloudsql-backup-readiness"] === "node scripts/qc-dev-032-cloudsql-backup-readiness.mjs");
record("DEV032-BACKUP-013 outputs exist with canonical newline", existsSync(reportPath) && existsSync(markdownPath) && /[^\r\n]\r?\n$/u.test(markdown));
record("DEV032-BACKUP-014 current Gate C2 evidence satisfies candidate and cleanup contract", rehearsal !== null && evaluate(rehearsal).matchesCandidate === true, rehearsal ? "" : "current candidate rehearsal evidence is absent");
record("DEV032-BACKUP-015 deleted restore target receipt is fail-closed", mutate((value) => { value.restore.deleted = false; }).cleanupVerified === false && mutate((value) => { value.restore.postDeleteInstanceCount = 1; }).cleanupVerified === false);
record("DEV032-BACKUP-016 production source zero-mutation receipt is fail-closed", mutate((value) => { value.source.metadataUnchanged = false; }).cleanupVerified === false && mutate((value) => { value.source.operationsDuringGate = 1; }).cleanupVerified === false);
record("DEV032-BACKUP-017 Cloud Run job restoration receipt is fail-closed", mutate((value) => { value.jobRestoration.specRestored = false; }).cleanupVerified === false && mutate((value) => { value.jobRestoration.originalDefaultSourceTargetRestored = false; }).cleanupVerified === false);
record("DEV032-BACKUP-018 cost authorization receipt is fail-closed", mutate((value) => { value.costGuard.capExceeded = true; }).cleanupVerified === false && mutate((value) => { value.costGuard.observedCloudSqlUpperBoundTwd = 101; }).cleanupVerified === false && mutate((value) => { value.authorization.costCapTwd = 101; value.costGuard.authorizedCap = 101; }).cleanupVerified === false);
record("DEV032-BACKUP-019 migration rerun and reconciliation remain fail-closed", mutate((value) => { value.migration.secondPassSucceeded = false; }).candidateMatches === false && mutate((value) => { value.reconciliation.snapshotUnchanged = false; }).candidateMatches === false);

for (const result of results) console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
const failures = results.filter((result) => !result.passed);
console.log(`\nDEV-032 Cloud SQL backup readiness QC: ${results.length - failures.length}/${results.length} passed`);
if (failures.length > 0) process.exitCode = 1;
