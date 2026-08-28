import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Database from "better-sqlite3";
import {
  candidateFingerprint,
  reviewRequestFingerprint
} from "./dev-079-recognition-owner-fingerprint.mjs";

const root = process.cwd();
const args = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const [key, ...rest] = argument.replace(/^--/, "").split("=");
  return [key, rest.length ? rest.join("=") : "true"];
}));
if (!args.database) throw new Error("DEV079_SCHEMA_REQUIRES_EXPLICIT_DATABASE");
if (args.confirm !== "APPLY_DEV079_OWNER_SCHEMA") throw new Error("DEV079_SCHEMA_CONFIRMATION_REQUIRED");
if (!args["expected-candidate-fingerprint"]) throw new Error("DEV079_SCHEMA_EXPECTED_CANDIDATE_FINGERPRINT_REQUIRED");
if (!args["expected-review-fingerprint"]) throw new Error("DEV079_SCHEMA_EXPECTED_REVIEW_FINGERPRINT_REQUIRED");

const databasePath = path.resolve(root, args.database);
const schema = fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8");
const startMarker = "CREATE TRIGGER IF NOT EXISTS trg_drawing_recognition_part_owner_insert";
const endMarker = "CREATE TABLE IF NOT EXISTS drawing_recognition_candidate_observations";
const start = schema.indexOf(startMarker);
const end = schema.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error("DEV079_SCHEMA_BLOCK_NOT_FOUND");

const database = new Database(databasePath, { fileMustExist: true });
try {
  database.pragma("foreign_keys = ON");
  const readFingerprints = () => ({
    candidate: candidateFingerprint(database.prepare(`
      SELECT candidate.*, session.status AS session_status, drawing.drawing_number
      FROM drawing_recognition_candidates candidate
      JOIN drawing_recognition_sessions session ON session.id = candidate.session_id AND session.company_id = candidate.company_id
      LEFT JOIN drawings drawing ON drawing.id = session.drawing_id AND drawing.company_id = session.company_id
      WHERE candidate.proposed_owner_type = 'part_number'
        AND TRIM(COALESCE(candidate.proposed_value, '')) <> ''
      ORDER BY candidate.id`).all()),
    review: reviewRequestFingerprint(database.prepare(
      "SELECT id, snapshot_hash, snapshot_payload FROM pdm_work_review_requests ORDER BY id"
    ).all())
  });
  const before = readFingerprints();
  if (before.candidate !== args["expected-candidate-fingerprint"]) {
    throw new Error("DEV079_SCHEMA_TARGET_FINGERPRINT_MISMATCH");
  }
  if (before.review !== args["expected-review-fingerprint"]) {
    throw new Error("DEV079_SCHEMA_REVIEW_FINGERPRINT_MISMATCH");
  }
  if (database.pragma("foreign_key_check").length > 0) throw new Error("DEV079_SCHEMA_PRECHECK_FOREIGN_KEY_FAILED");
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(schema.slice(start, end));
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  const installed = database.prepare(`SELECT name FROM sqlite_master
    WHERE type IN ('table', 'trigger') AND name IN (
      'trg_drawing_recognition_part_owner_insert',
      'trg_drawing_recognition_part_owner_update',
      'drawing_recognition_owner_reconciliations',
      'trg_drawing_recognition_owner_reconciliations_no_update',
      'trg_drawing_recognition_owner_reconciliations_no_delete'
    ) ORDER BY name`).all().map((row) => row.name);
  if (installed.length !== 5) throw new Error("DEV079_SCHEMA_INSTALL_INCOMPLETE");
  const after = readFingerprints();
  if (after.candidate !== before.candidate || after.review !== before.review) {
    throw new Error("DEV079_SCHEMA_UNEXPECTED_BUSINESS_DATA_MUTATION");
  }
  if (database.pragma("foreign_key_check").length > 0) throw new Error("DEV079_SCHEMA_POSTCHECK_FOREIGN_KEY_FAILED");
  console.log(JSON.stringify({
    status: "APPLIED",
    database: databasePath,
    candidateFingerprintBefore: before.candidate,
    candidateFingerprintAfter: after.candidate,
    reviewFingerprintBefore: before.review,
    reviewFingerprintAfter: after.review,
    installed
  }, null, 2));
} finally {
  database.close();
}
