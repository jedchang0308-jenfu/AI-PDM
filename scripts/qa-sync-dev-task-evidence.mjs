#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { findLatestReport as findLatestSwAddinReport, readReport as readSwAddinReport, validateReport as validateSwAddinReport } from "./sw-addin-report-utils.mjs";
import { getRestoreDrillReportEvidence } from "./restore-drill-report-utils.mjs";
import {
  findLatestReport as findLatestDocumentManagerReport,
  readReport as readDocumentManagerReport,
  validateReport as validateDocumentManagerReport
} from "./document-manager-report-utils.mjs";
import { getQualityDir } from "./pdm-paths.mjs";

const root = process.cwd();

function getDefaultTaskFile() {
  const preferredTaskFile = path.join(root, ".ai-doc", "dev_task.md");
  if (fs.existsSync(preferredTaskFile)) return preferredTaskFile;
  const legacyTaskFile = path.join(root, "dev_task.md");
  if (fs.existsSync(legacyTaskFile)) return legacyTaskFile;
  return path.join(root, "PDM_dev_task.md");
}

const targets = [
  {
    key: "solidworks_real_machine",
    evidenceKey: "solidWorksReady",
    matcher: (line) => line.includes("DEV-SW-001") || line.includes("SolidWorks Add-in 實機驗證"),
    blocker: "SolidWorks Add-in real-machine evidence is not ready."
  },
  {
    key: "restore_drill",
    evidenceKey: "restoreReady",
    matcher: (line) => line.includes("DEV-BACKUP-001") || line.includes("離線單向備份與還原"),
    blocker: "Restore drill evidence is not ready."
  },
  {
    key: "document_manager_component",
    evidenceKey: "documentManagerReady",
    matcher: (line) => line.includes("DEV-CAD-001") ||
      line.includes("SolidWorks Document Manager API 或等效授權元件") ||
      line.includes("SolidWorks Document Manager 或等效讀取元件"),
    blocker: "Document Manager or equivalent component evidence is not ready."
  },
  {
    key: "formal_field_test",
    evidenceKey: "fieldTestReady",
    matcher: (line) =>
      !/Cancelled by Human Decision|取消/u.test(line) &&
      (line.includes("DEV-FIELD-001") || line.includes("正式現場測試")),
    blocker: "Formal field-test evidence is not ready.",
    required: false
  },
  {
    key: "supabase_shadow",
    evidenceKey: "supabaseShadowReady",
    matcher: (line) => line.includes("DEV-034") ||
      line.includes("SQLite 到 PostgreSQL 影子遷移") ||
      /^\|\s*\[(x| |\/|!)\]\s*\|\s*DEV-IND-007\s*\|/u.test(line) ||
      line.includes("取得 disposable Supabase / Postgres shadow target") ||
      line.includes("在 disposable target 執行 schema migration") ||
      line.includes("在 disposable target 執行 SQLite/Postgres compare") ||
      line.includes("live RLS plan") ||
      line.includes("disposable target live compare") ||
      line.includes("`npm.cmd run qc:postgres-shadow` 在 disposable target") ||
      line.includes("production readiness 報告不再因 shadow target"),
    blocker: "Disposable Supabase/Postgres shadow migration evidence is not ready."
  },
  {
    key: "document_manager_integration",
    evidenceKey: "documentManagerReady",
    matcher: (line) => line.includes("整合 SolidWorks Document Manager API"),
    blocker: "Document Manager or equivalent component evidence is not ready.",
    required: false
  },
  {
    key: "document_manager_license",
    evidenceKey: "documentManagerReady",
    matcher: (line) => line.includes("確認 SolidWorks Document Manager 授權"),
    blocker: "Document Manager or equivalent component evidence is not ready.",
    required: false
  }
];

function parseArgs(argv) {
  const options = {
    taskFile: getDefaultTaskFile(),
    output: "",
    evidenceFixture: "",
    apply: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--task-file") {
      options.taskFile = path.resolve(root, argv[++index] ?? "");
    } else if (arg === "--output") {
      options.output = path.resolve(root, argv[++index] ?? "");
    } else if (arg === "--evidence-fixture") {
      options.evidenceFixture = path.resolve(root, argv[++index] ?? "");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function getSolidWorksEvidence() {
  const reportPath = findLatestSwAddinReport(root);
  if (!reportPath) {
    return { ready: false, reportPath: null, issues: [{ type: "missing_report" }] };
  }

  return {
    ...validateSwAddinReport(readSwAddinReport(reportPath)),
    reportPath
  };
}

function getDocumentManagerEvidence() {
  const reportPath = findLatestDocumentManagerReport(root);
  if (!reportPath) {
    return { ready: false, reportPath: null, issues: [{ type: "missing_report" }] };
  }

  return {
    ...validateDocumentManagerReport(readDocumentManagerReport(reportPath)),
    reportPath
  };
}

function findLatestPostgresShadowReport() {
  const reportDir = path.join(getQualityDir(root), "postgres-shadow");
  if (!fs.existsSync(reportDir)) return null;
  const reports = fs
    .readdirSync(reportDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^shadow-compare-\d+\.json$/u.test(entry.name))
    .map((entry) => path.join(reportDir, entry.name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  return reports[0] ?? null;
}

function getSupabaseShadowEvidence() {
  const reportPath = findLatestPostgresShadowReport();
  if (!reportPath) {
    return {
      ready: false,
      reportPath: null,
      issues: [{ type: "missing_postgres_shadow_report" }]
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
      reportPath,
      issues
    };
  } catch (error) {
    return {
      ready: false,
      reportPath,
      issues: [{ type: "invalid_postgres_shadow_report", message: error instanceof Error ? error.message : String(error) }]
    };
  }
}

function loadEvidence(options) {
  if (options.evidenceFixture) {
    const fixture = JSON.parse(fs.readFileSync(options.evidenceFixture, "utf8"));
    const solidWorksReady = fixture.solidWorksReady === true;
    const restoreReady = fixture.restoreReady === true;
    const documentManagerReady = fixture.documentManagerReady === true;
    const supabaseShadowReady = fixture.supabaseShadowReady === true;
    const fieldTestReady = fixture.fieldTestReady ?? (solidWorksReady && restoreReady && documentManagerReady);
    return {
      source: path.relative(root, options.evidenceFixture),
      solidWorksReady,
      restoreReady,
      documentManagerReady,
      supabaseShadowReady,
      fieldTestReady: fieldTestReady === true
    };
  }

  const solidWorks = getSolidWorksEvidence();
  const restore = getRestoreDrillReportEvidence(root);
  const documentManager = getDocumentManagerEvidence();
  const supabaseShadow = getSupabaseShadowEvidence();
  return {
    source: "latest evidence reports",
    solidWorksReady: solidWorks.ready === true,
    restoreReady: restore.ready === true,
    documentManagerReady: documentManager.ready === true,
    supabaseShadowReady: supabaseShadow.ready === true,
    fieldTestReady: solidWorks.ready === true && restore.ready === true && documentManager.ready === true,
    reports: {
      solidWorks: solidWorks.reportPath ? path.relative(root, solidWorks.reportPath) : null,
      restore: restore.reportPath ? path.relative(root, restore.reportPath) : null,
      documentManager: documentManager.reportPath ? path.relative(root, documentManager.reportPath) : null,
      supabaseShadow: supabaseShadow.reportPath ? path.relative(root, supabaseShadow.reportPath) : null
    },
    issues: {
      supabaseShadow: supabaseShadow.issues
    }
  };
}

function findTarget(line) {
  return targets.find((target) => target.matcher(line)) ?? null;
}

function parseActionableLine(line) {
  const listMatch = line.match(/^(\s*-\s+\[)(x| |\/|!)(\]\s+.+)$/u);
  if (listMatch) {
    return {
      statusToken: listMatch[2],
      update: (nextStatus) => `${listMatch[1]}${nextStatus}${listMatch[3]}`
    };
  }

  const tableMatch = line.match(/^(\|\s*)\[(x| |\/|!)\](\s*\|\s*DEV-[A-Z]+-\d+\s*\|.+)$/u);
  if (tableMatch) {
    return {
      statusToken: tableMatch[2],
      update: (nextStatus) => `${tableMatch[1]}[${nextStatus}]${tableMatch[3]}`
    };
  }

  return null;
}

function parseCanonicalEntries(markdown) {
  const lines = markdown.split(/\r?\n/u);
  const starts = [];
  lines.forEach((line, index) => {
    const match = line.match(/^-\s*([✓○☐◐◇!↷×])\s+(DEV-\d{3})\b/u);
    if (match) starts.push({ index, symbol: match[1], id: match[2] });
  });

  return starts.map((entry, index) => {
    let end = starts[index + 1]?.index ?? lines.length;
    for (let cursor = entry.index + 1; cursor < end; cursor += 1) {
      if (/^##\s+/u.test(lines[cursor])) {
        end = cursor;
        break;
      }
    }
    return {
      ...entry,
      line: entry.index + 1,
      lines: lines.slice(entry.index, end)
    };
  });
}

function syncMarkdown(markdown, evidence) {
  const changes = [];
  const blocked = [];
  const unsafeCompleted = [];
  const canonicalReady = [];
  const canonicalSkipped = [];
  const seenKeys = new Set();

  const lines = markdown.split(/\r?\n/);
  const updatedLines = lines.map((line, index) => {
    const target = findTarget(line);
    if (!target) return line;
    const actionableLine = parseActionableLine(line);
    if (!actionableLine) return line;

    seenKeys.add(target.key);
    const statusToken = actionableLine.statusToken;
    const ready = evidence[target.evidenceKey] === true;
    if (statusToken === "x") {
      if (!ready) {
        unsafeCompleted.push({
          line: index + 1,
          key: target.key,
          reason: target.blocker
        });
      }
      return line;
    }

    if (!ready) {
      blocked.push({
        line: index + 1,
        key: target.key,
        reason: target.blocker
      });
      return line;
    }

    const nextLine = actionableLine.update("x");
    changes.push({
      line: index + 1,
      key: target.key,
      from: `[${statusToken}]`,
      to: "[x]"
    });
    return nextLine;
  });

  const canonicalEntries = parseCanonicalEntries(markdown);
  for (const target of targets) {
    if (seenKeys.has(target.key)) continue;
    const entry = canonicalEntries.find((candidate) => candidate.lines.some((line) => target.matcher(line)));
    if (!entry) continue;
    seenKeys.add(target.key);

    if (entry.symbol === "×") {
      canonicalSkipped.push({ line: entry.line, key: target.key, devId: entry.id, reason: "Canonical DEV is skipped/cancelled." });
      continue;
    }

    const ready = evidence[target.evidenceKey] === true;
    if (entry.symbol === "✓" && !ready) {
      unsafeCompleted.push({ line: entry.line, key: target.key, devId: entry.id, reason: target.blocker });
    } else if (!ready) {
      blocked.push({ line: entry.line, key: target.key, devId: entry.id, reason: target.blocker });
    } else {
      canonicalReady.push({
        line: entry.line,
        key: target.key,
        devId: entry.id,
        note: "Evidence is ready; canonical status changes require a PM update."
      });
    }
  }

  for (const target of targets) {
    if (target.required !== false && !seenKeys.has(target.key)) {
      blocked.push({
        line: null,
        key: target.key,
        reason: "Target task line was not found."
      });
    }
  }

  return {
    markdown: updatedLines.join("\n"),
    changes,
    blocked,
    unsafeCompleted,
    canonicalReady,
    canonicalSkipped
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(options.taskFile)) {
    throw new Error(`Task file not found: ${path.relative(root, options.taskFile)}`);
  }

  const original = fs.readFileSync(options.taskFile, "utf8");
  const evidence = loadEvidence(options);
  const result = syncMarkdown(original, evidence);
  const writePath = options.output || options.taskFile;
  const shouldWrite = options.apply && result.changes.length > 0;

  if (shouldWrite) {
    fs.mkdirSync(path.dirname(writePath), { recursive: true });
    fs.writeFileSync(writePath, result.markdown, "utf8");
  }

  const report = {
    readyToApply: result.changes.length > 0 && result.blocked.length === 0 && result.unsafeCompleted.length === 0,
    applied: shouldWrite,
    taskFile: path.relative(root, options.taskFile),
    output: shouldWrite ? path.relative(root, writePath) : "",
    evidence,
    changes: result.changes,
    blocked: result.blocked,
    unsafeCompleted: result.unsafeCompleted,
    canonicalReady: result.canonicalReady,
    canonicalSkipped: result.canonicalSkipped
  };

  console.log(JSON.stringify(report, null, 2));

  if (result.unsafeCompleted.length > 0) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
