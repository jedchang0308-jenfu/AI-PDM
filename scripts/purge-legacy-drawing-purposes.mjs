#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { getDataDir } from "./pdm-paths.mjs";

const LEGACY_PURPOSE_CODES = ["MA", "OT"];
const LEGACY_DRAWING_CODE_PATTERN = /\bD-[A-Z0-9]+(?:-[A-Z0-9]+)*-(?:MA|OT)\d+\b/giu;
const LEGACY_FILE_PATH_PATTERN = /(?:-MA|-OT)\d+(?=[^0-9A-Z]|$)/iu;
const APPLY_CONFIRMATION = "PURGE-MA-OT-CONFIRMED";
const LEGACY_CLEANUP_TABLES = new Set([
  "audit_logs",
  "drawing_numbers",
  "drawings",
  "file_assets",
  "file_derivatives",
  "release_packages",
  "submission_files",
  "submission_snapshots",
  "submissions"
]);
const BLOCKING_REFERENCE_TABLES = new Set([
  "drawing_part_links",
  "drawings",
  "drawing_revision_fff_assessments",
  "drawing_revision_packages",
  "file_derivatives",
  "manufacturing_baseline_items",
  "numbering_candidate_revision_drafts",
  "numbering_draft_relations",
  "numbering_publication_evidence",
  "preview_jobs"
]);
const root = process.cwd();
const dataDir = path.resolve(getDataDir(root));
const dbPath = path.join(dataDir, "ai-pdm.sqlite");
const activeFileRoots = [path.join(dataDir, "repository"), path.join(dataDir, "release-packages")];
const applyMode = process.argv.includes("--apply");
const confirmation = process.argv.find((argument) => argument.startsWith("--confirm="))?.slice("--confirm=".length);

function quoteIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/iu.test(value)) throw new Error(`PURGE_IDENTIFIER_NOT_ALLOWED:${value}`);
  return `"${value}"`;
}

function hasTable(database, table) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

function rowsForPurpose(database, table) {
  if (!hasTable(database, table)) return [];
  return database
    .prepare(`SELECT * FROM ${quoteIdentifier(table)} WHERE purpose_code IN (?, ?) ORDER BY id`)
    .all(...LEGACY_PURPOSE_CODES);
}

function countByPurpose(database, table) {
  if (!hasTable(database, table)) return [];
  return database
    .prepare(`SELECT purpose_code, COUNT(*) AS count FROM ${quoteIdentifier(table)} GROUP BY purpose_code ORDER BY purpose_code`)
    .all();
}

function selectByIds(database, table, column, ids) {
  if (!ids.length || !hasTable(database, table)) return [];
  return database
    .prepare(`SELECT * FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier(column)} IN (${ids.map(() => "?").join(",")})`)
    .all(...ids);
}

function deleteByIds(database, table, column, ids) {
  if (!ids.length || !hasTable(database, table)) return 0;
  return database
    .prepare(`DELETE FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier(column)} IN (${ids.map(() => "?").join(",")})`)
    .run(...ids).changes;
}

function uniqueRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

function extractLegacyCodes(value) {
  if (typeof value !== "string") return [];
  return [...value.matchAll(LEGACY_DRAWING_CODE_PATTERN)].map((match) => match[0]);
}

function collectLegacyRows(database) {
  const tables = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all();
  const rowsByTable = {};
  for (const table of tables) {
    const columns = database
      .prepare(`PRAGMA table_info(${quoteIdentifier(table.name)})`)
      .all()
      .filter((column) => /TEXT|CHAR|CLOB/i.test(column.type ?? ""));
    if (!columns.length) continue;
    for (const row of database.prepare(`SELECT * FROM ${quoteIdentifier(table.name)}`).all()) {
      const codes = new Set();
      for (const column of columns) {
        for (const code of extractLegacyCodes(row[column.name])) codes.add(code);
      }
      if (!codes.size) continue;
      if (row.id == null) throw new Error(`PURGE_MATCHED_ROW_WITHOUT_ID:${table.name}`);
      rowsByTable[table.name] ??= [];
      rowsByTable[table.name].push({ row, codes: [...codes].sort() });
    }
  }
  return rowsByTable;
}

function summarizeLegacyRows(rowsByTable) {
  return Object.fromEntries(
    Object.entries(rowsByTable).map(([table, entries]) => [
      table,
      {
        count: entries.length,
        ids: entries.map(({ row }) => row.id),
        codes: [...new Set(entries.flatMap(({ codes }) => codes))].sort()
      }
    ])
  );
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function collectPhysicalFiles(rowGroups) {
  const paths = new Set();
  for (const row of rowGroups.flat()) {
    for (const [column, value] of Object.entries(row)) {
      if (!/path|storage|filename|file_name/i.test(column) || typeof value !== "string") continue;
      const candidate = path.resolve(value);
      if (!activeFileRoots.some((fileRoot) => isWithin(fileRoot, candidate))) continue;
      if (fs.existsSync(candidate)) paths.add(candidate);
    }
  }
  return [...paths].sort();
}

function collectOrphanLegacyFiles() {
  const paths = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(candidate);
      else if (entry.isFile() && LEGACY_FILE_PATH_PATTERN.test(candidate)) paths.push(candidate);
    }
  };
  for (const fileRoot of activeFileRoots) {
    if (fs.existsSync(fileRoot)) visit(fileRoot);
  }
  return paths;
}

function collectPlan(database) {
  const formalRows = rowsForPurpose(database, "drawing_numbers");
  const canonicalRows = rowsForPurpose(database, "drawings");
  const draftRows = rowsForPurpose(database, "numbering_draft_drawings");
  const formalIds = formalRows.map((row) => row.id);
  const canonicalIds = canonicalRows.map((row) => row.id);
  const draftIds = draftRows.map((row) => row.id);
  const legacyRowsByTable = collectLegacyRows(database);
  const legacyIds = (table) => (legacyRowsByTable[table] ?? []).map(({ row }) => row.id);
  const drawingNumbers = [
    ...formalRows.map((row) => row.drawing_number).filter(Boolean),
    ...new Set((legacyRowsByTable.drawing_numbers ?? []).flatMap(({ row }) => row.drawing_number ? [row.drawing_number] : []))
  ];
  const legacySubmissionRows = (legacyRowsByTable.submissions ?? []).map(({ row }) => row);
  const submissionRows = uniqueRows([
    ...legacySubmissionRows,
    ...(drawingNumbers.length && hasTable(database, "submissions")
      ? database
          .prepare(
            `SELECT * FROM submissions WHERE drawing_number IN (${drawingNumbers.map(() => "?").join(",")})
             OR source_entity_id IN (${drawingNumbers.map(() => "?").join(",")}) ORDER BY id`
          )
          .all(...drawingNumbers, ...drawingNumbers)
      : [])
  ]);
  const submissionIds = submissionRows.map((row) => row.id);
  const fileAssets = uniqueRows([
    ...(legacyRowsByTable.file_assets ?? []).map(({ row }) => row),
    ...selectByIds(database, "file_assets", "linked_entity_id", formalIds)
  ]);
  const fileAssetIds = fileAssets.map((row) => row.id);
  const fileDerivatives = uniqueRows([
    ...(legacyRowsByTable.file_derivatives ?? []).map(({ row }) => row),
    ...selectByIds(database, "file_derivatives", "source_file_asset_id", fileAssetIds)
  ]);
  const previewJobs = selectByIds(database, "preview_jobs", "source_file_asset_id", fileAssetIds);
  const submissionFiles = uniqueRows([
    ...(legacyRowsByTable.submission_files ?? []).map(({ row }) => row),
    ...selectByIds(database, "submission_files", "submission_id", submissionIds)
  ]);
  const submissionSnapshots = uniqueRows([
    ...(legacyRowsByTable.submission_snapshots ?? []).map(({ row }) => row),
    ...selectByIds(database, "submission_snapshots", "submission_id", submissionIds)
  ]);
  const releasePackages = (legacyRowsByTable.release_packages ?? []).map(({ row }) => row);
  const targetIdsByTable = {
    audit_logs: legacyIds("audit_logs"),
    drawing_numbers: formalIds,
    drawings: canonicalIds,
    numbering_draft_drawings: draftIds,
    file_assets: fileAssetIds,
    file_derivatives: fileDerivatives.map((row) => row.id),
    preview_jobs: previewJobs.map((row) => row.id),
    release_packages: releasePackages.map((row) => row.id),
    submission_files: submissionFiles.map((row) => row.id),
    submission_snapshots: submissionSnapshots.map((row) => row.id),
    submissions: submissionIds
  };
  const directReferences = [];
  const tables = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all();
  for (const table of tables) {
    for (const foreignKey of database.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(table.name)})`).all()) {
      const ids = targetIdsByTable[foreignKey.table];
      if (!ids?.length || foreignKey.to !== "id") continue;
      const rows = database
        .prepare(`SELECT id FROM ${quoteIdentifier(table.name)} WHERE ${quoteIdentifier(foreignKey.from)} IN (${ids.map(() => "?").join(",")})`)
        .all(...ids);
      if (rows.length) {
        directReferences.push({
          sourceTable: table.name,
          sourceColumn: foreignKey.from,
          targetTable: foreignKey.table,
          targetColumn: foreignKey.to,
          onDelete: foreignKey.on_delete,
          count: rows.length,
          ids: rows.map((row) => row.id).filter(Boolean)
        });
      }
    }
  }
  const rowGroups = [
    Object.values(legacyRowsByTable).flatMap((entries) => entries.map(({ row }) => row)),
    fileAssets,
    fileDerivatives,
    previewJobs,
    releasePackages,
    submissionFiles,
    submissionSnapshots,
    submissionRows
  ];
  return {
    dbPath,
    legacyPurposeCodes: LEGACY_PURPOSE_CODES,
    purposeCounts: {
      drawing_numbers: countByPurpose(database, "drawing_numbers"),
      drawings: countByPurpose(database, "drawings"),
      numbering_draft_drawings: countByPurpose(database, "numbering_draft_drawings")
    },
    formalRows,
    canonicalRows,
    draftRows,
    legacyRowsByTable,
    fileAssets,
    fileDerivatives,
    previewJobs,
    releasePackages,
    submissionFiles,
    submissionSnapshots,
    submissionRows,
    directReferences,
    physicalFiles: [...new Set([...collectPhysicalFiles(rowGroups), ...collectOrphanLegacyFiles()])].sort()
  };
}

function assertApplyScope(plan) {
  if (process.env.NODE_ENV === "production") throw new Error("PURGE_PRODUCTION_FORBIDDEN");
  const provider = (process.env.PDM_DB_PROVIDER ?? "sqlite").trim().toLowerCase();
  if (provider !== "sqlite") throw new Error(`PURGE_SQLITE_ONLY:${provider}`);
  if (confirmation !== APPLY_CONFIRMATION) throw new Error(`PURGE_CONFIRMATION_REQUIRED:${APPLY_CONFIRMATION}`);
  if (!isWithin(dataDir, dbPath)) throw new Error("PURGE_DATABASE_OUTSIDE_DATA_DIR");
  if (!Object.keys(plan.legacyRowsByTable).length && !plan.formalRows.length && !plan.canonicalRows.length && !plan.draftRows.length && !plan.physicalFiles.length) {
    throw new Error("PURGE_NO_LEGACY_PURPOSE_DATA");
  }
  const unexpectedLegacyTables = Object.keys(plan.legacyRowsByTable).filter((table) => !LEGACY_CLEANUP_TABLES.has(table));
  if (unexpectedLegacyTables.length) throw new Error(`PURGE_UNEXPECTED_LEGACY_TABLES:${JSON.stringify(unexpectedLegacyTables)}`);
  const unexpectedBlockingReferences = plan.directReferences.filter(
    (reference) => ["NO ACTION", "RESTRICT"].includes(reference.onDelete) && !BLOCKING_REFERENCE_TABLES.has(reference.sourceTable)
  );
  if (unexpectedBlockingReferences.length) throw new Error(`PURGE_UNEXPECTED_REFERENCES:${JSON.stringify(unexpectedBlockingReferences)}`);
  for (const filePath of plan.physicalFiles) {
    if (!activeFileRoots.some((fileRoot) => isWithin(fileRoot, filePath))) {
      throw new Error(`PURGE_FILE_OUTSIDE_ACTIVE_DATA_ROOT:${filePath}`);
    }
  }
}

async function createBackup(database, plan) {
  const stamp = `${new Date().toISOString().replaceAll(/[-:]/gu, "").replace(".", "-")}-${process.pid}`;
  const backupDir = path.join(root, "backups", "legacy-drawing-purpose-purge", stamp);
  const backupDbPath = path.join(backupDir, "ai-pdm.sqlite");
  fs.mkdirSync(backupDir, { recursive: true });
  await database.backup(backupDbPath);
  const backupFiles = [];
  for (const [index, source] of plan.physicalFiles.entries()) {
    const destination = path.join(backupDir, "files", `${String(index + 1).padStart(3, "0")}-${path.basename(source)}`);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    backupFiles.push(destination);
  }
  return { backupDir, backupDbPath, backupFiles };
}

function executePurge(database, plan) {
  database.pragma("foreign_keys = ON");
  const formalIds = plan.formalRows.map((row) => row.id);
  const canonicalIds = plan.canonicalRows.map((row) => row.id);
  const draftIds = plan.draftRows.map((row) => row.id);
  const submissionIds = plan.submissionRows.map((row) => row.id);
  const fileAssetIds = plan.fileAssets.map((row) => row.id);
  const changes = {};
  const transaction = database.transaction(() => {
    const auditTriggers = database
      .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'audit_logs' ORDER BY name")
      .all();
    for (const trigger of auditTriggers) database.exec(`DROP TRIGGER ${quoteIdentifier(trigger.name)}`);
    changes.audit_logs = deleteByIds(database, "audit_logs", "id", [
      ...(plan.legacyRowsByTable.audit_logs ?? []).map(({ row }) => row.id),
      ...selectByIds(database, "audit_logs", "submission_id", submissionIds).map((row) => row.id)
    ]);
    changes.drawing_part_links = deleteByIds(database, "drawing_part_links", "drawing_number_id", formalIds);
    changes.same_drawing_variants = deleteByIds(database, "same_drawing_variants", "drawing_number_id", formalIds);
    changes.drawing_revision_fff_assessments = deleteByIds(database, "drawing_revision_fff_assessments", "drawing_number_id", formalIds);
    changes.manufacturing_baseline_items = deleteByIds(database, "manufacturing_baseline_items", "drawing_number_id", formalIds);
    changes.drawing_revision_packages = deleteByIds(database, "drawing_revision_packages", "drawing_number_id", formalIds);
    changes.numbering_draft_relations = deleteByIds(database, "numbering_draft_relations", "drawing_draft_id", draftIds);
    changes.numbering_publication_evidence = deleteByIds(database, "numbering_publication_evidence", "drawing_draft_id", draftIds);
    changes.numbering_candidate_revision_drafts = deleteByIds(database, "numbering_candidate_revision_drafts", "drawing_draft_id", draftIds);
    changes.file_derivatives = deleteByIds(database, "file_derivatives", "id", plan.fileDerivatives.map((row) => row.id));
    changes.preview_jobs = deleteByIds(database, "preview_jobs", "id", plan.previewJobs.map((row) => row.id));
    changes.release_packages = deleteByIds(database, "release_packages", "id", plan.releasePackages.map((row) => row.id));
    changes.submission_files = deleteByIds(database, "submission_files", "id", plan.submissionFiles.map((row) => row.id));
    changes.submission_snapshots = deleteByIds(database, "submission_snapshots", "id", plan.submissionSnapshots.map((row) => row.id));
    changes.submissions = deleteByIds(database, "submissions", "id", submissionIds);
    changes.file_assets = deleteByIds(database, "file_assets", "id", fileAssetIds);
    changes.drawings = deleteByIds(database, "drawings", "id", canonicalIds);
    changes.numbering_draft_drawings = deleteByIds(database, "numbering_draft_drawings", "id", draftIds);
    changes.drawing_numbers = deleteByIds(database, "drawing_numbers", "id", formalIds);
    for (const trigger of auditTriggers) database.exec(trigger.sql);
    const foreignKeyViolations = database.prepare("PRAGMA foreign_key_check").all();
    if (foreignKeyViolations.length) throw new Error(`PURGE_FOREIGN_KEY_VIOLATION:${JSON.stringify(foreignKeyViolations)}`);
  });
  transaction();
  return changes;
}

function deletePhysicalFiles(plan) {
  const deletedFiles = [];
  for (const filePath of plan.physicalFiles) {
    if (!fs.existsSync(filePath)) continue;
    fs.unlinkSync(filePath);
    deletedFiles.push(filePath);
  }
  return deletedFiles;
}

function verifyPurge(database, plan) {
  const residualLegacyRows = summarizeLegacyRows(collectLegacyRows(database));
  const residualPurposeRows = ["drawing_numbers", "drawings", "numbering_draft_drawings"].flatMap((table) =>
    rowsForPurpose(database, table).map((row) => ({ table, id: row.id, purpose_code: row.purpose_code }))
  );
  const currentPurposeCounts = {
    drawing_numbers: countByPurpose(database, "drawing_numbers"),
    drawings: countByPurpose(database, "drawings"),
    numbering_draft_drawings: countByPurpose(database, "numbering_draft_drawings")
  };
  const preservedMAndR = {};
  for (const table of Object.keys(plan.purposeCounts)) {
    const before = new Map(plan.purposeCounts[table].map((row) => [row.purpose_code, row.count]));
    const after = new Map(currentPurposeCounts[table].map((row) => [row.purpose_code, row.count]));
    preservedMAndR[table] = { M: ["M"].every((code) => before.get(code) === after.get(code)), R: ["R"].every((code) => before.get(code) === after.get(code)) };
  }
  const foreignKeyViolations = database.prepare("PRAGMA foreign_key_check").all();
  const auditTriggers = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'audit_logs' ORDER BY name")
    .all()
    .map((row) => row.name);
  const residualFiles = plan.physicalFiles.filter((filePath) => fs.existsSync(filePath));
  if (Object.keys(residualLegacyRows).length || residualPurposeRows.length || foreignKeyViolations.length || residualFiles.length || !auditTriggers.includes("trg_audit_logs_no_delete") || !auditTriggers.includes("trg_audit_logs_no_update") || Object.values(preservedMAndR).some((value) => !value.M || !value.R)) {
    throw new Error(
      `PURGE_RESIDUAL_DATA:${JSON.stringify({ residualLegacyRows, residualPurposeRows, foreignKeyViolations, residualFiles, auditTriggers, preservedMAndR })}`
    );
  }
  return { currentPurposeCounts, preservedMAndR, auditTriggers, deletedPhysicalFiles: plan.physicalFiles.length };
}

function outputPlan(plan) {
  return {
    dbPath: plan.dbPath,
    legacyPurposeCodes: plan.legacyPurposeCodes,
    purposeCounts: plan.purposeCounts,
    legacyRows: summarizeLegacyRows(plan.legacyRowsByTable),
    formalRows: plan.formalRows.map((row) => ({ id: row.id, drawing_number: row.drawing_number, purpose_code: row.purpose_code })),
    canonicalRows: plan.canonicalRows.map((row) => ({ id: row.id, drawing_number: row.drawing_number, purpose_code: row.purpose_code })),
    draftRows: plan.draftRows.map((row) => ({ id: row.id, purpose_code: row.purpose_code })),
    dependentCounts: {
      fileAssets: plan.fileAssets.length,
      fileDerivatives: plan.fileDerivatives.length,
      previewJobs: plan.previewJobs.length,
      releasePackages: plan.releasePackages.length,
      submissionFiles: plan.submissionFiles.length,
      submissionSnapshots: plan.submissionSnapshots.length,
      submissions: plan.submissionRows.length,
      physicalFiles: plan.physicalFiles.length
    },
    directReferences: plan.directReferences
  };
}

const database = new Database(dbPath, { readonly: !applyMode, fileMustExist: true });
try {
  const plan = collectPlan(database);
  if (!applyMode) {
    console.log(JSON.stringify({ mode: "dry_run", ...outputPlan(plan) }, null, 2));
  } else {
    assertApplyScope(plan);
    const backup = await createBackup(database, plan);
    const changes = executePurge(database, plan);
    const deletedFiles = deletePhysicalFiles(plan);
    const verification = verifyPurge(database, plan);
    console.log(JSON.stringify({ mode: "applied", plan: outputPlan(plan), backup, changes, deletedFiles, verification }, null, 2));
  }
} finally {
  database.close();
}
