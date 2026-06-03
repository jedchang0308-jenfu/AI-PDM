#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getFieldTestHandoffsDir, getPostgresShadowHandoffsDir } from "./pdm-paths.mjs";

const root = process.cwd();
const results = [];
const expectedBlockers = [
  { id: "DEV-CAD-001", category: "external_document_manager" },
  { id: "DEV-SW-001", category: "external_solidworks_machine" },
  { id: "DEV-BACKUP-001", category: "external_restore_drill" },
  { id: "DEV-FIELD-001", category: "external_field_test" },
  { id: "DEV-IND-007", category: "external_supabase_shadow" }
];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

function relative(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

function readText(relativePath) {
  const filePath = path.join(root, ...relativePath.split("/"));
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function latestDirectory(baseDir) {
  if (!fs.existsSync(baseDir)) return "";
  return fs
    .readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(baseDir, entry.name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
    .at(0) ?? "";
}

function runNode(script, args = []) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
}

function parseReadinessReport() {
  const run = runNode("scripts/qc-production-readiness-test.mjs", ["--allow-open"]);
  if (run.status !== 0) return { run, report: null };
  try {
    return { run, report: JSON.parse(run.stdout) };
  } catch {
    return { run, report: null };
  }
}

function assertIncludes(label, content, expected) {
  record(`${label} includes: ${expected}`, content.includes(expected), expected);
}

function assertFileExists(label, filePath) {
  record(`${label} exists`, fs.existsSync(filePath) && fs.statSync(filePath).isFile(), relative(filePath));
}

const taskText = readText(".ai-doc/dev_task.md");
const externalHandoff = readText("docs/industrialization/external-validation-handoff-2026-05-28.md");
const evidenceChecklist = readText("docs/external-evidence-handoff-checklist-2026-05-27.md");
const activeBlockerReport = readText("docs/qc-active-goal-remaining-blockers-report-2026-06-02.md");
const packageJson = readJson("package.json");
const fieldHandoff = latestDirectory(getFieldTestHandoffsDir(root));
const postgresHandoff = latestDirectory(getPostgresShadowHandoffsDir(root));
const fieldHandoffRelative = fieldHandoff ? relative(fieldHandoff) : "";
const postgresHandoffRelative = postgresHandoff ? relative(postgresHandoff) : "";
const { run: readinessRun, report: readinessReport } = parseReadinessReport();

record("EXT-CLOSE-001 production readiness report parses", readinessRun.status === 0 && Boolean(readinessReport), readinessRun.stderr || "parsed");
record("EXT-CLOSE-002 production readiness is not ready while evidence is missing", readinessReport?.ready === false, String(readinessReport?.ready));
record("EXT-CLOSE-003 production readiness reports exactly 5 blockers", readinessReport?.blockers?.length === 5, String(readinessReport?.blockers?.length ?? "missing"));

for (const blocker of expectedBlockers) {
  const readinessBlocker = readinessReport?.blockers?.find((item) => item.task.includes(blocker.id));
  record(`EXT-CLOSE readiness includes ${blocker.id}`, Boolean(readinessBlocker), blocker.id);
  record(`EXT-CLOSE readiness category for ${blocker.id}`, readinessBlocker?.category === blocker.category, readinessBlocker?.category ?? "missing");
  record(`EXT-CLOSE dev_task keeps ${blocker.id} blocked`, taskText.includes(`| [!] | ${blocker.id} |`), blocker.id);
  assertIncludes("EXT-CLOSE external handoff", externalHandoff, blocker.id);
  assertIncludes("EXT-CLOSE active blocker report", activeBlockerReport, blocker.id);
}

record("EXT-CLOSE field handoff package exists", Boolean(fieldHandoff), fieldHandoffRelative || "missing");
record("EXT-CLOSE postgres shadow handoff package exists", Boolean(postgresHandoff), postgresHandoffRelative || "missing");

if (fieldHandoff) {
  for (const filePath of [
    "field-test-handoff.json",
    "README.md",
    "qc-checklist.ps1",
    "commands/document-manager-preflight.ps1",
    "commands/document-manager-probe.ps1",
    "commands/document-manager-fill-template.ps1",
    "commands/sw-addin-preflight.ps1",
    "commands/sw-addin-build-and-register.ps1",
    "commands/sw-addin-fill-template.ps1",
    "commands/restore-preflight.ps1",
    "commands/restore-fill-template.ps1",
    "commands/field-issues-import.ps1",
    "restore-handoff/restore-on-test-machine.ps1"
  ]) {
    assertFileExists(`EXT-CLOSE field handoff ${filePath}`, path.join(fieldHandoff, filePath));
  }
}

if (postgresHandoff) {
  for (const filePath of [
    "postgres-shadow-handoff.json",
    "README.md",
    "supabase-advisor-checklist.md",
    "qc-checklist.ps1",
    "commands/01-pre-migration-guard.ps1",
    "commands/02-apply-migration.ps1",
    "commands/03-compare-shadow.ps1",
    "db/schema.sql",
    "db/postgres/001_initial_schema.sql",
    "db/postgres/002_supabase_rls_plan.sql"
  ]) {
    assertFileExists(`EXT-CLOSE postgres handoff ${filePath}`, path.join(postgresHandoff, filePath));
  }
}

for (const doc of [
  { name: "external handoff", content: externalHandoff },
  { name: "evidence checklist", content: evidenceChecklist },
  { name: "active blocker report", content: activeBlockerReport }
]) {
  if (fieldHandoffRelative) assertIncludes(`EXT-CLOSE ${doc.name}`, doc.content, fieldHandoffRelative);
  if (postgresHandoffRelative) assertIncludes(`EXT-CLOSE ${doc.name}`, doc.content, postgresHandoffRelative);
}

for (const command of [
  "qc:document-manager-report",
  "qc:sw-addin-real-machine-report",
  "qc:restore-drill-report",
  "field-issues-import.ps1",
  "qc:defects-zero",
  "field-test:preflight -- --profile all --require-evidence",
  "01-pre-migration-guard.ps1",
  "02-apply-migration.ps1",
  "03-compare-shadow.ps1",
  "qc:production-readiness:report",
  "qa:dev-task:sync"
]) {
  assertIncludes("EXT-CLOSE external handoff command coverage", externalHandoff, command);
}

for (const safetyText of [
  "Production readiness remains open",
  "Do not create a project or branch until the user explicitly confirms",
  "ProJED",
  "ProJED_TEST",
  "PDM_POSTGRES_SHADOW_URL",
  "Every failed or blocked field case is converted into `data/quality/defect-register.json` or a new `.ai-doc/dev_task.md` item"
]) {
  assertIncludes("EXT-CLOSE external safety rule", externalHandoff, safetyText);
}

record("EXT-CLOSE field handoff QC script exposed", packageJson.scripts?.["qc:field-test-handoff-package"] === "node scripts/qc-field-test-handoff-package.mjs", "package.json");
record("EXT-CLOSE field issue intake QC script exposed", packageJson.scripts?.["qc:field-test-issue-intake"] === "node scripts/qc-field-test-issue-intake.mjs", "package.json");
record("EXT-CLOSE postgres handoff QC script exposed", packageJson.scripts?.["qc:postgres-shadow-handoff-package"] === "node scripts/qc-postgres-shadow-handoff-package.mjs", "package.json");
record("EXT-CLOSE closure QC script exposed", packageJson.scripts?.["qc:external-blocker-closure"] === "node scripts/qc-external-blocker-closure-package.mjs", "package.json");
record("EXT-CLOSE active blocker report states goal incomplete", /不可標示 complete|不能標示 complete|cannot mark/i.test(activeBlockerReport), "docs/qc-active-goal-remaining-blockers-report-2026-06-02.md");

const staleFieldIds = [...externalHandoff.matchAll(/data[\\/]+field-test-handoffs[\\/]+(\d{8}-\d{6})/gu)]
  .map((match) => match[1])
  .filter((id) => fieldHandoff && id !== path.basename(fieldHandoff));
const stalePostgresIds = [...externalHandoff.matchAll(/data[\\/]+postgres-shadow-handoffs[\\/]+(\d{8}-\d{6})/gu)]
  .map((match) => match[1])
  .filter((id) => postgresHandoff && id !== path.basename(postgresHandoff));
record("EXT-CLOSE external handoff has no stale field package id", staleFieldIds.length === 0, JSON.stringify(staleFieldIds));
record("EXT-CLOSE external handoff has no stale postgres package id", stalePostgresIds.length === 0, JSON.stringify(stalePostgresIds));

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  passed: results.length - failed.length,
  failed: failed.length,
  summary: {
    expectedBlockers: expectedBlockers.map((blocker) => blocker.id),
    fieldHandoff: fieldHandoffRelative,
    postgresHandoff: postgresHandoffRelative,
    productionReady: readinessReport?.ready ?? null
  },
  results
}, null, 2));

if (failed.length > 0) process.exitCode = 1;
