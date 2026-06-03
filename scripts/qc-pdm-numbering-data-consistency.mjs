#!/usr/bin/env node

import Database from "better-sqlite3";
import path from "node:path";

const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3100";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const dbPath = path.join(process.cwd(), "data", "ai-pdm.sqlite");
const unique = Date.now().toString().slice(-8);
const results = [];
const created = {
  rootCodes: [],
  approvalRequestIds: []
};

function record(name, passed, detail = "") {
  const ok = Boolean(passed);
  results.push({ name, passed: ok, detail });
  if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function openDb() {
  return new Database(dbPath);
}

function cleanup() {
  const db = openDb();
  try {
    if (created.approvalRequestIds.length > 0) {
      const placeholders = created.approvalRequestIds.map(() => "?").join(",");
      db.prepare(`DELETE FROM approval_decisions WHERE approval_request_id IN (${placeholders})`).run(...created.approvalRequestIds);
      db.prepare(`DELETE FROM approval_batch_items WHERE approval_request_id IN (${placeholders})`).run(...created.approvalRequestIds);
      db.prepare(`DELETE FROM approval_requests WHERE id IN (${placeholders})`).run(...created.approvalRequestIds);
    }

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

function insertReplacementDrawing(root, adminUserId) {
  const db = openDb();
  try {
    const now = new Date().toISOString();
    const drawingNumber = `D-${root.rootCode}-MA2`;
    const drawingId = `qc-data-restore-drawing-${unique}`;
    db.prepare(
      `
      INSERT INTO drawing_numbers (
        id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no,
        is_primary_manufacturing, development_phase, record_status, rule_version_id, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, 'MA', 'Replacement manufacturing drawing', 2, 1, 'EVT', 'Active', 'numbering-rule-v1', ?, ?, ?)
    `
    ).run(drawingId, root.id, drawingNumber, adminUserId, now, now);
    return { id: drawingId, drawingNumber };
  } finally {
    db.close();
  }
}

function markRootAndPartObsolete(rootId, partId) {
  const db = openDb();
  try {
    const now = new Date().toISOString();
    db.prepare("UPDATE part_numbers SET record_status = 'Obsolete', updated_at = ? WHERE id = ?").run(now, partId);
    db.prepare("UPDATE part_roots SET record_status = 'Obsolete', updated_at = ? WHERE id = ?").run(now, rootId);
  } finally {
    db.close();
  }
}

function expectSqliteReject(name, fn, expectedText) {
  try {
    fn();
    record(name, false, "statement unexpectedly succeeded");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record(name, message.includes(expectedText), message);
  }
}

function assertDuplicateRootRejected(root) {
  const db = openDb();
  try {
    expectSqliteReject("Duplicate root code is rejected after obsolete/active lifecycle", () => {
      db.prepare(
        `
        INSERT INTO part_roots (
          id, root_code, core_name, item_kind, development_phase, record_status, rule_version_id, created_by, created_at, updated_at
        ) VALUES (?, ?, 'QC duplicate root', 'manufactured', 'EVT', 'Draft', 'numbering-rule-v1', NULL, datetime('now'), datetime('now'))
      `
      ).run(`qc-data-dup-root-${unique}`, root.rootCode);
    }, "UNIQUE");
  } finally {
    db.close();
  }
}

function assertDuplicatePartRejected(root, partNumber) {
  const db = openDb();
  try {
    expectSqliteReject("Duplicate part number is rejected after obsolete lifecycle", () => {
      db.prepare(
        `
        INSERT INTO part_numbers (
          id, part_root_id, part_number, sequence_no, sequence_code, part_name,
          item_kind, is_universal, development_phase, record_status, rule_version_id, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, 99, '099', 'QC duplicate part', 'manufactured', 0, 'EVT', 'Draft', 'numbering-rule-v1', NULL, datetime('now'), datetime('now'))
      `
      ).run(`qc-data-dup-part-${unique}`, root.id, partNumber);
    }, "UNIQUE");
  } finally {
    db.close();
  }
}

function assertDuplicateDrawingRejected(root, drawingNumber) {
  const db = openDb();
  try {
    expectSqliteReject("Duplicate drawing number is rejected after obsolete lifecycle", () => {
      db.prepare(
        `
        INSERT INTO drawing_numbers (
          id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no,
          is_primary_manufacturing, development_phase, record_status, rule_version_id, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, 'MA', 'QC duplicate drawing', 99, 0, 'EVT', 'Draft', 'numbering-rule-v1', NULL, datetime('now'), datetime('now'))
      `
      ).run(`qc-data-dup-drawing-${unique}`, root.id, drawingNumber);
    }, "UNIQUE");
  } finally {
    db.close();
  }
}

function getRestoreLinks(partId, oldDrawingId, replacementDrawingId) {
  const db = openDb();
  try {
    return db
      .prepare(
        `
        SELECT drawing_number_id AS drawingId, part_number_id AS partId, link_type AS linkType
        FROM drawing_part_links
        WHERE part_number_id = ?
          AND drawing_number_id IN (?, ?)
        ORDER BY drawing_number_id
      `
      )
      .all(partId, oldDrawingId, replacementDrawingId);
  } finally {
    db.close();
  }
}

function getApprovalTrace(approvalRequestId) {
  const db = openDb();
  try {
    const request = db.prepare("SELECT * FROM approval_requests WHERE id = ?").get(approvalRequestId);
    const decision = db.prepare("SELECT * FROM approval_decisions WHERE approval_request_id = ?").get(approvalRequestId);
    const auditRows = db
      .prepare("SELECT action, detail_json AS detailJson FROM audit_logs WHERE detail_json LIKE ? ORDER BY created_at ASC")
      .all(`%${approvalRequestId}%`)
      .map((row) => ({ action: row.action, detail: JSON.parse(row.detailJson || "{}") }));
    return { request, decision, auditRows };
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
  const data = text ? JSON.parse(text) : {};
  const expected = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  record(`${method} ${urlPath} returns ${expected.join("/")}`, expected.includes(response.status), `HTTP ${response.status}`);
  return data;
}

try {
  const adminUserId = getAdminUserId();
  record("Admin demo user exists", Boolean(adminUserId), String(adminUserId ?? "missing"));
  const adminCookie = await login("admin@example.com");

  const restoreCase = await request(
    "POST",
    "/api/numbering/records",
    adminCookie,
    {
      coreName: `QC data consistency restore ${unique}`,
      partName: `QC data consistency part ${unique}`,
      itemKind: "manufactured",
      developmentPhase: "EVT",
      drawingRequested: true,
      drawingPurposeCode: "MA"
    },
    201
  );
  const restoreRoot = restoreCase.root;
  const restorePart = restoreCase.partNumber;
  const oldDrawing = restoreCase.drawingNumber;
  created.rootCodes.push(restoreRoot.rootCode);

  const invalidated = await request(
    "POST",
    "/api/numbering/impact-analysis",
    adminCookie,
    { drawingNumber: oldDrawing.drawingNumber, reason: `QC obsolete drawing ${unique}`, applyInvalidation: true },
    200
  );
  record("Main drawing invalidation creates obsolete drawing lifecycle", invalidated.applied === true, JSON.stringify({ drawingNumber: oldDrawing.drawingNumber }));
  assertDuplicateDrawingRejected(restoreRoot, oldDrawing.drawingNumber);

  const replacementDrawing = insertReplacementDrawing(restoreRoot, adminUserId);
  const restoreApproval = await request(
    "POST",
    "/api/numbering/approval-requests",
    adminCookie,
    {
      actionCode: "main_drawing_restore",
      partNumber: restorePart.partNumber,
      replacementDrawingNumber: replacementDrawing.drawingNumber,
      reason: `QC restore ${unique}`
    },
    201
  );
  created.approvalRequestIds.push(restoreApproval.id);
  await request(
    "POST",
    "/api/numbering/approval-decisions",
    adminCookie,
    {
      approvalRequestId: restoreApproval.id,
      decision: "approved",
      comment: `QC restore approved ${unique}`
    },
    200
  );
  const links = getRestoreLinks(restorePart.id, oldDrawing.id, replacementDrawing.id);
  record(
    "Main drawing restore keeps traceable redirect links",
    links.some((link) => link.drawingId === oldDrawing.id && link.linkType === "reference") &&
      links.some((link) => link.drawingId === replacementDrawing.id && link.linkType === "primary_manufacturing"),
    JSON.stringify(links)
  );

  const overrideCase = await request(
    "POST",
    "/api/numbering/records",
    adminCookie,
    {
      coreName: `QC data consistency override ${unique}`,
      partName: `QC missing MA override part ${unique}`,
      itemKind: "manufactured",
      developmentPhase: "DVT",
      drawingRequested: false
    },
    201
  );
  created.rootCodes.push(overrideCase.root.rootCode);
  const overrideApproval = await request(
    "POST",
    "/api/numbering/approval-requests",
    adminCookie,
    {
      actionCode: "dvt_missing_ma_override",
      entityType: "part_number",
      entityId: overrideCase.partNumber.id,
      reason: `QC missing MA override ${unique}`,
      payload: {
        rootCode: overrideCase.root.rootCode,
        partNumber: overrideCase.partNumber.partNumber,
        overrideTypes: ["missing_primary_ma"],
        riskFlags: ["has_override", "missing_primary_ma"]
      }
    },
    201
  );
  created.approvalRequestIds.push(overrideApproval.id);
  await request(
    "POST",
    "/api/numbering/approval-decisions",
    adminCookie,
    {
      approvalRequestId: overrideApproval.id,
      decision: "approved",
      comment: `QC override approved ${unique}`
    },
    200
  );
  const overrideTrace = getApprovalTrace(overrideApproval.id);
  record(
    "Override approval keeps request, decision, and audit trace",
    overrideTrace.request?.action_code === "dvt_missing_ma_override" &&
      overrideTrace.decision?.decision === "approved" &&
      overrideTrace.auditRows.some((row) => row.detail?.actionCode === "dvt_missing_ma_override" && row.detail?.markers?.some((marker) => marker.code === "override")),
    JSON.stringify({ request: overrideTrace.request?.action_code, decision: overrideTrace.decision?.decision, auditActions: overrideTrace.auditRows.map((row) => row.action) })
  );

  markRootAndPartObsolete(overrideCase.root.id, overrideCase.partNumber.id);
  assertDuplicateRootRejected(overrideCase.root);
  assertDuplicatePartRejected(overrideCase.root, overrideCase.partNumber.partNumber);
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
