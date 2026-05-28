#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { getDataDir } from "./pdm-paths.mjs";

const root = process.cwd();
const dbPath = path.join(getDataDir(root), "ai-pdm.sqlite");
const maxIssues = parsePositiveInt(process.env.PDM_HASH_CHECK_MAX_ISSUES) ?? 50;

function parsePositiveInt(value) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function readFileRows() {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    return db
      .prepare(
        `SELECT
          f.id,
          f.submission_id,
          f.file_role,
          f.original_filename,
          f.local_path,
          f.sha256,
          f.file_size,
          s.drawing_number,
          s.revision,
          s.status
        FROM submission_files f
        JOIN submissions s ON s.id = f.submission_id
        ORDER BY f.created_at ASC, f.id ASC`
      )
      .all();
  } finally {
    db.close();
  }
}

function addIssue(issues, issue) {
  if (issues.length < maxIssues) {
    issues.push(issue);
  }
}

function summarize(results) {
  const summary = {
    dbPath,
    checkedAt: new Date().toISOString(),
    total: results.length,
    ok: 0,
    missing: 0,
    unreadable: 0,
    sizeMismatch: 0,
    hashMismatch: 0,
    issues: []
  };

  for (const result of results) {
    if (result.status === "ok") summary.ok += 1;
    else if (result.status === "missing") summary.missing += 1;
    else if (result.status === "unreadable") summary.unreadable += 1;
    else if (result.status === "size_mismatch") summary.sizeMismatch += 1;
    else if (result.status === "hash_mismatch") summary.hashMismatch += 1;

    if (result.status !== "ok") addIssue(summary.issues, result);
  }

  return summary;
}

async function verifyRow(row) {
  const context = {
    fileId: row.id,
    submissionId: row.submission_id,
    drawingNumber: row.drawing_number,
    revision: row.revision,
    status: row.status,
    fileRole: row.file_role,
    originalFilename: row.original_filename,
    localPath: row.local_path
  };

  let fileStat;
  try {
    fileStat = await stat(row.local_path);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { ...context, status: "missing" };
    }
    return { ...context, status: "unreadable", error: error instanceof Error ? error.message : String(error) };
  }

  if (!fileStat.isFile()) {
    return { ...context, status: "unreadable", error: "Path is not a file" };
  }

  if (fileStat.size !== row.file_size) {
    return { ...context, status: "size_mismatch", expectedSize: row.file_size, actualSize: fileStat.size };
  }

  const actualSha256 = await hashFile(row.local_path);
  if (actualSha256 !== row.sha256) {
    return { ...context, status: "hash_mismatch", expectedSha256: row.sha256, actualSha256 };
  }

  return { ...context, status: "ok" };
}

try {
  const rows = readFileRows();
  const results = [];
  for (const row of rows) {
    results.push(await verifyRow(row));
  }

  const summary = summarize(results);
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = summary.issues.length > 0 ? 1 : 0;
} catch (error) {
  console.error(
    JSON.stringify(
      {
        dbPath,
        checkedAt: new Date().toISOString(),
        total: 0,
        ok: 0,
        missing: 0,
        unreadable: 0,
        sizeMismatch: 0,
        hashMismatch: 0,
        issues: [{ status: "error", error: error instanceof Error ? error.message : String(error) }]
      },
      null,
      2
    )
  );
  process.exitCode = 1;
}
