#!/usr/bin/env node

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const repositorySource = read("src/lib/repositories/numbering-async-repository.ts");
const createStart = repositorySource.indexOf("async createNumberingRecord");
const createEnd = repositorySource.indexOf("async updateDraftNumberingRecord", createStart);
const createNumberingRecordSource = createStart >= 0 && createEnd > createStart ? repositorySource.slice(createStart, createEnd) : "";
record(
  "Async createNumberingRecord uses provider transaction for SQLite and Postgres",
  createNumberingRecordSource.includes("return this.client.transaction(run);") &&
    !createNumberingRecordSource.includes('if (this.client.kind === "postgres") return this.client.transaction(run);') &&
    !createNumberingRecordSource.includes("return run(this.client);"),
  "src/lib/repositories/numbering-async-repository.ts"
);
record(
  "SQLite async transaction uses BEGIN IMMEDIATE",
  read("src/lib/db-async-provider.ts").includes('this.database.exec("BEGIN IMMEDIATE")'),
  "src/lib/db-async-provider.ts"
);

function createTransactionFixture() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE numbering_sequences (
      sequence_key TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'company-jenfu',
      next_value INTEGER NOT NULL CHECK (next_value > 0),
      updated_at TEXT NOT NULL
    );
    CREATE TABLE part_roots (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'company-jenfu',
      root_code TEXT NOT NULL,
      UNIQUE (company_id, root_code)
    );
    CREATE TABLE part_numbers (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'company-jenfu',
      part_root_id TEXT NOT NULL,
      part_number TEXT NOT NULL,
      UNIQUE (company_id, part_number)
    );
    CREATE TABLE drawing_numbers (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'company-jenfu',
      part_root_id TEXT NOT NULL,
      drawing_number TEXT NOT NULL,
      UNIQUE (company_id, drawing_number)
    );
  `);
  return db;
}

function allocateSequence(db, key) {
  const row = db.prepare("SELECT next_value FROM numbering_sequences WHERE sequence_key = ?").get(key);
  const now = new Date().toISOString();
  if (!row) {
    db.prepare("INSERT INTO numbering_sequences (sequence_key, company_id, next_value, updated_at) VALUES (?, 'company-jenfu', 2, ?)").run(key, now);
    return 1;
  }
  db.prepare("UPDATE numbering_sequences SET next_value = ?, updated_at = ? WHERE sequence_key = ?").run(Number(row.next_value) + 1, now, key);
  return Number(row.next_value);
}

function simulateCreateWithFailure(db, failurePoint) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const rootNo = allocateSequence(db, "company-jenfu:part_root:v2");
    if (failurePoint === "after-root-sequence") throw new Error("INJECT_AFTER_ROOT_SEQUENCE");
    const rootCode = String(rootNo).padStart(5, "0");
    db.prepare("INSERT INTO part_roots (id, company_id, root_code) VALUES (?, 'company-jenfu', ?)").run(`root-${rootCode}`, rootCode);
    const partNo = allocateSequence(db, `company-jenfu:part:${rootCode}`);
    db.prepare("INSERT INTO part_numbers (id, company_id, part_root_id, part_number) VALUES (?, 'company-jenfu', ?, ?)").run(`part-${rootCode}`, `root-${rootCode}`, `${rootCode}-P${String(partNo).padStart(2, "0")}`);
    if (failurePoint === "after-part-insert") throw new Error("INJECT_AFTER_PART_INSERT");
    const drawingNo = allocateSequence(db, `company-jenfu:drawing:${rootCode}:M`);
    db.prepare("INSERT INTO drawing_numbers (id, company_id, part_root_id, drawing_number) VALUES (?, 'company-jenfu', ?, ?)").run(`drawing-${rootCode}`, `root-${rootCode}`, `${rootCode}-M${String(drawingNo).padStart(2, "0")}`);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

for (const failurePoint of ["after-root-sequence", "after-part-insert"]) {
  const db = createTransactionFixture();
  try {
    try {
      simulateCreateWithFailure(db, failurePoint);
      record(`SQLite transaction fixture rejects ${failurePoint}`, false, "unexpected success");
    } catch (error) {
      const sequenceCount = db.prepare("SELECT COUNT(*) AS count FROM numbering_sequences").get().count;
      const rootCount = db.prepare("SELECT COUNT(*) AS count FROM part_roots").get().count;
      const partCount = db.prepare("SELECT COUNT(*) AS count FROM part_numbers").get().count;
      const drawingCount = db.prepare("SELECT COUNT(*) AS count FROM drawing_numbers").get().count;
      record(
        `SQLite transaction fixture rolls back ${failurePoint}`,
        sequenceCount === 0 && rootCount === 0 && partCount === 0 && drawingCount === 0,
        JSON.stringify({ message: error instanceof Error ? error.message : String(error), sequenceCount, rootCount, partCount, drawingCount })
      );
    }
  } finally {
    db.close();
  }
}

const failed = results.filter((result) => !result.passed);
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      results
    },
    null,
    2
  )
);

if (failed.length > 0) {
  process.exit(1);
}
