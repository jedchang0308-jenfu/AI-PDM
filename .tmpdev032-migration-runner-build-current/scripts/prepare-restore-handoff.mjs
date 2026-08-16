#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getBackupDir, getRestoreHandoffsDir, resolveUserPath } from "./pdm-paths.mjs";

const root = process.cwd();
const backupRoot = getBackupDir(root);
const args = parseArgs(process.argv.slice(2));
const snapshotDir = resolveSnapshotDir(args.snapshot);
const manifestPath = path.join(snapshotDir, "manifest.json");
const manifest = readSnapshotManifest();
const outputRoot = args.output ? resolveUserPath(root, args.output) : getRestoreHandoffsDir(root);
const outputDir = path.join(outputRoot, manifest.snapshotId ?? path.basename(snapshotDir));

function parseArgs(argv) {
  const parsed = {
    snapshot: "--latest",
    output: ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--latest") {
      parsed.snapshot = "--latest";
    } else if (arg === "--snapshot") {
      parsed.snapshot = argv[++index] ?? "";
    } else if (arg === "--output") {
      parsed.output = argv[++index] ?? "";
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  return parsed;
}

function resolveSnapshotDir(snapshotArg) {
  if (snapshotArg && snapshotArg !== "--latest") {
    return resolveUserPath(root, snapshotArg);
  }

  if (!existsSync(backupRoot)) {
    console.error(`Backup root not found at ${backupRoot}`);
    process.exit(1);
  }

  const snapshots = readdirSync(backupRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(backupRoot, entry.name))
    .sort();

  if (snapshots.length === 0) {
    console.error(`No backup snapshots found at ${backupRoot}`);
    process.exit(1);
  }

  return snapshots[snapshots.length - 1];
}

function readSnapshotManifest() {
  if (!existsSync(manifestPath)) {
    console.error(`Backup manifest not found at ${manifestPath}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

function runSnapshotVerification() {
  const result = spawnSync(process.execPath, ["scripts/verify-backup.mjs", snapshotDir], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    process.exit(result.status ?? 1);
  }

  return JSON.parse(result.stdout);
}

function powershellSingleQuoted(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function toPortableSlash(value) {
  return value.replaceAll(path.sep, "/");
}

function buildPowerShellScript() {
  const snapshot = powershellSingleQuoted(snapshotDir);

  return [
    "param(",
    `  [string]$SnapshotPath = ${snapshot},`,
    '  [string]$TargetDir = "data/restore-targets/manual-restore"',
    ")",
    "",
    '$ErrorActionPreference = "Stop"',
    "",
    'Write-Host "Verifying backup snapshot..."',
    'node scripts/verify-backup.mjs "$SnapshotPath"',
    "",
    'Write-Host "Restoring snapshot into test target..."',
    'npm.cmd run backup:restore -- --snapshot "$SnapshotPath" --target "$TargetDir" --force',
    "",
    '$env:PDM_DATA_DIR = Join-Path $TargetDir "data"',
    '$env:PDM_REPOSITORY_DIR = Join-Path $TargetDir "data/repository"',
    "",
    'Write-Host "Running restored app verification..."',
    "npm.cmd run build",
    "npm.cmd run smoke",
    "npm.cmd run qc:api",
    "npm.cmd run qc:file-hashes",
    "",
    'Write-Host "Reporting production readiness blockers..."',
    "npm.cmd run qc:production-readiness:report",
    "",
    'Write-Host "Restore handoff verification complete."',
    ""
  ].join("\r\n");
}

function buildReadme(handoff) {
  return [
    "# AI PDM Restore Handoff",
    "",
    `Snapshot ID: \`${handoff.snapshot.snapshotId}\``,
    `Snapshot path: \`${handoff.snapshot.snapshotDir}\``,
    `Created at: \`${handoff.snapshot.createdAt}\``,
    "",
    "## Purpose",
    "",
    "Use this handoff on a separate Windows test machine to prove the offline backup can restore the database and repository without depending on the original source directory.",
    "",
    "## Test Machine Command",
    "",
    "```powershell",
    ".\\restore-on-test-machine.ps1",
    "```",
    "",
    "If the snapshot is copied to a different path, pass it explicitly:",
    "",
    "```powershell",
    ".\\restore-on-test-machine.ps1 -SnapshotPath \"D:\\AI_PDM_BACKUPS\\<snapshot>\" -TargetDir \"data\\restore-targets\\manual-restore\"",
    "```",
    "",
    "## Passing Criteria",
    "",
    "- Snapshot verification returns `valid: true`.",
    "- Restore command exits 0.",
    "- `npm.cmd run build` exits 0 against restored paths.",
    "- `npm.cmd run smoke` exits 0 against restored paths.",
    "- `npm.cmd run qc:api` exits 0 against restored paths.",
    "- `npm.cmd run qc:file-hashes` reports no missing, size mismatch, or hash mismatch issues.",
    "- `qc:production-readiness:report` is recorded with remaining external blockers.",
    "",
    "## Files In This Handoff",
    "",
    "- `restore-handoff.json`: machine-readable handoff summary.",
    "- `restore-on-test-machine.ps1`: execution script for the independent test machine.",
    "- `README.md`: this operator guide.",
    ""
  ].join("\n");
}

const verification = runSnapshotVerification();

mkdirSync(outputDir, { recursive: true });

const handoff = {
  generatedAt: new Date().toISOString(),
  snapshot: {
    snapshotId: manifest.snapshotId ?? path.basename(snapshotDir),
    snapshotDir,
    createdAt: manifest.createdAt,
    fileCount: manifest.fileCount,
    totalBytes: manifest.totalBytes,
    manifest: manifestPath
  },
  verification,
  testMachine: {
    script: "restore-on-test-machine.ps1",
    defaultTargetDir: "data/restore-targets/manual-restore",
    commands: [
      "node scripts/verify-backup.mjs <snapshot>",
      "npm.cmd run backup:restore -- --snapshot <snapshot> --target data/restore-targets/manual-restore --force",
      "$env:PDM_DATA_DIR=\"data/restore-targets/manual-restore/data\"",
      "$env:PDM_REPOSITORY_DIR=\"data/restore-targets/manual-restore/data/repository\"",
      "npm.cmd run build",
      "npm.cmd run smoke",
      "npm.cmd run qc:api",
      "npm.cmd run qc:file-hashes",
      "npm.cmd run qc:production-readiness:report"
    ],
    passingCriteria: [
      "backup manifest verification passes",
      "restore exits 0",
      "build exits 0 using restored paths",
      "smoke exits 0 using restored paths",
      "qc:api exits 0 using restored paths",
      "qc:file-hashes reports 0 issues using restored paths"
    ]
  }
};

writeFileSync(path.join(outputDir, "restore-handoff.json"), `${JSON.stringify(handoff, null, 2)}\n`, "utf8");
writeFileSync(path.join(outputDir, "restore-on-test-machine.ps1"), buildPowerShellScript(), "utf8");
writeFileSync(path.join(outputDir, "README.md"), buildReadme(handoff), "utf8");

console.log(JSON.stringify({
  snapshotId: handoff.snapshot.snapshotId,
  snapshotDir: handoff.snapshot.snapshotDir,
  outputDir,
  files: [
    toPortableSlash(path.relative(root, path.join(outputDir, "restore-handoff.json"))),
    toPortableSlash(path.relative(root, path.join(outputDir, "restore-on-test-machine.ps1"))),
    toPortableSlash(path.relative(root, path.join(outputDir, "README.md")))
  ],
  verification: {
    valid: verification.valid,
    fileCount: verification.fileCount,
    totalBytes: verification.totalBytes
  }
}, null, 2));
