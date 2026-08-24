#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const args = new Map(process.argv.slice(2).map((entry) => {
  const separator = entry.indexOf("=");
  return separator === -1 ? [entry, true] : [entry.slice(0, separator), entry.slice(separator + 1)];
}));
const runId = `DEV094-root-recovery-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const databasePath = path.resolve(String(args.get("--db") ?? ""));
const outputDir = path.resolve(String(args.get("--output-dir") ?? path.join(root, "output", "qa", "dev-094-recovery", runId)));
const apply = args.has("--apply");
const confirmed = args.has("--confirm-dev-094-root-recovery");
const expectedFingerprint = String(args.get("--expected-fingerprint") ?? "").trim();
const injectedFailure = String(args.get("--inject-failure") ?? "").trim();

if (!args.has("--db") || !databasePath.toLowerCase().endsWith(".sqlite")) {
  console.error("DEV094_EXPLICIT_SQLITE_DB_REQUIRED");
  process.exit(2);
}
if (!fs.existsSync(databasePath)) {
  console.error(`DEV094_DATABASE_NOT_FOUND:${databasePath}`);
  process.exit(2);
}

fs.mkdirSync(outputDir, { recursive: true });

const ROOT_TABLE = "part_roots";
const PART_TABLE = "part_numbers";
const ROOT_STAGING = "part_roots_company_scope_migration";
const PART_STAGING = "part_numbers_company_scope_migration";
const recoveryTables = [ROOT_TABLE, PART_TABLE, "drawing_numbers", "drawings", "canonical_workbench_states", ROOT_STAGING, PART_STAGING];

function hashJson(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function hashFile(filePath) {
  const digest = crypto.createHash("sha256");
  const descriptor = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead) digest.update(buffer.subarray(0, bytesRead));
    } while (bytesRead);
  } finally {
    fs.closeSync(descriptor);
  }
  return digest.digest("hex");
}

function tableExists(database, table) {
  return Boolean(database.prepare("SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name=?").get(table));
}

function tableRows(database, table) {
  return tableExists(database, table) ? database.prepare(`SELECT * FROM ${table} ORDER BY id`).all() : null;
}

function scopedFingerprint(database) {
  const payload = {
    schema: database.prepare(`SELECT type, name, tbl_name, sql FROM sqlite_master
      WHERE type IN ('table','index','trigger') AND (tbl_name IN (${recoveryTables.map(() => "?").join(",")}) OR name IN (?,?))
      ORDER BY type, name`).all(...recoveryTables, ROOT_STAGING, PART_STAGING),
    rows: Object.fromEntries(recoveryTables.map((table) => [table, tableRows(database, table)])),
    foreignKeys: database.pragma("foreign_key_check")
  };
  return { hash: hashJson(payload), payload };
}

function repositoryFingerprint() {
  const configured = process.env.PDM_REPOSITORY_DIR?.trim();
  const repositoryDir = configured ? path.resolve(configured) : path.join(path.dirname(databasePath), "repository");
  if (!fs.existsSync(repositoryDir)) return { repositoryDir, files: 0, hash: hashJson([]) };
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push({ path: path.relative(repositoryDir, absolute).replaceAll("\\", "/"), size: fs.statSync(absolute).size, hash: hashFile(absolute) });
    }
  };
  visit(repositoryDir);
  return { repositoryDir, files: files.length, hash: hashJson(files) };
}

function normalizeRoot(row) {
  return {
    id: row.id, company_id: row.company_id, root_code: row.root_code, core_name: row.core_name,
    item_kind: row.item_kind, record_status: row.record_status, rule_version_id: row.rule_version_id,
    created_by: row.created_by, created_at: row.created_at, updated_at: row.updated_at
  };
}

function normalizePart(row) {
  return {
    id: row.id, company_id: row.company_id, part_root_id: row.part_root_id, part_number: row.part_number,
    sequence_no: row.sequence_no, sequence_code: row.sequence_code, part_name: row.part_name, item_kind: row.item_kind,
    is_universal: row.is_universal, bom_usage_policy: row.bom_usage_policy, custom_specification: row.custom_specification,
    series_code: row.series_code ?? null, record_status: row.record_status, universal_reason: row.universal_reason,
    rule_version_id: row.rule_version_id, created_by: row.created_by, created_at: row.created_at, updated_at: row.updated_at
  };
}

function duplicates(rows, keyFor) {
  const seen = new Set();
  const found = [];
  for (const row of rows) {
    const key = keyFor(row);
    if (seen.has(key)) found.push(key);
    seen.add(key);
  }
  return found;
}

function quotedIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(value)) throw new Error(`DEV094_UNSAFE_SQL_IDENTIFIER:${value}`);
  return `"${value}"`;
}

function danglingReferenceInventory(database, foreignKeys) {
  const candidates = {
    part_roots: new Set((tableRows(database, ROOT_STAGING) ?? []).map((row) => row.id)),
    part_numbers: new Set((tableRows(database, PART_STAGING) ?? []).map((row) => row.id))
  };
  return foreignKeys.map((violation) => {
    const foreignKeyRows = database.pragma(`foreign_key_list(${quotedIdentifier(violation.table)})`).filter((row) => row.id === violation.fkid);
    const supported = foreignKeyRows.length === 1 && foreignKeyRows[0].to === "id" && Boolean(candidates[violation.parent]);
    const childColumn = supported ? foreignKeyRows[0].from : null;
    const child = childColumn
      ? database.prepare(`SELECT ${quotedIdentifier(childColumn)} AS value FROM ${quotedIdentifier(violation.table)} WHERE rowid = ?`).get(violation.rowid)
      : null;
    const value = child?.value ?? null;
    return {
      ...violation,
      childColumn,
      value,
      coveredByCandidate: supported && candidates[violation.parent].has(value)
    };
  });
}

function inventory(database) {
  const finalRoots = tableRows(database, ROOT_TABLE) ?? [];
  const finalParts = tableRows(database, PART_TABLE) ?? [];
  const candidateRoots = tableRows(database, ROOT_STAGING);
  const candidateParts = tableRows(database, PART_STAGING);
  const foreignKeys = database.pragma("foreign_key_check");
  const dangling = danglingReferenceInventory(database, foreignKeys);
  const blockers = [];
  const healthyNoOp = finalRoots.length > 0 && finalParts.length > 0 && candidateRoots === null && candidateParts === null && foreignKeys.length === 0;

  if (!healthyNoOp) {
    if (finalRoots.length !== 0 || finalParts.length !== 0) blockers.push(`FINAL_TABLES_NOT_EMPTY:${finalRoots.length}:${finalParts.length}`);
    if (!candidateRoots?.length || !candidateParts?.length) blockers.push("RECOVERY_CANDIDATES_MISSING");
    if (candidateRoots && duplicates(candidateRoots, (row) => row.id).length) blockers.push("DUPLICATE_ROOT_ID");
    if (candidateRoots && duplicates(candidateRoots, (row) => `${row.company_id}:${row.root_code}`).length) blockers.push("DUPLICATE_ROOT_CODE");
    if (candidateParts && duplicates(candidateParts, (row) => row.id).length) blockers.push("DUPLICATE_PART_ID");
    if (candidateParts && duplicates(candidateParts, (row) => `${row.company_id}:${row.part_number}`).length) blockers.push("DUPLICATE_PART_NUMBER");
    if (candidateParts && duplicates(candidateParts, (row) => `${row.part_root_id}:${row.sequence_code}`).length) blockers.push("DUPLICATE_PART_SEQUENCE");
    const rootIds = new Set((candidateRoots ?? []).map((row) => row.id));
    if ((candidateParts ?? []).some((row) => !rootIds.has(row.part_root_id))) blockers.push("CANDIDATE_PART_ROOT_MISSING");
    if (!foreignKeys.length) blockers.push("EXPECTED_FOREIGN_KEY_FAILURES_MISSING");
    if (dangling.some((row) => !row.coveredByCandidate)) blockers.push("DANGLING_REFERENCE_NOT_COVERED");
  }

  return {
    healthyNoOp,
    blockers: [...new Set(blockers)],
    counts: { finalRoots: finalRoots.length, finalParts: finalParts.length, candidateRoots: candidateRoots?.length ?? 0, candidateParts: candidateParts?.length ?? 0, foreignKeys: foreignKeys.length },
    hashes: {
      finalRoots: hashJson(finalRoots.map(normalizeRoot)), finalParts: hashJson(finalParts.map(normalizePart)),
      candidateRoots: hashJson((candidateRoots ?? []).map(normalizeRoot)), candidateParts: hashJson((candidateParts ?? []).map(normalizePart))
    },
    finalRoots,
    finalParts,
    candidateRoots,
    candidateParts,
    foreignKeys,
    dangling
  };
}

async function createBackup(database) {
  const backupDir = path.join(outputDir, "backup");
  const backupPath = path.join(backupDir, "ai-pdm.sqlite");
  fs.mkdirSync(backupDir, { recursive: true });
  await database.backup(backupPath);
  const verification = new Database(backupPath, { readonly: true, fileMustExist: true });
  try {
    verification.pragma("quick_check");
  } finally {
    verification.close();
  }
  return { path: backupPath, size: fs.statSync(backupPath).size, sha256: hashFile(backupPath) };
}

function applyRecovery(database, before) {
  database.pragma("foreign_keys = ON");
  database.exec("BEGIN IMMEDIATE");
  try {
    const lockedFingerprint = scopedFingerprint(database).hash;
    if (lockedFingerprint !== expectedFingerprint) throw new Error(`DEV094_EXPECTED_FINGERPRINT_DRIFT:${expectedFingerprint}:${lockedFingerprint}`);
    database.exec(`INSERT INTO part_roots (
      id, company_id, root_code, core_name, item_kind, record_status, rule_version_id, created_by, created_at, updated_at
    ) SELECT id, company_id, root_code, core_name, item_kind, record_status, rule_version_id, created_by, created_at, updated_at
      FROM part_roots_company_scope_migration ORDER BY id`);
    if (injectedFailure === "after-roots") throw new Error("DEV094_INJECTED_FAILURE_AFTER_ROOTS");
    database.exec(`INSERT INTO part_numbers (
      id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind,
      is_universal, bom_usage_policy, custom_specification, series_code, record_status, universal_reason,
      rule_version_id, created_by, created_at, updated_at
    ) SELECT id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind,
      is_universal, bom_usage_policy, custom_specification, NULL, record_status, universal_reason,
      rule_version_id, created_by, created_at, updated_at
      FROM part_numbers_company_scope_migration ORDER BY id`);
    if (injectedFailure === "after-parts") throw new Error("DEV094_INJECTED_FAILURE_AFTER_PARTS");

    const insertedRoots = tableRows(database, ROOT_TABLE).map(normalizeRoot);
    const insertedParts = tableRows(database, PART_TABLE).map(normalizePart);
    if (hashJson(insertedRoots) !== before.hashes.candidateRoots || hashJson(insertedParts) !== before.hashes.candidateParts) {
      throw new Error("DEV094_RECOVERY_ROW_HASH_MISMATCH");
    }
    const foreignKeysBeforeCleanup = database.pragma("foreign_key_check");
    if (foreignKeysBeforeCleanup.length) throw new Error(`DEV094_RECOVERY_FOREIGN_KEYS_REMAIN:${JSON.stringify(foreignKeysBeforeCleanup)}`);
    database.exec("DROP TABLE part_numbers_company_scope_migration");
    database.exec("DROP TABLE part_roots_company_scope_migration");
    if (database.pragma("foreign_key_check").length) throw new Error("DEV094_RECOVERY_FOREIGN_KEYS_AFTER_CLEANUP");
    if (injectedFailure === "before-commit") throw new Error("DEV094_INJECTED_FAILURE_BEFORE_COMMIT");
    database.exec("COMMIT");
  } catch (error) {
    if (database.inTransaction) database.exec("ROLLBACK");
    throw error;
  }
}

const manifest = {
  devId: "DEV-094",
  capaId: "CAPA-PDM-2026-08-24-001",
  runId,
  generatedAt: new Date().toISOString(),
  mode: apply ? "apply" : "dry-run",
  databasePath,
  status: "BLOCKED",
  expectedFingerprint: expectedFingerprint || null,
  before: null,
  after: null,
  backup: null,
  repositoryBefore: null,
  repositoryAfter: null,
  error: null
};

const database = new Database(databasePath, { fileMustExist: true });
database.pragma("busy_timeout = 15000");
try {
  const beforeFingerprint = scopedFingerprint(database);
  const before = inventory(database);
  manifest.before = { fingerprint: beforeFingerprint.hash, inventory: before };
  manifest.repositoryBefore = repositoryFingerprint();

  if (before.healthyNoOp) {
    manifest.status = "NO_OP";
  } else if (before.blockers.length) {
    throw new Error(`DEV094_RECOVERY_BLOCKED:${before.blockers.join(",")}`);
  } else if (!apply) {
    manifest.status = "READY";
  } else {
    if (!confirmed) throw new Error("DEV094_APPLY_CONFIRMATION_REQUIRED");
    if (!expectedFingerprint) throw new Error("DEV094_EXPECTED_FINGERPRINT_REQUIRED");
    if (expectedFingerprint !== beforeFingerprint.hash) throw new Error(`DEV094_EXPECTED_FINGERPRINT_MISMATCH:${expectedFingerprint}:${beforeFingerprint.hash}`);
    manifest.backup = await createBackup(database);
    applyRecovery(database, before);
    const afterFingerprint = scopedFingerprint(database);
    const after = inventory(database);
    manifest.after = { fingerprint: afterFingerprint.hash, inventory: after };
    manifest.repositoryAfter = repositoryFingerprint();
    if (!after.healthyNoOp || after.counts.finalRoots !== before.counts.candidateRoots || after.counts.finalParts !== before.counts.candidateParts) {
      throw new Error("DEV094_RECOVERY_POSTCONDITION_FAILED");
    }
    if (manifest.repositoryAfter.hash !== manifest.repositoryBefore.hash) throw new Error("DEV094_REPOSITORY_CHANGED");
    manifest.status = "PASS";
  }
} catch (error) {
  manifest.error = error instanceof Error ? error.message : String(error);
  try {
    manifest.after = { fingerprint: scopedFingerprint(database).hash, inventory: inventory(database) };
    manifest.repositoryAfter = repositoryFingerprint();
  } catch (inspectionError) {
    manifest.error += `;POST_FAILURE_INSPECTION:${inspectionError instanceof Error ? inspectionError.message : String(inspectionError)}`;
  }
} finally {
  database.close();
  fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify({ status: manifest.status, mode: manifest.mode, fingerprint: manifest.before?.fingerprint ?? null, outputDir, error: manifest.error }, null, 2));
if (!['READY', 'PASS', 'NO_OP'].includes(manifest.status)) process.exitCode = 2;
