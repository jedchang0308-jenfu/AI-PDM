#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { evaluateCurrentRehearsal } from "./lib/dev-032-cloudsql-backup-rehearsal-contract.mjs";

const root = process.cwd();
const outputDir = path.join(root, "output", "dev-032-cloudsql-backup-readiness");
const jsonPath = path.join(outputDir, "report.json");
const markdownPath = path.join(outputDir, "report.md");
const targetContractPath = "config/platform/production-target.template.json";
const candidateManifestPath = "output/dev-032-cloudsql-migration-package/cloudsql-migration-manifest.json";
const currentRehearsalPath = "output/dev-032-cloudsql-native-backup-rehearsal/execution-summary.json";

function projectPath(relativePath) {
  return path.join(root, ...relativePath.split("/"));
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(projectPath(relativePath), "utf8"));
}

function readJsonIfExists(relativePath) {
  return existsSync(projectPath(relativePath)) ? readJson(relativePath) : null;
}

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

function runGcloud(name, args) {
  const startedAt = new Date().toISOString();
  try {
    const stdout = process.platform === "win32"
      ? execFileSync("cmd.exe", ["/d", "/s", "/c", "gcloud", ...args], {
          cwd: root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 30_000,
          maxBuffer: 16 * 1024 * 1024
        })
      : execFileSync("gcloud", args, {
          cwd: root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 30_000,
          maxBuffer: 16 * 1024 * 1024
        });
    return { name, command: ["gcloud", ...args], readOnly: true, ok: true, startedAt, stdout: stdout.trim(), stderr: "" };
  } catch (error) {
    return {
      name,
      command: ["gcloud", ...args],
      readOnly: true,
      ok: false,
      startedAt,
      stdout: typeof error.stdout === "string" ? error.stdout.trim() : "",
      stderr: typeof error.stderr === "string" ? error.stderr.trim().slice(0, 2_000) : "",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function parseJson(result) {
  if (!result.ok || !result.stdout) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function privateOnly(instance) {
  return instance?.settings?.ipConfiguration?.ipv4Enabled === false;
}

function successfulBackup(backup) {
  return backup?.status === "SUCCESSFUL";
}

function backupTimestamp(backup) {
  return backup?.endTime ?? backup?.startTime ?? backup?.windowStartTime ?? null;
}

function ageHours(timestamp) {
  if (!timestamp) return null;
  const millis = Date.parse(timestamp);
  return Number.isFinite(millis) ? (Date.now() - millis) / 3_600_000 : null;
}

function blocker(code, message, evidence = {}) {
  return { code, message, evidence };
}

const contract = readJson(targetContractPath);
const candidateManifest = readJson(candidateManifestPath);
const currentRehearsal = readJsonIfExists(currentRehearsalPath);
const projectId = contract.target.projectId;
const instanceName = contract.target.cloudSqlInstance;
const region = contract.target.region;
const candidateManifestSha256 = sha256(JSON.stringify(candidateManifest, null, 2));
const candidateSchemaMigrationCount = candidateManifest.orderedSchemaMigrations?.length ?? 0;

const commands = {
  activeAccount: runGcloud("active-account", ["config", "get-value", "account"]),
  sourceInstance: runGcloud("source-instance", ["sql", "instances", "describe", instanceName, `--project=${projectId}`, "--format=json"]),
  backups: runGcloud("source-backups", ["sql", "backups", "list", `--instance=${instanceName}`, `--project=${projectId}`, "--limit=30", "--sort-by=~endTime", "--format=json"])
};

const sourceInstance = parseJson(commands.sourceInstance);
const backups = parseJson(commands.backups);
const successfulBackups = Array.isArray(backups) ? backups.filter(successfulBackup) : [];
const latestSuccessfulBackup = successfulBackups[0] ?? null;
const latestBackupAgeHours = ageHours(backupTimestamp(latestSuccessfulBackup));
const recentSuccessfulBackup = latestSuccessfulBackup !== null && latestBackupAgeHours !== null && latestBackupAgeHours >= 0 && latestBackupAgeHours <= 48;
const backupConfiguration = sourceInstance?.settings?.backupConfiguration ?? {};
const sourceProtectionReady =
  sourceInstance?.state === "RUNNABLE" &&
  sourceInstance?.region === region &&
  privateOnly(sourceInstance) &&
  backupConfiguration.enabled === true &&
  backupConfiguration.pointInTimeRecoveryEnabled === true &&
  (sourceInstance?.settings?.deletionProtectionEnabled === true || sourceInstance?.deletionProtection === true);

const currentRehearsalEvaluation = evaluateCurrentRehearsal({
  evidence: currentRehearsal,
  projectId,
  instanceName,
  candidateManifestSha256,
  candidateSchemaMigrationCount
});

const reauthRequired = Object.values(commands).some((command) => /reauthentication failed|gcloud auth login/iu.test(command.stderr));
const blockers = [];
if (reauthRequired) blockers.push(blocker("GCLOUD_REAUTH_REQUIRED", "The active Google Cloud account must be reauthenticated before read-only backup metadata can be verified."));
if (!sourceInstance) blockers.push(blocker("PRODUCTION_CLOUD_SQL_SOURCE_UNREADABLE", "The production Cloud SQL source instance was not readable."));
if (sourceInstance && !sourceProtectionReady) blockers.push(blocker("PRODUCTION_BACKUP_PITR_PROTECTION_UNPROVEN", "Backup, PITR, deletion protection, private IP or source readiness did not match the production contract."));
if (!recentSuccessfulBackup) blockers.push(blocker("RECENT_SUCCESSFUL_NATIVE_BACKUP_UNPROVEN", "No successful native Cloud SQL backup within 48 hours was proven."));
if (!currentRehearsalEvaluation.candidateMatches) blockers.push(blocker(
  "CURRENT_CANDIDATE_NATIVE_BACKUP_RESTORE_REHEARSAL_MISSING_OR_MISMATCHED",
  "The current migration manifest has not been proven by a native backup restore, exact migration apply/rerun and reconciliation on a separate target.",
  { currentRehearsalPath, candidateManifestSha256, candidateSchemaMigrationCount, checks: currentRehearsalEvaluation.checks }
));
if (!currentRehearsalEvaluation.cleanupVerified) blockers.push(blocker(
  "CURRENT_CANDIDATE_REHEARSAL_CLEANUP_UNPROVEN",
  "The current rehearsal does not prove restore-target deletion, production-source protection, Cloud Run Job restoration and cost-cap compliance.",
  { currentRehearsalPath, checks: currentRehearsalEvaluation.checks }
));

const report = {
  schemaVersion: 2,
  dev: "DEV-032",
  generatedAt: new Date().toISOString(),
  status: blockers.length === 0 ? "current_candidate_native_restore_rehearsal_verified" : "blocked_readonly_backup_preflight",
  readOnly: true,
  productionActionPerformed: false,
  target: { projectId, region, sourceInstance: instanceName },
  activeIdentity: { account: commands.activeAccount.ok ? commands.activeAccount.stdout : null, reauthRequired },
  candidate: { manifestPath: candidateManifestPath, manifestSha256: candidateManifestSha256, schemaMigrationCount: candidateSchemaMigrationCount },
  sourceProtection: {
    commandOk: commands.sourceInstance.ok,
    readable: sourceInstance !== null,
    state: sourceInstance?.state ?? null,
    privateOnly: privateOnly(sourceInstance),
    automatedBackupEnabled: backupConfiguration.enabled === true,
    pitrEnabled: backupConfiguration.pointInTimeRecoveryEnabled === true,
    deletionProtectionEnabled: sourceInstance?.settings?.deletionProtectionEnabled === true || sourceInstance?.deletionProtection === true,
    ready: sourceProtectionReady
  },
  backups: {
    commandOk: commands.backups.ok,
    successfulCount: successfulBackups.length,
    latestSuccessful: latestSuccessfulBackup ? {
      id: latestSuccessfulBackup.id ?? null,
      status: latestSuccessfulBackup.status ?? null,
      type: latestSuccessfulBackup.type ?? null,
      timestamp: backupTimestamp(latestSuccessfulBackup),
      ageHours: latestBackupAgeHours
    } : null,
    recentWithin48Hours: recentSuccessfulBackup
  },
  currentCandidateRehearsal: {
    evidencePath: currentRehearsalPath,
    evidencePresent: currentRehearsal !== null,
    candidateMatches: currentRehearsalEvaluation.candidateMatches,
    cleanupVerified: currentRehearsalEvaluation.cleanupVerified,
    matchesCandidate: currentRehearsalEvaluation.matchesCandidate,
    checks: currentRehearsalEvaluation.checks
  },
  blockers,
  commands: Object.values(commands).map((command) => ({
    name: command.name,
    command: command.command,
    readOnly: command.readOnly,
    ok: command.ok,
    stderr: command.stderr
  })),
  stopConditions: [
    "This preflight performs read-only metadata discovery only.",
    "Do not create an on-demand backup, restore/clone instance, execute SQL, apply Terraform or delete a restore target without separate Lane 3 approval.",
    "A deleted restore target is the expected end state; its signed execution and cleanup receipts must match the current candidate and remain fail-closed.",
    "Do not activate production until the current candidate native restore rehearsal and rollback evidence pass."
  ]
};

function markdown(value) {
  return `${[
    "# DEV-032 Cloud SQL Backup Readiness",
    "",
    `Generated: ${value.generatedAt}`,
    `Status: \`${value.status}\``,
    `Production action performed: \`${value.productionActionPerformed}\``,
    "",
    "## Candidate",
    "",
    `- Manifest SHA-256: \`${value.candidate.manifestSha256}\``,
    `- Schema migrations: \`${value.candidate.schemaMigrationCount}\``,
    "",
    "## Result",
    "",
    ...value.blockers.map((item) => `- \`${item.code}\`: ${item.message}`),
    "",
    "## Stop Conditions",
    "",
    ...value.stopConditions.map((item) => `- ${item}`)
  ].join("\n")}\n`;
}

mkdirSync(outputDir, { recursive: true });
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
writeFileSync(markdownPath, markdown(report), "utf8");

console.log(JSON.stringify({
  outputPath: path.relative(root, jsonPath).replaceAll("\\", "/"),
  status: report.status,
  productionActionPerformed: report.productionActionPerformed,
  candidateManifestSha256,
  candidateSchemaMigrationCount,
  blockerCount: blockers.length,
  blockers: blockers.map((item) => item.code)
}, null, 2));
