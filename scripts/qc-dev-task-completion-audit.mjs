#!/usr/bin/env node

import { projectFileExists, readProjectFile } from "./qc-project-file-utils.mjs";
import { runProductionReadinessReport } from "./qc-production-readiness-report-runner.mjs";

const root = process.cwd();
const taskRelativePath = resolveTaskFile();
const expectedExternalOpenIds = ["DEV-PDM-ERP-GOOGLE-CLOUDSQL-001"];
const allowedOpenCategories = new Set([
  "external_document_manager",
  "external_solidworks_machine",
  "external_restore_drill",
  "external_field_test",
  "external_supabase_shadow",
  "external_platform_release"
]);
const results = [];

function resolveTaskFile() {
  const candidates = [
    ".ai-doc/dev_task.md",
    "dev_task.md",
    "PDM_dev_task.md"
  ];
  return candidates.find((candidate) => projectFileExists(root, candidate)) ?? candidates[0];
}

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

function statusFromToken(token) {
  if (token === "x") return "done";
  if (token === "/") return "partial";
  if (token === "!") return "blocked";
  return "open";
}

function stripInlineCode(value) {
  return value.replace(/^`|`$/g, "");
}

function categoryForTask(id, text) {
  if (id === "DEV-CAD-001") return "external_document_manager";
  if (id === "DEV-SW-001") return "external_solidworks_machine";
  if (id === "DEV-BACKUP-001") return "external_restore_drill";
  if (id === "DEV-FIELD-001") return "external_field_test";
  if (id === "DEV-IND-007") return "external_supabase_shadow";
  if (id === "DEV-PDM-ERP-GOOGLE-CLOUDSQL-001") return "external_platform_release";
  if (/Document Manager|native CAD metadata/i.test(text)) return "external_document_manager";
  if (/SolidWorks Add-in|real-machine/i.test(text)) return "external_solidworks_machine";
  if (/restore drill|backup/i.test(text)) return "external_restore_drill";
  if (/field-test|field validation/i.test(text)) return "external_field_test";
  if (/Supabase|Postgres\/Supabase shadow|Postgres shadow/i.test(text)) return "external_supabase_shadow";
  return "local_or_unclassified";
}

function parseTopTaskTable(lines) {
  const tasks = [];
  let currentPriority = null;

  lines.forEach((line, index) => {
    const headingPriority = line.match(/^#{2,4}\s+(P[0-2])\b/i)?.[1]?.toUpperCase();
    if (headingPriority) currentPriority = headingPriority;
    if (!currentPriority || !line.trim().startsWith("|")) return;

    const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
    if (cells.length < 3) return;

    const statusMatch = cells[0].match(/^\[(x| |\/|!)\]$/);
    if (!statusMatch) return;

    const id = cells[1] ?? "";
    const text = cells.slice(1).join(" | ");
    tasks.push({
      line: index + 1,
      section: currentPriority,
      id,
      status: statusFromToken(statusMatch[1]),
      text,
      category: categoryForTask(id, text)
    });
  });

  return tasks;
}

function parseIndustrializationOverview(lines) {
  const tasks = [];
  let inBacklog = false;
  let inOverview = false;

  lines.forEach((line, index) => {
    if (/^#\s+Industrialization Optimization Backlog\b/i.test(line)) {
      inBacklog = true;
      inOverview = false;
      return;
    }
    if (inBacklog && /^##\s+Task Overview\b/i.test(line)) {
      inOverview = true;
      return;
    }
    if (inOverview && /^##\s+(?!Task Overview\b)/i.test(line)) {
      inOverview = false;
      return;
    }
    if (!inOverview) return;

    const match = line.match(/^- \[(x| |\/|!)\]\s+(DEV-IND-\d+):\s+(.+)$/);
    if (!match) return;

    const id = match[2];
    const text = `${id} | ${match[3].trim()}`;
    tasks.push({
      line: index + 1,
      section: "Industrialization",
      id,
      status: statusFromToken(match[1]),
      text,
      category: categoryForTask(id, text)
    });
  });

  return tasks;
}

function parseParkedExternalBlockers(lines) {
  const tasks = [];
  let inParkedExternalBlockers = false;
  const parkedExternalHeadingPattern = /^##\s+3\.\s+(?:Parked Scope And External Blockers|External Blockers\s*\/\s*Parked Scope)\b/i;

  lines.forEach((line, index) => {
    if (parkedExternalHeadingPattern.test(line)) {
      inParkedExternalBlockers = true;
      return;
    }
    if (inParkedExternalBlockers && /^##\s+/i.test(line) && !parkedExternalHeadingPattern.test(line)) {
      inParkedExternalBlockers = false;
    }
    if (!inParkedExternalBlockers || !line.trim().startsWith("|")) return;

    const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
    if (cells.length < 4) return;

    const statusMatch = cells[0].match(/^\[(x| |\/|!)\]$/);
    if (!statusMatch) return;

    const id = stripInlineCode(cells[1] ?? "");
    if (!expectedExternalOpenIds.includes(id)) return;

    const text = [id, cells[2] ?? "", cells[3] ?? ""].filter(Boolean).join(" | ");
    tasks.push({
      line: index + 1,
      section: "Parked Scope",
      id,
      status: statusFromToken(statusMatch[1]),
      text,
      category: categoryForTask(id, text)
    });
  });

  return tasks;
}

if (!projectFileExists(root, taskRelativePath)) {
  console.error(`Task file not found: ${taskRelativePath}`);
  process.exit(1);
}

const lines = readProjectFile(root, taskRelativePath).split(/\r?\n/u);
const tasks = [...parseTopTaskTable(lines), ...parseIndustrializationOverview(lines), ...parseParkedExternalBlockers(lines)];
const openTasks = tasks.filter((task) => task.status !== "done");
const unclassifiedOpenTasks = openTasks.filter((task) => !allowedOpenCategories.has(task.category));
const missingExpectedOpen = expectedExternalOpenIds
  .filter((id) => !openTasks.some((task) => task.id === id));
const handoff = readProjectFile(root, ".ai-doc/reports/industrialization/external-validation-handoff-2026-05-28.md");
const handoffTasks = openTasks.filter((task) => task.category !== "external_platform_release");
const { run: readinessRun, report: readinessReport } = runProductionReadinessReport(root);
const readinessIds = new Set(
  expectedExternalOpenIds.filter((id) =>
    (readinessReport?.blockers ?? []).some((blocker) => blocker.task.includes(id))
  )
);
const openIds = new Set(openTasks.map((task) => task.id));
const readinessMissingOpen = [...openIds].filter((id) => !readinessIds.has(id));

record("COMPLETE-001 dev_task.md exists", projectFileExists(root, taskRelativePath), taskRelativePath);
record("COMPLETE-002 task audit covers active backlog overview", tasks.length >= expectedExternalOpenIds.length, String(tasks.length));
record("COMPLETE-003 no local or unclassified open task remains", unclassifiedOpenTasks.length === 0, JSON.stringify(unclassifiedOpenTasks));
record("COMPLETE-004 expected external blockers remain visible", missingExpectedOpen.length === 0, JSON.stringify(missingExpectedOpen));
record("COMPLETE-005 legacy external handoff mentions applicable open blockers", handoffTasks.every((task) => handoff.includes(task.id)), JSON.stringify(handoffTasks.map((task) => task.id)));
record("COMPLETE-006 production readiness report is parseable", readinessRun.status === 0 && Boolean(readinessReport), readinessRun.stderr || "parsed");
record("COMPLETE-007 production readiness reports every open blocker", readinessMissingOpen.length === 0, JSON.stringify(readinessMissingOpen));
record("COMPLETE-008 production readiness remains not ready", readinessReport?.ready === false, String(readinessReport?.ready));

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  passed: results.length - failed.length,
  failed: failed.length,
  summary: {
    taskCount: tasks.length,
    openTaskCount: openTasks.length,
    openTasks: openTasks.map((task) => ({
      id: task.id,
      line: task.line,
      status: task.status,
      category: task.category
    }))
  },
  results
}, null, 2));
if (failed.length > 0) process.exitCode = 1;
