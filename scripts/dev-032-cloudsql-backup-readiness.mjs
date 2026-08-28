#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const outputDir = path.join(root, "output", "dev-032-cloudsql-backup-readiness");
const jsonPath = path.join(outputDir, "report.json");
const markdownPath = path.join(outputDir, "report.md");
const targetContractPath = "config/platform/production-target.template.json";
const candidateManifestPath = "output/dev-032-cloudsql-migration-package/cloudsql-migration-manifest.json";
const historicalReadbackPath = "output/dev-032-production-live-readback/report.json";
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
const historicalReadback = readJsonIfExists(historicalReadbackPath);
const currentRehearsal = readJsonIfExists(currentRehearsalPath);
const projectId = contract.target.projectId;
const instanceName = contract.target.cloudSqlInstance;
const region = contract.target.region;
const candidateManifestSha256 = sha256(JSON.stringify(candidateManifest, null, 2));
const candidateSchemaMigrationCount = candidateManifest.orderedSchemaMigrations?.length ?? 0;

const commands = {
  activeAccount: runGcloud("active-account", ["config", "get-value", "account"]),
  sourceInstance: runGcloud("source-instance", ["sql", "instances", "describe", instanceName, `--project=${projectId}`, "--format=json"]),
  backups: runGcloud("source-backups", ["sql", "backups", "list", `--instance=${instanceName}`, `--project=${projectId}`, "--limit=30", "--sort-by=~endTime", "--format=json"]),
  instances: runGcloud("project-sql-instances", ["sql", "instances", "list", `--project=${projectId}`, "--format=json"])
};

const sourceInstance = parseJson(commands.sourceInstance);
const backups = parseJson(commands.backups);
const instances = parseJson(commands.instances);
const successfulBackups = Array.isArray(backups) ? backups.filter(successfulBackup) : [];
const latestSuccessfulBackup = successfulBackups[0] ?? null;
const latestBackupAgeHours = ageHours(backupTimestamp(latestSuccessfulBackup));
const recentSuccessfulBackup = latestSuccessfulBackup !== null && latestBackupAgeHours !== null && latestBackupAgeHours >= 0 && latestBackupAgeHours <= 48;
const historicalRestoreTargetName = historicalReadback?.recovery?.restoreTarget ?? null;
const historicalRestoreTarget = Array.isArray(instances)
  ? instances.find((instance) => instance.name === historicalRestoreTargetName) ?? null
  : null;
const historicalRestoreTargetReadable =
  historicalRestoreTarget?.state === "RUNNABLE" &&
  historicalRestoreTarget?.region === region &&
  historicalRestoreTarget?.name !== instanceName &&
  privateOnly(historicalRestoreTarget);

const backupConfiguration = sourceInstance?.settings?.backupConfiguration ?? {};
const sourceProtectionReady =
  sourceInstance?.state === "RUNNABLE" &&
  sourceInstance?.region === region &&
  privateOnly(sourceInstance) &&
  backupConfiguration.enabled === true &&
  backupConfiguration.pointInTimeRecoveryEnabled === true &&
  (sourceInstance?.settings?.deletionProtectionEnabled === true || sourceInstance?.deletionProtection === true);

const currentRehearsalMatchesCandidate =
  currentRehearsal?.status === "succeeded" &&
  currentRehearsal?.productionActionPerformed === true &&
  currentRehearsal?.source?.projectId === projectId &&
  currentRehearsal?.source?.instance === instanceName &&
  currentRehearsal?.candidate?.manifestSha256 === candidateManifestSha256 &&
  currentRehearsal?.candidate?.schemaMigrationCount === candidateSchemaMigrationCount &&
  currentRehearsal?.restore?.targetInstance !== instanceName &&
  currentRehearsal?.restore?.state === "RUNNABLE" &&
  currentRehearsal?.migration?.firstPassSucceeded === true &&
  currentRehearsal?.migration?.idempotentRerunAppliedVersions === 0 &&
  currentRehearsal?.reconciliation?.allChecksPassed === true &&
  currentRehearsal?.reconciliation?.sourceSnapshotSha256 === currentRehearsal?.reconciliation?.restoreSnapshotSha256;

const reauthRequired = Object.values(commands).some((command) => /reauthentication failed|gcloud auth login/iu.test(command.stderr));
const blockers = [];
if (reauthRequired) blockers.push(blocker("GCLOUD_REAUTH_REQUIRED", "The active Google Cloud account must be reauthenticated before read-only backup metadata can be verified."));
if (!sourceInstance) blockers.push(blocker("PRODUCTION_CLOUD_SQL_SOURCE_UNREADABLE", "The production Cloud SQL source instance was not readable."));
if (sourceInstance && !sourceProtectionReady) blockers.push(blocker("PRODUCTION_BACKUP_PITR_PROTECTION_UNPROVEN", "Backup, PITR, deletion protection, private IP or source readiness did not match the production contract."));
if (!recentSuccessfulBackup) blockers.push(blocker("RECENT_SUCCESSFUL_NATIVE_BACKUP_UNPROVEN", "No successful native Cloud SQL backup within 48 hours was proven."));
if (!historicalRestoreTargetReadable) blockers.push(blocker("HISTORICAL_SEPARATE_RESTORE_TARGET_UNPROVEN", "The historical separate restore target was not proven readable, runnable and private."));
if (!currentRehearsalMatchesCandidate) blockers.push(blocker(
  "CURRENT_CANDIDATE_NATIVE_BACKUP_RESTORE_REHEARSAL_MISSING_OR_MISMATCHED",
  "The current migration manifest has not been proven by a native backup restore, exact migration apply/rerun and reconciliation on a separate target.",
  { currentRehearsalPath, candidateManifestSha256, candidateSchemaMigrationCount }
));

const report = {
  schemaVersion: 1,
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
  historicalRestoreEvidence: {
    readbackPath: historicalReadbackPath,
    backupId: historicalReadback?.recovery?.backupId ?? null,
    restoreTarget: historicalRestoreTargetName,
    migrationCount: historicalReadback?.reconciliation?.migrationCount ?? null,
    currentCandidateMigrationCount: candidateSchemaMigrationCount,
    targetReadable: historicalRestoreTargetReadable,
    historicalOnly: historicalReadback?.reconciliation?.migrationCount !== candidateSchemaMigrationCount
  },
  currentCandidateRehearsal: {
    evidencePath: currentRehearsalPath,
    evidencePresent: currentRehearsal !== null,
    matchesCandidate: currentRehearsalMatchesCandidate
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
    "Historical 18-migration restore evidence cannot satisfy the current candidate unless exact manifest hash and migration count match.",
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

