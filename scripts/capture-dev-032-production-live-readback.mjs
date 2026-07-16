#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const contractPath = path.join(root, "config", "platform", "production-activation-evidence.json");
const outputDir = path.join(root, "output", "dev-032-production-live-readback");
const outputPath = path.join(outputDir, "report.json");
const contract = JSON.parse(readFileSync(contractPath, "utf8"));
const windowsCloudSdkRoot = process.env.CLOUDSDK_ROOT_DIR
  ?? (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Google", "Cloud SDK", "google-cloud-sdk") : null);
if (process.platform === "win32" && !windowsCloudSdkRoot) {
  throw new Error("Cloud SDK root is unavailable: set CLOUDSDK_ROOT_DIR or LOCALAPPDATA.");
}
const cloudSdkRoot = windowsCloudSdkRoot ?? "";
const gcloud = process.platform === "win32"
  ? path.join(cloudSdkRoot, "platform", "bundledpython", "python.exe")
  : "gcloud";
const gcloudPrefix = process.platform === "win32" ? [path.join(cloudSdkRoot, "lib", "gcloud.py")] : [];

function runGcloud(args) {
  const result = spawnSync(gcloud, [...gcloudPrefix, ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`gcloud ${args[0]} failed (${result.status}): ${result.stderr.trim()}`);
  }
  return JSON.parse(result.stdout);
}

function execution(name) {
  return runGcloud([
    "run", "jobs", "executions", "describe", name,
    `--project=${contract.target.projectId}`,
    `--region=${contract.target.region}`,
    "--format=json"
  ]);
}

function executionResult(name) {
  const filter = [
    'resource.type="cloud_run_job"',
    'resource.labels.job_name="ai-pdm-prod-migration-runner"',
    `labels."run.googleapis.com/execution_name"="${name}"`,
    'labels.container_name="ai-pdm-migration-runner"',
    `logName="projects/${contract.target.projectId}/logs/run.googleapis.com%2Fstdout"`
  ].join(" AND ");
  const entries = runGcloud([
    "logging", "read", filter,
    `--project=${contract.target.projectId}`,
    "--limit=100",
    "--order=asc",
    "--format=json"
  ]);
  const lines = entries
    .filter((entry) => typeof entry.textPayload === "string")
    .sort((left, right) => String(left.timestamp).localeCompare(String(right.timestamp)))
    .map((entry) => entry.textPayload);
  const first = lines.findIndex((line) => line.trim() === "{");
  const last = lines.findLastIndex((line) => line.trim() === "}");
  if (first < 0 || last <= first) throw new Error(`No JSON runner result found for ${name}`);
  return JSON.parse(lines.slice(first, last + 1).join("\n"));
}

function executionPassed(value) {
  return value?.status?.succeededCount === 1
    && value?.spec?.template?.spec?.maxRetries === 0
    && value?.status?.conditions?.some((condition) => condition.type === "Completed" && condition.status === "True");
}

function privateOnly(instance) {
  return instance?.settings?.ipConfiguration?.ipv4Enabled === false
    && Array.isArray(instance?.ipAddresses)
    && instance.ipAddresses.length > 0
    && instance.ipAddresses.every((address) => address.type === "PRIVATE");
}

function runtimeEnv(service, name) {
  return service?.spec?.template?.spec?.containers?.[0]?.env?.find((entry) => entry.name === name)?.value ?? null;
}

function activeTrafficEntries(service) {
  return (service?.status?.traffic ?? []).filter((entry) => Number(entry.percent ?? 0) > 0);
}

const principalExecution = execution(contract.executions.principalBootstrap);
const preCanaryExecution = execution(contract.executions.preCanaryReconciliation);
const restoreExecution = execution(contract.executions.restoreReconciliation);
const principalResult = executionResult(contract.executions.principalBootstrap);
const preCanaryResult = executionResult(contract.executions.preCanaryReconciliation);
const restoreResult = executionResult(contract.executions.restoreReconciliation);
const sourceSql = runGcloud(["sql", "instances", "describe", contract.target.cloudSqlInstance, `--project=${contract.target.projectId}`, "--format=json"]);
const restoreSql = runGcloud(["sql", "instances", "describe", contract.recovery.restoreTarget, `--project=${contract.target.projectId}`, "--format=json"]);
const backup = runGcloud(["sql", "backups", "describe", contract.recovery.backupId, `--instance=${contract.target.cloudSqlInstance}`, `--project=${contract.target.projectId}`, "--format=json"]);
const runtime = runGcloud(["run", "services", "describe", contract.target.runtimeService, `--project=${contract.target.projectId}`, `--region=${contract.target.region}`, "--format=json"]);
const runtimeImage = runtime?.spec?.template?.spec?.containers?.[0]?.image ?? "";
const activeTraffic = activeTrafficEntries(runtime);
const principalReadback = principalResult?.readback ?? {};
const preCanaryReadback = preCanaryResult?.readback ?? {};
const restoreReadback = restoreResult?.readback ?? {};

const checks = {
  principalExecutionPassed: executionPassed(principalExecution),
  principalReadbackPassed: principalResult?.mode === "execute"
    && principalReadback.allChecksPassed === true
    && principalReadback.principalId === contract.initialPrincipal.pdmUserId
    && principalReadback.firebaseUid === contract.initialPrincipal.firebaseUid
    && principalReadback.roleCount === contract.initialPrincipal.expectedRoleCount
    && principalReadback.permissionCount === contract.initialPrincipal.expectedPermissionCount,
  preCanaryExecutionPassed: executionPassed(preCanaryExecution),
  preCanaryReadbackPassed: preCanaryResult?.mode === "pre_canary"
    && preCanaryReadback.allChecksPassed === true
    && preCanaryReadback.migrationCount === 18
    && preCanaryReadback.roleCount === contract.initialPrincipal.expectedRoleCount
    && preCanaryReadback.permissionCount === contract.initialPrincipal.expectedPermissionCount,
  sourceCloudSqlReady: sourceSql?.project === contract.target.projectId
    && sourceSql?.region === contract.target.region
    && sourceSql?.name === contract.target.cloudSqlInstance
    && sourceSql?.state === "RUNNABLE"
    && sourceSql?.settings?.availabilityType === "REGIONAL"
    && sourceSql?.settings?.backupConfiguration?.enabled === true
    && sourceSql?.settings?.backupConfiguration?.pointInTimeRecoveryEnabled === true
    && sourceSql?.settings?.deletionProtectionEnabled === true
    && privateOnly(sourceSql),
  recoveryPointReady: String(backup?.id) === String(contract.recovery.backupId)
    && backup?.instance === contract.target.cloudSqlInstance
    && backup?.status === "SUCCESSFUL",
  restoreTargetSeparateAndReady: restoreSql?.project === contract.target.projectId
    && restoreSql?.region === contract.target.region
    && restoreSql?.name === contract.recovery.restoreTarget
    && restoreSql?.name !== sourceSql?.name
    && restoreSql?.state === "RUNNABLE"
    && privateOnly(restoreSql),
  restoreExecutionPassed: executionPassed(restoreExecution),
  restoreReadbackPassed: restoreResult?.mode === "restore"
    && restoreReadback.allChecksPassed === true
    && restoreReadback.migrationCount === preCanaryReadback.migrationCount
    && restoreReadback.roleCount === preCanaryReadback.roleCount
    && restoreReadback.permissionCount === preCanaryReadback.permissionCount,
  numberingSnapshotMatched: preCanaryReadback.numberingSnapshotSha256 === contract.recovery.numberingSnapshotSha256
    && restoreReadback.numberingSnapshotSha256 === contract.recovery.numberingSnapshotSha256,
  runtimeReady: runtime?.metadata?.namespace === "451715062958"
    && runtime?.status?.conditions?.some((condition) => condition.type === "Ready" && condition.status === "True")
    && activeTraffic.length === 1
    && activeTraffic[0].percent === 100,
  runtimeArtifactMatched: runtimeImage.endsWith(`@${contract.artifact.applicationImageDigest}`),
  productionSliceActive: runtimeEnv(runtime, "PDM_PRODUCTION_SLICE_MODE") === "official-numbering-draft"
    && runtimeEnv(runtime, "PDM_PUBLIC_BASE_URL") === contract.target.canonicalBaseUrl
};
const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
const report = {
  schemaVersion: 1,
  dev: "DEV-032",
  capturedAt: new Date().toISOString(),
  readOnlyCapture: true,
  productionMutationPerformed: false,
  target: contract.target,
  artifact: {
    applicationSourceRevision: contract.artifact.applicationSourceRevision,
    applicationImageDigest: contract.artifact.applicationImageDigest,
    migrationSourceRevision: contract.artifact.migrationSourceRevision,
    migrationImageDigest: contract.artifact.migrationImageDigest,
    liveRuntimeImage: runtimeImage,
    latestReadyRevision: runtime?.status?.latestReadyRevisionName ?? null
  },
  principal: {
    execution: contract.executions.principalBootstrap,
    pdmUserId: principalReadback.principalId ?? null,
    firebaseUid: principalReadback.firebaseUid ?? null,
    roleCount: principalReadback.roleCount ?? null,
    permissionCount: principalReadback.permissionCount ?? null,
    passed: checks.principalExecutionPassed && checks.principalReadbackPassed
  },
  reconciliation: {
    preCanaryExecution: contract.executions.preCanaryReconciliation,
    restoreExecution: contract.executions.restoreReconciliation,
    migrationCount: preCanaryReadback.migrationCount ?? null,
    counts: preCanaryReadback.counts ?? null,
    sourceNumberingSnapshotSha256: preCanaryReadback.numberingSnapshotSha256 ?? null,
    restoreNumberingSnapshotSha256: restoreReadback.numberingSnapshotSha256 ?? null,
    preCanaryPassed: checks.preCanaryExecutionPassed && checks.preCanaryReadbackPassed,
    restorePassed: checks.restoreExecutionPassed && checks.restoreReadbackPassed && checks.numberingSnapshotMatched
  },
  recovery: {
    backupId: String(backup?.id ?? ""),
    backupStatus: backup?.status ?? null,
    sourceInstance: sourceSql?.name ?? null,
    sourceState: sourceSql?.state ?? null,
    sourceBackupEnabled: sourceSql?.settings?.backupConfiguration?.enabled === true,
    sourcePitrEnabled: sourceSql?.settings?.backupConfiguration?.pointInTimeRecoveryEnabled === true,
    sourceDeletionProtection: sourceSql?.settings?.deletionProtectionEnabled === true,
    restoreTarget: restoreSql?.name ?? null,
    restoreState: restoreSql?.state ?? null,
    separateTarget: restoreSql?.name !== sourceSql?.name,
    privateOnly: privateOnly(sourceSql) && privateOnly(restoreSql)
  },
  runtime: {
    service: runtime?.metadata?.name ?? null,
    latestReadyRevision: runtime?.status?.latestReadyRevisionName ?? null,
    trafficPercent: activeTraffic[0]?.percent ?? null,
    trafficRevision: activeTraffic[0]?.revisionName ?? null,
    taggedRevisionCount: Math.max((runtime?.status?.traffic?.length ?? 0) - activeTraffic.length, 0),
    productionSliceMode: runtimeEnv(runtime, "PDM_PRODUCTION_SLICE_MODE"),
    canonicalBaseUrl: runtimeEnv(runtime, "PDM_PUBLIC_BASE_URL")
  },
  checks,
  failed,
  allChecksPassed: failed.length === 0
};

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath: path.relative(root, outputPath).replaceAll("\\", "/"), allChecksPassed: report.allChecksPassed, failed }, null, 2));
if (failed.length > 0) process.exitCode = 1;
