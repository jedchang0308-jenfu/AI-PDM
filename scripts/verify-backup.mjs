#!/usr/bin/env node

import crypto from "node:crypto";
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { getBackupDir, resolveUserPath } from "./pdm-paths.mjs";

const root = process.cwd();
const backupRoot = getBackupDir(root);
const snapshotDir = resolveSnapshotDir();
const manifestPath = path.join(snapshotDir, "manifest.json");

function resolveSnapshotDir() {
  const arg = process.argv[2];
  if (arg && arg !== "--latest") {
    return resolveUserPath(root, arg);
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

function sha256FileSync(filePath) {
  const hash = crypto.createHash("sha256");
  const file = openSync(filePath, "r");
  const buffer = Buffer.alloc(1024 * 1024);

  try {
    let bytesRead = 0;
    while ((bytesRead = readSync(file, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    closeSync(file);
  }

  return hash.digest("hex");
}

if (!existsSync(manifestPath)) {
  console.error(`Backup manifest not found at ${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const failures = [];

for (const expected of manifest.files ?? []) {
  const filePath = path.join(snapshotDir, expected.path);
  if (!existsSync(filePath)) {
    failures.push({ path: expected.path, reason: "missing" });
    continue;
  }

  const stat = statSync(filePath);
  const actualHash = sha256FileSync(filePath);
  if (stat.size !== expected.size || actualHash !== expected.sha256) {
    failures.push({
      path: expected.path,
      reason: "checksum-mismatch",
      expectedSize: expected.size,
      actualSize: stat.size,
      expectedSha256: expected.sha256,
      actualSha256: actualHash
    });
  }
}

if (!existsSync(path.join(snapshotDir, "database", "ai-pdm.sqlite"))) {
  failures.push({ path: "database/ai-pdm.sqlite", reason: "required-db-missing" });
}

if (!existsSync(path.join(snapshotDir, "repository"))) {
  failures.push({ path: "repository", reason: "required-repository-missing" });
}

if (failures.length > 0) {
  console.error(JSON.stringify({ snapshotDir, valid: false, failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      snapshotDir,
      valid: true,
      fileCount: manifest.fileCount,
      totalBytes: manifest.totalBytes
    },
    null,
    2
  )
);
