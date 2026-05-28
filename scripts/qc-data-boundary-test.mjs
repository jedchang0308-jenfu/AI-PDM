#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  getBackupDir,
  getDataDir,
  getEvidenceRoot,
  getFieldTestHandoffsDir,
  getQualityDir,
  getReportRoot,
  getRepositoryDir,
  getRestoreDrillsDir,
  getRestoreHandoffsDir,
  getRestoreTargetsDir,
  getRetentionDrillsDir
} from "./pdm-paths.mjs";

const root = process.cwd();
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8");
}

function runGit(args) {
  return spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
}

function normalize(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/") || ".";
}

const envExample = read(".env.example");
for (const variable of [
  "PDM_DATA_DIR",
  "PDM_REPOSITORY_DIR",
  "PDM_BACKUP_DIR",
  "PDM_QUALITY_DIR",
  "PDM_EVIDENCE_DIR",
  "PDM_REPORT_DIR",
  "PDM_RESTORE_DRILL_DIR",
  "PDM_RESTORE_TARGET_DIR",
  "PDM_RETENTION_DRILL_DIR",
  "PDM_RESTORE_HANDOFF_DIR",
  "PDM_FIELD_TEST_HANDOFF_DIR"
]) {
  record(`DATA-BOUNDARY env documented: ${variable}`, new RegExp(`^${variable}=`, "m").test(envExample), ".env.example");
}

const ignored = runGit(["check-ignore", "-v", "--", "data/"]);
record("DATA-BOUNDARY data root ignored", ignored.status === 0, (ignored.stdout || ignored.stderr).trim());

const trackedData = runGit(["ls-files", "--", "data/"]);
record("DATA-BOUNDARY data root not tracked", trackedData.status === 0 && trackedData.stdout.trim() === "", trackedData.stdout.trim());

const defaultPaths = {
  dataDir: getDataDir(root),
  repositoryDir: getRepositoryDir(root),
  backupDir: getBackupDir(root),
  qualityDir: getQualityDir(root),
  evidenceRoot: getEvidenceRoot(root),
  reportRoot: getReportRoot(root, "sw-addin-test-reports"),
  restoreDrillsDir: getRestoreDrillsDir(root),
  restoreTargetsDir: getRestoreTargetsDir(root),
  retentionDrillsDir: getRetentionDrillsDir(root),
  restoreHandoffsDir: getRestoreHandoffsDir(root),
  fieldTestHandoffsDir: getFieldTestHandoffsDir(root)
};

record("DATA-BOUNDARY repository defaults under data", normalize(defaultPaths.repositoryDir) === "data/repository", normalize(defaultPaths.repositoryDir));
record("DATA-BOUNDARY backups default under data", normalize(defaultPaths.backupDir) === "data/backups", normalize(defaultPaths.backupDir));
record("DATA-BOUNDARY quality default under data", normalize(defaultPaths.qualityDir) === "data/quality", normalize(defaultPaths.qualityDir));
record("DATA-BOUNDARY reports default under data", normalize(defaultPaths.reportRoot) === "data/sw-addin-test-reports", normalize(defaultPaths.reportRoot));
record("DATA-BOUNDARY restore drills default under data", normalize(defaultPaths.restoreDrillsDir) === "data/restore-drills", normalize(defaultPaths.restoreDrillsDir));

const pathSensitiveScripts = [
  "scripts/backup.mjs",
  "scripts/verify-backup.mjs",
  "scripts/restore-backup.mjs",
  "scripts/restore-drill.mjs",
  "scripts/backup-retention-drill.mjs",
  "scripts/prepare-restore-handoff.mjs",
  "scripts/prepare-field-test-handoff.mjs",
  "scripts/field-test-preflight.mjs",
  "scripts/sw-addin-report-utils.mjs",
  "scripts/document-manager-report-utils.mjs",
  "scripts/restore-drill-report-utils.mjs",
  "scripts/defect-register-utils.mjs",
  "scripts/init-db.mjs",
  "scripts/seed.mjs",
  "scripts/create-user.mjs",
  "scripts/verify-file-hashes.mjs",
  "scripts/migrate-v2.mjs"
];

for (const script of pathSensitiveScripts) {
  record(`DATA-BOUNDARY script uses central paths: ${script}`, read(script).includes("./pdm-paths.mjs"), script);
}

const nextConfig = read("next.config.mjs");
record("DATA-BOUNDARY Next standalone excludes runtime data", nextConfig.includes('"./data/**/*"'), "next.config.mjs");

const failed = results.filter((result) => !result.passed);
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      defaultPaths: Object.fromEntries(Object.entries(defaultPaths).map(([key, value]) => [key, normalize(value)])),
      results
    },
    null,
    2
  )
);

process.exitCode = failed.length === 0 ? 0 : 1;
