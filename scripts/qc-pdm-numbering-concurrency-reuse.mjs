#!/usr/bin/env node

import Database from "better-sqlite3";
import { assertNumberingQcRuntimeIsIsolated } from "./numbering-qc-runtime-guard.mjs";

const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3100";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const { dbPath } = assertNumberingQcRuntimeIsIsolated({ scriptName: "qc-pdm-numbering-concurrency-reuse" });
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

function uniqueValues(values) {
  return new Set(values.filter(Boolean));
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

    db.prepare("DELETE FROM duplicate_check_events WHERE query_json LIKE ? OR result_json LIKE ?").run(`%${unique}%`, `%${unique}%`);

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
        // The unified `drawings` projection holds RESTRICT references to the
        // canonical drawing/root rows; remove the projection before its source
        // rows so the disposable QC fixture can clean up with FKs enabled.
        db.prepare(`DELETE FROM drawings WHERE part_root_id IN (${rootPlaceholders})`).run(...rootIds);
        db.prepare(`DELETE FROM drawing_numbers WHERE part_root_id IN (${rootPlaceholders})`).run(...rootIds);
        db.prepare(`DELETE FROM part_numbers WHERE part_root_id IN (${rootPlaceholders})`).run(...rootIds);
        db.prepare(`DELETE FROM part_roots WHERE id IN (${rootPlaceholders})`).run(...rootIds);
      }
    }
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
  record(`${email} login succeeds`, response.status === 200, `HTTP ${response.status}`);
  record(`${email} login returns session cookie`, Boolean(cookie), cookie ? "cookie received" : "missing cookie");
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
  record(`${method} ${urlPath} returns ${expected.join("/")}`, expected.includes(response.status), `HTTP ${response.status}: ${text.slice(0, 300)}`);
  return data;
}

async function createRecord(cookie, label, index, drawingRequested = true) {
  const response = await fetch(`${apiBaseUrl}/api/numbering/records`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie
    },
    body: JSON.stringify({
      coreName: `QC ${label} root ${unique}-${index}`,
      partName: `QC ${label} part ${unique}-${index}`,
      itemKind: "manufactured",
      drawingRequested,
      drawingPurposeCode: drawingRequested ? "M" : undefined
    })
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  return { status: response.status, data, text };
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

function assertDuplicateRootRejected(root, name) {
  const db = openDb();
  try {
    expectSqliteReject(name, () => {
      db.prepare(
        `
        INSERT INTO part_roots (
          id, root_code, core_name, item_kind, record_status, rule_version_id, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, 'manufactured', 'Draft', 'numbering-rule-v1', NULL, datetime('now'), datetime('now'))
      `
      ).run(`qc-concurrency-dup-root-${unique}-${name}`, root.rootCode, `QC duplicate root ${unique}`);
    }, "UNIQUE");
  } finally {
    db.close();
  }
}

function assertDuplicatePartRejected(root, partNumber, name) {
  const db = openDb();
  try {
    expectSqliteReject(name, () => {
      db.prepare(
        `
        INSERT INTO part_numbers (
          id, part_root_id, part_number, sequence_no, sequence_code, part_name,
          item_kind, is_universal, record_status, rule_version_id, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, 99, '099', ?, 'manufactured', 0, 'Draft', 'numbering-rule-v1', NULL, datetime('now'), datetime('now'))
      `
      ).run(`qc-concurrency-dup-part-${unique}-${name}`, root.id, partNumber, `QC duplicate part ${unique}`);
    }, "UNIQUE");
  } finally {
    db.close();
  }
}

function assertDuplicateDrawingRejected(root, drawingNumber, name) {
  const db = openDb();
  try {
    expectSqliteReject(name, () => {
      db.prepare(
        `
        INSERT INTO drawing_numbers (
          id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no,
          is_primary_manufacturing, record_status, rule_version_id, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, 'MA', ?, 99, 0, 'Draft', 'numbering-rule-v1', NULL, datetime('now'), datetime('now'))
      `
      ).run(`qc-concurrency-dup-drawing-${unique}-${name}`, root.id, drawingNumber, `QC duplicate drawing ${unique}`);
    }, "UNIQUE");
  } finally {
    db.close();
  }
}

function setRecordStatus(rootId, status) {
  const db = openDb();
  try {
    const now = new Date().toISOString();
    db.prepare("UPDATE drawing_numbers SET record_status = ?, updated_at = ? WHERE part_root_id = ?").run(status, now, rootId);
    db.prepare("UPDATE part_numbers SET record_status = ?, updated_at = ? WHERE part_root_id = ?").run(status, now, rootId);
    db.prepare("UPDATE part_roots SET record_status = ?, updated_at = ? WHERE id = ?").run(status, now, rootId);
  } finally {
    db.close();
  }
}

function getApprovalRequestStatus(id) {
  const db = openDb();
  try {
    return db.prepare("SELECT request_status AS status FROM approval_requests WHERE id = ?").get(id)?.status ?? null;
  } finally {
    db.close();
  }
}

async function assertDuplicateCheckBlocked(cookie, query, name) {
  const result = await request("POST", "/api/numbering/duplicate-check", cookie, { ...query, coreName: `QC ${unique}` }, 200);
  record(name, result.blocked === true && result.matches?.some((match) => match.severity === "blocker"), JSON.stringify(result));
}

try {
  const adminCookie = await login("admin@example.com");

  const concurrentCount = 12;
  const concurrentResults = await Promise.all(
    Array.from({ length: concurrentCount }, (_, index) => createRecord(adminCookie, "concurrent", index, true))
  );
  const failures = concurrentResults.filter((result) => result.status !== 201);
  record("Concurrent numbering requests all succeed", failures.length === 0, JSON.stringify(failures.map((failure) => ({ status: failure.status, text: failure.text }))));

  const records = concurrentResults.map((result) => result.data);
  for (const recordData of records) created.rootCodes.push(recordData.root.rootCode);
  const rootCodes = records.map((recordData) => recordData.root.rootCode);
  const partNumbers = records.map((recordData) => recordData.partNumber.partNumber);
  const drawingNumbers = records.map((recordData) => recordData.drawingNumber?.drawingNumber);
  record("Concurrent root codes are unique", uniqueValues(rootCodes).size === concurrentCount, JSON.stringify(rootCodes));
  record("Concurrent part numbers are unique", uniqueValues(partNumbers).size === concurrentCount, JSON.stringify(partNumbers));
  record("Concurrent drawing numbers are unique", uniqueValues(drawingNumbers).size === concurrentCount, JSON.stringify(drawingNumbers));
  record(
    "Concurrent codes keep expected numbering formats",
    rootCodes.every((code) => /^A\d{4}$/.test(code)) &&
      partNumbers.every((code) => /^A\d{4}-P\d{2}$/.test(code)) &&
      drawingNumbers.every((code) => /^A\d{4}-M\d{2}$/.test(code)),
    JSON.stringify({ rootCodes, partNumbers, drawingNumbers })
  );
  await assertDuplicateCheckBlocked(
    adminCookie,
    { rootCode: rootCodes[0], partNumber: partNumbers[0], drawingNumber: drawingNumbers[0] },
    "Duplicate check blocks exact code from concurrent allocation"
  );

  const pendingCase = await request(
    "POST",
    "/api/numbering/records",
    adminCookie,
    {
      coreName: `QC pending reuse root ${unique}`,
      partName: `QC pending reuse part ${unique}`,
      itemKind: "manufactured",
      drawingRequested: true,
      drawingPurposeCode: "M"
    },
    201
  );
  created.rootCodes.push(pendingCase.root.rootCode);
  const pendingApproval = await request(
    "POST",
    "/api/numbering/approval-requests",
    adminCookie,
    {
      actionCode: "release",
      entityType: "part_number",
      entityId: pendingCase.partNumber.id,
      reason: `QC pending request keeps number reserved ${unique}`,
      payload: {
        rootCode: pendingCase.root.rootCode,
        partNumber: pendingCase.partNumber.partNumber,
        drawingNumber: pendingCase.drawingNumber.drawingNumber,
        overrideTypes: ["pending_number_reserved"],
        riskFlags: ["has_override"]
      }
    },
    201
  );
  created.approvalRequestIds.push(pendingApproval.id);
  record("Pending approval remains unresolved", getApprovalRequestStatus(pendingApproval.id) === "pending", String(getApprovalRequestStatus(pendingApproval.id)));
  assertDuplicateRootRejected(pendingCase.root, "Pending approval root code cannot be reused");
  assertDuplicatePartRejected(pendingCase.root, pendingCase.partNumber.partNumber, "Pending approval part number cannot be reused");
  assertDuplicateDrawingRejected(pendingCase.root, pendingCase.drawingNumber.drawingNumber, "Pending approval drawing number cannot be reused");
  await assertDuplicateCheckBlocked(
    adminCookie,
    {
      rootCode: pendingCase.root.rootCode,
      partNumber: pendingCase.partNumber.partNumber,
      drawingNumber: pendingCase.drawingNumber.drawingNumber
    },
    "Duplicate check blocks pending/unapproved numbering codes"
  );

  const rejectedCase = await request(
    "POST",
    "/api/numbering/records",
    adminCookie,
    {
      coreName: `QC rejected reuse root ${unique}`,
      partName: `QC rejected reuse part ${unique}`,
      itemKind: "manufactured",
      drawingRequested: true,
      drawingPurposeCode: "M"
    },
    201
  );
  created.rootCodes.push(rejectedCase.root.rootCode);
  const rejectedApproval = await request(
    "POST",
    "/api/numbering/approval-requests",
    adminCookie,
    {
      actionCode: "release",
      entityType: "part_number",
      entityId: rejectedCase.partNumber.id,
      reason: `QC rejected request keeps number reserved ${unique}`,
      payload: {
        rootCode: rejectedCase.root.rootCode,
        partNumber: rejectedCase.partNumber.partNumber,
        drawingNumber: rejectedCase.drawingNumber.drawingNumber,
        overrideTypes: ["rejected_number_reserved"],
        riskFlags: ["has_override"]
      }
    },
    201
  );
  created.approvalRequestIds.push(rejectedApproval.id);
  await request(
    "POST",
    "/api/numbering/approval-decisions",
    adminCookie,
    {
      approvalRequestId: rejectedApproval.id,
      decision: "rejected",
      comment: `QC rejected request ${unique}`
    },
    200
  );
  record("Rejected approval status is stored", getApprovalRequestStatus(rejectedApproval.id) === "rejected", String(getApprovalRequestStatus(rejectedApproval.id)));
  assertDuplicateRootRejected(rejectedCase.root, "Rejected approval root code cannot be reused");
  assertDuplicatePartRejected(rejectedCase.root, rejectedCase.partNumber.partNumber, "Rejected approval part number cannot be reused");
  assertDuplicateDrawingRejected(rejectedCase.root, rejectedCase.drawingNumber.drawingNumber, "Rejected approval drawing number cannot be reused");
  await assertDuplicateCheckBlocked(
    adminCookie,
    {
      rootCode: rejectedCase.root.rootCode,
      partNumber: rejectedCase.partNumber.partNumber,
      drawingNumber: rejectedCase.drawingNumber.drawingNumber
    },
    "Duplicate check blocks rejected numbering codes"
  );

  const obsoleteCase = await request(
    "POST",
    "/api/numbering/records",
    adminCookie,
    {
      coreName: `QC obsolete reuse root ${unique}`,
      partName: `QC obsolete reuse part ${unique}`,
      itemKind: "manufactured",
      drawingRequested: true,
      drawingPurposeCode: "M"
    },
    201
  );
  created.rootCodes.push(obsoleteCase.root.rootCode);
  setRecordStatus(obsoleteCase.root.id, "Obsolete");
  assertDuplicateRootRejected(obsoleteCase.root, "Obsolete root code cannot be reused");
  assertDuplicatePartRejected(obsoleteCase.root, obsoleteCase.partNumber.partNumber, "Obsolete part number cannot be reused");
  assertDuplicateDrawingRejected(obsoleteCase.root, obsoleteCase.drawingNumber.drawingNumber, "Obsolete drawing number cannot be reused");
  await assertDuplicateCheckBlocked(
    adminCookie,
    {
      rootCode: obsoleteCase.root.rootCode,
      partNumber: obsoleteCase.partNumber.partNumber,
      drawingNumber: obsoleteCase.drawingNumber.drawingNumber
    },
    "Duplicate check blocks obsolete numbering codes"
  );
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
      concurrentRequests: 12,
      results
    },
    null,
    2
  )
);

if (failed.length > 0) {
  process.exit(1);
}
