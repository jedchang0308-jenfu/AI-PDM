#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { getRetentionDrillsDir } from "./pdm-paths.mjs";

const root = process.cwd();
const drillRoot = path.join(getRetentionDrillsDir(root), makeDrillId(new Date()));
const sourceDataDir = path.join(drillRoot, "source", "data");
const sourceRepositoryDir = path.join(sourceDataDir, "repository");
const backupDir = path.join(drillRoot, "backups");
const sourceFilePath = path.join(sourceRepositoryDir, "pending", "2026", "05", "SUB-RETENTION-001", "RETENTION-001.pdf");
const sourceContent = Buffer.from("retention drill source file\n", "utf8");
const sourceSha256 = crypto.createHash("sha256").update(sourceContent).digest("hex");

function makeDrillId(date) {
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

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function seedSource() {
  fs.mkdirSync(path.dirname(sourceFilePath), { recursive: true });
  fs.writeFileSync(sourceFilePath, sourceContent);
  fs.mkdirSync(sourceDataDir, { recursive: true });

  const schema = fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8");
  const db = new Database(path.join(sourceDataDir, "ai-pdm.sqlite"));
  try {
    db.exec(schema);
    db.prepare(
      "INSERT INTO users (id, display_name, email, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("user-retention", "Retention Drill", "retention@example.com", "Engineer", new Date().toISOString(), new Date().toISOString());
    db.prepare(
      "INSERT INTO items (id, part_number, part_name, current_revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("item-retention", "RETENTION-PART-001", "Retention Part", "A", new Date().toISOString(), new Date().toISOString());
    db.prepare(
      `INSERT INTO submissions (
        id, item_id, drawing_number, revision, material, surface_finish, document_type,
        change_description, status, submitted_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "SUB-RETENTION-001",
      "item-retention",
      "RETENTION-001",
      "A",
      "Steel",
      "None",
      "Drawing",
      "Retention drill setup file",
      "Pending",
      "user-retention",
      new Date().toISOString(),
      new Date().toISOString()
    );
    db.prepare(
      `INSERT INTO submission_files (
        id, submission_id, file_role, original_filename, local_path, sha256, file_size, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "file-retention-001",
      "SUB-RETENTION-001",
      "pdf",
      "RETENTION-001.pdf",
      sourceFilePath,
      sourceSha256,
      sourceContent.byteLength,
      new Date().toISOString()
    );
  } finally {
    db.close();
  }
}

function runBackup() {
  const result = spawnSync(process.execPath, ["scripts/backup.mjs"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PDM_DATA_DIR: sourceDataDir,
      PDM_REPOSITORY_DIR: sourceRepositoryDir,
      PDM_BACKUP_DIR: backupDir
    }
  });

  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    process.exit(result.status ?? 1);
  }

  return JSON.parse(result.stdout);
}

seedSource();
const backupResult = runBackup();
const backedUpFile = path.join(backupResult.snapshotDir, "repository", "pending", "2026", "05", "SUB-RETENTION-001", "RETENTION-001.pdf");

fs.rmSync(sourceFilePath, { force: true });

const retained = fs.existsSync(backedUpFile);
const hashMatches = retained && sha256File(backedUpFile) === sourceSha256;

if (!retained || !hashMatches) {
  console.error(JSON.stringify({ retained, hashMatches, backedUpFile, passed: false }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      drillRoot,
      snapshotDir: backupResult.snapshotDir,
      sourceDeleted: !fs.existsSync(sourceFilePath),
      retained,
      hashMatches,
      passed: true
    },
    null,
    2
  )
);
