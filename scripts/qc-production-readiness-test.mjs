#!/usr/bin/env node

import path from "node:path";
import fs from "node:fs";
import { evaluateDefectRegister } from "./defect-register-utils.mjs";
import { getQualityDir } from "./pdm-paths.mjs";
import { projectFileExists, readProjectFile } from "./qc-project-file-utils.mjs";
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
const taskRelativePath = resolveTaskFile();

function resolveTaskFile() {
  const candidates = [
    ".ai-doc/dev_task.md",
    "dev_task.md",
    "PDM_dev_task.md"
  ];
  return candidates.find((candidate) => projectFileExists(root, candidate)) ?? candidates[0];
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

function getFieldTestEvidence() {
  return {
    ready: false,
    requiredScope: "First-version formal numbering / draft pilot",
    issues: [
      { type: "missing_first_version_field_test_evidence" },
      { type: "missing_signed_go_no_go" },
      { type: "missing_field_issue_closure" }
    ]
  };
}

function getSupabaseShadowEvidence() {
  const reportDir = path.join(getQualityDir(root), "postgres-shadow");
  const reports = fs.existsSync(reportDir)
    ? fs
        .readdirSync(reportDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && /^shadow-compare-\d+\.json$/u.test(entry.name))
        .map((entry) => path.join(reportDir, entry.name))
        .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
    : [];
  const reportPath = reports[0] ?? "";

  if (!reportPath) {
    const evidenceDocs = [
      ".ai-doc/reports/industrialization/postgres-shadow-migration-plan-2026-05-28.md",
      ".ai-doc/reports/industrialization/supabase-live-probe-2026-05-28.md",
      ".ai-doc/reports/industrialization/supabase-shadow-target-guard-verification-2026-05-28.md",
      ".ai-doc/reports/industrialization/external-validation-handoff-2026-05-28.md"
    ].map((docPath) => ({
      path: docPath,
      exists: projectFileExists(root, docPath)
    }));

    return {
      ready: false,
      reportPath: null,
      requiredTarget: "Disposable AI_PDM Supabase/Postgres shadow target",
      issues: [{ type: "missing_postgres_shadow_report" }],
      evidenceDocs
    };
  }

  try {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    const issues = [];
    if (report.postgresShadowConfigured !== true) issues.push({ type: "postgres_shadow_not_configured" });
    if (report.postgresTargetGuard?.safe !== true) issues.push({ type: "postgres_target_guard_not_safe" });
    if (report.postgresCompareError) issues.push({ type: "postgres_compare_error", message: report.postgresCompareError });
    if ((report.missingInPostgres ?? []).length > 0) issues.push({ type: "missing_in_postgres", tables: report.missingInPostgres });
    if ((report.rlsMissingTables ?? []).length > 0) issues.push({ type: "rls_missing_tables", tables: report.rlsMissingTables });
    if ((report.mismatches ?? []).length > 0) issues.push({ type: "postgres_sqlite_mismatches", mismatches: report.mismatches });
    if (report.comparePolicy === "schema_rls_only") {
      if (report.dataCompareSkipped !== true) issues.push({ type: "schema_rls_only_without_skip_flag" });
    } else if (!Array.isArray(report.postgresStats) || report.postgresStats.length === 0) {
      issues.push({ type: "postgres_stats_missing" });
    }

    return {
      ready: issues.length === 0,
      reportPath: path.relative(root, reportPath).replaceAll(path.sep, "/"),
      comparePolicy: report.comparePolicy,
      targetMode: report.postgresTargetGuard?.mode ?? null,
      issues
    };
  } catch (error) {
    return {
      ready: false,
      reportPath: path.relative(root, reportPath).replaceAll(path.sep, "/"),
      issues: [{ type: "invalid_postgres_shadow_report", message: error instanceof Error ? error.message : String(error) }]
    };
  }
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
  if (/DEV-IND-007|Supabase|Postgres\/Supabase shadow|Postgres shadow/i.test(task)) {
    return "external_supabase_shadow";
  }
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

function classifyIndustrializationTask(task) {
  if (/DEV-IND-007|Supabase|Postgres\/Supabase shadow|Postgres shadow/i.test(task)) {
    return "external_supabase_shadow";
  }
  return "industrialization_gate";
}

function readinessStatusFromToken(token) {
  if (token === "x") return "done";
  if (token === "/") return "partial";
  if (token === "!") return "blocked";
  return "open";
}

function stripInlineCode(value) {
  return value.replace(/^`|`$/g, "");
}

function externalBlockerPriority(id) {
  if (id === "DEV-FIELD-001") return "P1";
  if (id === "DEV-IND-007") return "P0";
  return null;
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

function parseIndustrializationOverviewTask(line, index) {
  const match = line.match(/^- \[(x| |\/|!)\]\s+(DEV-IND-\d+):\s+(.+)$/);
  if (!match) return null;

  const task = `${match[2]} | ${match[3].trim()}`;
  return {
    line: index + 1,
    priority: "P0",
    status: readinessStatusFromToken(match[1]),
    task,
    category: classifyIndustrializationTask(task)
  };
}

function parseParkedExternalBlockerTask(line, index) {
  if (!line.trim().startsWith("|")) return null;

  const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
  if (cells.length < 4) return null;

  const statusMatch = cells[0].match(/^\[(x| |\/|!)\]$/);
  if (!statusMatch) return null;

  const id = stripInlineCode(cells[1] ?? "");
  const priority = externalBlockerPriority(id);
  if (!priority) return null;

  const task = [id, cells[2] ?? "", cells[3] ?? ""].filter(Boolean).join(" | ");
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
  let inIndustrializationBacklog = false;
  let inIndustrializationOverview = false;
  let inParkedExternalBlockers = false;
  const parkedExternalHeadingPattern = /^##\s+3\.\s+(?:Parked Scope And External Blockers|External Blockers\s*\/\s*Parked Scope)\b/i;

  markdown.split(/\r?\n/).forEach((line, index) => {
    if (parkedExternalHeadingPattern.test(line)) {
      inParkedExternalBlockers = true;
      currentPriority = null;
      return;
    }

    if (inParkedExternalBlockers && /^##\s+/i.test(line) && !parkedExternalHeadingPattern.test(line)) {
      inParkedExternalBlockers = false;
    }

    if (inParkedExternalBlockers) {
      const parkedTask = parseParkedExternalBlockerTask(line, index);
      if (parkedTask) tasks.push(parkedTask);
      return;
    }

    if (/^#\s+Industrialization Optimization Backlog\b/i.test(line)) {
      inIndustrializationBacklog = true;
      inIndustrializationOverview = false;
      currentPriority = null;
      return;
    }

    if (inIndustrializationBacklog && /^##\s+Task Overview\b/i.test(line)) {
      inIndustrializationOverview = true;
      return;
    }

    if (inIndustrializationOverview && /^##\s+(?!Task Overview\b)/i.test(line)) {
      inIndustrializationOverview = false;
    }

    if (inIndustrializationOverview) {
      const industrializationTask = parseIndustrializationOverviewTask(line, index);
      if (industrializationTask) tasks.push(industrializationTask);
      return;
    }

    const headingPriority = line.match(/^#{2,4}\s+(P[0-2])\b/i)?.[1]?.toUpperCase();
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

if (!projectFileExists(root, taskRelativePath)) {
  console.error(`Task file not found: ${taskRelativePath}`);
  process.exit(1);
}

const tasks = parseReadinessTasks(readProjectFile(root, taskRelativePath));
const solidWorksEvidence = getSolidWorksReportEvidence();
const restoreDrillEvidence = getRestoreDrillReportEvidence(root);
const documentManagerEvidence = getDocumentManagerReportEvidence();
const fieldTestEvidence = getFieldTestEvidence();
const supabaseShadowEvidence = getSupabaseShadowEvidence();
const defectEvidence = evaluateDefectRegister(root);
const blockers = tasks
  .filter((task) => task.status !== "done" && ["P0", "P1"].includes(task.priority))
  .map((task) => {
    if (task.category === "external_solidworks_machine") return { ...task, evidence: solidWorksEvidence };
    if (task.category === "external_restore_drill") return { ...task, evidence: restoreDrillEvidence };
    if (task.category === "external_document_manager") return { ...task, evidence: documentManagerEvidence };
    if (task.category === "external_field_test") return { ...task, evidence: fieldTestEvidence };
    if (task.category === "external_supabase_shadow") return { ...task, evidence: supabaseShadowEvidence };
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
  taskFile: taskRelativePath.replaceAll(path.sep, "/"),
  summary: {
    trackedTasks: tasks.length,
    blockers: blockers.length,
    byPriority,
    byCategory,
    solidWorksEvidenceReady: solidWorksEvidence.ready,
    restoreDrillEvidenceReady: restoreDrillEvidence.ready,
    documentManagerEvidenceReady: documentManagerEvidence.ready,
    fieldTestEvidenceReady: fieldTestEvidence.ready,
    supabaseShadowEvidenceReady: supabaseShadowEvidence.ready,
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
