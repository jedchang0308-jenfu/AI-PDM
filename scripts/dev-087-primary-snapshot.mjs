#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const databaseArg = process.argv.find((value) => value.startsWith("--db="));
const databasePath = path.resolve(root, databaseArg ? databaseArg.slice("--db=".length) : path.join(root, "data", "ai-pdm.sqlite"));
if (!fs.existsSync(databasePath)) throw new Error("DEV087_PRIMARY_DATABASE_MISSING");
const database = new Database(databasePath, { readonly: true, fileMustExist: true });
const rows = (sql) => database.prepare(sql).all();
const count = (sql) => Number(database.prepare(sql).get().count ?? 0);
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const columns = (table) => new Set(database.prepare(`PRAGMA table_info(${table})`).all().map((row) => String(row.name)));

try {
  const schema = rows("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('table','index','trigger','view') ORDER BY type, name");
  const identities = {
    roots: rows("SELECT id, company_id, root_code, record_status FROM part_roots ORDER BY company_id, root_code, id"),
    parts: rows("SELECT id, company_id, part_root_id, part_number, record_status FROM part_numbers ORDER BY company_id, part_number, id"),
    drawingNumbers: rows("SELECT id, company_id, part_root_id, drawing_number, record_status FROM drawing_numbers ORDER BY company_id, drawing_number, id"),
    drawings: rows("SELECT id, company_id, part_root_id, formal_drawing_number_id, drawing_number, lifecycle_state FROM drawings ORDER BY company_id, drawing_number, id")
  };
  const quarantineColumns = columns("pdm_workbench_migration_quarantine");
  const unresolvedResidue = quarantineColumns.has("resolution_status")
    ? count("SELECT COUNT(*) AS count FROM pdm_workbench_migration_quarantine WHERE resolution_status='unresolved'")
    : quarantineColumns.has("resolution")
      ? count("SELECT COUNT(*) AS count FROM pdm_workbench_migration_quarantine WHERE resolution IS NULL OR TRIM(resolution)='' OR resolution='unresolved'")
      : count("SELECT COUNT(*) AS count FROM pdm_workbench_migration_quarantine");
  const snapshot = {
    schemaHash: hash(schema),
    canonicalIdentityHash: hash(identities),
    counts: Object.fromEntries(Object.entries(identities).map(([key, values]) => [key, values.length])),
    migrationResidue: {
      total: count("SELECT COUNT(*) AS count FROM pdm_workbench_migration_quarantine"),
      unresolved: unresolvedResidue
    },
    rootReferenceViolations: {
      parts: count("SELECT COUNT(*) AS count FROM part_numbers part LEFT JOIN part_roots root ON root.id=part.part_root_id AND root.company_id=part.company_id WHERE part.part_root_id IS NOT NULL AND root.id IS NULL"),
      drawingNumbers: count("SELECT COUNT(*) AS count FROM drawing_numbers drawing LEFT JOIN part_roots root ON root.id=drawing.part_root_id AND root.company_id=drawing.company_id WHERE drawing.part_root_id IS NOT NULL AND root.id IS NULL"),
      drawings: count("SELECT COUNT(*) AS count FROM drawings drawing LEFT JOIN part_roots root ON root.id=drawing.part_root_id AND root.company_id=drawing.company_id WHERE drawing.part_root_id IS NOT NULL AND root.id IS NULL"),
      formalDrawingNumbers: count("SELECT COUNT(*) AS count FROM drawings drawing LEFT JOIN drawing_numbers number ON number.id=drawing.formal_drawing_number_id AND number.company_id=drawing.company_id WHERE drawing.formal_drawing_number_id IS NOT NULL AND number.id IS NULL")
    },
    foreignKeyViolations: database.pragma("foreign_key_check").length
  };
  console.log(JSON.stringify(snapshot));
} finally {
  database.close();
}
