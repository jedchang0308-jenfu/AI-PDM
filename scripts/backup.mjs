#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { getBackupDir, getDataDir, getRepositoryDir, resolveUserPath } from "./pdm-paths.mjs";

const root = process.cwd();
const dataDir = getDataDir(root);
const repositoryDir = getRepositoryDir(root);
const backupRoot = getBackupDir(root);
const dbPath = path.join(dataDir, "ai-pdm.sqlite");
const snapshotId = makeSnapshotId(new Date());
const snapshotDir = path.join(backupRoot, snapshotId);

function makeSnapshotId(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function quoteSqlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const file = fs.openSync(filePath, "r");
  const buffer = Buffer.alloc(1024 * 1024);

  try {
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(file, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(file);
  }

  return hash.digest("hex");
}

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function copyIfExists(source, target) {
  if (!fs.existsSync(source)) return false;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
  return true;
}

function parseExtraPaths() {
  return (process.env.PDM_BACKUP_EXTRA_PATHS ?? "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => resolveUserPath(root, item));
}

if (!fs.existsSync(dbPath)) {
  console.error(`Database not found at ${dbPath}`);
  process.exit(1);
}

fs.mkdirSync(snapshotDir, { recursive: true });

const backupDbPath = path.join(snapshotDir, "database", "ai-pdm.sqlite");
fs.mkdirSync(path.dirname(backupDbPath), { recursive: true });

const db = new Database(dbPath);
try {
  db.exec(`VACUUM INTO ${quoteSqlString(backupDbPath)}`);
} finally {
  db.close();
}

copyIfExists(repositoryDir, path.join(snapshotDir, "repository"));
copyIfExists(path.join(root, ".env"), path.join(snapshotDir, "config", ".env"));
copyIfExists(path.join(root, ".env.local"), path.join(snapshotDir, "config", ".env.local"));
copyIfExists(path.join(root, ".env.example"), path.join(snapshotDir, "config", ".env.example"));
copyIfExists(path.join(dataDir, "logs"), path.join(snapshotDir, "logs"));

for (const extraPath of parseExtraPaths()) {
  copyIfExists(extraPath, path.join(snapshotDir, "extra", path.basename(extraPath)));
}

const createdAt = new Date().toISOString();
fs.writeFileSync(
  path.join(snapshotDir, "backup.log"),
  [
    `snapshotId=${snapshotId}`,
    `createdAt=${createdAt}`,
    `dbPath=${dbPath}`,
    `repositoryDir=${repositoryDir}`,
    "status=completed"
  ].join("\n") + "\n",
  "utf8"
);

const files = walkFiles(snapshotDir)
  .filter((filePath) => path.basename(filePath) !== "manifest.json")
  .map((filePath) => {
    const stat = fs.statSync(filePath);
    return {
      path: path.relative(snapshotDir, filePath).replaceAll(path.sep, "/"),
      size: stat.size,
      sha256: sha256File(filePath)
    };
  })
  .sort((a, b) => a.path.localeCompare(b.path));

const manifest = {
  snapshotId,
  createdAt,
  root,
  sources: {
    dataDir,
    repositoryDir,
    dbPath
  },
  fileCount: files.length,
  totalBytes: files.reduce((sum, file) => sum + file.size, 0),
  files
};

fs.writeFileSync(path.join(snapshotDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      snapshotId,
      snapshotDir,
      fileCount: manifest.fileCount,
      totalBytes: manifest.totalBytes,
      manifest: path.join(snapshotDir, "manifest.json")
    },
    null,
    2
  )
);
