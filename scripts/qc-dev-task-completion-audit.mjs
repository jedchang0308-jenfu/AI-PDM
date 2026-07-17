#!/usr/bin/env node

import { projectFileExists, readProjectFile } from "./qc-project-file-utils.mjs";
import { runProductionReadinessReport } from "./qc-production-readiness-report-runner.mjs";

const root = process.cwd();
const taskRelativePath = resolveTaskFile();
const expectedExternalOpenIds = ["DEV-PDM-ERP-GOOGLE-CLOUDSQL-001"];
const externalCategories = new Map([
  ["DEV-CAD-001", "external_document_manager"],
  ["DEV-SW-001", "external_solidworks_machine"],
  ["DEV-BACKUP-001", "external_restore_drill"],
  ["DEV-FIELD-001", "external_field_test"],
  ["DEV-IND-007", "external_supabase_shadow"],
  ["DEV-PDM-ERP-GOOGLE-CLOUDSQL-001", "external_platform_release"]
]);
const allowedOpenCategories = new Set(externalCategories.values());
const results = [];

function resolveTaskFile() {
  const candidates = [".ai-doc/dev_task.md", "dev_task.md", "PDM_dev_task.md"];
  return candidates.find((candidate) => projectFileExists(root, candidate)) ?? candidates[0];
}

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

function statusFromSymbol(symbol) {
  if (symbol === "✓") return "done";
  if (symbol === "×") return "skipped";
  if (symbol === "!") return "blocked";
  if (symbol === "↷") return "deferred";
  if (symbol === "◇") return "validation";
  if (symbol === "◐") return "in_progress";
  if (symbol === "☐") return "executable";
  return "pending";
}

function parseCanonicalEntries(markdown) {
  const lines = markdown.split(/\r?\n/u);
  const starts = [];
  lines.forEach((line, index) => {
    const match = line.match(/^-\s*([✓○☐◐◇!↷×])\s+(DEV-\d{3})\b/u);
    if (match) starts.push({ index, symbol: match[1], devId: match[2] });
  });

  return starts.map((entry, index) => {
    let end = starts[index + 1]?.index ?? lines.length;
    for (let cursor = entry.index + 1; cursor < end; cursor += 1) {
      if (/^##\s+/u.test(lines[cursor])) {
        end = cursor;
        break;
      }
    }
    const block = lines.slice(entry.index, end).join("\n");
    return { ...entry, line: entry.index + 1, block };
  });
}

function parseExternalTasks(markdown) {
  const tasks = [];
  for (const entry of parseCanonicalEntries(markdown)) {
    const sourceIds = [...entry.block.matchAll(/\bDEV-[A-Z0-9-]+\b/gu)].map((match) => match[0]);
    const externalId = sourceIds.find((id) => externalCategories.has(id));
    if (!externalId) continue;

    let status = statusFromSymbol(entry.symbol);
    if (externalId === "DEV-PDM-ERP-GOOGLE-CLOUDSQL-001" && /Future Phases Gated|future phases gated/iu.test(entry.block)) {
      status = "partial";
    }

    tasks.push({
      id: externalId,
      devId: entry.devId,
      line: entry.line,
      symbol: entry.symbol,
      status,
      category: externalCategories.get(externalId)
    });
  }
  return tasks;
}

if (!projectFileExists(root, taskRelativePath)) {
  console.error(`Task file not found: ${taskRelativePath}`);
  process.exit(1);
}

const taskMarkdown = readProjectFile(root, taskRelativePath);
const tasks = parseExternalTasks(taskMarkdown);
const openTasks = tasks.filter((task) => !["done", "skipped"].includes(task.status));
const unclassifiedOpenTasks = openTasks.filter((task) => !allowedOpenCategories.has(task.category));
const missingExpectedOpen = expectedExternalOpenIds.filter((id) => !openTasks.some((task) => task.id === id));
const handoff = readProjectFile(root, ".ai-doc/reports/industrialization/external-validation-handoff-2026-05-28.md");
const handoffTasks = openTasks.filter((task) => task.category !== "external_platform_release");
const releaseRelevantOpenTasks = openTasks.filter((task) => task.category === "external_platform_release");
const { run: readinessRun, report: readinessReport } = runProductionReadinessReport(root);
const readinessBlockers = (readinessReport?.blockers ?? []).map((blocker) => blocker.task).join("\n");
const readinessMissingOpen = releaseRelevantOpenTasks.filter((task) => !readinessBlockers.includes(task.id)).map((task) => task.id);

record("COMPLETE-001 dev_task.md exists", projectFileExists(root, taskRelativePath), taskRelativePath);
record("COMPLETE-002 canonical index exposes external evidence tasks", tasks.length >= expectedExternalOpenIds.length, String(tasks.length));
record("COMPLETE-003 no local or unclassified open task remains", unclassifiedOpenTasks.length === 0, JSON.stringify(unclassifiedOpenTasks));
record("COMPLETE-004 expected external platform gate remains visible", missingExpectedOpen.length === 0, JSON.stringify(missingExpectedOpen));
record("COMPLETE-005 external handoff mentions applicable open blockers", handoffTasks.every((task) => handoff.includes(task.id)), JSON.stringify(handoffTasks.map((task) => task.id)));
record("COMPLETE-006 production readiness report is parseable", readinessRun.status === 0 && Boolean(readinessReport), readinessRun.stderr || "parsed");
record("COMPLETE-007 production readiness reports every release-relevant blocker", readinessMissingOpen.length === 0, JSON.stringify(readinessMissingOpen));
record("COMPLETE-008 production readiness remains not ready", readinessReport?.ready === false, String(readinessReport?.ready));
record("COMPLETE-009 skipped/cancelled canonical DEV does not reopen evidence", tasks.filter((task) => task.symbol === "×").every((task) => task.status === "skipped"), JSON.stringify(tasks.filter((task) => task.symbol === "×")));

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  passed: results.length - failed.length,
  failed: failed.length,
  summary: {
    taskCount: tasks.length,
    openTaskCount: openTasks.length,
    openTasks
  },
  results
}, null, 2));

if (failed.length > 0) process.exitCode = 1;
