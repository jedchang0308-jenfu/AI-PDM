#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { UnifiedDrawingAsyncRepository } from "../src/lib/repositories/unified-drawing-async-repository.ts";

const root = process.cwd();
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const confirmed = args.includes("--confirm-local-dev-073-repair");

function arg(name, fallback = "") {
  const direct = args.find((value) => value.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function safeOutputDirectory(value) {
  const resolved = path.resolve(root, value);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("DEV073_REPORT_DIR_MUST_BE_INSIDE_REPOSITORY");
  return resolved;
}

function snapshot(database) {
  const drawings = database.prepare(`
    SELECT id, drawing_number AS drawingNumber, lifecycle_state AS lifecycleState
    FROM drawings
    WHERE formal_drawing_number_id IS NOT NULL
    ORDER BY drawing_number, id
  `).all();
  const revisions = database.prepare(`
    SELECT revision.id, revision.drawing_id AS drawingId, drawing.drawing_number AS drawingNumber,
           revision.revision, revision.lifecycle_state AS lifecycleState
    FROM drawing_revisions revision
    JOIN drawings drawing ON drawing.id = revision.drawing_id
    WHERE revision.source_revision_package_id IS NOT NULL
    ORDER BY revision.drawing_id, revision.revision, revision.id
  `).all();
  const counts = Object.fromEntries([
    "drawing_revision_packages",
    "review_confirmation_events",
    "approval_platform_requests",
    "approval_platform_decisions",
    "drawing_revision_lifecycle_workflows"
  ].map((table) => [table, Number(database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count)]));
  const orphanReviews = database.prepare(`
    SELECT package.drawing_number AS drawingNumber, package.revision
    FROM drawing_revision_packages package
    WHERE (package.lifecycle_state = 'in_review' OR package.status = 'Pending')
      AND NOT EXISTS (
        SELECT 1 FROM drawing_revision_lifecycle_workflows workflow
        WHERE workflow.package_id = package.id
          AND workflow.state IN ('active', 'finalizing', 'cleanup_pending')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM numbering_candidate_revision_drafts candidate
        JOIN approval_platform_requests request
          ON request.id = candidate.approval_request_id
         AND request.company_id = candidate.company_id
        WHERE candidate.company_id = package.company_id
          AND candidate.formal_revision_package_id = package.id
          AND candidate.lifecycle_status = 'promoted'
          AND request.request_status IN ('approved', 'applied')
      )
      AND NOT (
        instr(package.revision, '.') > 0
        AND EXISTS (
          SELECT 1
          FROM drawing_revision_fff_assessments assessment
          JOIN review_confirmation_events confirmation
            ON confirmation.review_id = assessment.id
           AND confirmation.company_id = assessment.company_id
          WHERE assessment.company_id = package.company_id
            AND assessment.submission_id = package.source_submission_id
            AND assessment.drawing_number_id = package.drawing_number_id
            AND assessment.revision = package.revision
            AND confirmation.action IN (
              'confirm_bom_no_revision',
              'confirm_original_part_reuse',
              'approve_replacement_part_and_drawing_release'
            )
        )
      )
    ORDER BY package.drawing_number, package.revision
  `).all();
  return { drawings, revisions, counts, orphanReviews };
}

function stateChanges(before, after, key) {
  const previous = new Map(before.map((row) => [row[key], row]));
  return after.flatMap((row) => {
    const old = previous.get(row[key]);
    if (!old || old.lifecycleState !== row.lifecycleState) {
      return [{ id: row[key], drawingNumber: row.drawingNumber ?? null, revision: row.revision ?? null, before: old?.lifecycleState ?? null, after: row.lifecycleState }];
    }
    return [];
  });
}

async function synchronize(database) {
  const client = createAsyncDatabaseClient({ kind: "sqlite", database });
  const drawings = database.prepare("SELECT id, company_id FROM drawing_numbers ORDER BY company_id, drawing_number, id").all();
  await client.transaction(async (transactionClient) => {
    const repository = new UnifiedDrawingAsyncRepository(transactionClient);
    for (const drawing of drawings) {
      await repository.synchronizeFormalDrawing({ drawingNumberId: drawing.id, companyId: drawing.company_id });
    }
  });
}

const databasePath = path.resolve(root, arg("--database", process.env.PDM_SQLITE_PATH || "data/ai-pdm.sqlite"));
if (String(process.env.PDM_DB_PROVIDER ?? "sqlite").trim().toLowerCase() !== "sqlite") throw new Error("DEV073_REPAIR_LOCAL_SQLITE_ONLY");
if (!fs.existsSync(databasePath)) throw new Error(`DEV073_DATABASE_NOT_FOUND:${databasePath}`);
const sourceHashBefore = sha256(databasePath);
const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const reportDir = safeOutputDirectory(arg("--report-dir", `output/qa/dev-073-status-actionability/${timestamp}`));
fs.mkdirSync(reportDir, { recursive: true });

let targetPath = databasePath;
let temporaryDirectory = null;
let backupPath = null;
if (!apply) {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev073-"));
  targetPath = path.join(temporaryDirectory, "dry-run.sqlite");
  fs.copyFileSync(databasePath, targetPath);
} else {
  const expectedHash = arg("--expected-sha256");
  const backupValue = arg("--backup-dir");
  if (!confirmed || !expectedHash || !backupValue) throw new Error("DEV073_APPLY_REQUIRES_CONFIRMATION_EXPECTED_HASH_AND_BACKUP_DIR");
  if (expectedHash !== sourceHashBefore) throw new Error("DEV073_SOURCE_HASH_CHANGED");
  const backupDir = safeOutputDirectory(backupValue);
  fs.mkdirSync(backupDir, { recursive: true });
  backupPath = path.join(backupDir, `${path.basename(databasePath, path.extname(databasePath))}-${timestamp}-${sourceHashBefore.slice(0, 12)}.sqlite`);
  fs.copyFileSync(databasePath, backupPath);
  if (sha256(backupPath) !== sourceHashBefore) throw new Error("DEV073_BACKUP_HASH_MISMATCH");
}

const database = new Database(targetPath, { fileMustExist: true });
database.pragma("foreign_keys = ON");
let report;
try {
  const before = snapshot(database);
  await synchronize(database);
  const after = snapshot(database);
  const countChanges = Object.fromEntries(Object.keys(before.counts).map((key) => [key, after.counts[key] - before.counts[key]]));
  if (Object.values(countChanges).some((value) => value !== 0)) throw new Error("DEV073_PROTECTED_COUNT_CHANGED");
  report = {
    mode: apply ? "apply" : "dry-run",
    database: path.relative(root, databasePath).replaceAll("\\", "/"),
    sourceSha256Before: sourceHashBefore,
    sourceSha256After: apply ? null : sha256(databasePath),
    backup: backupPath ? path.relative(root, backupPath).replaceAll("\\", "/") : null,
    drawingStateChanges: stateChanges(before.drawings, after.drawings, "id"),
    revisionStateChanges: stateChanges(before.revisions, after.revisions, "id"),
    protectedCountChanges: countChanges,
    orphanReviewsBefore: before.orphanReviews,
    orphanReviewsAfter: after.orphanReviews,
    idempotency: { checked: false, secondPassDrawingStateChanges: null, secondPassRevisionStateChanges: null }
  };
  const once = after;
  await synchronize(database);
  const twice = snapshot(database);
  report.idempotency = {
    checked: true,
    secondPassDrawingStateChanges: stateChanges(once.drawings, twice.drawings, "id").length,
    secondPassRevisionStateChanges: stateChanges(once.revisions, twice.revisions, "id").length
  };
  if (report.idempotency.secondPassDrawingStateChanges !== 0 || report.idempotency.secondPassRevisionStateChanges !== 0) {
    throw new Error("DEV073_REPAIR_NOT_IDEMPOTENT");
  }
} finally {
  database.close();
  if (temporaryDirectory) {
    if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
    fs.rmdirSync(temporaryDirectory);
  }
}

if (!apply && report.sourceSha256After !== sourceHashBefore) throw new Error("DEV073_DRY_RUN_MUTATED_SOURCE");
if (apply) report.sourceSha256After = sha256(databasePath);
const reportPath = path.join(reportDir, "repair-report.json");
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ...report, reportPath: path.relative(root, reportPath).replaceAll("\\", "/") }, null, 2));
