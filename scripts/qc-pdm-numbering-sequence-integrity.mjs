#!/usr/bin/env node

import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveNumberingQcDbPath, resolveProtectedNumberingRuntimeDbPath } from "./numbering-qc-runtime-guard.mjs";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const selfTest = args.has("--self-test") || process.argv.length <= 2;
const runtimeReportOnly = args.has("--runtime-report-only");
const runtimeGate = args.has("--runtime");
const reportDir = path.join(root, "output", "qc-pdm-numbering-sequence-integrity");
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
}

function rootCodeFromSequence(sequenceNo) {
  return String(sequenceNo).padStart(5, "0");
}

function parseAuditRootCodes(rows) {
  const rootCodes = [];
  for (const row of rows) {
    try {
      const detail = JSON.parse(row.detail_json ?? "{}");
      if (typeof detail.rootCode === "string" && /^\d{5}$/u.test(detail.rootCode)) {
        rootCodes.push(detail.rootCode);
      }
    } catch {
      // Invalid legacy audit JSON is reported by count only; do not mutate audit evidence.
    }
  }
  return [...new Set(rootCodes)].sort();
}

function parsePurgedTestRootCodes(rows) {
  const rootCodes = [];
  for (const row of rows) {
    try {
      const detail = JSON.parse(row.detail_json ?? "{}");
      if (!Array.isArray(detail.purgedRootCodes)) continue;
      for (const code of detail.purgedRootCodes) {
        if (typeof code === "string" && /^\d{5}$/u.test(code)) rootCodes.push(code);
      }
    } catch {
      // Repair evidence is best-effort for reporting. Invalid JSON must not hide integrity drift.
    }
  }
  return [...new Set(rootCodes)].sort();
}

function analyzeSequenceIntegrity(db, { companyId = "company-jenfu" } = {}) {
  const sequenceKey = `${companyId}:part_root:v2`;
  const sequence = db.prepare("SELECT sequence_key, company_id, next_value, updated_at FROM numbering_sequences WHERE sequence_key = ?").get(sequenceKey) ?? null;
  const retainedRootRows = db
    .prepare("SELECT root_code FROM part_roots WHERE company_id = ? AND rule_version_id = 'numbering-rule-v2' ORDER BY root_code")
    .all(companyId);
  const retainedRootCodes = retainedRootRows.map((row) => row.root_code).filter((code) => /^\d{5}$/u.test(code));
  const retainedRootSet = new Set(retainedRootCodes);
  const auditRows = db.prepare("SELECT detail_json FROM audit_logs WHERE action = 'numbering.create' ORDER BY created_at ASC").all();
  const auditRootCodes = parseAuditRootCodes(auditRows);
  const auditRootSet = new Set(auditRootCodes);
  const repairRows = db.prepare("SELECT detail_json FROM audit_logs WHERE action = 'numbering.sequence_repair' ORDER BY created_at ASC").all();
  const purgedTestRootCodes = parsePurgedTestRootCodes(repairRows);
  const purgedTestRootSet = new Set(purgedTestRootCodes);
  const expectedAllocatedCodes = [];
  const allocatedMax = Number(sequence?.next_value ?? 1) - 1;
  for (let value = 1; value <= Math.max(0, allocatedMax); value += 1) {
    expectedAllocatedCodes.push(rootCodeFromSequence(value));
  }

  const missingAuditRootsFromMaster = auditRootCodes.filter((code) => !retainedRootSet.has(code) && !purgedTestRootSet.has(code));
  const retainedRootsMissingAudit = retainedRootCodes.filter((code) => !auditRootSet.has(code));
  const expectedCodesMissingMasterAndAudit = expectedAllocatedCodes.filter((code) => !retainedRootSet.has(code) && !auditRootSet.has(code) && !purgedTestRootSet.has(code));
  const maxRetained = retainedRootCodes.length > 0 ? Math.max(...retainedRootCodes.map((code) => Number(code))) : 0;
  const sequenceCoversRetainedRoots = sequence ? allocatedMax >= maxRetained : retainedRootCodes.length === 0;
  const clean =
    sequenceCoversRetainedRoots &&
    missingAuditRootsFromMaster.length === 0 &&
    retainedRootsMissingAudit.length === 0 &&
    expectedCodesMissingMasterAndAudit.length === 0;

  return {
    clean,
    companyId,
    sequenceKey,
    sequence,
    allocatedMax,
    retainedRootCodes,
    auditRootCodes,
    purgedTestRootCodes,
    missingAuditRootsFromMaster,
    retainedRootsMissingAudit,
    expectedCodesMissingMasterAndAudit,
    sequenceCoversRetainedRoots,
    counts: {
      retainedRoots: retainedRootCodes.length,
      auditCreatedRoots: auditRootCodes.length,
      purgedTestRoots: purgedTestRootCodes.length,
      missingAuditRootsFromMaster: missingAuditRootsFromMaster.length,
      retainedRootsMissingAudit: retainedRootsMissingAudit.length,
      expectedCodesMissingMasterAndAudit: expectedCodesMissingMasterAndAudit.length
    }
  };
}

function createFixtureDb({ contaminated }) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-sequence-integrity-"));
  const dbPath = path.join(tempDir, "ai-pdm.sqlite");
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE numbering_sequences (
      sequence_key TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'company-jenfu',
      next_value INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE part_roots (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'company-jenfu',
      root_code TEXT NOT NULL,
      core_name TEXT NOT NULL,
      item_kind TEXT NOT NULL,
      development_phase TEXT NOT NULL,
      record_status TEXT NOT NULL,
      rule_version_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE part_numbers (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'company-jenfu',
      part_root_id TEXT NOT NULL,
      part_number TEXT NOT NULL
    );
    CREATE TABLE drawing_numbers (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL DEFAULT 'company-jenfu',
      part_root_id TEXT NOT NULL,
      drawing_number TEXT NOT NULL
    );
    CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  const now = new Date().toISOString();
  const roots = contaminated ? ["00001"] : ["00001", "00002"];
  const auditRoots = contaminated ? ["00001", "00002", "00003"] : ["00001", "00002"];
  db.prepare("INSERT INTO numbering_sequences (sequence_key, company_id, next_value, updated_at) VALUES (?, 'company-jenfu', ?, ?)")
    .run("company-jenfu:part_root:v2", contaminated ? 4 : 3, now);
  for (const code of roots) {
    db.prepare(
      "INSERT INTO part_roots (id, company_id, root_code, core_name, item_kind, development_phase, record_status, rule_version_id, created_at, updated_at) VALUES (?, 'company-jenfu', ?, ?, 'manufactured', 'EVT', 'Draft', 'numbering-rule-v2', ?, ?)"
    ).run(`root-${code}`, code, `Fixture ${code}`, now, now);
  }
  for (const code of auditRoots) {
    db.prepare("INSERT INTO audit_logs (id, action, detail_json, created_at) VALUES (?, 'numbering.create', ?, ?)")
      .run(`audit-${code}`, JSON.stringify({ rootCode: code, partNumber: `${code}-P01`, drawingNumber: `${code}-M01`, ruleVersionId: "numbering-rule-v2" }), now);
  }
  return { db, tempDir };
}

function runSelfTest() {
  const cleanFixture = createFixtureDb({ contaminated: false });
  try {
    const cleanReport = analyzeSequenceIntegrity(cleanFixture.db);
    record("Clean fixture passes sequence integrity", cleanReport.clean, JSON.stringify(cleanReport.counts));
  } finally {
    cleanFixture.db.close();
    fs.rmSync(cleanFixture.tempDir, { recursive: true, force: true });
  }

  const contaminatedFixture = createFixtureDb({ contaminated: true });
  try {
    const contaminatedReport = analyzeSequenceIntegrity(contaminatedFixture.db);
    record(
      "Contaminated fixture fails sequence integrity",
      !contaminatedReport.clean && contaminatedReport.missingAuditRootsFromMaster.length === 2,
      JSON.stringify(contaminatedReport.counts)
    );
  } finally {
    contaminatedFixture.db.close();
    fs.rmSync(contaminatedFixture.tempDir, { recursive: true, force: true });
  }
}

function writeReport(report, { reportOnly }) {
  fs.mkdirSync(reportDir, { recursive: true });
  const payload = {
    checkedAt: new Date().toISOString(),
    reportOnly,
    protectedRuntimeDbPath: resolveProtectedNumberingRuntimeDbPath(root),
    report
  };
  fs.writeFileSync(path.join(reportDir, "report.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(reportDir, "report.md"),
    [
      "# PDM Numbering Sequence Integrity Report",
      "",
      `- Checked at: ${payload.checkedAt}`,
      `- Report only: ${reportOnly ? "yes" : "no"}`,
      `- Clean: ${report.clean ? "yes" : "no"}`,
      `- Sequence key: ${report.sequenceKey}`,
      `- Next value: ${report.sequence?.next_value ?? "missing"}`,
      `- Retained roots: ${report.counts.retainedRoots}`,
      `- Audit-created roots: ${report.counts.auditCreatedRoots}`,
      `- Purged test roots: ${report.counts.purgedTestRoots}`,
      `- Missing audit roots from master: ${report.counts.missingAuditRootsFromMaster}`,
      `- Retained roots missing audit: ${report.counts.retainedRootsMissingAudit}`,
      `- Expected codes missing master and audit: ${report.counts.expectedCodesMissingMasterAndAudit}`,
      ""
    ].join("\n"),
    "utf8"
  );
}

function runRuntimeCheck({ reportOnly }) {
  const dbPath = resolveNumberingQcDbPath(root, process.env);
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const report = analyzeSequenceIntegrity(db);
    writeReport(report, { reportOnly });
    record(
      reportOnly ? "Runtime sequence integrity report generated read-only" : "Runtime sequence integrity passes",
      reportOnly ? true : report.clean,
      JSON.stringify({ dbPath, clean: report.clean, counts: report.counts })
    );
  } finally {
    db.close();
  }
}

if (selfTest) runSelfTest();
if (runtimeReportOnly || runtimeGate) runRuntimeCheck({ reportOnly: runtimeReportOnly });

const failed = results.filter((result) => !result.passed);
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      reportDir,
      results
    },
    null,
    2
  )
);

if (failed.length > 0) {
  process.exit(1);
}
