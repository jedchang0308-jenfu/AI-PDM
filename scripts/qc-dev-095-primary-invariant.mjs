import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const databasePath = path.resolve(process.argv.find((argument) => argument.startsWith("--database="))?.slice(11) || "data/ai-pdm.sqlite");
const database = new Database(databasePath, { readonly: true, fileMustExist: true });
database.pragma("query_only = ON");

const tables = [
  "companies",
  "part_roots",
  "part_numbers",
  "drawing_numbers",
  "drawings",
  "bom_headers",
  "bom_lines",
  "bom_drafts",
  "bom_lines_tree",
  "bom_draft_floating_topics",
  "bom_import_profiles",
  "bom_import_jobs",
  "file_references"
];
const tableExists = (tableName) =>
  Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
const counts = Object.fromEntries(
  tables.map((tableName) => [
    tableName,
    tableExists(tableName) ? Number(database.prepare(`SELECT COUNT(*) FROM "${tableName}"`).pluck().get()) : null
  ])
);
const schema = database
  .prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name")
  .all();
const identities = Object.fromEntries(
  ["part_roots", "part_numbers", "drawing_numbers", "drawings"].map((tableName) => [
    tableName,
    tableExists(tableName) ? database.prepare(`SELECT * FROM "${tableName}" ORDER BY id`).all() : []
  ])
);
const residue = database
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%_migration%' ORDER BY name")
  .all();
const foreignKeys = database.pragma("foreign_key_check");
database.close();

console.log(
  JSON.stringify(
    {
      databasePath,
      fileSha256: crypto.createHash("sha256").update(fs.readFileSync(databasePath)).digest("hex"),
      schemaSha256: hash(schema),
      identitySha256: hash(identities),
      counts,
      residue,
      foreignKeys
    },
    null,
    2
  )
);

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
