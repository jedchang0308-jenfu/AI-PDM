#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const taskPath = resolveTaskFile();
const expectedExternalOpenIds = ["DEV-CAD-001", "DEV-SW-001", "DEV-BACKUP-001", "DEV-FIELD-001", "DEV-IND-007"];
const allowedOpenCategories = new Set([
  "external_document_manager",
  "external_solidworks_machine",
  "external_restore_drill",
  "external_field_test",
  "external_supabase_shadow"
]);
const results = [];

function resolveTaskFile() {
  const candidates = [
    path.join(root, ".ai-doc", "dev_task.md"),
    path.join(root, "dev_task.md"),
    path.join(root, "PDM_dev_task.md")
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
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

function categoryForTask(id, text) {
  if (id === "DEV-CAD-001") return "external_document_manager";
  if (id === "DEV-SW-001") return "external_solidworks_machine";
  if (id === "DEV-BACKUP-001") return "external_restore_drill";
  if (id === "DEV-FIELD-001") return "external_field_test";
  if (id === "DEV-IND-007") return "external_supabase_shadow";
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

function runReadinessReport() {
  const run = spawnSync(process.execPath, ["scripts/qc-production-readiness-test.mjs", "--allow-open"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
  if (run.status !== 0) return { run, report: null };
  try {
    return { run, report: JSON.parse(run.stdout) };
  } catch {
    return { run, report: null };
  }
}

if (!fs.existsSync(taskPath)) {
  console.error(`Task file not found: ${path.relative(root, taskPath)}`);
  process.exit(1);
}

const lines = fs.readFileSync(taskPath, "utf8").split(/\r?\n/u);
const tasks = [...parseTopTaskTable(lines), ...parseIndustrializationOverview(lines)];
const openTasks = tasks.filter((task) => task.status !== "done");
const unclassifiedOpenTasks = openTasks.filter((task) => !allowedOpenCategories.has(task.category));
const missingExpectedOpen = expectedExternalOpenIds
  .filter((id) => !openTasks.some((task) => task.id === id));
const handoff = fs.readFileSync(path.join(root, "docs", "industrialization", "external-validation-handoff-2026-05-28.md"), "utf8");
const { run: readinessRun, report: readinessReport } = runReadinessReport();
const readinessIds = new Set((readinessReport?.blockers ?? []).map((blocker) => blocker.task.match(/DEV-[A-Z]+-\d+/)?.[0]).filter(Boolean));
const openIds = new Set(openTasks.map((task) => task.id));
const readinessMissingOpen = [...openIds].filter((id) => !readinessIds.has(id));

record("COMPLETE-001 dev_task.md exists", fs.existsSync(taskPath), path.relative(root, taskPath));
record("COMPLETE-002 task audit covers active backlog overview", tasks.length >= expectedExternalOpenIds.length, String(tasks.length));
record("COMPLETE-003 no local or unclassified open task remains", unclassifiedOpenTasks.length === 0, JSON.stringify(unclassifiedOpenTasks));
record("COMPLETE-004 expected external blockers remain visible", missingExpectedOpen.length === 0, JSON.stringify(missingExpectedOpen));
record("COMPLETE-005 external handoff mentions every open blocker", openTasks.every((task) => handoff.includes(task.id)), JSON.stringify(openTasks.map((task) => task.id)));
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
