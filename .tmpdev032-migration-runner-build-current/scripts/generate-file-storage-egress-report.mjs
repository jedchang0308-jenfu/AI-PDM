#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { getDataDir } from "./pdm-paths.mjs";

const DEFAULT_TOP_LIMIT = 20;

function bytesToGb(bytes) {
  return bytes / 1024 / 1024 / 1024;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePositiveNumber(value, fallback) {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function safeRelative(root, targetPath) {
  if (!root || !targetPath) return null;
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(targetPath);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) return relative.split(path.sep).join("/");
  return `[external]/${path.basename(targetPath)}`;
}

function tableExists(db, tableName) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
  return Boolean(row);
}

function readStorageAccessAuditRows(dbPath) {
  if (!existsSync(dbPath)) {
    return {
      exists: false,
      rows: []
    };
  }

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    if (!tableExists(db, "audit_logs")) {
      return {
        exists: true,
        rows: []
      };
    }

    const rows = db
      .prepare(
        `SELECT id, submission_id, actor_id, action, detail_json, created_at
         FROM audit_logs
         WHERE action = 'StorageAccessed'
         ORDER BY created_at ASC, id ASC`
      )
      .all();

    return {
      exists: true,
      rows
    };
  } finally {
    db.close();
  }
}

function parseDetailJson(value) {
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeBytes(value) {
  const bytes = Number(value ?? 0);
  return Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
}

function normalizeText(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function createEmptySummary() {
  return {
    count: 0,
    bytes: 0,
    gb: 0
  };
}

function addToSummary(summary, bytes) {
  summary.count += 1;
  summary.bytes += bytes;
  summary.gb = Number(bytesToGb(summary.bytes).toFixed(6));
}

function addSummary(map, key, bytes) {
  const normalizedKey = normalizeText(key, "unknown");
  map[normalizedKey] ??= createEmptySummary();
  addToSummary(map[normalizedKey], bytes);
}

function normalizeStorageAccessRows(rows) {
  const normalized = [];
  const malformedRows = [];
  const ignoredRows = [];
  const excludedQcRuntimeRows = [];
  const legacyUnclassifiedRows = [];

  for (const row of rows) {
    const detail = parseDetailJson(row.detail_json);
    if (detail.storageAccess !== true) {
      ignoredRows.push({ id: row.id, reason: "storage_access_flag_missing" });
      continue;
    }

    const bytes = normalizeBytes(detail.bytes);
    const accessKind = normalizeText(detail.accessKind, "unknown");
    const provider = normalizeText(detail.provider, "unknown");
    const route = normalizeText(detail.route, "unknown");
    const storageKey = normalizeText(detail.storageKey, "unknown");
    if (!bytes || accessKind === "unknown" || route === "unknown" || storageKey === "unknown") {
      malformedRows.push({
        id: row.id,
        reason: "missing_required_storage_access_fields"
      });
    }

    const hasStorageAccessSource = Object.hasOwn(detail, "storageAccessSource");
    const storageAccessSource = normalizeText(detail.storageAccessSource, "runtime");
    normalized.push({
      id: row.id,
      submissionId: row.submission_id ?? null,
      actorId: row.actor_id ?? null,
      createdAt: row.created_at,
      accessKind,
      fileId: detail.fileId ?? null,
      shareId: detail.shareId ?? null,
      externalAccess: detail.externalAccess === true,
      filename: normalizeText(detail.filename, "unknown"),
      bytes,
      disposition: normalizeText(detail.disposition, "unknown"),
      provider,
      bucket: detail.bucket ?? null,
      storageKey,
      accessMode: normalizeText(detail.accessMode, "unknown"),
      storageAccessSource,
      qcRunId: detail.qcRunId ?? null,
      signedUrlExpiresAt: detail.signedUrlExpiresAt ?? null,
      signedUrlExpiresInSeconds: detail.signedUrlExpiresInSeconds ?? null,
      authorizationHeaderRequired: detail.authorizationHeaderRequired === true,
      auditRequired: detail.auditRequired === true,
      route
    });

    if (detail.storageAccessSource === "qc_api") {
      excludedQcRuntimeRows.push({ id: row.id, reason: "qc_api_runtime_evidence", qcRunId: detail.qcRunId ?? null });
    } else if (!hasStorageAccessSource) {
      legacyUnclassifiedRows.push({ id: row.id, reason: "missing_storage_access_source" });
    }
  }

  return {
    records: normalized,
    malformedRows,
    ignoredRows,
    excludedQcRuntimeRows,
    legacyUnclassifiedRows
  };
}

function buildTopObjects(records, limit) {
  const map = new Map();
  for (const record of records) {
    const key = [record.provider, record.bucket ?? "", record.storageKey, record.filename].join("\u001f");
    const existing =
      map.get(key) ??
      {
        provider: record.provider,
        bucket: record.bucket,
        storageKey: record.storageKey,
        filename: record.filename,
        accessKinds: new Set(),
        routes: new Set(),
        shareIds: new Set(),
        count: 0,
        bytes: 0,
        gb: 0
      };
    existing.count += 1;
    existing.bytes += record.bytes;
    existing.gb = Number(bytesToGb(existing.bytes).toFixed(6));
    existing.accessKinds.add(record.accessKind);
    existing.routes.add(record.route);
    if (record.shareId) existing.shareIds.add(record.shareId);
    map.set(key, existing);
  }

  return Array.from(map.values())
    .map((object) => ({
      ...object,
      accessKinds: Array.from(object.accessKinds).sort(),
      routes: Array.from(object.routes).sort(),
      shareIds: Array.from(object.shareIds).sort()
    }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, limit);
}

function summarizeEgress(records, limit) {
  const total = createEmptySummary();
  const byAccessKind = {};
  const byRoute = {};
  const byProvider = {};
  const byAccessMode = {};
  const byShareId = {};
  const byExternalAccess = {};

  for (const record of records) {
    addToSummary(total, record.bytes);
    addSummary(byAccessKind, record.accessKind, record.bytes);
    addSummary(byRoute, record.route, record.bytes);
    addSummary(byProvider, record.provider, record.bytes);
    addSummary(byAccessMode, record.accessMode, record.bytes);
    addSummary(byExternalAccess, record.externalAccess ? "external" : "authenticated", record.bytes);
    if (record.shareId) addSummary(byShareId, record.shareId, record.bytes);
  }

  return {
    total,
    byAccessKind,
    byRoute,
    byProvider,
    byAccessMode,
    byExternalAccess,
    byShareId,
    topObjects: buildTopObjects(records, limit)
  };
}

function buildRecommendations(summary, thresholds, malformedRows, excludedQcRuntimeRows, legacyUnclassifiedRows) {
  const recommendations = [];
  const totalGb = summary.total.gb;
  const publicShareBytes = summary.byAccessKind.public_share_package?.bytes ?? 0;
  const publicSharePct = summary.total.bytes > 0 ? publicShareBytes / summary.total.bytes : 0;

  if (summary.total.count === 0) {
    recommendations.push("No StorageAccessed audit rows found. Keep egress governance in observation mode until real downloads exist.");
  }
  if (thresholds.warningGb > 0 && totalGb >= thresholds.warningGb) {
    recommendations.push("Egress audit volume is above the warning threshold; review preview-first, CDN/cache, and large-file download controls.");
  }
  if (thresholds.includedGb > 0 && totalGb >= thresholds.includedGb * 0.7) {
    recommendations.push("Egress audit volume is above 70% of included quota; prepare provider and lifecycle cost controls.");
  }
  if (publicSharePct >= 0.2) {
    recommendations.push("Public share package downloads represent at least 20% of audited egress; review share expiry, supplier caching, and package size.");
  }
  if (summary.topObjects.some((object) => object.bytes >= 5 * 1024 * 1024 * 1024)) {
    recommendations.push("At least one object has 5 GB or more audited egress; require large-file workflow and explicit owner review.");
  }
  if (malformedRows.length > 0) {
    recommendations.push("Some StorageAccessed audit rows are missing required fields; inspect route instrumentation before relying on totals.");
  }
  if (excludedQcRuntimeRows.length > 0) {
    recommendations.push("QC runtime StorageAccessed rows were excluded from governance totals; keep regression evidence separate from monthly cost decisions.");
  }
  if (legacyUnclassifiedRows.length > 0) {
    recommendations.push("Some StorageAccessed rows predate audit provenance; review legacy/unclassified rows before using this evidence for monthly cost decisions.");
  }
  if (!recommendations.length) {
    recommendations.push("Continue collecting StorageAccessed audit rows; no egress threshold action is required yet.");
  }
  return recommendations;
}

export function buildStorageEgressReport(options = {}) {
  const root = options.root ?? process.cwd();
  const env = options.env ?? process.env;
  const limit = options.limit ?? parsePositiveInt(env.PDM_STORAGE_REPORT_TOP_LIMIT, DEFAULT_TOP_LIMIT);
  const dataDir = getDataDir(root, env);
  const dbPath = path.join(dataDir, "ai-pdm.sqlite");
  const egressIncludedGb = parsePositiveNumber(env.PDM_EGRESS_INCLUDED_GB, 250);
  const egressWarningGb = parsePositiveNumber(env.PDM_EGRESS_WARNING_GB, 150);
  const includeQcRuntimeAccess = env.PDM_STORAGE_EGRESS_INCLUDE_QC_RUNTIME === "1";
  const auditRows = readStorageAccessAuditRows(dbPath);
  const normalized = normalizeStorageAccessRows(auditRows.rows);
  const governanceRecords = includeQcRuntimeAccess
    ? normalized.records
    : normalized.records.filter((record) => record.storageAccessSource !== "qc_api");
  const summary = summarizeEgress(governanceRecords, limit);

  return {
    reportType: "file-storage-egress-audit",
    generatedAt: new Date().toISOString(),
    root: safeRelative(root, root),
    inputs: {
      dbPath: safeRelative(root, dbPath),
      dbExists: auditRows.exists,
      auditAction: "StorageAccessed"
    },
    assumptions: {
      pricingReferenceDate: "2026-06-10",
      egressIncludedGb,
      egressWarningGb,
      pricingMustBeRecheckedBeforePurchase: true,
      noProviderMigrationExecuted: true,
      noFilesRead: true,
      noProviderRequests: true,
      rawShareTokensAreNotReported: true,
      signedUrlsAreNotReported: true,
      qcRuntimeRowsExcludedFromGovernanceTotals: !includeQcRuntimeAccess
    },
    auditRows: {
      read: auditRows.rows.length,
      normalized: governanceRecords.length,
      normalizedIncludingExcluded: normalized.records.length,
      malformed: normalized.malformedRows.length,
      ignored: normalized.ignoredRows.length,
      excludedQcRuntime: includeQcRuntimeAccess ? 0 : normalized.excludedQcRuntimeRows.length,
      legacyUnclassified: normalized.legacyUnclassifiedRows.length,
      malformedRows: normalized.malformedRows.slice(0, limit),
      ignoredRows: normalized.ignoredRows.slice(0, limit),
      excludedQcRuntimeRows: includeQcRuntimeAccess ? [] : normalized.excludedQcRuntimeRows.slice(0, limit),
      legacyUnclassifiedRows: normalized.legacyUnclassifiedRows.slice(0, limit)
    },
    egress: summary,
    thresholdUsage: {
      egressWarningPct: egressWarningGb > 0 ? Number(((summary.total.gb / egressWarningGb) * 100).toFixed(3)) : null,
      egressIncludedPct: egressIncludedGb > 0 ? Number(((summary.total.gb / egressIncludedGb) * 100).toFixed(3)) : null
    },
    recommendations: buildRecommendations(
      summary,
      { includedGb: egressIncludedGb, warningGb: egressWarningGb },
      normalized.malformedRows,
      includeQcRuntimeAccess ? [] : normalized.excludedQcRuntimeRows,
      normalized.legacyUnclassifiedRows
    )
  };
}

async function main() {
  const report = buildStorageEgressReport();
  const outIndex = process.argv.indexOf("--out");
  if (outIndex >= 0) {
    const outPath = process.argv[outIndex + 1];
    if (!outPath) throw new Error("--out requires a path");
    await mkdir(path.dirname(path.resolve(outPath)), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
