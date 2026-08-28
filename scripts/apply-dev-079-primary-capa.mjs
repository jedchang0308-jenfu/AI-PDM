#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import {
  candidateFingerprint,
  reviewRequestFingerprint,
  sha256Canonical
} from "./dev-079-recognition-owner-fingerprint.mjs";

const root = process.cwd();
const args = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const [key, ...rest] = argument.replace(/^--/u, "").split("=");
  return [key, rest.length > 0 ? rest.join("=") : "true"];
}));
const runId = `DEV079-PRIMARY-CAPA-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const primaryDatabasePath = path.resolve(root, "data", "ai-pdm.sqlite");
const databasePath = path.resolve(root, args.database ?? "");
const evidenceRoot = path.resolve(root, "output", "qa", "dev-079-primary-apply");
const outputDir = path.resolve(root, args["output-dir"] ?? path.join(evidenceRoot, runId));
const expectedCandidateFingerprint = String(args["expected-candidate-fingerprint"] ?? "").trim();
const expectedReviewFingerprint = String(args["expected-review-fingerprint"] ?? "").trim();
const expectedPlanHash = String(args["expected-plan-hash"] ?? "").trim();
const expectedRepairCount = Number(args["expected-repair-count"] ?? Number.NaN);
const idempotencyKey = String(args["idempotency-key"] ?? "").trim();
const confirmation = "APPLY_PRIMARY_DEV079_CAPA";
const allowedSchemaObjects = new Set([
  "drawing_recognition_owner_reconciliations",
  "trg_drawing_recognition_owner_reconciliations_no_delete",
  "trg_drawing_recognition_owner_reconciliations_no_update",
  "trg_drawing_recognition_part_owner_insert",
  "trg_drawing_recognition_part_owner_update"
]);

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readSnapshot(targetPath) {
  const database = new Database(targetPath, { readonly: true, fileMustExist: true });
  database.pragma("query_only = ON");
  try {
    const schema = database.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
    const uncontrolledSchema = schema.filter((row) => !allowedSchemaObjects.has(row.name));
    const identities = {
      roots: database.prepare("SELECT id,company_id,root_code FROM part_roots ORDER BY company_id,id").all(),
      parts: database.prepare("SELECT id,company_id,part_root_id,part_number FROM part_numbers ORDER BY company_id,id").all(),
      drawings: database.prepare("SELECT id,company_id,drawing_number,formal_drawing_number_id FROM drawings ORDER BY company_id,id").all()
    };
    const candidates = database.prepare(`
      SELECT candidate.*, session.status AS session_status, drawing.drawing_number
      FROM drawing_recognition_candidates candidate
      JOIN drawing_recognition_sessions session ON session.id = candidate.session_id AND session.company_id = candidate.company_id
      LEFT JOIN drawings drawing ON drawing.id = session.drawing_id AND drawing.company_id = session.company_id
      WHERE candidate.proposed_owner_type = 'part_number'
        AND TRIM(COALESCE(candidate.proposed_value, '')) <> ''
      ORDER BY candidate.id`).all();
    const reviewRequests = database.prepare("SELECT id,snapshot_hash,snapshot_payload FROM pdm_work_review_requests ORDER BY id").all();
    const residue = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%migration%' OR name LIKE '%backup%' OR name LIKE '%_old') ORDER BY name").all();
    const foreignKeys = database.pragma("foreign_key_check");
    const brokenRootReferences = {
      parts: Number(database.prepare("SELECT COUNT(*) count FROM part_numbers part LEFT JOIN part_roots root ON root.id=part.part_root_id AND root.company_id=part.company_id WHERE part.part_root_id IS NOT NULL AND root.id IS NULL").get().count),
      drawings: Number(database.prepare("SELECT COUNT(*) count FROM drawings drawing LEFT JOIN part_roots root ON root.id=drawing.part_root_id AND root.company_id=drawing.company_id WHERE drawing.part_root_id IS NOT NULL AND root.id IS NULL").get().count)
    };
    return {
      schemaHash: sha256Canonical(schema),
      uncontrolledSchemaHash: sha256Canonical(uncontrolledSchema),
      schemaObjects: schema.filter((row) => allowedSchemaObjects.has(row.name)).map((row) => row.name).sort(),
      identitiesHash: sha256Canonical(identities),
      identityCounts: {
        roots: identities.roots.length,
        parts: identities.parts.length,
        drawings: identities.drawings.length
      },
      brokenRootReferences,
      residue,
      residueHash: sha256Canonical(residue),
      foreignKeys,
      candidateFingerprint: candidateFingerprint(candidates),
      reviewFingerprint: reviewRequestFingerprint(reviewRequests)
    };
  } finally {
    database.close();
  }
}

function runNode(label, childArgs) {
  const result = spawnSync(process.execPath, childArgs, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 48 * 1024 * 1024,
    env: { ...process.env }
  });
  fs.writeFileSync(path.join(outputDir, `${label}.stdout.log`), result.stdout ?? "", "utf8");
  fs.writeFileSync(path.join(outputDir, `${label}.stderr.log`), result.stderr ?? "", "utf8");
  if (result.status !== 0) {
    throw new Error(`${label.toUpperCase().replaceAll("-", "_")}_FAILED:${result.status}:${(result.stderr || result.stdout || "").trim().slice(0, 1200)}`);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertStableBusinessState(before, after, prefix) {
  assert(after.uncontrolledSchemaHash === before.uncontrolledSchemaHash, `${prefix}_UNCONTROLLED_SCHEMA_DRIFT`);
  assert(after.identitiesHash === before.identitiesHash, `${prefix}_CANONICAL_IDENTITY_DRIFT`);
  assert(after.residueHash === before.residueHash, `${prefix}_MIGRATION_RESIDUE_DRIFT`);
  assert(after.reviewFingerprint === before.reviewFingerprint, `${prefix}_REVIEW_REQUEST_DRIFT`);
  assert(after.brokenRootReferences.parts === 0 && after.brokenRootReferences.drawings === 0, `${prefix}_BROKEN_ROOT_REFERENCE`);
  assert(after.foreignKeys.length === 0, `${prefix}_FOREIGN_KEY_CHECK_FAILED`);
}

assert(args.confirm === confirmation, "PRIMARY_CAPA_CONFIRMATION_REQUIRED");
assert(databasePath === primaryDatabasePath, "PRIMARY_CAPA_EXACT_DATABASE_TARGET_REQUIRED");
assert(expectedCandidateFingerprint.length > 0, "PRIMARY_CAPA_EXPECTED_CANDIDATE_FINGERPRINT_REQUIRED");
assert(expectedReviewFingerprint.length > 0, "PRIMARY_CAPA_EXPECTED_REVIEW_FINGERPRINT_REQUIRED");
assert(expectedPlanHash.length > 0, "PRIMARY_CAPA_EXPECTED_PLAN_HASH_REQUIRED");
assert(Number.isInteger(expectedRepairCount) && expectedRepairCount >= 0, "PRIMARY_CAPA_EXPECTED_REPAIR_COUNT_REQUIRED");
assert(idempotencyKey.length > 0, "PRIMARY_CAPA_IDEMPOTENCY_KEY_REQUIRED");
assert(outputDir.startsWith(`${evidenceRoot}${path.sep}`), "PRIMARY_CAPA_EVIDENCE_PATH_OUTSIDE_ALLOWED_ROOT");
assert(!fs.existsSync(outputDir), "PRIMARY_CAPA_EVIDENCE_PATH_ALREADY_EXISTS");

fs.mkdirSync(outputDir, { recursive: true });
const backupDir = path.join(outputDir, "backup");
const backupPath = path.join(backupDir, "ai-pdm.sqlite");
const receiptPath = path.join(outputDir, "receipt.json");
const runtimeDeclaration = {
  project: root,
  purpose: "Authorized DEV-079 primary SQLite schema guard and 21-row recognition-owner reconciliation",
  port: "none",
  owningProcessTree: `orchestrator ${process.pid} -> sequential task-owned Node child processes only`,
  cleanupCondition: "all child processes exit; no server is started; retained backup and evidence are CAPA rollback records",
  PDM_DATA_DIR: path.dirname(databasePath),
  PDM_REPOSITORY_DIR: "not accessed or mutated",
  mutationScope: [databasePath, `${databasePath}-wal`, `${databasePath}-shm`, outputDir]
};
console.log(JSON.stringify({ runtimeDeclaration }, null, 2));

const receipt = {
  schemaVersion: "dev079-primary-capa-v1",
  runId,
  status: "IN_PROGRESS",
  authorization: "User authorized primary DEV-079 schema guard and 21-row reconciliation; stop on fingerprint mismatch; release source must be a clean CAPA release branch.",
  runtimeDeclaration,
  database: databasePath,
  outputDir,
  backup: { path: backupPath, retained: false, sha256: null },
  expected: {
    candidateFingerprint: expectedCandidateFingerprint,
    reviewFingerprint: expectedReviewFingerprint,
    planHash: expectedPlanHash,
    repairCount: expectedRepairCount,
    idempotencyKey
  },
  startedAt: new Date().toISOString()
};

try {
  const before = readSnapshot(databasePath);
  receipt.before = before;
  assert(before.candidateFingerprint === expectedCandidateFingerprint, "PRIMARY_CAPA_CANDIDATE_FINGERPRINT_MISMATCH");
  assert(before.reviewFingerprint === expectedReviewFingerprint, "PRIMARY_CAPA_REVIEW_FINGERPRINT_MISMATCH");
  assert(before.foreignKeys.length === 0, "PRIMARY_CAPA_PRECHECK_FOREIGN_KEY_FAILED");
  assert(before.brokenRootReferences.parts === 0 && before.brokenRootReferences.drawings === 0, "PRIMARY_CAPA_PRECHECK_ROOT_REFERENCE_FAILED");

  const preflightDir = path.join(outputDir, "reconciliation-preflight");
  runNode("reconciliation-preflight", [
    "--experimental-transform-types",
    "--experimental-loader", "./scripts/qc-ts-path-loader.mjs",
    "scripts/reconcile-dev-079-recognition-owner.mjs",
    "--mode=dry-run",
    `--database=${databasePath}`,
    `--output-dir=${preflightDir}`
  ]);
  const preflight = readJson(path.join(preflightDir, "manifest.json"));
  receipt.preflight = {
    manifest: path.join(preflightDir, "manifest.json"),
    targetFingerprintBefore: preflight.targetFingerprintBefore,
    reviewRequestFingerprintBefore: preflight.reviewRequestFingerprintBefore,
    planHash: preflight.planHash,
    repairCount: preflight.plan?.length ?? null,
    inventorySummary: preflight.inventorySummary
  };
  assert(preflight.targetFingerprintBefore === expectedCandidateFingerprint, "PRIMARY_CAPA_PREFLIGHT_CANDIDATE_FINGERPRINT_MISMATCH");
  assert(preflight.reviewRequestFingerprintBefore === expectedReviewFingerprint, "PRIMARY_CAPA_PREFLIGHT_REVIEW_FINGERPRINT_MISMATCH");
  assert(preflight.planHash === expectedPlanHash, "PRIMARY_CAPA_PREFLIGHT_PLAN_HASH_MISMATCH");
  assert(preflight.plan.length === expectedRepairCount, "PRIMARY_CAPA_PREFLIGHT_REPAIR_COUNT_MISMATCH");

  fs.mkdirSync(backupDir, { recursive: true });
  const source = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    await source.backup(backupPath);
  } finally {
    source.close();
  }
  const backup = readSnapshot(backupPath);
  receipt.backup = { path: backupPath, retained: true, sha256: sha256File(backupPath), snapshot: backup };
  assert(backup.schemaHash === before.schemaHash, "PRIMARY_CAPA_BACKUP_SCHEMA_MISMATCH");
  assert(backup.identitiesHash === before.identitiesHash, "PRIMARY_CAPA_BACKUP_IDENTITY_MISMATCH");
  assert(backup.candidateFingerprint === before.candidateFingerprint, "PRIMARY_CAPA_BACKUP_CANDIDATE_MISMATCH");
  assert(backup.reviewFingerprint === before.reviewFingerprint, "PRIMARY_CAPA_BACKUP_REVIEW_MISMATCH");
  assert(backup.residueHash === before.residueHash, "PRIMARY_CAPA_BACKUP_RESIDUE_MISMATCH");
  assert(backup.foreignKeys.length === 0, "PRIMARY_CAPA_BACKUP_FOREIGN_KEY_FAILED");

  const justBeforeApply = readSnapshot(databasePath);
  assert(justBeforeApply.candidateFingerprint === expectedCandidateFingerprint, "PRIMARY_CAPA_PRE_APPLY_CANDIDATE_FINGERPRINT_MISMATCH");
  assert(justBeforeApply.reviewFingerprint === expectedReviewFingerprint, "PRIMARY_CAPA_PRE_APPLY_REVIEW_FINGERPRINT_MISMATCH");
  assert(justBeforeApply.identitiesHash === before.identitiesHash, "PRIMARY_CAPA_PRE_APPLY_IDENTITY_DRIFT");
  assert(justBeforeApply.uncontrolledSchemaHash === before.uncontrolledSchemaHash, "PRIMARY_CAPA_PRE_APPLY_SCHEMA_DRIFT");

  runNode("schema-apply", [
    "scripts/apply-dev-079-recognition-owner-schema.mjs",
    `--database=${databasePath}`,
    "--confirm=APPLY_DEV079_OWNER_SCHEMA",
    `--expected-candidate-fingerprint=${expectedCandidateFingerprint}`,
    `--expected-review-fingerprint=${expectedReviewFingerprint}`
  ]);
  const afterSchema = readSnapshot(databasePath);
  receipt.afterSchema = afterSchema;
  assertStableBusinessState(before, afterSchema, "PRIMARY_CAPA_SCHEMA");
  assert(afterSchema.candidateFingerprint === expectedCandidateFingerprint, "PRIMARY_CAPA_SCHEMA_CANDIDATE_DRIFT");
  assert(afterSchema.schemaObjects.length === allowedSchemaObjects.size
    && afterSchema.schemaObjects.every((name) => allowedSchemaObjects.has(name)), "PRIMARY_CAPA_SCHEMA_OBJECT_SET_INCOMPLETE");

  const applyDir = path.join(outputDir, "reconciliation-apply");
  runNode("reconciliation-apply", [
    "--experimental-transform-types",
    "--experimental-loader", "./scripts/qc-ts-path-loader.mjs",
    "scripts/reconcile-dev-079-recognition-owner.mjs",
    "--mode=apply",
    `--database=${databasePath}`,
    `--output-dir=${applyDir}`,
    `--expected-fingerprint=${expectedCandidateFingerprint}`,
    `--expected-review-fingerprint=${expectedReviewFingerprint}`,
    `--expected-plan-hash=${expectedPlanHash}`,
    `--idempotency-key=${idempotencyKey}`,
    "--confirm=APPLY_DEV079_RECONCILIATION"
  ]);
  const applied = readJson(path.join(applyDir, "manifest.json"));
  receipt.apply = {
    manifest: path.join(applyDir, "manifest.json"),
    status: applied.status,
    appliedCount: applied.appliedCount,
    targetFingerprintBefore: applied.targetFingerprintBefore,
    targetFingerprintAfter: applied.targetFingerprintAfter,
    reviewRequestFingerprintBefore: applied.reviewRequestFingerprintBefore,
    reviewRequestFingerprintAfter: applied.reviewRequestFingerprintAfter,
    planHash: applied.planHash,
    rollbackSql: path.join(applyDir, "rollback.sql")
  };
  assert(applied.status === "APPLIED", "PRIMARY_CAPA_RECONCILIATION_NOT_APPLIED");
  assert(applied.appliedCount === expectedRepairCount, "PRIMARY_CAPA_RECONCILIATION_COUNT_MISMATCH");
  assert(applied.targetFingerprintBefore === expectedCandidateFingerprint, "PRIMARY_CAPA_APPLY_CANDIDATE_BEFORE_MISMATCH");
  assert(applied.reviewRequestFingerprintBefore === expectedReviewFingerprint, "PRIMARY_CAPA_APPLY_REVIEW_BEFORE_MISMATCH");
  assert(applied.reviewRequestFingerprintAfter === expectedReviewFingerprint, "PRIMARY_CAPA_APPLY_REVIEW_AFTER_MISMATCH");
  assert(applied.planHash === expectedPlanHash, "PRIMARY_CAPA_APPLY_PLAN_HASH_MISMATCH");

  const replayDir = path.join(outputDir, "reconciliation-replay");
  runNode("reconciliation-replay", [
    "--experimental-transform-types",
    "--experimental-loader", "./scripts/qc-ts-path-loader.mjs",
    "scripts/reconcile-dev-079-recognition-owner.mjs",
    "--mode=apply",
    `--database=${databasePath}`,
    `--output-dir=${replayDir}`,
    `--expected-fingerprint=${expectedCandidateFingerprint}`,
    `--expected-review-fingerprint=${expectedReviewFingerprint}`,
    `--expected-plan-hash=${expectedPlanHash}`,
    `--idempotency-key=${idempotencyKey}`,
    "--confirm=APPLY_DEV079_RECONCILIATION"
  ]);
  const replay = readJson(path.join(replayDir, "manifest.json"));
  receipt.replay = {
    manifest: path.join(replayDir, "manifest.json"),
    idempotentReplay: replay.idempotentReplay,
    appliedCount: replay.appliedCount,
    targetFingerprintAfter: replay.targetFingerprintAfter,
    reviewRequestFingerprintAfter: replay.reviewRequestFingerprintAfter
  };
  assert(replay.idempotentReplay === true && replay.appliedCount === 0, "PRIMARY_CAPA_REPLAY_NOT_ZERO_DELTA");

  const verifyDir = path.join(outputDir, "reconciliation-verify");
  runNode("reconciliation-verify", [
    "--experimental-transform-types",
    "--experimental-loader", "./scripts/qc-ts-path-loader.mjs",
    "scripts/reconcile-dev-079-recognition-owner.mjs",
    "--mode=inventory",
    `--database=${databasePath}`,
    `--output-dir=${verifyDir}`
  ]);
  const verify = readJson(path.join(verifyDir, "manifest.json"));
  receipt.verify = {
    manifest: path.join(verifyDir, "manifest.json"),
    inventorySummary: verify.inventorySummary,
    planCount: verify.plan?.length ?? null,
    targetFingerprintAfter: verify.targetFingerprintAfter,
    reviewRequestFingerprintAfter: verify.reviewRequestFingerprintAfter
  };
  assert((verify.plan?.length ?? -1) === 0, "PRIMARY_CAPA_VERIFY_REPAIR_PLAN_NOT_EMPTY");
  assert((verify.inventorySummary?.repairable_exactly_one ?? 0) === 0, "PRIMARY_CAPA_VERIFY_REPAIRABLE_REMAINS");
  assert((verify.inventorySummary?.ambiguous_manual_disposition ?? 0) === 0, "PRIMARY_CAPA_VERIFY_AMBIGUOUS_REMAINS");
  assert((verify.inventorySummary?.unresolved_manual_disposition ?? 0) === 0, "PRIMARY_CAPA_VERIFY_UNRESOLVED_REMAINS");
  assert((verify.inventorySummary?.terminal_manual_disposition ?? 0) === 0, "PRIMARY_CAPA_VERIFY_TERMINAL_REMAINS");

  const after = readSnapshot(databasePath);
  receipt.after = after;
  assertStableBusinessState(before, after, "PRIMARY_CAPA_FINAL");
  assert(after.candidateFingerprint === applied.targetFingerprintAfter, "PRIMARY_CAPA_FINAL_CANDIDATE_FINGERPRINT_MISMATCH");
  assert(after.reviewFingerprint === expectedReviewFingerprint, "PRIMARY_CAPA_FINAL_REVIEW_FINGERPRINT_MISMATCH");
  receipt.status = "PASS";
  receipt.completedAt = new Date().toISOString();
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    status: receipt.status,
    runId,
    outputDir,
    backup: receipt.backup,
    appliedCount: receipt.apply.appliedCount,
    replayAppliedCount: receipt.replay.appliedCount,
    inventorySummary: receipt.verify.inventorySummary,
    receipt: receiptPath
  }, null, 2));
} catch (error) {
  receipt.status = "FAILED";
  receipt.error = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { message: String(error) };
  receipt.completedAt = new Date().toISOString();
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  console.error(JSON.stringify({ status: receipt.status, error: receipt.error.message, receipt: receiptPath, backup: receipt.backup }, null, 2));
  process.exitCode = 1;
}
