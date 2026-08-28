#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const reportPath = path.join(root, "output", "dev-032-cloudsql-backup-readiness", "report.json");
const markdownPath = path.join(root, "output", "dev-032-cloudsql-backup-readiness", "report.md");
const report = JSON.parse(readFileSync(reportPath, "utf8"));
const markdown = readFileSync(markdownPath, "utf8");
const source = readFileSync(path.join(root, "scripts", "dev-032-cloudsql-backup-readiness.mjs"), "utf8");
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const blockers = new Set(report.blockers.map((item) => item.code));
const results = [];
const record = (name, passed, detail = "") => results.push({ name, passed: Boolean(passed), detail });

record("DEV032-BACKUP-001 report identifies read-only DEV-032 preflight", report.schemaVersion === 1 && report.dev === "DEV-032" && report.readOnly === true && report.productionActionPerformed === false);
record("DEV032-BACKUP-002 target is exact production Cloud SQL", report.target.projectId === "jenfu-ai-pdm-prod" && report.target.region === "asia-east1" && report.target.sourceInstance === "ai-pdm-prod-postgres");
record("DEV032-BACKUP-003 candidate is immutable and counted", /^[a-f0-9]{64}$/u.test(report.candidate.manifestSha256) && report.candidate.schemaMigrationCount >= 47);
record("DEV032-BACKUP-004 command failures remain fail-closed", report.commands.every((command) => command.ok || report.blockers.length > 0));
record("DEV032-BACKUP-005 all cloud commands are read-only metadata verbs", report.commands.length === 4 && report.commands.every((command) => command.readOnly === true) && report.commands.every((command) => /^gcloud (config get-value|sql instances (describe|list)|sql backups list)/u.test(command.command.join(" "))));
record("DEV032-BACKUP-006 source protection state is coherent", report.sourceProtection.ready ? report.sourceProtection.readable && report.sourceProtection.privateOnly && report.sourceProtection.automatedBackupEnabled && report.sourceProtection.pitrEnabled && report.sourceProtection.deletionProtectionEnabled : blockers.has("PRODUCTION_CLOUD_SQL_SOURCE_UNREADABLE") || blockers.has("PRODUCTION_BACKUP_PITR_PROTECTION_UNPROVEN") || blockers.has("GCLOUD_REAUTH_REQUIRED"));
record("DEV032-BACKUP-007 recent backup state is coherent", report.backups.recentWithin48Hours ? report.backups.latestSuccessful?.status === "SUCCESSFUL" : blockers.has("RECENT_SUCCESSFUL_NATIVE_BACKUP_UNPROVEN"));
record("DEV032-BACKUP-008 historical restore is not promoted to current evidence", report.historicalRestoreEvidence.migrationCount !== report.historicalRestoreEvidence.currentCandidateMigrationCount && report.historicalRestoreEvidence.historicalOnly === true);
record("DEV032-BACKUP-009 current candidate rehearsal is exact or explicitly blocked", report.currentCandidateRehearsal.matchesCandidate ? !blockers.has("CURRENT_CANDIDATE_NATIVE_BACKUP_RESTORE_REHEARSAL_MISSING_OR_MISMATCHED") : blockers.has("CURRENT_CANDIDATE_NATIVE_BACKUP_RESTORE_REHEARSAL_MISSING_OR_MISMATCHED"));
record("DEV032-BACKUP-010 source contains no mutation command", !/\["sql",\s*"(?:backups",\s*"create|instances",\s*"(?:clone|create|delete|patch|restore))"/u.test(source) && !/terraform\s+(?:apply|destroy)|gcloud\s+.*\b(?:create|delete|restore|clone|import)\b/iu.test(source));
record("DEV032-BACKUP-011 report does not persist secrets", !/(private_key|client_secret|refresh_token|password|database_url|session_signing)/iu.test(JSON.stringify(report)));
record("DEV032-BACKUP-012 scripts are registered", packageJson.scripts["preflight:dev-032-cloudsql-backup-readiness"] === "node scripts/dev-032-cloudsql-backup-readiness.mjs" && packageJson.scripts["qc:dev-032-cloudsql-backup-readiness"] === "node scripts/qc-dev-032-cloudsql-backup-readiness.mjs");
record("DEV032-BACKUP-013 outputs exist with canonical newline", existsSync(reportPath) && existsSync(markdownPath) && /[^\r\n]\r?\n$/u.test(markdown));

for (const result of results) console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
const failures = results.filter((result) => !result.passed);
console.log(`\nDEV-032 Cloud SQL backup readiness QC: ${results.length - failures.length}/${results.length} passed`);
if (failures.length > 0) process.exitCode = 1;

