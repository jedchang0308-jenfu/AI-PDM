#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import Database from "better-sqlite3";

const root = process.cwd();
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const check = args.includes("--check");
const allowRunningLocalServer = args.includes("--allow-running-local-server");
const dbPath = argValue("--db", path.join(root, "data", "ai-pdm.sqlite"));
const outputDir = argValue("--output-dir", path.join(root, "output", "qc-pdm-numbering-v2-cutover"));
const backupRoot = argValue("--backup-root", path.join(root, "data", "backups"));
const now = new Date().toISOString();
const stamp = now.replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");

const V1_RULE = "numbering-rule-v1";
const V2_RULE = "numbering-rule-v2";

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
  ["manufacturing_baselines", "snapshot_json"],
  ["drawing_revision_packages", "snapshot_json"]
];

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

function countWhereLike(db, table, column, needles) {
  if (!columnExists(db, table, column)) return 0;
  let count = 0;
  const statement = db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdent(table)} WHERE ${quoteIdent(column)} LIKE ?`);
  for (const needle of needles) count += Number(statement.get(`%${needle}%`)?.count ?? 0);
  return count;
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
  return commandLine.includes(root.toLowerCase()) && (commandLine.includes("next") || commandLine.includes("npm"));
}

function assertMaintenanceWindow() {
  if (!apply || allowRunningLocalServer) return;
  const owner = readPortOwner();
  if (isProjectOwnedLocalServer(owner)) {
    throw new Error(
      `PDM_NUMBERING_V2_CUTOVER_SERVER_RUNNING: stop the AI_PDM local server before apply, or pass --allow-running-local-server intentionally. PID ${owner.processId}.`
    );
  }
}

function compactRootCode(rootCode) {
  if (/^\d{5}$/.test(rootCode)) return rootCode;
  if (/^\d{4}$/.test(rootCode)) return rootCode.padStart(5, "0");
  return null;
}

function compactSequence(sequenceNo) {
  const value = Number(sequenceNo);
  if (!Number.isInteger(value) || value < 1 || value > 99) return null;
  return String(value).padStart(2, "0");
}

function compactPurpose(purposeCode) {
  if (purposeCode === "MA") return "M";
  if (purposeCode === "OT") return "R";
  if (purposeCode === "M" || purposeCode === "R") return purposeCode;
  return null;
}

function buildPlan(db) {
  const blockers = [];
  const roots = db.prepare("SELECT * FROM part_roots ORDER BY root_code ASC, id ASC").all();
  const parts = db.prepare("SELECT * FROM part_numbers ORDER BY part_number ASC, id ASC").all();
  const drawings = db.prepare("SELECT * FROM drawing_numbers ORDER BY drawing_number ASC, id ASC").all();
  const existingRootByCode = new Map(roots.map((row) => [row.root_code, row]));
  const existingPartByNumber = new Map(parts.map((row) => [row.part_number, row]));
  const existingDrawingByNumber = new Map(drawings.map((row) => [row.drawing_number, row]));

  const rootMappings = roots
    .filter((row) => row.rule_version_id === V1_RULE || /^\d{4}$/.test(row.root_code))
    .map((row) => {
      const to = compactRootCode(row.root_code);
      const collision = to ? existingRootByCode.get(to) : null;
      const status = !to ? "blocked_invalid_root" : collision && collision.id !== row.id ? "blocked_root_collision" : row.root_code === to && row.rule_version_id === V2_RULE ? "unchanged" : "proposed";
      return { id: row.id, companyId: row.company_id, from: row.root_code, to, status, collisionId: collision && collision.id !== row.id ? collision.id : null };
    });
  const rootById = new Map(roots.map((row) => [row.id, row]));
  const rootMappingById = new Map(rootMappings.map((mapping) => [mapping.id, mapping]));

  const proposedRootTargets = new Map();
  for (const mapping of rootMappings) {
    if (mapping.status === "proposed" && mapping.to) {
      const key = `${mapping.companyId}\u0000${mapping.to}`;
      const existing = proposedRootTargets.get(key);
      if (existing) {
        mapping.status = "blocked_root_collision";
        mapping.collisionId = existing.id;
      } else {
        proposedRootTargets.set(key, mapping);
      }
    }
  }

  const partMappings = parts
    .filter((row) => row.rule_version_id === V1_RULE || /^P-\d{4}-\d{3}$/.test(row.part_number))
    .map((row) => {
      const root = rootById.get(row.part_root_id);
      const rootMapping = rootMappingById.get(row.part_root_id);
      const sequence = compactSequence(row.sequence_no);
      const to = rootMapping?.to && sequence ? `${rootMapping.to}-P${sequence}` : null;
      const collision = to ? existingPartByNumber.get(to) : null;
      const status = rootMapping?.status?.startsWith("blocked")
        ? "blocked_root_mapping"
        : !sequence
          ? "blocked_sequence_capacity"
          : collision && collision.id !== row.id
            ? "blocked_part_collision"
            : row.part_number === to && row.rule_version_id === V2_RULE
              ? "unchanged"
              : "proposed";
      return {
        id: row.id,
        companyId: row.company_id,
        rootId: row.part_root_id,
        rootFrom: root?.root_code ?? null,
        rootTo: rootMapping?.to ?? null,
        from: row.part_number,
        to,
        sequenceNo: Number(row.sequence_no),
        sequenceCode: sequence,
        status,
        collisionId: collision && collision.id !== row.id ? collision.id : null
      };
    });

  const proposedPartTargets = new Map();
  for (const mapping of partMappings) {
    if (mapping.status === "proposed" && mapping.to) {
      const key = `${mapping.companyId}\u0000${mapping.to}`;
      const existing = proposedPartTargets.get(key);
      if (existing) {
        mapping.status = "blocked_part_collision";
        mapping.collisionId = existing.id;
      } else {
        proposedPartTargets.set(key, mapping);
      }
    }
  }

  const drawingMappings = drawings
    .filter((row) => row.rule_version_id === V1_RULE || /^D-\d{4}-(MA|OT)\d$/.test(row.drawing_number) || row.purpose_code === "MA" || row.purpose_code === "OT")
    .map((row) => {
      const root = rootById.get(row.part_root_id);
      const rootMapping = rootMappingById.get(row.part_root_id);
      const purpose = compactPurpose(row.purpose_code);
      const sequence = compactSequence(row.sequence_no);
      const to = rootMapping?.to && purpose && sequence ? `${rootMapping.to}-${purpose}${sequence}` : null;
      const collision = to ? existingDrawingByNumber.get(to) : null;
      const status = rootMapping?.status?.startsWith("blocked")
        ? "blocked_root_mapping"
        : !purpose
          ? "blocked_unknown_purpose"
          : !sequence
            ? "blocked_sequence_capacity"
            : collision && collision.id !== row.id
              ? "blocked_drawing_collision"
              : row.drawing_number === to && row.rule_version_id === V2_RULE
                ? "unchanged"
                : "proposed";
      return {
        id: row.id,
        companyId: row.company_id,
        rootId: row.part_root_id,
        rootFrom: root?.root_code ?? null,
        rootTo: rootMapping?.to ?? null,
        from: row.drawing_number,
        to,
        purposeFrom: row.purpose_code,
        purposeTo: purpose,
        sequenceNo: Number(row.sequence_no),
        sequenceCode: sequence,
        status,
        collisionId: collision && collision.id !== row.id ? collision.id : null
      };
    });

  const proposedDrawingTargets = new Map();
  for (const mapping of drawingMappings) {
    if (mapping.status === "proposed" && mapping.to) {
      const key = `${mapping.companyId}\u0000${mapping.to}`;
      const existing = proposedDrawingTargets.get(key);
      if (existing) {
        mapping.status = "blocked_drawing_collision";
        mapping.collisionId = existing.id;
      } else {
        proposedDrawingTargets.set(key, mapping);
      }
    }
  }

  for (const mapping of [...rootMappings, ...partMappings, ...drawingMappings]) {
    if (mapping.status.startsWith("blocked")) blockers.push(mapping);
  }

  return {
    rootMappings,
    partMappings,
    drawingMappings,
    blockers,
    replacements: buildReplacements(rootMappings, partMappings, drawingMappings)
  };
}

function buildReplacements(rootMappings, partMappings, drawingMappings) {
  const roots = new Map(rootMappings.filter((item) => item.status === "proposed" && item.to).map((item) => [item.from, item.to]));
  const parts = new Map(partMappings.filter((item) => item.status === "proposed" && item.to).map((item) => [item.from, item.to]));
  const drawings = new Map(drawingMappings.filter((item) => item.status === "proposed" && item.to).map((item) => [item.from, item.to]));
  const purpose = new Map(drawingMappings.filter((item) => item.status === "proposed" && item.purposeTo).map((item) => [item.purposeFrom, item.purposeTo]));
  return { roots, parts, drawings, purpose };
}

function buildNeedles(replacements) {
  return [...replacements.drawings.keys(), ...replacements.parts.keys(), ...replacements.roots.keys()];
}

function replaceExactValue(value, replacements, kind) {
  if (kind === "root") return replacements.roots.get(value) ?? value;
  if (kind === "part") return replacements.parts.get(value) ?? value;
  if (kind === "drawing") return replacements.drawings.get(value) ?? value;
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

function replaceSnapshotValue(value, replacements, key = "") {
  if (Array.isArray(value)) return value.map((item) => replaceSnapshotValue(item, replacements, key));
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, childKey) => {
        result[childKey] = replaceSnapshotValue(value[childKey], replacements, childKey);
        return result;
      }, {});
  }
  if (typeof value !== "string") return value;
  if (key === "rootCode") return replacements.roots.get(value) ?? value;
  if (key === "partNumber") return replacements.parts.get(value) ?? value;
  if (key === "drawingNumber") return replacements.drawings.get(value) ?? value;
  if (key === "purposeCode") return replacements.purpose.get(value) ?? value;
  if (key === "purposeLabel" && value.includes("MA")) return value.replace("MA 製造圖", "製造圖").replace("MA", "製造圖");
  if (key === "route") return replaceText(value, replacements);
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
    .reduce((result, key) => {
      if (key === "snapshot_hash") return result;
      result[key] = sortJsonValue(value[key]);
      return result;
    }, {});
}

function updateSubmissionSnapshots(db, replacements, updatedRows) {
  if (!tableExists(db, "submission_snapshots")) return;
  const rows = db.prepare("SELECT id, snapshot_hash, snapshot_json FROM submission_snapshots").all();
  const update = db.prepare("UPDATE submission_snapshots SET snapshot_hash = ?, snapshot_json = ? WHERE id = ?");
  let count = 0;
  for (const row of rows) {
    if (!row.snapshot_json || !buildNeedles(replacements).some((needle) => row.snapshot_json.includes(needle))) continue;
    let parsed;
    try {
      parsed = JSON.parse(row.snapshot_json);
    } catch {
      continue;
    }
    const next = replaceSnapshotValue(parsed, replacements);
    next.numberingCutover = {
      schema: "pdm-numbering-v2-cutover.v1",
      appliedAt: now,
      legacySnapshotHash: row.snapshot_hash,
      retainedFileEvidence: "Attachment file names, physical paths and release package manifests are intentionally retained as historical evidence."
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

function updateExactReferences(db, replacements, updatedRows) {
  for (const [table, column, kind] of exactReferenceUpdates) {
    if (!columnExists(db, table, column)) continue;
    const entries = kind === "root" ? replacements.roots : kind === "part" ? replacements.parts : replacements.drawings;
    const update = db.prepare(`UPDATE ${quoteIdent(table)} SET ${quoteIdent(column)} = ? WHERE ${quoteIdent(column)} = ?`);
    let count = 0;
    for (const [from, to] of entries.entries()) {
      const result = update.run(to, from);
      count += Number(result.changes ?? 0);
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
  for (const mapping of plan.rootMappings.filter((item) => item.status === "proposed")) {
    roots += Number(updateRoot.run(mapping.to, V2_RULE, now, mapping.id).changes ?? 0);
  }
  for (const mapping of plan.partMappings.filter((item) => item.status === "proposed")) {
    parts += Number(updatePart.run(mapping.to, mapping.sequenceCode, V2_RULE, now, mapping.id).changes ?? 0);
  }
  for (const mapping of plan.drawingMappings.filter((item) => item.status === "proposed")) {
    const description = mapping.purposeTo === "M" ? "製造圖" : "參考圖";
    drawings += Number(updateDrawing.run(mapping.to, mapping.purposeTo, description, V2_RULE, now, mapping.id).changes ?? 0);
  }
  updatedRows.push({ table: "part_roots", column: "root_code/rule_version_id", count: roots });
  updatedRows.push({ table: "part_numbers", column: "part_number/sequence_code/rule_version_id", count: parts });
  updatedRows.push({ table: "drawing_numbers", column: "drawing_number/purpose_code/rule_version_id", count: drawings });
}

function upsertSequence(db, key, companyId, nextValue) {
  const existing = db.prepare("SELECT next_value FROM numbering_sequences WHERE sequence_key = ?").get(key);
  if (existing) {
    db.prepare("UPDATE numbering_sequences SET next_value = MAX(next_value, ?), updated_at = ? WHERE sequence_key = ?").run(nextValue, now, key);
    return;
  }
  db.prepare("INSERT INTO numbering_sequences (sequence_key, company_id, next_value, updated_at) VALUES (?, ?, ?, ?)").run(key, companyId, nextValue, now);
}

function updateSequences(db, plan, updatedRows) {
  if (!tableExists(db, "numbering_sequences")) return;
  let count = 0;
  const rootNumbers = new Set();
  for (const row of db.prepare("SELECT root_code FROM part_roots").all()) {
    if (/^\d{5}$/.test(row.root_code)) rootNumbers.add(Number(row.root_code));
  }
  for (const mapping of plan.rootMappings) {
    if (mapping.to && /^\d{5}$/.test(mapping.to)) rootNumbers.add(Number(mapping.to));
  }
  const maxRoot = rootNumbers.size > 0 ? Math.max(...rootNumbers) : 0;
  const companyIds = new Set(plan.rootMappings.map((item) => item.companyId).filter(Boolean));
  if (companyIds.size === 0) companyIds.add("company-jenfu");
  for (const companyId of companyIds) {
    upsertSequence(db, `${companyId}:part_root:v2`, companyId, maxRoot + 1);
    count += 1;
  }

  for (const mapping of plan.partMappings.filter((item) => item.status === "proposed" && item.rootTo)) {
    upsertSequence(db, `${mapping.companyId}:part:${mapping.rootTo}`, mapping.companyId, mapping.sequenceNo + 1);
    count += 1;
  }
  for (const mapping of plan.drawingMappings.filter((item) => item.status === "proposed" && item.rootTo && item.purposeTo)) {
    upsertSequence(db, `${mapping.companyId}:drawing:${mapping.rootTo}:${mapping.purposeTo}`, mapping.companyId, mapping.sequenceNo + 1);
    count += 1;
  }
  updatedRows.push({ table: "numbering_sequences", column: "sequence_key", count });
}

function updateRuleStatus(db, updatedRows) {
  if (!tableExists(db, "numbering_rule_versions")) return;
  const retire = db
    .prepare("UPDATE numbering_rule_versions SET status = 'retired', retired_at = COALESCE(retired_at, ?), updated_at = ? WHERE id = ?")
    .run(now, now, V1_RULE);
  const activate = db.prepare("UPDATE numbering_rule_versions SET status = 'active', retired_at = NULL, updated_at = ? WHERE id = ?").run(now, V2_RULE);
  updatedRows.push({ table: "numbering_rule_versions", column: "status", count: Number(retire.changes ?? 0) + Number(activate.changes ?? 0) });
}

function insertCutoverAudit(db, plan, backupPath, updatedRows) {
  if (!tableExists(db, "audit_logs")) return;
  db.prepare("INSERT INTO audit_logs (id, submission_id, actor_id, action, detail_json, created_at) VALUES (?, NULL, NULL, ?, ?, ?)").run(
    crypto.randomUUID(),
    "numbering.v2.cutover",
    JSON.stringify({
      rootMappings: plan.rootMappings.filter((item) => item.status === "proposed").map(({ id, from, to }) => ({ id, from, to })),
      partMappings: plan.partMappings.filter((item) => item.status === "proposed").map(({ id, from, to }) => ({ id, from, to })),
      drawingMappings: plan.drawingMappings.filter((item) => item.status === "proposed").map(({ id, from, to, purposeFrom, purposeTo }) => ({ id, from, to, purposeFrom, purposeTo })),
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
    updateSequences(db, plan, updatedRows);
    updateRuleStatus(db, updatedRows);
    insertCutoverAudit(db, plan, backupPath, updatedRows);
  });
  transaction();
  return updatedRows;
}

function collectStatus(db, plan) {
  const activeRules = tableExists(db, "numbering_rule_versions")
    ? db.prepare("SELECT id, status, retired_at FROM numbering_rule_versions ORDER BY id").all()
    : [];
  const masterCounts = {
    v1Roots: tableExists(db, "part_roots") ? Number(db.prepare("SELECT COUNT(*) AS count FROM part_roots WHERE root_code GLOB '[0-9][0-9][0-9][0-9]' OR rule_version_id = ?").get(V1_RULE).count ?? 0) : 0,
    v1Parts: tableExists(db, "part_numbers") ? Number(db.prepare("SELECT COUNT(*) AS count FROM part_numbers WHERE part_number LIKE 'P-%' OR rule_version_id = ?").get(V1_RULE).count ?? 0) : 0,
    v1Drawings: tableExists(db, "drawing_numbers")
      ? Number(db.prepare("SELECT COUNT(*) AS count FROM drawing_numbers WHERE drawing_number LIKE 'D-%' OR purpose_code IN ('MA','OT') OR rule_version_id = ?").get(V1_RULE).count ?? 0)
      : 0
  };
  const needles = buildNeedles(plan.replacements);
  const retained = retainedHistoricalFields
    .filter(([table, column]) => columnExists(db, table, column))
    .map(([table, column]) => ({ table, column, occurrences: countWhereLike(db, table, column, needles) }))
    .filter((item) => item.occurrences > 0);
  return { activeRules, masterCounts, retained };
}

function buildReport(mode, plan, status, backupPath, updatedRows = []) {
  return {
    mode,
    generatedAt: now,
    dbPath,
    backupPath,
    summary: {
      roots: plan.rootMappings.length,
      parts: plan.partMappings.length,
      drawings: plan.drawingMappings.length,
      proposed: [...plan.rootMappings, ...plan.partMappings, ...plan.drawingMappings].filter((item) => item.status === "proposed").length,
      unchanged: [...plan.rootMappings, ...plan.partMappings, ...plan.drawingMappings].filter((item) => item.status === "unchanged").length,
      blocked: plan.blockers.length
    },
    rootMappings: plan.rootMappings,
    partMappings: plan.partMappings,
    drawingMappings: plan.drawingMappings,
    blockers: plan.blockers,
    updatedRows,
    status,
    retainedHistoricalEvidencePolicy:
      "Release packages, audit logs, attachment file names, derivative paths and physical repository paths are intentionally retained as historical evidence. Current master identities and operational lookup fields are cut over to v2."
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
      "# PDM Numbering V2 Formal Cutover",
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
      `- Proposed changes: ${report.summary.proposed}`,
      `- Blocked mappings: ${report.summary.blocked}`,
      `- Remaining v1 master rows: ${report.status.masterCounts.v1Roots + report.status.masterCounts.v1Parts + report.status.masterCounts.v1Drawings}`,
      "",
      "## Retained Historical Evidence",
      "",
      ...(
        report.status.retained.length > 0
          ? report.status.retained.map((item) => `- ${item.table}.${item.column}: ${item.occurrences} legacy string occurrence(s) retained`)
          : ["- None detected"]
      ),
      ""
    ].join("\n"),
    "utf8"
  );
  return { jsonPath, mdPath };
}

function assertCutoverPassed(report) {
  const activeV2Only =
    report.status.activeRules.some((row) => row.id === V2_RULE && row.status === "active") &&
    !report.status.activeRules.some((row) => row.id === V1_RULE && row.status === "active");
  const noV1Masters = report.status.masterCounts.v1Roots === 0 && report.status.masterCounts.v1Parts === 0 && report.status.masterCounts.v1Drawings === 0;
  if (report.blockers.length > 0) throw new Error(`PDM_NUMBERING_V2_CUTOVER_BLOCKED: ${report.blockers.map((item) => item.status).join(", ")}`);
  if (!activeV2Only) throw new Error("PDM_NUMBERING_V2_CUTOVER_RULE_STATUS_FAILED: v2 must be the only active numbering rule.");
  if (!noV1Masters) throw new Error(`PDM_NUMBERING_V2_CUTOVER_MASTER_ROWS_REMAIN: ${JSON.stringify(report.status.masterCounts)}`);
}

if (!fs.existsSync(dbPath)) throw new Error(`Database not found: ${dbPath}`);
assertMaintenanceWindow();

const db = new Database(dbPath);
try {
  db.pragma("foreign_keys = ON");
  const plan = buildPlan(db);
  if (apply && plan.blockers.length > 0) {
    const report = buildReport("blocked", plan, collectStatus(db, plan), null);
    const paths = writeReport(report);
    throw new Error(`PDM_NUMBERING_V2_CUTOVER_BLOCKED: see ${paths.jsonPath}`);
  }

  let backupPath = null;
  let updatedRows = [];
  if (apply) {
    const backupDir = path.join(backupRoot, `pdm-numbering-v2-cutover-${stamp}`);
    fs.mkdirSync(backupDir, { recursive: true });
    backupPath = path.join(backupDir, "ai-pdm.sqlite");
    await db.backup(backupPath);
    updatedRows = applyPlan(db, plan, backupPath);
  }

  const report = buildReport(apply ? "apply" : check ? "check" : "dry-run", plan, collectStatus(db, plan), backupPath, updatedRows);
  const paths = writeReport(report);
  if (check || apply) assertCutoverPassed(report);
  console.log(JSON.stringify({ reportPath: paths.jsonPath, markdownPath: paths.mdPath, mode: report.mode, summary: report.summary, status: report.status }, null, 2));
} finally {
  db.close();
}
