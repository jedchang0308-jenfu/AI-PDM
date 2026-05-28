#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { evaluateDefectRegister } from "./defect-register-utils.mjs";
import { getRestoreDrillReportEvidence } from "./restore-drill-report-utils.mjs";
import { findLatestReport, readReport, validateReport } from "./sw-addin-report-utils.mjs";
import {
  findLatestReport as findLatestDocumentManagerReport,
  readReport as readDocumentManagerReport,
  validateReport as validateDocumentManagerReport
} from "./document-manager-report-utils.mjs";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const allowOpen = args.has("--allow-open");
const taskPath = resolveTaskFile();

function resolveTaskFile() {
  const candidates = [
    path.join(root, "dev_task.md"),
    path.join(root, "PDM_dev_task.md")
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function getSolidWorksReportEvidence() {
  const reportPath = findLatestReport(root);
  if (!reportPath) {
    return {
      ready: false,
      reportPath: null,
      issues: [{ type: "missing_report" }]
    };
  }

  const validation = validateReport(readReport(reportPath));
  return {
    ...validation,
    reportPath
  };
}

function getDocumentManagerReportEvidence() {
  const reportPath = findLatestDocumentManagerReport(root);
  if (!reportPath) {
    return {
      ready: false,
      reportPath: null,
      issues: [{ type: "missing_report" }]
    };
  }

  const validation = validateDocumentManagerReport(readDocumentManagerReport(reportPath));
  return {
    ...validation,
    reportPath
  };
}

function getFieldTestEvidence(solidWorksEvidence, restoreDrillEvidence, documentManagerEvidence) {
  return {
    ready: solidWorksEvidence.ready && restoreDrillEvidence.ready && documentManagerEvidence.ready,
    solidWorks: {
      ready: solidWorksEvidence.ready,
      reportPath: solidWorksEvidence.reportPath,
      issues: solidWorksEvidence.issues
    },
    restore: {
      ready: restoreDrillEvidence.ready,
      reportPath: restoreDrillEvidence.reportPath,
      issues: restoreDrillEvidence.issues
    },
    documentManager: {
      ready: documentManagerEvidence.ready,
      reportPath: documentManagerEvidence.reportPath,
      issues: documentManagerEvidence.issues
    }
  };
}

function classify(task) {
  if (/Document Manager|metadata extraction adapter|讀取元件|授權元件|等效讀取器|等效授權元件/i.test(task)) {
    return "external_document_manager";
  }
  if (/正式現場測試|field-test|現場測試/i.test(task)) {
    return "external_field_test";
  }
  if (/SolidWorks|Add-in|CAD/i.test(task) && /實機|註冊|編譯|測試|machine|registration|compile/i.test(task)) {
    return "external_solidworks_machine";
  }
  if (/還原|備份|restore|backup/i.test(task) && /獨立測試機|實測|演練|test machine|drill/i.test(task)) {
    return "external_restore_drill";
  }
  if (/P0\s*\/\s*P1|缺陷清零|defect/i.test(task)) {
    return "release_readiness_gate";
  }
  return "open_task";
}

function classifyReadinessTask(task) {
  if (/DEV-CAD-001|Document Manager|metadata extraction adapter|讀取元件|授權元件|等效讀取|custom[- ]property/i.test(task)) {
    return "external_document_manager";
  }
  if (/DEV-FIELD-001|field-test|現場測試|field validation/i.test(task)) {
    return "external_field_test";
  }
  if (/DEV-SW-001/i.test(task) || (/SolidWorks|Add-in|CAD/i.test(task) && /實機|註冊|COM|machine|registration|compile/i.test(task))) {
    return "external_solidworks_machine";
  }
  if (/DEV-BACKUP-001/i.test(task) || (/restore|backup|備份|還原/i.test(task) && /獨立測試機|test machine|drill/i.test(task))) {
    return "external_restore_drill";
  }
  if (/P0\s*\/\s*P1|defect/i.test(task)) {
    return "release_readiness_gate";
  }
  return "open_task";
}

function readinessStatusFromToken(token) {
  if (token === "x") return "done";
  if (token === "/") return "partial";
  if (token === "!") return "blocked";
  return "open";
}

function parseLegacyReadinessTask(line, index) {
  const match = line.match(/^- \[(x| |\/|!)\]\s+`(P[0-2])`\s+(.+)$/);
  if (!match) return null;

  const task = match[3].trim();
  return {
    line: index + 1,
    priority: match[2],
    status: readinessStatusFromToken(match[1]),
    task,
    category: classifyReadinessTask(task)
  };
}

function parseTableReadinessTask(line, index, priority) {
  if (!priority || !line.trim().startsWith("|")) return null;

  const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
  if (cells.length < 3) return null;

  const statusMatch = cells[0].match(/^\[(x| |\/|!)\]$/);
  if (!statusMatch) return null;

  const task = [
    cells[1] ?? "",
    cells[2] ?? "",
    cells[3] ?? "",
    cells[4] ?? ""
  ].filter(Boolean).join(" | ");

  return {
    line: index + 1,
    priority,
    status: readinessStatusFromToken(statusMatch[1]),
    task,
    category: classifyReadinessTask(task)
  };
}

function parseReadinessTasks(markdown) {
  const tasks = [];
  let currentPriority = null;

  markdown.split(/\r?\n/).forEach((line, index) => {
    const headingPriority = line.match(/^##\s+(P[0-2])\b/i)?.[1]?.toUpperCase();
    if (headingPriority) currentPriority = headingPriority;

    const legacyTask = parseLegacyReadinessTask(line, index);
    if (legacyTask) {
      tasks.push(legacyTask);
      return;
    }

    const tableTask = parseTableReadinessTask(line, index, currentPriority);
    if (tableTask) tasks.push(tableTask);
  });

  return tasks;
}

if (!fs.existsSync(taskPath)) {
  console.error(`Task file not found: ${path.relative(root, taskPath)}`);
  process.exit(1);
}

const tasks = parseReadinessTasks(fs.readFileSync(taskPath, "utf8"));
const solidWorksEvidence = getSolidWorksReportEvidence();
const restoreDrillEvidence = getRestoreDrillReportEvidence(root);
const documentManagerEvidence = getDocumentManagerReportEvidence();
const fieldTestEvidence = getFieldTestEvidence(solidWorksEvidence, restoreDrillEvidence, documentManagerEvidence);
const defectEvidence = evaluateDefectRegister(root);
const blockers = tasks
  .filter((task) => task.status !== "done" && ["P0", "P1"].includes(task.priority))
  .map((task) => {
    if (task.category === "external_solidworks_machine") return { ...task, evidence: solidWorksEvidence };
    if (task.category === "external_restore_drill") return { ...task, evidence: restoreDrillEvidence };
    if (task.category === "external_document_manager") return { ...task, evidence: documentManagerEvidence };
    if (task.category === "external_field_test") return { ...task, evidence: fieldTestEvidence };
    if (task.category === "release_readiness_gate") return { ...task, evidence: defectEvidence };
    return task;
  });

if (!defectEvidence.ready && !blockers.some((task) => task.category === "release_readiness_gate")) {
  blockers.push({
    line: null,
    priority: "P0",
    status: "open",
    task: "P0/P1 defect register is not clear",
    category: "release_readiness_gate",
    evidence: defectEvidence
  });
}

const byPriority = blockers.reduce((acc, blocker) => {
  acc[blocker.priority] = (acc[blocker.priority] ?? 0) + 1;
  return acc;
}, {});

const byCategory = blockers.reduce((acc, blocker) => {
  acc[blocker.category] = (acc[blocker.category] ?? 0) + 1;
  return acc;
}, {});

const report = {
  ready: blockers.length === 0,
  allowOpen,
  taskFile: path.relative(root, taskPath).replaceAll(path.sep, "/"),
  summary: {
    trackedTasks: tasks.length,
    blockers: blockers.length,
    byPriority,
    byCategory,
    solidWorksEvidenceReady: solidWorksEvidence.ready,
    restoreDrillEvidenceReady: restoreDrillEvidence.ready,
    documentManagerEvidenceReady: documentManagerEvidence.ready,
    fieldTestEvidenceReady: fieldTestEvidence.ready,
    policyConfirmationRequired: false,
    defectsZeroReady: defectEvidence.ready,
    activeP0P1Defects: defectEvidence.summary.activeP0P1
  },
  blockers
};

console.log(JSON.stringify(report, null, 2));

if (blockers.length > 0 && !allowOpen) {
  process.exitCode = 1;
}
