#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { readProjectFile } from "./qc-project-file-utils.mjs";
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
const allowedTrackedDataFiles = new Set(["data/quality/defect-register.json"]);

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

const read = (relativePath) => readProjectFile(root, relativePath);

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

const runtimeIgnored = runGit(["check-ignore", "-v", "--", "data/repository/", "data/quality/generated.json"]);
record("DATA-BOUNDARY runtime data paths ignored", runtimeIgnored.status === 0, (runtimeIgnored.stdout || runtimeIgnored.stderr).trim());

const trackedData = runGit(["ls-files", "--", "data/"]);
const trackedDataFiles = trackedData.stdout.trim().split(/\r?\n/u).filter(Boolean);
const unexpectedTrackedDataFiles = trackedDataFiles.filter((file) => !allowedTrackedDataFiles.has(file));
record(
  "DATA-BOUNDARY tracked data limited to quality baseline",
  trackedData.status === 0 && unexpectedTrackedDataFiles.length === 0,
  unexpectedTrackedDataFiles.join("\n") || trackedDataFiles.join("\n")
);
record(
  "DATA-BOUNDARY quality baseline remains tracked",
  trackedDataFiles.includes("data/quality/defect-register.json"),
  trackedDataFiles.join("\n")
);

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
  "scripts/qc-search-indexes-test.mjs",
  "scripts/migrate-v2.mjs"
];

for (const script of pathSensitiveScripts) {
  record(`DATA-BOUNDARY script uses central paths: ${script}`, read(script).includes("./pdm-paths.mjs"), script);
}

const searchIndexesTest = read("scripts/qc-search-indexes-test.mjs");
record(
  "DATA-BOUNDARY search index QC avoids invalid fixture hashes",
  !searchIndexesTest.includes("idx-hash") && searchIndexesTest.includes("createHash(\"sha256\")"),
  "scripts/qc-search-indexes-test.mjs"
);
record(
  "DATA-BOUNDARY search index QC cleans fixture residue",
  searchIndexesTest.includes("cleanupIndexedRows") && searchIndexesTest.includes("QC seed rows cleaned after run"),
  "scripts/qc-search-indexes-test.mjs"
);

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
