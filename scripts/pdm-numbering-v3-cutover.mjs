#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import Database from "better-sqlite3";

const rootDir = process.cwd();
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const check = args.includes("--check");
const allowRunningLocalServer = args.includes("--allow-running-local-server");
const dbPath = argValue("--db", path.join(rootDir, "data", "ai-pdm.sqlite"));
const outputDir = argValue("--output-dir", path.join(rootDir, "output", "qc-pdm-numbering-v3-cutover"));
const backupRoot = argValue("--backup-root", path.join(rootDir, "data", "backups"));
const now = new Date().toISOString();
const stamp = now.replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");

const V1_RULE = "numbering-rule-v1";
const V2_RULE = "numbering-rule-v2";
const V3_RULE = "numbering-rule-v3-alpha-root";
const V3_ROOT_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const CLASS_SAFE_MAP = "safe_map";
const CLASS_COLLISION = "collision";
const CLASS_MANUAL_REVIEW = "manual_review";
const CLASS_PROTECTED_EVIDENCE_RETAINED = "protected_evidence_retained";
const CLASS_OUT_OF_SCOPE = "out_of_scope";

// These are deterministic local QC fixtures, not business identities. They are
// excluded by immutable row id only; production rows are never excluded by a
// name, creator, or status pattern.
const knownNonProductionFixtureIds = {
  roots: new Set(["root-qc-submit-ui"]),
  parts: new Set(["part-qc-submit-ui-001"]),
  drawings: new Set()
};

const retainedHistoricalFields = [
  ["audit_logs", "detail_json"],
  ["numbering_export_jobs", "result_json"],
  ["file_assets", "original_path"],
  ["file_assets", "storage_key"],
  ["file_assets", "file_name"],
  ["file_assets", "display_name"],
  ["file_derivatives", "storage_key"],
  ["file_derivatives", "original_path"],
  ["file_derivatives", "file_name"],
  ["release_packages", "package_filename"],
  ["release_packages", "local_path"],
  ["release_packages", "manifest_json"],
  // The package summary is frozen at submit/release time and remains review evidence.
  // Its live drawing identity is migrated through drawing_revision_packages.drawing_number.
  ["drawing_revision_packages", "snapshot_json"],
  ["submission_files", "original_filename"],
  ["submission_files", "local_path"]
];

const exactReferenceUpdates = [
  ["items", "part_number", "part"],
  ["submissions", "drawing_number", "drawing"],
  ["submission_attempts", "source_root_code", "root"],
  ["submission_attempts", "source_drawing_number", "drawing"],
  ["submission_snapshots", "source_root_code", "root"],
  ["submission_snapshots", "source_drawing_number", "drawing"],
  ["submission_snapshots", "source_part_number", "part"],
  ["file_references", "referenced_part_number", "part"],
  ["file_references", "referenced_drawing_number", "drawing"],
  ["manufacturing_baseline_items", "drawing_number", "drawing"],
  ["drawing_revision_packages", "drawing_number", "drawing"],
  ["drawing_revision_fff_assessments", "detected_part_number", "part"],
  ["drawing_revision_fff_assessments", "corrected_part_number", "part"],
  ["part_number_drafts", "reserved_part_number", "part"]
];

const jsonReferenceUpdates = [
  ["approval_requests", "payload_json"],
  ["numbering_task_items", "detail_json"],
  ["numbering_notifications", "detail_json"],
  ["warning_events", "detail_json"],
  ["manufacturing_baselines", "snapshot_json"]
];

const legacyRootPattern = /^(?:[0-9]{4}|[0-9]{5})$/;
const legacyPartPattern = /^(?:P-[0-9]{4}-[0-9]{3}|[0-9]{5}-P[0-9]{2})$/;
const legacyDrawingPattern = /^(?:D-[0-9]{4}-(?:MA|OT)[0-9]|[0-9]{5}-[MR][0-9]{2})$/;
const legacyTextPattern = /(?:\bP-[0-9]{4}-[0-9]{3}\b|\bD-[0-9]{4}-(?:MA|OT)[0-9]\b|\b[0-9]{5}-P[0-9]{2}\b|\b[0-9]{5}-[MR][0-9]{2}\b|\b[0-9]{5}\b)/;

function argValue(name, fallback) {
  const prefix = `${name}=`;
  const raw = args.find((arg) => arg.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : fallback;
}

function quoteIdent(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function tableExists(db, table) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

function columnExists(db, table, column) {
  if (!tableExists(db, table)) return false;
  return db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all().some((row) => row.name === column);
}

function readPortOwner() {
  if (process.platform !== "win32") return { listening: false };
  const command = `
$connection = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -eq $connection) {
  [ordered]@{ listening = $false } | ConvertTo-Json -Compress
} else {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)" -ErrorAction SilentlyContinue
  [ordered]@{
    listening = $true
    processId = [int]$connection.OwningProcess
    processName = if ($process) { $process.Name } else { "" }
    commandLine = if ($process) { $process.CommandLine } else { "" }
  } | ConvertTo-Json -Compress
}
`;
  try {
    const output = execFileSync("powershell", ["-NoProfile", "-Command", command], { encoding: "utf8" }).trim();
    return output ? JSON.parse(output) : { listening: false };
  } catch {
    return { listening: false };
  }
}

function isProjectOwnedLocalServer(owner) {
  if (!owner?.listening || !owner.commandLine) return false;
  const commandLine = String(owner.commandLine).toLowerCase();
  return commandLine.includes(rootDir.toLowerCase()) && (commandLine.includes("next") || commandLine.includes("npm"));
}

function assertMaintenanceWindow() {
  if (!apply || allowRunningLocalServer) return;
  const owner = readPortOwner();
  if (isProjectOwnedLocalServer(owner)) {
    throw new Error(
      `PDM_NUMBERING_V3_CUTOVER_SERVER_RUNNING: stop the AI_PDM local server before apply, or pass --allow-running-local-server intentionally. PID ${owner.processId}.`
    );
  }
}

function isV3RootCode(value) {
  return /^[A-Z][0-9]{4}$/.test(value) && !value.endsWith("0000");
}

function isV3PartNumber(value) {
  return /^[A-Z][0-9]{4}-P[0-9]{2}$/.test(value) && !/[A-Z]0000-P[0-9]{2}$/.test(value) && !value.endsWith("P00");
}

function isV3DrawingNumber(value) {
  return /^[A-Z][0-9]{4}-[MR][0-9]{2}$/.test(value) && !/[A-Z]0000-[MR][0-9]{2}$/.test(value) && !/[MR]00$/.test(value);
}

function rootOrdinalToV3(value) {
  if (!Number.isInteger(value) || value < 1 || value > V3_ROOT_LETTERS.length * 9999) {
    throw new Error(`ROOT_SEQUENCE_OUT_OF_RANGE: ${value}`);
  }
  const letterIndex = Math.floor((value - 1) / 9999);
  const sequence = ((value - 1) % 9999) + 1;
  return `${V3_ROOT_LETTERS[letterIndex]}${String(sequence).padStart(4, "0")}`;
}

function v3RootToOrdinal(rootCode) {
  const normalized = String(rootCode).trim().toUpperCase();
  if (!isV3RootCode(normalized)) return null;
  return V3_ROOT_LETTERS.indexOf(normalized[0]) * 9999 + Number.parseInt(normalized.slice(1), 10);
}

function normalizeRootToV3(rootCode) {
  const normalized = String(rootCode ?? "").trim().toUpperCase();
  if (isV3RootCode(normalized)) return normalized;
  if (/^[0-9]{4,5}$/.test(normalized)) {
    const ordinal = Number.parseInt(normalized, 10);
    if (ordinal < 1 || ordinal > V3_ROOT_LETTERS.length * 9999) return null;
    return rootOrdinalToV3(ordinal);
  }
  return null;
}

function compactSequence(sequenceNo) {
  const value = Number(sequenceNo);
  if (!Number.isInteger(value) || value < 1 || value > 99) return null;
  return String(value).padStart(2, "0");
}

function normalizePurposeToV3(purposeCode) {
  if (purposeCode === "MA" || purposeCode === "M") return "M";
  if (purposeCode === "OT" || purposeCode === "R") return "R";
  return null;
}

function key(companyId, value) {
  return `${companyId ?? ""}\u0000${value}`;
}

function isKnownNonProductionFixture(kind, id) {
  return knownNonProductionFixtureIds[kind]?.has(id) === true;
}

function buildPlan(db) {
  const roots = tableExists(db, "part_roots") ? db.prepare("SELECT * FROM part_roots ORDER BY company_id ASC, root_code ASC, id ASC").all() : [];
  const parts = tableExists(db, "part_numbers") ? db.prepare("SELECT * FROM part_numbers ORDER BY company_id ASC, part_number ASC, id ASC").all() : [];
  const drawings = tableExists(db, "drawing_numbers") ? db.prepare("SELECT * FROM drawing_numbers ORDER BY company_id ASC, drawing_number ASC, id ASC").all() : [];
  const rootById = new Map(roots.map((row) => [row.id, row]));
  const existingRootByCode = new Map(roots.map((row) => [key(row.company_id, row.root_code), row]));
  const existingPartByNumber = new Map(parts.map((row) => [key(row.company_id, row.part_number), row]));
  const existingDrawingByNumber = new Map(drawings.map((row) => [key(row.company_id, row.drawing_number), row]));

  const rootMappings = roots.map((row) => {
    const excludedFixture = isKnownNonProductionFixture("roots", row.id);
    const to = normalizeRootToV3(row.root_code);
    const collision = to ? existingRootByCode.get(key(row.company_id, to)) : null;
    const identityAlreadyV3 = to === row.root_code && row.rule_version_id === V3_RULE;
    const classification = excludedFixture
      ? CLASS_OUT_OF_SCOPE
      : !to
      ? CLASS_MANUAL_REVIEW
      : collision && collision.id !== row.id
        ? CLASS_COLLISION
        : identityAlreadyV3
          ? CLASS_OUT_OF_SCOPE
          : CLASS_SAFE_MAP;
    return {
      id: row.id,
      companyId: row.company_id,
      from: row.root_code,
      to,
      ruleFrom: row.rule_version_id,
      ruleTo: V3_RULE,
      classification,
      reason: excludedFixture
        ? "known_qc_fixture_excluded"
        : !to
        ? "root_code_not_convertible_to_v3"
        : collision && collision.id !== row.id
          ? "target_root_already_exists"
          : identityAlreadyV3
            ? "already_v3"
            : "convert_root_or_rule_to_v3",
      collisionId: collision && collision.id !== row.id ? collision.id : null
    };
  });

  markDuplicateTargets(rootMappings, "root");
  const rootMappingById = new Map(rootMappings.map((mapping) => [mapping.id, mapping]));

  const partMappings = parts.map((row) => {
    const excludedFixture = isKnownNonProductionFixture("parts", row.id);
    const root = rootById.get(row.part_root_id);
    const rootMapping = rootMappingById.get(row.part_root_id);
    const sequenceCode = compactSequence(row.sequence_no);
    const rootTo = rootMapping?.to ?? normalizeRootToV3(root?.root_code);
    const to = rootTo && sequenceCode ? `${rootTo}-P${sequenceCode}` : null;
    const collision = to ? existingPartByNumber.get(key(row.company_id, to)) : null;
    const rootBlocked = rootMapping?.classification === CLASS_COLLISION || rootMapping?.classification === CLASS_MANUAL_REVIEW;
    const identityAlreadyV3 = to === row.part_number && row.rule_version_id === V3_RULE && isV3PartNumber(row.part_number);
    const classification = excludedFixture
      ? CLASS_OUT_OF_SCOPE
      : rootBlocked
      ? rootMapping.classification
      : !rootTo || !sequenceCode || !to
        ? CLASS_MANUAL_REVIEW
        : collision && collision.id !== row.id
          ? CLASS_COLLISION
          : identityAlreadyV3
            ? CLASS_OUT_OF_SCOPE
            : CLASS_SAFE_MAP;
    return {
      id: row.id,
      companyId: row.company_id,
      rootId: row.part_root_id,
      rootFrom: root?.root_code ?? null,
      rootTo,
      from: row.part_number,
      to,
      sequenceNo: Number(row.sequence_no),
      sequenceCode,
      ruleFrom: row.rule_version_id,
      ruleTo: V3_RULE,
      classification,
      reason: excludedFixture
        ? "known_qc_fixture_excluded"
        : rootBlocked
        ? "root_mapping_blocked"
        : !rootTo
          ? "part_root_not_convertible_to_v3"
          : !sequenceCode
            ? "part_sequence_outside_v3_capacity"
            : collision && collision.id !== row.id
              ? "target_part_already_exists"
              : identityAlreadyV3
                ? "already_v3"
                : "convert_part_or_rule_to_v3",
      collisionId: collision && collision.id !== row.id ? collision.id : null
    };
  });

  markDuplicateTargets(partMappings, "part");

  const drawingMappings = drawings.map((row) => {
    const excludedFixture = isKnownNonProductionFixture("drawings", row.id);
    const root = rootById.get(row.part_root_id);
    const rootMapping = rootMappingById.get(row.part_root_id);
    const purposeTo = normalizePurposeToV3(row.purpose_code);
    const sequenceCode = compactSequence(row.sequence_no);
    const rootTo = rootMapping?.to ?? normalizeRootToV3(root?.root_code);
    const to = rootTo && purposeTo && sequenceCode ? `${rootTo}-${purposeTo}${sequenceCode}` : null;
    const collision = to ? existingDrawingByNumber.get(key(row.company_id, to)) : null;
    const rootBlocked = rootMapping?.classification === CLASS_COLLISION || rootMapping?.classification === CLASS_MANUAL_REVIEW;
    const identityAlreadyV3 = to === row.drawing_number && row.rule_version_id === V3_RULE && isV3DrawingNumber(row.drawing_number) && row.purpose_code === purposeTo;
    const classification = excludedFixture
      ? CLASS_OUT_OF_SCOPE
      : rootBlocked
      ? rootMapping.classification
      : !rootTo || !purposeTo || !sequenceCode || !to
        ? CLASS_MANUAL_REVIEW
        : collision && collision.id !== row.id
          ? CLASS_COLLISION
          : identityAlreadyV3
            ? CLASS_OUT_OF_SCOPE
            : CLASS_SAFE_MAP;
    return {
      id: row.id,
      companyId: row.company_id,
      rootId: row.part_root_id,
      rootFrom: root?.root_code ?? null,
      rootTo,
      from: row.drawing_number,
      to,
      purposeFrom: row.purpose_code,
      purposeTo,
      sequenceNo: Number(row.sequence_no),
      sequenceCode,
      ruleFrom: row.rule_version_id,
      ruleTo: V3_RULE,
      classification,
      reason: excludedFixture
        ? "known_qc_fixture_excluded"
        : rootBlocked
        ? "root_mapping_blocked"
        : !rootTo
          ? "drawing_root_not_convertible_to_v3"
          : !purposeTo
            ? "drawing_purpose_not_convertible_to_m_or_r"
            : !sequenceCode
              ? "drawing_sequence_outside_v3_capacity"
              : collision && collision.id !== row.id
                ? "target_drawing_already_exists"
                : identityAlreadyV3
                  ? "already_v3"
                  : "convert_drawing_or_rule_to_v3",
      collisionId: collision && collision.id !== row.id ? collision.id : null
    };
  });

  markDuplicateTargets(drawingMappings, "drawing");

  const blockers = [...rootMappings, ...partMappings, ...drawingMappings].filter((item) => item.classification === CLASS_COLLISION || item.classification === CLASS_MANUAL_REVIEW);
  const replacements = buildReplacements(rootMappings, partMappings, drawingMappings);
  const referencePlan = buildReferencePlan(db, replacements);

  return {
    rootMappings,
    partMappings,
    drawingMappings,
    blockers,
    replacements,
    referencePlan
  };
}

function markDuplicateTargets(mappings, kindName) {
  const proposedTargets = new Map();
  for (const mapping of mappings) {
    if (mapping.classification !== CLASS_SAFE_MAP || !mapping.to) continue;
    const targetKey = key(mapping.companyId, mapping.to);
    const existing = proposedTargets.get(targetKey);
    if (existing) {
      mapping.classification = CLASS_COLLISION;
      mapping.reason = `duplicate_${kindName}_target_in_plan`;
      mapping.collisionId = existing.id;
    } else {
      proposedTargets.set(targetKey, mapping);
    }
  }
}

function buildReplacements(rootMappings, partMappings, drawingMappings) {
  const safeChanged = (item) => item.classification === CLASS_SAFE_MAP && item.to && item.from !== item.to;
  const roots = new Map(rootMappings.filter(safeChanged).map((item) => [item.from, item.to]));
  const parts = new Map(partMappings.filter(safeChanged).map((item) => [item.from, item.to]));
  const drawings = new Map(drawingMappings.filter(safeChanged).map((item) => [item.from, item.to]));
  const purpose = new Map(
    drawingMappings
      .filter((item) => item.classification === CLASS_SAFE_MAP && item.purposeTo && item.purposeFrom !== item.purposeTo)
      .map((item) => [item.purposeFrom, item.purposeTo])
  );
  return { roots, parts, drawings, purpose };
}

function buildNeedles(replacements) {
  return [...replacements.drawings.keys(), ...replacements.parts.keys(), ...replacements.roots.keys()];
}

function replaceExactValue(value, replacements, kindName) {
  if (kindName === "root") return replacements.roots.get(value) ?? value;
  if (kindName === "part") return replacements.parts.get(value) ?? value;
  if (kindName === "drawing") return replacements.drawings.get(value) ?? value;
  return value;
}

function replaceText(text, replacements) {
  if (typeof text !== "string" || text.length === 0) return text;
  let next = text;
  const pairs = [
    ...[...replacements.drawings.entries()],
    ...[...replacements.parts.entries()],
    ...[...replacements.roots.entries()]
  ].sort((left, right) => right[0].length - left[0].length);
  for (const [from, to] of pairs) next = next.split(from).join(to);
  return next;
}

function replaceSnapshotValue(value, replacements, currentKey = "") {
  if (Array.isArray(value)) return value.map((item) => replaceSnapshotValue(item, replacements, currentKey));
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, childKey) => {
        result[childKey] = replaceSnapshotValue(value[childKey], replacements, childKey);
        return result;
      }, {});
  }
  if (typeof value !== "string") return value;
  if (currentKey === "rootCode") return replacements.roots.get(value) ?? value;
  if (currentKey === "partNumber") return replacements.parts.get(value) ?? value;
  if (currentKey === "drawingNumber") return replacements.drawings.get(value) ?? value;
  if (currentKey === "purposeCode") return replacements.purpose.get(value) ?? value;
  if (currentKey === "purposeLabel" && value.includes("MA")) return value.replace("MA 製造圖", "製造圖").replace("MA", "製造圖");
  if (currentKey === "purposeLabel" && value.includes("OT")) return value.replace("OT 其他圖", "參考圖").replace("OT", "參考圖");
  if (currentKey === "route") return replaceText(value, replacements);
  return value;
}

function canonicalJsonStringify(value) {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value) {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value)
    .sort()
    .reduce((result, childKey) => {
      if (childKey === "snapshot_hash") return result;
      result[childKey] = sortJsonValue(value[childKey]);
      return result;
    }, {});
}

function countExactMatches(db, table, column, values) {
  if (!columnExists(db, table, column) || values.length === 0) return 0;
  const statement = db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdent(table)} WHERE ${quoteIdent(column)} = ?`);
  let count = 0;
  for (const value of values) count += Number(statement.get(value)?.count ?? 0);
  return count;
}

function countTextMatches(db, table, column, needles) {
  if (!columnExists(db, table, column) || needles.length === 0) return 0;
  const statement = db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdent(table)} WHERE ${quoteIdent(column)} LIKE ?`);
  let count = 0;
  for (const needle of needles) count += Number(statement.get(`%${needle}%`)?.count ?? 0);
  return count;
}

function buildReferencePlan(db, replacements) {
  const exact = [];
  for (const [table, column, kindName] of exactReferenceUpdates) {
    const entries = kindName === "root" ? replacements.roots : kindName === "part" ? replacements.parts : replacements.drawings;
    const values = [...entries.keys()];
    const count = countExactMatches(db, table, column, values);
    if (count > 0) exact.push({ table, column, kind: kindName, count, classification: CLASS_SAFE_MAP });
  }

  const needles = buildNeedles(replacements);
  const json = [];
  for (const [table, column] of jsonReferenceUpdates) {
    const count = countTextMatches(db, table, column, needles);
    if (count > 0) json.push({ table, column, count, classification: CLASS_SAFE_MAP });
  }

  const protectedEvidence = [];
  for (const [table, column] of retainedHistoricalFields) {
    const occurrences = countTextMatches(db, table, column, needles);
    if (occurrences > 0) protectedEvidence.push({ table, column, occurrences, classification: CLASS_PROTECTED_EVIDENCE_RETAINED });
  }

  return { exact, json, protectedEvidence };
}

function updateExactReferences(db, replacements, updatedRows) {
  for (const [table, column, kindName] of exactReferenceUpdates) {
    if (!columnExists(db, table, column)) continue;
    const entries = kindName === "root" ? replacements.roots : kindName === "part" ? replacements.parts : replacements.drawings;
    const update = db.prepare(`UPDATE ${quoteIdent(table)} SET ${quoteIdent(column)} = ? WHERE ${quoteIdent(column)} = ?`);
    let count = 0;
    for (const [from, to] of entries.entries()) {
      const result = update.run(to, from);
      count += Number(result.changes ?? 0);
    }
    updatedRows.push({ table, column, count });
  }
}

function updateSubmissionSnapshots(db, replacements, updatedRows) {
  if (!tableExists(db, "submission_snapshots")) return;
  const needles = buildNeedles(replacements);
  const rows = db.prepare("SELECT id, snapshot_hash, snapshot_json FROM submission_snapshots").all();
  const update = db.prepare("UPDATE submission_snapshots SET snapshot_hash = ?, snapshot_json = ? WHERE id = ?");
  let count = 0;
  for (const row of rows) {
    if (!row.snapshot_json || !needles.some((needle) => row.snapshot_json.includes(needle))) continue;
    let parsed;
    try {
      parsed = JSON.parse(row.snapshot_json);
    } catch {
      continue;
    }
    const next = replaceSnapshotValue(parsed, replacements);
    next.numberingCutover = {
      schema: "pdm-numbering-v3-cutover.v1",
      appliedAt: now,
      legacySnapshotHash: row.snapshot_hash,
      retainedFileEvidence: "Attachment file names, physical paths, export results and release package manifests are intentionally retained as historical evidence."
    };
    const text = canonicalJsonStringify(next);
    const hash = crypto.createHash("sha256").update(text).digest("hex");
    if (hash !== row.snapshot_hash || text !== row.snapshot_json) {
      update.run(hash, text, row.id);
      count += 1;
    }
  }
  updatedRows.push({ table: "submission_snapshots", column: "snapshot_json+snapshot_hash", count });
}

function updateJsonTextFields(db, replacements, updatedRows) {
  const needles = buildNeedles(replacements);
  for (const [table, column] of jsonReferenceUpdates) {
    if (!columnExists(db, table, column)) continue;
    const rows = db.prepare(`SELECT rowid AS rowid, ${quoteIdent(column)} AS value FROM ${quoteIdent(table)}`).all();
    const update = db.prepare(`UPDATE ${quoteIdent(table)} SET ${quoteIdent(column)} = ? WHERE rowid = ?`);
    let count = 0;
    for (const row of rows) {
      if (!row.value || !needles.some((needle) => String(row.value).includes(needle))) continue;
      const next = replaceText(String(row.value), replacements);
      if (next !== row.value) {
        update.run(next, row.rowid);
        count += 1;
      }
    }
    updatedRows.push({ table, column, count });
  }
}

function updateMasterTables(db, plan, updatedRows) {
  const updateRoot = db.prepare("UPDATE part_roots SET root_code = ?, rule_version_id = ?, updated_at = ? WHERE id = ?");
  const updatePart = db.prepare("UPDATE part_numbers SET part_number = ?, sequence_code = ?, rule_version_id = ?, updated_at = ? WHERE id = ?");
  const updateDrawing = db.prepare("UPDATE drawing_numbers SET drawing_number = ?, purpose_code = ?, purpose_description = ?, rule_version_id = ?, updated_at = ? WHERE id = ?");
  let roots = 0;
  let parts = 0;
  let drawings = 0;
  for (const mapping of plan.rootMappings.filter((item) => item.classification === CLASS_SAFE_MAP)) {
    roots += Number(updateRoot.run(mapping.to, V3_RULE, now, mapping.id).changes ?? 0);
  }
  for (const mapping of plan.partMappings.filter((item) => item.classification === CLASS_SAFE_MAP)) {
    parts += Number(updatePart.run(mapping.to, mapping.sequenceCode, V3_RULE, now, mapping.id).changes ?? 0);
  }
  for (const mapping of plan.drawingMappings.filter((item) => item.classification === CLASS_SAFE_MAP)) {
    const description = mapping.purposeTo === "M" ? "製造圖" : "參考圖";
    drawings += Number(updateDrawing.run(mapping.to, mapping.purposeTo, description, V3_RULE, now, mapping.id).changes ?? 0);
  }
  updatedRows.push({ table: "part_roots", column: "root_code/rule_version_id", count: roots });
  updatedRows.push({ table: "part_numbers", column: "part_number/sequence_code/rule_version_id", count: parts });
  updatedRows.push({ table: "drawing_numbers", column: "drawing_number/purpose_code/rule_version_id", count: drawings });
}

function upsertSequence(db, sequenceKey, companyId, nextValue) {
  const existing = db.prepare("SELECT next_value FROM numbering_sequences WHERE sequence_key = ?").get(sequenceKey);
  if (existing) {
    db.prepare("UPDATE numbering_sequences SET next_value = MAX(next_value, ?), updated_at = ? WHERE sequence_key = ?").run(nextValue, now, sequenceKey);
    return;
  }
  db.prepare("INSERT INTO numbering_sequences (sequence_key, company_id, next_value, updated_at) VALUES (?, ?, ?, ?)").run(sequenceKey, companyId, nextValue, now);
}

function updateSequences(db, updatedRows) {
  if (!tableExists(db, "numbering_sequences")) return;
  let count = 0;
  const roots = tableExists(db, "part_roots") ? db.prepare("SELECT company_id, root_code FROM part_roots").all() : [];
  const rootsByCompany = new Map();
  for (const row of roots) {
    if (!isV3RootCode(row.root_code)) continue;
    const ordinal = v3RootToOrdinal(row.root_code);
    const existing = rootsByCompany.get(row.company_id) ?? [];
    rootsByCompany.set(row.company_id, [...existing, ordinal]);
  }
  if (rootsByCompany.size === 0) rootsByCompany.set("company-jenfu", []);
  for (const [companyId, usedOrdinals] of rootsByCompany.entries()) {
    const nextOrdinal = lowestAvailableSequence(usedOrdinals, V3_ROOT_LETTERS.length * 9999, "ROOT");
    upsertSequence(db, `${companyId}:part_root:v3`, companyId, nextOrdinal);
    count += 1;
  }

  if (tableExists(db, "part_numbers")) {
    const partRows = db
      .prepare(
        `SELECT pr.company_id AS company_id, pr.root_code AS root_code, MAX(pn.sequence_no) AS max_sequence
         FROM part_roots pr
         JOIN part_numbers pn ON pn.part_root_id = pr.id
         WHERE pr.root_code GLOB '[A-Z][0-9][0-9][0-9][0-9]'
         GROUP BY pr.company_id, pr.root_code`
      )
      .all();
    for (const row of partRows) {
      upsertSequence(db, `${row.company_id}:part:${row.root_code}`, row.company_id, Number(row.max_sequence ?? 0) + 1);
      count += 1;
    }
  }

  if (tableExists(db, "drawing_numbers")) {
    const drawingRows = db
      .prepare(
        `SELECT pr.company_id AS company_id, pr.root_code AS root_code, dn.purpose_code AS purpose_code, MAX(dn.sequence_no) AS max_sequence
         FROM part_roots pr
         JOIN drawing_numbers dn ON dn.part_root_id = pr.id
         WHERE pr.root_code GLOB '[A-Z][0-9][0-9][0-9][0-9]' AND dn.purpose_code IN ('M', 'R')
         GROUP BY pr.company_id, pr.root_code, dn.purpose_code`
      )
      .all();
    for (const row of drawingRows) {
      upsertSequence(db, `${row.company_id}:drawing:${row.root_code}:${row.purpose_code}`, row.company_id, Number(row.max_sequence ?? 0) + 1);
      count += 1;
    }
  }

  updatedRows.push({ table: "numbering_sequences", column: "sequence_key", count });
}

function updateRuleStatus(db, updatedRows) {
  if (!tableExists(db, "numbering_rule_versions")) return;
  const retire = db
    .prepare("UPDATE numbering_rule_versions SET status = 'retired', retired_at = COALESCE(retired_at, ?), updated_at = ? WHERE id IN (?, ?)")
    .run(now, now, V1_RULE, V2_RULE);
  const activate = db.prepare("UPDATE numbering_rule_versions SET status = 'active', retired_at = NULL, updated_at = ? WHERE id = ?").run(now, V3_RULE);
  updatedRows.push({ table: "numbering_rule_versions", column: "status", count: Number(retire.changes ?? 0) + Number(activate.changes ?? 0) });
}

function insertCutoverAudit(db, plan, backupPath, updatedRows) {
  if (!tableExists(db, "audit_logs")) return;
  db.prepare("INSERT INTO audit_logs (id, submission_id, actor_id, action, detail_json, created_at) VALUES (?, NULL, NULL, ?, ?, ?)").run(
    crypto.randomUUID(),
    "numbering.v3.cutover",
    JSON.stringify({
      classifications: classificationSummary(plan),
      rootMappings: plan.rootMappings.filter((item) => item.classification === CLASS_SAFE_MAP).map(({ id, from, to }) => ({ id, from, to })),
      partMappings: plan.partMappings.filter((item) => item.classification === CLASS_SAFE_MAP).map(({ id, from, to }) => ({ id, from, to })),
      drawingMappings: plan.drawingMappings
        .filter((item) => item.classification === CLASS_SAFE_MAP)
        .map(({ id, from, to, purposeFrom, purposeTo }) => ({ id, from, to, purposeFrom, purposeTo })),
      protectedEvidencePolicy:
        "Audit logs, export results, frozen submission/package snapshots, attachment file names, physical paths and release package manifests are retained as historical evidence and are not rewritten.",
      backupPath,
      updatedRows
    }),
    now
  );
  updatedRows.push({ table: "audit_logs", column: "append-only cutover audit", count: 1 });
}

function applyPlan(db, plan, backupPath) {
  const updatedRows = [];
  const transaction = db.transaction(() => {
    updateExactReferences(db, plan.replacements, updatedRows);
    updateSubmissionSnapshots(db, plan.replacements, updatedRows);
    updateJsonTextFields(db, plan.replacements, updatedRows);
    updateMasterTables(db, plan, updatedRows);
    updateSequences(db, updatedRows);
    updateRuleStatus(db, updatedRows);
    insertCutoverAudit(db, plan, backupPath, updatedRows);
  });
  transaction();
  return updatedRows;
}

function countLegacyExactReferences(db) {
  const exact = [];
  for (const [table, column, kindName] of exactReferenceUpdates) {
    if (!columnExists(db, table, column)) continue;
    const rows = db.prepare(`SELECT ${quoteIdent(column)} AS value FROM ${quoteIdent(table)} WHERE ${quoteIdent(column)} IS NOT NULL`).all();
    const count = rows.filter((row) => {
      const value = String(row.value);
      if (kindName === "root") return legacyRootPattern.test(value);
      if (kindName === "part") return legacyPartPattern.test(value);
      if (kindName === "drawing") return legacyDrawingPattern.test(value);
      return false;
    }).length;
    if (count > 0) exact.push({ table, column, kind: kindName, count });
  }
  return exact;
}

function countLegacyJsonReferences(db) {
  const json = [];
  for (const [table, column] of jsonReferenceUpdates) {
    if (!columnExists(db, table, column)) continue;
    const rows = db.prepare(`SELECT ${quoteIdent(column)} AS value FROM ${quoteIdent(table)} WHERE ${quoteIdent(column)} IS NOT NULL`).all();
    const count = rows.filter((row) => legacyTextPattern.test(String(row.value))).length;
    if (count > 0) json.push({ table, column, count });
  }
  return json;
}

function collectRetainedLegacyEvidence(db) {
  const retained = [];
  for (const [table, column] of retainedHistoricalFields) {
    if (!columnExists(db, table, column)) continue;
    const rows = db.prepare(`SELECT ${quoteIdent(column)} AS value FROM ${quoteIdent(table)} WHERE ${quoteIdent(column)} IS NOT NULL`).all();
    const occurrences = rows.filter((row) => legacyTextPattern.test(String(row.value))).length;
    if (occurrences > 0) retained.push({ table, column, occurrences, classification: CLASS_PROTECTED_EVIDENCE_RETAINED });
  }
  return retained;
}

function collectStatus(db) {
  const activeRules = tableExists(db, "numbering_rule_versions")
    ? db.prepare("SELECT id, status, retired_at FROM numbering_rule_versions ORDER BY id").all()
    : [];
  const allRoots = tableExists(db, "part_roots")
    ? db.prepare("SELECT id, root_code, rule_version_id FROM part_roots").all().filter((row) => !isKnownNonProductionFixture("roots", row.id))
    : [];
  const allParts = tableExists(db, "part_numbers")
    ? db.prepare("SELECT id, part_number, rule_version_id FROM part_numbers").all().filter((row) => !isKnownNonProductionFixture("parts", row.id))
    : [];
  const allDrawings = tableExists(db, "drawing_numbers")
    ? db.prepare("SELECT id, drawing_number, purpose_code, rule_version_id FROM drawing_numbers").all().filter((row) => !isKnownNonProductionFixture("drawings", row.id))
    : [];
  const masterCounts = {
    legacyRoots: allRoots.filter((row) => legacyRootPattern.test(String(row.root_code)) || row.rule_version_id === V1_RULE || row.rule_version_id === V2_RULE).length,
    legacyParts: allParts.filter((row) => legacyPartPattern.test(String(row.part_number)) || row.rule_version_id === V1_RULE || row.rule_version_id === V2_RULE).length,
    legacyDrawings: allDrawings.filter((row) => legacyDrawingPattern.test(String(row.drawing_number)) || row.purpose_code === "MA" || row.purpose_code === "OT" || row.rule_version_id === V1_RULE || row.rule_version_id === V2_RULE).length,
    invalidV3Roots: allRoots.filter((row) => !isV3RootCode(String(row.root_code))).length,
    invalidV3Parts: allParts.filter((row) => !isV3PartNumber(String(row.part_number))).length,
    invalidV3Drawings: allDrawings.filter((row) => !isV3DrawingNumber(String(row.drawing_number))).length
  };
  return {
    activeRules,
    masterCounts,
    operationalLegacyReferences: {
      exact: countLegacyExactReferences(db),
      json: countLegacyJsonReferences(db)
    },
    retainedHistoricalEvidence: collectRetainedLegacyEvidence(db)
  };
}

function classificationSummary(plan) {
  const values = [...plan.rootMappings, ...plan.partMappings, ...plan.drawingMappings, ...plan.referencePlan.protectedEvidence];
  return values.reduce(
    (result, item) => {
      result[item.classification] = (result[item.classification] ?? 0) + 1;
      return result;
    },
    {
      [CLASS_SAFE_MAP]: 0,
      [CLASS_COLLISION]: 0,
      [CLASS_MANUAL_REVIEW]: 0,
      [CLASS_PROTECTED_EVIDENCE_RETAINED]: 0,
      [CLASS_OUT_OF_SCOPE]: 0
    }
  );
}

function buildReport(mode, plan, status, backupPath, updatedRows = []) {
  const classifications = classificationSummary(plan);
  return {
    mode,
    generatedAt: now,
    dbPath,
    backupPath,
    summary: {
      roots: plan.rootMappings.length,
      parts: plan.partMappings.length,
      drawings: plan.drawingMappings.length,
      safe_map: classifications[CLASS_SAFE_MAP] ?? 0,
      collision: classifications[CLASS_COLLISION] ?? 0,
      manual_review: classifications[CLASS_MANUAL_REVIEW] ?? 0,
      protected_evidence_retained: classifications[CLASS_PROTECTED_EVIDENCE_RETAINED] ?? 0,
      out_of_scope: classifications[CLASS_OUT_OF_SCOPE] ?? 0,
      blockers: plan.blockers.length,
      exactReferences: plan.referencePlan.exact.reduce((sum, item) => sum + item.count, 0),
      jsonReferences: plan.referencePlan.json.reduce((sum, item) => sum + item.count, 0)
    },
    excludedNonProductionFixtures: {
      roots: [...knownNonProductionFixtureIds.roots],
      parts: [...knownNonProductionFixtureIds.parts],
      drawings: [...knownNonProductionFixtureIds.drawings]
    },
    mutation: {
      dryRun: !apply,
      unchanged: !apply
    },
    rootMappings: plan.rootMappings,
    partMappings: plan.partMappings,
    drawingMappings: plan.drawingMappings,
    referencePlan: plan.referencePlan,
    blockers: plan.blockers,
    updatedRows,
    status,
    retainedHistoricalEvidencePolicy:
      "正式主檔與可查詢營運欄位會 cut over 到 v3。audit、匯出結果、frozen submission/package snapshot、附件檔名、實體路徑與 release package manifest 保留原字串作為歷史證據，不以防呆方式改寫。"
  };
}

function writeReport(report) {
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, "report.json");
  const mdPath = path.join(outputDir, "report.md");
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    mdPath,
    [
      "# PDM Numbering V3 Formal Cutover",
      "",
      `Mode: ${report.mode}`,
      `Generated at: ${report.generatedAt}`,
      `DB: ${report.dbPath}`,
      `Backup: ${report.backupPath ?? "(none)"}`,
      "",
      "## Summary",
      "",
      `- Root mappings: ${report.summary.roots}`,
      `- Part mappings: ${report.summary.parts}`,
      `- Drawing mappings: ${report.summary.drawings}`,
      `- safe_map: ${report.summary.safe_map}`,
      `- collision: ${report.summary.collision}`,
      `- manual_review: ${report.summary.manual_review}`,
      `- protected_evidence_retained: ${report.summary.protected_evidence_retained}`,
      `- out_of_scope: ${report.summary.out_of_scope}`,
      `- Blockers: ${report.summary.blockers}`,
      `- Exact operational references to update: ${report.summary.exactReferences}`,
      `- JSON operational references to update: ${report.summary.jsonReferences}`,
      "",
      "## Runtime Status",
      "",
      `- Legacy master rows: ${report.status.masterCounts.legacyRoots + report.status.masterCounts.legacyParts + report.status.masterCounts.legacyDrawings}`,
      `- Invalid v3 master rows: ${report.status.masterCounts.invalidV3Roots + report.status.masterCounts.invalidV3Parts + report.status.masterCounts.invalidV3Drawings}`,
      `- Legacy exact operational references: ${report.status.operationalLegacyReferences.exact.reduce((sum, item) => sum + item.count, 0)}`,
      `- Legacy JSON operational references: ${report.status.operationalLegacyReferences.json.reduce((sum, item) => sum + item.count, 0)}`,
      "",
      "## Retained Historical Evidence",
      "",
      ...(
        report.status.retainedHistoricalEvidence.length > 0
          ? report.status.retainedHistoricalEvidence.map((item) => `- ${item.table}.${item.column}: ${item.occurrences} legacy string occurrence(s) retained`)
          : ["- None detected"]
      ),
      ""
    ].join("\n"),
    "utf8"
  );
  return { jsonPath, mdPath };
}

function assertCutoverPassed(report) {
  const activeV3Only =
    report.status.activeRules.some((row) => row.id === V3_RULE && row.status === "active") &&
    !report.status.activeRules.some((row) => (row.id === V1_RULE || row.id === V2_RULE) && row.status === "active");
  const noLegacyMasters =
    report.status.masterCounts.legacyRoots === 0 &&
    report.status.masterCounts.legacyParts === 0 &&
    report.status.masterCounts.legacyDrawings === 0 &&
    report.status.masterCounts.invalidV3Roots === 0 &&
    report.status.masterCounts.invalidV3Parts === 0 &&
    report.status.masterCounts.invalidV3Drawings === 0;
  const noOperationalLegacyReferences =
    report.status.operationalLegacyReferences.exact.length === 0 && report.status.operationalLegacyReferences.json.length === 0;
  if (report.blockers.length > 0) throw new Error(`PDM_NUMBERING_V3_CUTOVER_BLOCKED: ${report.blockers.map((item) => item.reason).join(", ")}`);
  if (!activeV3Only) throw new Error("PDM_NUMBERING_V3_CUTOVER_RULE_STATUS_FAILED: v3 must be active and v1/v2 must not be active.");
  if (!noLegacyMasters) throw new Error(`PDM_NUMBERING_V3_CUTOVER_MASTER_ROWS_REMAIN: ${JSON.stringify(report.status.masterCounts)}`);
  if (!noOperationalLegacyReferences) {
    throw new Error(`PDM_NUMBERING_V3_CUTOVER_OPERATIONAL_REFERENCES_REMAIN: ${JSON.stringify(report.status.operationalLegacyReferences)}`);
  }
}

if (!fs.existsSync(dbPath)) throw new Error(`Database not found: ${dbPath}`);
assertMaintenanceWindow();

const db = new Database(dbPath);
try {
  db.pragma("foreign_keys = ON");
  const plan = buildPlan(db);
  if (apply && plan.blockers.length > 0) {
    const report = buildReport("blocked", plan, collectStatus(db), null);
    const paths = writeReport(report);
    throw new Error(`PDM_NUMBERING_V3_CUTOVER_BLOCKED: see ${paths.jsonPath}`);
  }

  let backupPath = null;
  let updatedRows = [];
  if (apply) {
    const backupDir = path.join(backupRoot, `pdm-numbering-v3-cutover-${stamp}`);
    fs.mkdirSync(backupDir, { recursive: true });
    backupPath = path.join(backupDir, "ai-pdm.sqlite");
    await db.backup(backupPath);
    updatedRows = applyPlan(db, plan, backupPath);
  }

  const report = buildReport(apply ? "apply" : check ? "check" : "dry-run", plan, collectStatus(db), backupPath, updatedRows);
  const paths = writeReport(report);
  if (check || apply) assertCutoverPassed(report);
  console.log(JSON.stringify({ reportPath: paths.jsonPath, markdownPath: paths.mdPath, mode: report.mode, summary: report.summary, status: report.status }, null, 2));
} finally {
  db.close();
}
