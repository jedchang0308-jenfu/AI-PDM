#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

const rootDir = process.cwd();
const results = [];
const dbPath = path.join(rootDir, "data", "ai-pdm.sqlite");
const applyReportPath = path.join(rootDir, "output", "qc-pdm-numbering-v3-cutover", "report.json");
const checkOutputDir = path.join(rootDir, "output", "qc-pdm-numbering-v3-cutover-check");

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function record(name, passed, detail = "") {
  const ok = Boolean(passed);
  results.push({ name, passed: ok, detail });
  if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function fileIncludes(relativePath, needles) {
  const source = read(relativePath);
  return needles.every((needle) => source.includes(needle));
}

function runCutoverCheck() {
  const result = spawnSync(process.execPath, ["scripts/pdm-numbering-v3-cutover.mjs", "--check", `--output-dir=${checkOutputDir}`], {
    cwd: rootDir,
    encoding: "utf8",
    windowsHide: true
  });
  record("Cutover check command passes against runtime DB", result.status === 0, result.stderr || result.stdout);
}

function assertRuntimeDb() {
  const db = new Database(dbPath, { readonly: true });
  try {
    const activeRules = db.prepare("SELECT id, status FROM numbering_rule_versions ORDER BY id").all();
    record(
      "Runtime DB has v3 active and v1/v2 retired",
      activeRules.some((row) => row.id === "numbering-rule-v3-alpha-root" && row.status === "active") &&
        !activeRules.some((row) => (row.id === "numbering-rule-v1" || row.id === "numbering-rule-v2") && row.status === "active"),
      JSON.stringify(activeRules)
    );
    const counts = {
      legacyRoots: db
        .prepare("SELECT COUNT(*) AS count FROM part_roots WHERE root_code GLOB '[0-9][0-9][0-9][0-9]' OR root_code GLOB '[0-9][0-9][0-9][0-9][0-9]' OR rule_version_id IN ('numbering-rule-v1','numbering-rule-v2')")
        .get().count,
      legacyParts: db
        .prepare("SELECT COUNT(*) AS count FROM part_numbers WHERE part_number LIKE 'P-%' OR part_number GLOB '[0-9][0-9][0-9][0-9][0-9]-P[0-9][0-9]' OR rule_version_id IN ('numbering-rule-v1','numbering-rule-v2')")
        .get().count,
      legacyDrawings: db
        .prepare("SELECT COUNT(*) AS count FROM drawing_numbers WHERE drawing_number LIKE 'D-%' OR drawing_number GLOB '[0-9][0-9][0-9][0-9][0-9]-[MR][0-9][0-9]' OR purpose_code IN ('MA','OT') OR rule_version_id IN ('numbering-rule-v1','numbering-rule-v2')")
        .get().count
    };
    record("Runtime DB has no v1/v2 master identities", counts.legacyRoots === 0 && counts.legacyParts === 0 && counts.legacyDrawings === 0, JSON.stringify(counts));
    const invalid = {
      roots: db.prepare("SELECT COUNT(*) AS count FROM part_roots WHERE root_code NOT GLOB '[A-Z][0-9][0-9][0-9][0-9]' OR root_code GLOB '[A-Z]0000'").get().count,
      parts: db.prepare("SELECT COUNT(*) AS count FROM part_numbers WHERE part_number NOT GLOB '[A-Z][0-9][0-9][0-9][0-9]-P[0-9][0-9]' OR part_number GLOB '[A-Z]0000-P[0-9][0-9]' OR part_number GLOB '[A-Z][0-9][0-9][0-9][0-9]-P00'").get().count,
      drawings: db.prepare("SELECT COUNT(*) AS count FROM drawing_numbers WHERE drawing_number NOT GLOB '[A-Z][0-9][0-9][0-9][0-9]-[MR][0-9][0-9]' OR drawing_number GLOB '[A-Z]0000-[MR][0-9][0-9]' OR drawing_number GLOB '[A-Z][0-9][0-9][0-9][0-9]-[MR]00'").get().count
    };
    record("Runtime DB master identities use v3 format", invalid.roots === 0 && invalid.parts === 0 && invalid.drawings === 0, JSON.stringify(invalid));
  } finally {
    db.close();
  }
}

try {
  record(
    "Package exposes v3 dry-run/apply/check commands",
    fileIncludes("package.json", ["pdm:numbering-v3:cutover-dry-run", "pdm:numbering-v3:cutover-apply", "qc:pdm-numbering-v3-formal-cutover"])
  );
  record(
    "V3 cutover script emits required classifications and retained evidence policy",
    fileIncludes("scripts/pdm-numbering-v3-cutover.mjs", [
      "safe_map",
      "collision",
      "manual_review",
      "protected_evidence_retained",
      "out_of_scope",
      "retainedHistoricalEvidencePolicy"
    ])
  );
  runCutoverCheck();
  assertRuntimeDb();

  const report = JSON.parse(fs.readFileSync(applyReportPath, "utf8"));
  record("Apply report exists and records backup", report.mode === "apply" && typeof report.backupPath === "string" && fs.existsSync(report.backupPath), JSON.stringify({ mode: report.mode, backupPath: report.backupPath }));
  record(
    "Apply report records v3 mappings and governance classifications",
    report.summary?.safe_map >= 0 &&
      report.summary?.collision === 0 &&
      report.summary?.manual_review === 0 &&
      report.retainedHistoricalEvidencePolicy?.includes("audit"),
    JSON.stringify(report.summary)
  );
} finally {
  const failed = results.filter((result) => !result.passed);
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), total: results.length, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
  if (failed.length > 0) process.exit(1);
}
