#!/usr/bin/env node

import Database from "better-sqlite3";
import { assertNumberingQcRuntimeIsIsolated } from "./numbering-qc-runtime-guard.mjs";

const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3100";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const { dbPath } = assertNumberingQcRuntimeIsIsolated({ scriptName: "qc-pdm-numbering-draft-lifecycle" });
const unique = Date.now().toString().slice(-8);
const results = [];
const created = {
  rootCodes: []
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
    const approvalRequests = db
      .prepare("SELECT id FROM approval_requests WHERE reason LIKE ? OR payload_json LIKE ?")
      .all(`%${unique}%`, `%${unique}%`)
      .map((row) => row.id);
    if (approvalRequests.length > 0) {
      const placeholders = approvalRequests.map(() => "?").join(",");
      db.prepare(`DELETE FROM approval_decisions WHERE approval_request_id IN (${placeholders})`).run(...approvalRequests);
      db.prepare(`DELETE FROM approval_batch_items WHERE approval_request_id IN (${placeholders})`).run(...approvalRequests);
      db.prepare(`DELETE FROM approval_requests WHERE id IN (${placeholders})`).run(...approvalRequests);
    }

    db.prepare("DELETE FROM duplicate_check_events WHERE query_json LIKE ? OR result_json LIKE ?").run(`%${unique}%`, `%${unique}%`);

    const rootCodes = created.rootCodes.filter(Boolean);
    if (rootCodes.length === 0) return;
    const placeholders = rootCodes.map(() => "?").join(",");
    const roots = db.prepare(`SELECT id FROM part_roots WHERE root_code IN (${placeholders})`).all(...rootCodes);
    const rootIds = roots.map((row) => row.id);
    if (rootIds.length === 0) return;

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

function getRootBundle(rootCode) {
  const db = openDb();
  try {
    const root = db.prepare("SELECT * FROM part_roots WHERE root_code = ?").get(rootCode);
    if (!root) return null;
    const parts = db.prepare("SELECT * FROM part_numbers WHERE part_root_id = ? ORDER BY sequence_no ASC").all(root.id);
    const drawings = db.prepare("SELECT * FROM drawing_numbers WHERE part_root_id = ? ORDER BY purpose_code ASC, sequence_no ASC").all(root.id);
    return { root, parts, drawings };
  } finally {
    db.close();
  }
}

function countApprovalRequestsForBundle(bundle) {
  const ids = [bundle.root.id, ...bundle.parts.map((part) => part.id), ...bundle.drawings.map((drawing) => drawing.id)];
  const db = openDb();
  try {
    const placeholders = ids.map(() => "?").join(",");
    return db.prepare(`SELECT COUNT(*) AS count FROM approval_requests WHERE entity_id IN (${placeholders})`).get(...ids).count;
  } finally {
    db.close();
  }
}

function auditActionsForRoot(rootCode) {
  const db = openDb();
  try {
    return db
      .prepare("SELECT action FROM audit_logs WHERE detail_json LIKE ? ORDER BY created_at ASC")
      .all(`%${rootCode}%`)
      .map((row) => row.action);
  } finally {
    db.close();
  }
}

function setBundleTimestamp(rootCode, isoTimestamp) {
  const db = openDb();
  try {
    const root = db.prepare("SELECT id FROM part_roots WHERE root_code = ?").get(rootCode);
    if (!root) throw new Error(`Missing root ${rootCode}`);
    db.prepare("UPDATE drawing_numbers SET created_at = ?, updated_at = ? WHERE part_root_id = ?").run(isoTimestamp, isoTimestamp, root.id);
    db.prepare("UPDATE part_numbers SET created_at = ?, updated_at = ? WHERE part_root_id = ?").run(isoTimestamp, isoTimestamp, root.id);
    db.prepare("UPDATE part_roots SET created_at = ?, updated_at = ? WHERE id = ?").run(isoTimestamp, isoTimestamp, root.id);
  } finally {
    db.close();
  }
}

function getAdminConfirmRows(rootId) {
  const db = openDb();
  try {
    const tasks = db.prepare("SELECT * FROM numbering_task_items WHERE entity_id = ? AND task_type = 'draft_admin_confirm'").all(rootId);
    const notifications = db.prepare("SELECT * FROM numbering_notifications WHERE entity_id = ? AND notification_type = 'draft_admin_confirm'").all(rootId);
    return { tasks, notifications };
  } finally {
    db.close();
  }
}

try {
  const engineerCookie = await login("engineer@example.com");
  const adminCookie = await login("admin@example.com");

  await request(
    "POST",
    "/api/numbering/drafts/overdue",
    engineerCookie,
    { olderThanDays: 30, now: "2000-02-15T00:00:00.000Z" },
    403
  );

  const draft = await request(
    "POST",
    "/api/numbering/records",
    engineerCookie,
    {
      coreName: `QC draft lifecycle root ${unique}`,
      partName: `QC draft lifecycle part ${unique}`,
      itemKind: "manufactured",
      drawingRequested: true,
      drawingPurposeCode: "M"
    },
    201
  );
  created.rootCodes.push(draft.root.rootCode);
  let bundle = getRootBundle(draft.root.rootCode);
  record("Engineer-created numbering root is Draft", bundle?.root.record_status === "Draft", JSON.stringify(bundle?.root ?? {}));
  record("Engineer-created part and drawing are Draft", bundle.parts.every((part) => part.record_status === "Draft") && bundle.drawings.every((drawing) => drawing.record_status === "Draft"), JSON.stringify({ parts: bundle.parts, drawings: bundle.drawings }));
  record("Draft creation creates no approval request", countApprovalRequestsForBundle(bundle) === 0, `approval count ${countApprovalRequestsForBundle(bundle)}`);

  const updated = await request(
    "PATCH",
    `/api/numbering/records/${encodeURIComponent(draft.root.rootCode)}`,
    engineerCookie,
    {
      coreName: `QC draft lifecycle root updated ${unique}`,
      partName: `QC draft lifecycle part updated ${unique}`,
      drawingPurposeDescription: `QC draft lifecycle manufacturing updated ${unique}`
    },
    200
  );
  const updateResult = updated.result ?? updated;
  record(
    "Draft update API returns updated core, part, and manufacturing drawing",
    updateResult.root?.coreName?.includes("updated") &&
      updateResult.partNumbers?.[0]?.partName?.includes("updated") &&
      updateResult.drawingNumbers?.[0]?.purposeCode === "M" &&
      updateResult.drawingNumbers?.[0]?.purposeDescription?.includes("manufacturing updated"),
    JSON.stringify(updated)
  );
  bundle = getRootBundle(draft.root.rootCode);
  record("Draft update keeps root, part, and drawing in Draft", bundle.root.record_status === "Draft" && bundle.parts.every((part) => part.record_status === "Draft") && bundle.drawings.every((drawing) => drawing.record_status === "Draft"), JSON.stringify({ root: bundle.root.record_status, parts: bundle.parts.map((part) => part.record_status), drawings: bundle.drawings.map((drawing) => drawing.record_status) }));
  record("Draft update creates no approval request", countApprovalRequestsForBundle(bundle) === 0, `approval count ${countApprovalRequestsForBundle(bundle)}`);
  record("Draft update is audit logged", auditActionsForRoot(draft.root.rootCode).includes("numbering.draft.update"), auditActionsForRoot(draft.root.rootCode).join(","));

  const obsoleted = await request(
    "POST",
    `/api/numbering/records/${encodeURIComponent(draft.root.rootCode)}/obsolete`,
    engineerCookie,
    { reason: `QC draft obsolete no approval ${unique}` },
    200
  );
  const obsoleteResult = obsoleted.result ?? obsoleted;
  record("Draft obsolete API returns Obsolete root", obsoleteResult.root?.recordStatus === "Obsolete", JSON.stringify(obsoleted));
  bundle = getRootBundle(draft.root.rootCode);
  record("Draft obsolete updates root, part, and drawing to Obsolete", bundle.root.record_status === "Obsolete" && bundle.parts.every((part) => part.record_status === "Obsolete") && bundle.drawings.every((drawing) => drawing.record_status === "Obsolete"), JSON.stringify({ root: bundle.root.record_status, parts: bundle.parts.map((part) => part.record_status), drawings: bundle.drawings.map((drawing) => drawing.record_status) }));
  record("Draft obsolete creates no approval request", countApprovalRequestsForBundle(bundle) === 0, `approval count ${countApprovalRequestsForBundle(bundle)}`);
  record("Draft obsolete is audit logged", auditActionsForRoot(draft.root.rootCode).includes("numbering.draft.obsolete"), auditActionsForRoot(draft.root.rootCode).join(","));

  const oldDraft = await request(
    "POST",
    "/api/numbering/records",
    engineerCookie,
    {
      coreName: `QC overdue old root ${unique}`,
      partName: `QC overdue old part ${unique}`,
      itemKind: "manufactured",
      drawingRequested: true,
      drawingPurposeCode: "M"
    },
    201
  );
  const freshDraft = await request(
    "POST",
    "/api/numbering/records",
    engineerCookie,
    {
      coreName: `QC overdue fresh root ${unique}`,
      partName: `QC overdue fresh part ${unique}`,
      itemKind: "manufactured",
      drawingRequested: true,
      drawingPurposeCode: "M"
    },
    201
  );
  created.rootCodes.push(oldDraft.root.rootCode, freshDraft.root.rootCode);
  setBundleTimestamp(oldDraft.root.rootCode, "2000-01-01T00:00:00.000Z");

  const overdue = await request(
    "POST",
    "/api/numbering/drafts/overdue",
    adminCookie,
    { olderThanDays: 30, now: "2000-02-15T00:00:00.000Z" },
    200
  );
  record("Overdue draft job includes old draft root", overdue.updatedRootCodes?.includes(oldDraft.root.rootCode), JSON.stringify(overdue));
  record("Overdue draft job excludes fresh draft root", !overdue.updatedRootCodes?.includes(freshDraft.root.rootCode), JSON.stringify(overdue));

  const oldBundle = getRootBundle(oldDraft.root.rootCode);
  const freshBundle = getRootBundle(freshDraft.root.rootCode);
  record("Old draft root, part, and drawing are PendingAdminConfirm", oldBundle.root.record_status === "PendingAdminConfirm" && oldBundle.parts.every((part) => part.record_status === "PendingAdminConfirm") && oldBundle.drawings.every((drawing) => drawing.record_status === "PendingAdminConfirm"), JSON.stringify({ root: oldBundle.root.record_status, parts: oldBundle.parts.map((part) => part.record_status), drawings: oldBundle.drawings.map((drawing) => drawing.record_status) }));
  record("Fresh draft remains Draft after overdue job", freshBundle.root.record_status === "Draft" && freshBundle.parts.every((part) => part.record_status === "Draft") && freshBundle.drawings.every((drawing) => drawing.record_status === "Draft"), JSON.stringify({ root: freshBundle.root.record_status, parts: freshBundle.parts.map((part) => part.record_status), drawings: freshBundle.drawings.map((drawing) => drawing.record_status) }));

  const confirmRows = getAdminConfirmRows(oldBundle.root.id);
  record("Overdue draft creates PDM admin task", confirmRows.tasks.some((task) => task.assigned_role === "pdm_admin" && task.task_status === "open"), JSON.stringify(confirmRows.tasks));
  record("Overdue draft creates non-dismissible PDM admin notification", confirmRows.notifications.some((notification) => notification.recipient_role === "pdm_admin" && notification.dismissible === 0), JSON.stringify(confirmRows.notifications));
  record("Overdue draft admin confirmation is audit logged", auditActionsForRoot(oldDraft.root.rootCode).includes("numbering.draft.pending_admin_confirm"), auditActionsForRoot(oldDraft.root.rootCode).join(","));
} catch (error) {
  if (!results.some((result) => !result.passed)) {
    results.push({ name: "QC script failed before assertion", passed: false, detail: error instanceof Error ? error.message : String(error) });
  }
} finally {
  try {
    cleanup();
  } catch (error) {
    results.push({ name: "QC cleanup completed", passed: false, detail: error instanceof Error ? error.message : String(error) });
  }
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
