#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

const root = process.cwd();
const results = [];
const dbPath = path.join(root, "data", "ai-pdm.sqlite");
const applyReportPath = path.join(root, "output", "qc-pdm-numbering-v2-cutover", "report.json");
const checkOutputDir = path.join(root, "output", "qc-pdm-numbering-v2-cutover-check");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
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
  const result = spawnSync(process.execPath, ["scripts/pdm-numbering-v2-cutover.mjs", "--check", `--output-dir=${checkOutputDir}`], {
    cwd: root,
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
      "Runtime DB has v2 active and v1 retired",
      activeRules.some((row) => row.id === "numbering-rule-v2" && row.status === "active") &&
        !activeRules.some((row) => row.id === "numbering-rule-v1" && row.status === "active"),
      JSON.stringify(activeRules)
    );
    const counts = {
      v1Roots: db.prepare("SELECT COUNT(*) AS count FROM part_roots WHERE root_code GLOB '[0-9][0-9][0-9][0-9]' OR rule_version_id = 'numbering-rule-v1'").get().count,
      v1Parts: db.prepare("SELECT COUNT(*) AS count FROM part_numbers WHERE part_number LIKE 'P-%' OR rule_version_id = 'numbering-rule-v1'").get().count,
      v1Drawings: db.prepare("SELECT COUNT(*) AS count FROM drawing_numbers WHERE drawing_number LIKE 'D-%' OR purpose_code IN ('MA','OT') OR rule_version_id = 'numbering-rule-v1'").get().count
    };
    record("Runtime DB has no v1 master identities", counts.v1Roots === 0 && counts.v1Parts === 0 && counts.v1Drawings === 0, JSON.stringify(counts));
    const invalidV2 = {
      roots: db.prepare("SELECT COUNT(*) AS count FROM part_roots WHERE root_code NOT GLOB '[0-9][0-9][0-9][0-9][0-9]'").get().count,
      parts: db.prepare("SELECT COUNT(*) AS count FROM part_numbers WHERE part_number NOT GLOB '[0-9][0-9][0-9][0-9][0-9]-P[0-9][0-9]'").get().count,
      drawings: db.prepare("SELECT COUNT(*) AS count FROM drawing_numbers WHERE drawing_number NOT GLOB '[0-9][0-9][0-9][0-9][0-9]-[MR][0-9][0-9]'").get().count
    };
    record("Runtime DB master identities use compact v2 format", invalidV2.roots === 0 && invalidV2.parts === 0 && invalidV2.drawings === 0, JSON.stringify(invalidV2));
  } finally {
    db.close();
  }
}

try {
  record(
    "Package exposes formal cutover commands",
    fileIncludes("package.json", ["pdm:numbering-v2:cutover-dry-run", "pdm:numbering-v2:cutover-apply", "qc:pdm-numbering-v2-formal-cutover"])
  );
  record(
    "Runtime defaults retire v1 and default new master rows to v2",
    fileIncludes("src/lib/db.ts", [
      "status = 'retired'",
      "status = 'active'",
      "DEFAULT 'numbering-rule-v2'"
    ]) && fileIncludes("src/app/settings/page.tsx", ['ruleVersionId: "numbering-rule-v2"'])
  );
  record(
    "SQL migrations retire v1 and activate v2",
    fileIncludes("db/schema.sql", ["status = 'retired'", "status = 'active'", "DEFAULT 'numbering-rule-v2'"]) &&
      fileIncludes("db/postgres/001_initial_schema.sql", ["status = 'retired'", "status = 'active'", "DEFAULT 'numbering-rule-v2'"]) &&
      fileIncludes("db/postgres/004_numbering_v2_compact_identity.sql", ["status = 'retired'", "status = 'active'"])
  );
  record(
    "Cloud SQL source documents compact v2 cutover migration",
    fileIncludes("db/postgres/README.md", ["Cloud SQL PostgreSQL", "db/postgres/*.sql"]) &&
      fileIncludes("db/postgres/004_numbering_v2_compact_identity.sql", ["status = 'retired'", "status = 'active'"])
  );
  record(
    "Change-control replacement release no longer creates v1 REL roots",
    fileIncludes("src/lib/pdm-change-control-domain.ts", ["replacement_part_number_format_invalid", "NUMBERING_RULE_V2_ID", "parseCompactV2PartNumber"]) &&
      !read("src/lib/pdm-change-control-domain.ts").includes("REL-${draft.id}")
  );
  runCutoverCheck();
  assertRuntimeDb();

  const report = JSON.parse(fs.readFileSync(applyReportPath, "utf8"));
  record("Apply report exists and records backup", report.mode === "apply" && typeof report.backupPath === "string" && fs.existsSync(report.backupPath), JSON.stringify({ mode: report.mode, backupPath: report.backupPath }));
  record("Apply report records proposed mappings and retained-evidence policy", report.summary?.proposed > 0 && report.retainedHistoricalEvidencePolicy?.includes("historical evidence"), JSON.stringify(report.summary));
} finally {
  const failed = results.filter((result) => !result.passed);
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), total: results.length, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
  if (failed.length > 0) process.exit(1);
}
