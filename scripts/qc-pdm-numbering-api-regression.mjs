#!/usr/bin/env node

import Database from "better-sqlite3";
import { assertNumberingQcRuntimeIsIsolated } from "./numbering-qc-runtime-guard.mjs";

const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3100";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const { dbPath } = assertNumberingQcRuntimeIsIsolated({ scriptName: "qc-pdm-numbering-api-regression" });
const unique = Date.now().toString().slice(-8);
const results = [];
const created = {
  rootCodes: [],
  importBatchIds: [],
  reportIds: []
};

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function openDb() {
  return new Database(dbPath);
}

function cleanup() {
  const db = openDb();
  try {
    const rootCodes = created.rootCodes.filter(Boolean);
    if (rootCodes.length > 0) {
      const placeholders = rootCodes.map(() => "?").join(",");
      const roots = db.prepare(`SELECT id FROM part_roots WHERE root_code IN (${placeholders})`).all(...rootCodes);
      const rootIds = roots.map((row) => row.id);
      if (rootIds.length > 0) {
        const rootPlaceholders = rootIds.map(() => "?").join(",");
        const partIds = db.prepare(`SELECT id FROM part_numbers WHERE part_root_id IN (${rootPlaceholders})`).all(...rootIds).map((row) => row.id);
        const drawingIds = db.prepare(`SELECT id FROM drawing_numbers WHERE part_root_id IN (${rootPlaceholders})`).all(...rootIds).map((row) => row.id);
        const entityIds = [...rootIds, ...partIds, ...drawingIds];
        if (entityIds.length > 0) {
          const entityPlaceholders = entityIds.map(() => "?").join(",");
          db.prepare(`DELETE FROM warning_events WHERE entity_id IN (${entityPlaceholders})`).run(...entityIds);
          db.prepare(`DELETE FROM numbering_task_items WHERE entity_id IN (${entityPlaceholders})`).run(...entityIds);
          db.prepare(`DELETE FROM numbering_notifications WHERE entity_id IN (${entityPlaceholders})`).run(...entityIds);
        }
        if (drawingIds.length > 0) {
          const drawingPlaceholders = drawingIds.map(() => "?").join(",");
          db.prepare(`DELETE FROM same_drawing_variants WHERE drawing_number_id IN (${drawingPlaceholders})`).run(...drawingIds);
          db.prepare(`DELETE FROM drawing_part_links WHERE drawing_number_id IN (${drawingPlaceholders})`).run(...drawingIds);
        }
        if (partIds.length > 0) {
          const partPlaceholders = partIds.map(() => "?").join(",");
          db.prepare(`DELETE FROM same_drawing_variants WHERE part_number_id IN (${partPlaceholders})`).run(...partIds);
          db.prepare(`DELETE FROM drawing_part_links WHERE part_number_id IN (${partPlaceholders})`).run(...partIds);
        }
        db.prepare(`DELETE FROM drawing_numbers WHERE part_root_id IN (${rootPlaceholders})`).run(...rootIds);
        db.prepare(`DELETE FROM part_numbers WHERE part_root_id IN (${rootPlaceholders})`).run(...rootIds);
        db.prepare(`DELETE FROM part_roots WHERE id IN (${rootPlaceholders})`).run(...rootIds);
      }
    }

    if (created.importBatchIds.length > 0) {
      const placeholders = created.importBatchIds.map(() => "?").join(",");
      db.prepare(`DELETE FROM import_staging_rows WHERE import_batch_id IN (${placeholders})`).run(...created.importBatchIds);
      db.prepare(`DELETE FROM import_batches WHERE id IN (${placeholders})`).run(...created.importBatchIds);
    }

    if (created.reportIds.length > 0) {
      const placeholders = created.reportIds.map(() => "?").join(",");
      db.prepare(`DELETE FROM monthly_audit_reports WHERE id IN (${placeholders})`).run(...created.reportIds);
    }
  } finally {
    db.close();
  }
}

function getAdminUserId() {
  const db = openDb();
  try {
    const row = db.prepare("SELECT id FROM users WHERE email = ?").get("admin@example.com");
    return row?.id ?? null;
  } finally {
    db.close();
  }
}

function nextPartIdentity(firstPartNumber) {
  const compact = firstPartNumber.match(/^([A-Z][0-9]{4}|\d{5})-P(\d{2})$/);
  if (compact) {
    const nextSequenceNo = Number(compact[2]) + 1;
    const sequenceCode = String(nextSequenceNo).padStart(2, "0");
    const ruleVersionId = /^[A-Z][0-9]{4}$/u.test(compact[1]) ? "numbering-rule-v3-alpha-root" : "numbering-rule-v2";
    return {
      partNumber: `${compact[1]}-P${sequenceCode}`,
      sequenceNo: nextSequenceNo,
      sequenceCode,
      ruleVersionId
    };
  }

  const legacy = firstPartNumber.match(/^(.*?)(\d{3})$/);
  if (legacy) {
    const nextSequenceNo = Number(legacy[2]) + 1;
    const sequenceCode = String(nextSequenceNo).padStart(3, "0");
    return {
      partNumber: `${legacy[1]}${sequenceCode}`,
      sequenceNo: nextSequenceNo,
      sequenceCode,
      ruleVersionId: "numbering-rule-v1"
    };
  }

  throw new Error(`UNSUPPORTED_PART_NUMBER_FORMAT: ${firstPartNumber}`);
}

function seedSecondPart(root, firstPartNumber, adminUserId) {
  const db = openDb();
  try {
    const now = new Date().toISOString();
    const { partNumber, sequenceNo, sequenceCode, ruleVersionId } = nextPartIdentity(firstPartNumber);
    const partId = `qc-api-part-${unique}-002`;
    db.prepare(
      `
      INSERT INTO part_numbers (
        id, part_root_id, part_number, sequence_no, sequence_code, part_name,
        item_kind, is_universal, development_phase, record_status, rule_version_id, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'manufactured', 0, 'EVT', 'Draft', ?, ?, ?, ?)
    `
    ).run(partId, root.id, partNumber, sequenceNo, sequenceCode, `QC API ${unique} variant part`, ruleVersionId, adminUserId, now, now);
    return { id: partId, partNumber };
  } finally {
    db.close();
  }
}

async function login(email) {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  record("Admin login succeeds", response.status === 200, `HTTP ${response.status}`);
  record("Admin login returns session cookie", Boolean(cookie), cookie ? "cookie received" : "missing cookie");
  return cookie;
}

async function request(method, urlPath, cookie, body, expectedStatus = 200) {
  const response = await fetch(`${apiBaseUrl}${urlPath}`, {
    method,
    headers: {
      "content-type": "application/json",
      cookie
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let data = {};
  if (text) {
    data = JSON.parse(text);
  }
  const expected = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  record(`${method} ${urlPath} returns ${expected.join("/")}`, expected.includes(response.status), `HTTP ${response.status}`);
  return data;
}

try {
  const adminUserId = getAdminUserId();
  record("Admin demo user exists", Boolean(adminUserId), String(adminUserId ?? "missing"));
  const adminCookie = await login("admin@example.com");

  const numbering = await request(
    "POST",
    "/api/numbering/records",
    adminCookie,
    {
      coreName: `QC API regression ${unique}`,
      partName: `QC API part ${unique}-001`,
      itemKind: "manufactured",
      developmentPhase: "DVT",
      drawingRequested: true,
      drawingPurposeCode: "M"
    },
    201
  );
  const rootCode = numbering.root?.rootCode;
  const firstPartNumber = numbering.partNumber?.partNumber;
  const drawingNumber = numbering.drawingNumber?.drawingNumber;
  created.rootCodes.push(rootCode);
  record("Numbering allocation returns root, part, and MA drawing", Boolean(rootCode && firstPartNumber && drawingNumber), JSON.stringify({ rootCode, firstPartNumber, drawingNumber }));
  record(
    "Numbering create API forces new records to EVT initial phase",
    numbering.root?.developmentPhase === "EVT" && numbering.partNumber?.developmentPhase === "EVT" && numbering.drawingNumber?.developmentPhase === "EVT",
    JSON.stringify({
      root: numbering.root?.developmentPhase,
      part: numbering.partNumber?.developmentPhase,
      drawing: numbering.drawingNumber?.developmentPhase
    })
  );

  const duplicate = await request(
    "POST",
    "/api/numbering/duplicate-check",
    adminCookie,
    { rootCode, partNumber: firstPartNumber, drawingNumber },
    200
  );
  record("Duplicate check blocks exact reused numbering", duplicate.blocked === true, JSON.stringify({ blocked: duplicate.blocked, matches: duplicate.matches?.length }));

  const secondPart = seedSecondPart(numbering.root, firstPartNumber, adminUserId);
  const variant = await request(
    "POST",
    "/api/numbering/variants",
    adminCookie,
    {
      drawingNumber,
      partNumber: secondPart.partNumber,
      variants: {
        material: `QC-${unique}`,
        finish: "api-regression"
      }
    },
    201
  );
  record("Same-drawing multi-part API links variant fields", variant.partNumber?.partNumber === secondPart.partNumber && Array.isArray(variant.variants) && variant.variants.length >= 2, JSON.stringify(variant));

  const search = await request("GET", `/api/numbering/search?query=${encodeURIComponent(rootCode)}&entityType=all&limit=20`, adminCookie);
  record("Search API returns allocated root", Array.isArray(search.results) && search.results.some((item) => item.rootCode === rootCode || item.displayCode === rootCode), JSON.stringify({ resultCount: search.results?.length ?? 0 }));

  const detailBeforeImpact = await request("GET", `/api/numbering/roots/${encodeURIComponent(rootCode)}`, adminCookie);
  record("Root detail API returns same-drawing variant data", detailBeforeImpact.partNumbers?.length >= 2 && detailBeforeImpact.variants?.length >= 2, JSON.stringify({ parts: detailBeforeImpact.partNumbers?.length, variants: detailBeforeImpact.variants?.length }));
  const auditTrail = Array.isArray(detailBeforeImpact.auditTrail) ? detailBeforeImpact.auditTrail : [];
  record(
    "Root detail audit trail exposes before/after/diff envelope",
    auditTrail.some((entry) => entry.action === "numbering.create" && "before" in entry && "after" in entry && "diff" in entry),
    JSON.stringify(auditTrail.map((entry) => entry.action).slice(0, 8))
  );

  const impact = await request(
    "POST",
    "/api/numbering/impact-analysis",
    adminCookie,
    { drawingNumber, reason: `QC API impact ${unique}`, applyInvalidation: true },
    200
  );
  record(
    "Manufacturing drawing invalidation API applies impact to linked parts",
    impact.applied === true && Array.isArray(impact.impactedPartNumbers) && impact.impactedPartNumbers.length >= 2,
    JSON.stringify({ applied: impact.applied, impacted: impact.impactedPartNumbers?.map((part) => part.partNumber) })
  );

  const importRootCode = `7${unique.slice(-4)}`;
  const importPartNumber = `${importRootCode}-P01`;
  const importDrawingNumber = `${importRootCode}-M01`;
  const importBatch = await request(
    "POST",
    "/api/numbering/import-batches",
    adminCookie,
    {
      sourceFilename: `qc-api-regression-${unique}.csv`,
      sourceHash: `sha256-qc-api-${unique}`,
      rows: [
        {
          rootCode: importRootCode,
          coreName: `QC API imported root ${unique}`,
          partNumber: importPartNumber,
          partName: `QC API imported part ${unique}`,
          itemKind: "manufactured",
          drawingNumber: importDrawingNumber,
          purposeCode: "M"
        }
      ]
    },
    201
  );
  created.importBatchIds.push(importBatch.id);
  created.rootCodes.push(importRootCode);
  record("Import staging API stores valid row", importBatch.status === "staged" && importBatch.rows?.[0]?.checkStatus === "valid", JSON.stringify(importBatch.summary));

  const confirmedImport = await request("POST", `/api/numbering/import-batches/${importBatch.id}/confirm`, adminCookie, {}, 200);
  record("Import confirm API promotes staged row", confirmedImport.status === "confirmed" && confirmedImport.summary?.createdRoots >= 1, JSON.stringify(confirmedImport.summary));

  const matrix = await request("GET", "/api/numbering/admin/matrix", adminCookie);
  record(
    "Admin matrix API returns roles, rules, templates, and hard rules",
    matrix.roles?.some((role) => role.roleCode === "rd_manager") &&
      matrix.approvalRules?.some((rule) => rule.actionCode === "dvt_promotion") &&
      matrix.ruleTemplates?.length >= 3 &&
      matrix.hardRules?.length > 0,
    JSON.stringify({ roles: matrix.roles?.length, rules: matrix.approvalRules?.length, templates: matrix.ruleTemplates?.length, hardRules: matrix.hardRules?.length })
  );

  const reportMonth = "2099-12";
  const report = await request("POST", "/api/numbering/monthly-audit-reports", adminCookie, { reportMonth }, 201);
  created.reportIds.push(report.id);
  record(
    "Monthly audit report API generates metadata",
    report.reportMonth === reportMonth && report.status === "completed" && Boolean(report.query?.counts),
    JSON.stringify({ reportMonth: report.reportMonth, counts: report.query?.counts })
  );

  const reportList = await request("GET", `/api/numbering/monthly-audit-reports?reportMonth=${reportMonth}&limit=5`, adminCookie);
  record("Monthly audit report list API returns generated report", reportList.reports?.some((item) => item.id === report.id), JSON.stringify({ reportCount: reportList.reports?.length ?? 0 }));
} finally {
  cleanup();
}

const failed = results.filter((result) => !result.passed);
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      apiBaseUrl,
      results
    },
    null,
    2
  )
);

if (failed.length > 0) {
  process.exit(1);
}
