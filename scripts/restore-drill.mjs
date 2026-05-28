#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

const root = process.cwd();
const drillRoot = path.join(root, "data", "restore-drills", makeDrillId(new Date()));

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

function runRestore() {
  const result = spawnSync(
    process.execPath,
    ["scripts/restore-backup.mjs", "--latest", "--target", drillRoot, "--force"],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    process.exit(result.status ?? 1);
  }

  return JSON.parse(result.stdout);
}

function verifyRestoredDatabase(dbPath) {
  const db = new Database(dbPath);
  try {
    const integrity = db.prepare("PRAGMA integrity_check").get();
    const integrityValue = Object.values(integrity)[0];
    if (integrityValue !== "ok") {
      return { ok: false, reason: `integrity_check=${integrityValue}` };
    }

    const submissionCount = db.prepare("SELECT COUNT(*) AS count FROM submissions").get().count;
    const fileRows = db.prepare("SELECT local_path, sha256 FROM submission_files").all();
    const missingFiles = [];
    const hashMismatches = [];

    for (const row of fileRows) {
      const filePath = String(row.local_path);
      if (!fs.existsSync(filePath)) {
        missingFiles.push(filePath);
        continue;
      }

      const actualSha256 = sha256File(filePath);
      if (actualSha256 !== row.sha256) {
        hashMismatches.push(filePath);
      }
    }

    return {
      ok: missingFiles.length === 0 && hashMismatches.length === 0,
      submissionCount,
      fileCount: fileRows.length,
      missingFiles,
      hashMismatches
    };
  } finally {
    db.close();
  }
}

const restoreResult = runRestore();
const dbResult = verifyRestoredDatabase(restoreResult.targetDbPath);

if (!dbResult.ok) {
  console.error(JSON.stringify({ restoreResult, dbResult, passed: false }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      drillRoot,
      targetDbPath: restoreResult.targetDbPath,
      targetRepositoryDir: restoreResult.targetRepositoryDir,
      rewrittenLocalPaths: restoreResult.rewrittenLocalPaths,
      submissionCount: dbResult.submissionCount,
      fileCount: dbResult.fileCount,
      passed: true
    },
    null,
    2
  )
);
