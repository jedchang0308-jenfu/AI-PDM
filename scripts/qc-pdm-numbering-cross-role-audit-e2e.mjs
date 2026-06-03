#!/usr/bin/env node

import Database from "better-sqlite3";
import path from "node:path";

const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3100";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const dbPath = path.join(process.cwd(), "data", "ai-pdm.sqlite");
const unique = Date.now().toString().slice(-8);
const projectCode = `QCAUDIT-${unique}`;
const rootCode = `QCAUD${unique}`;
const batchId = `qc-audit-batch-${unique}`;
const requestId = `qc-audit-request-${unique}`;
const delegationId = `qc-audit-delegation-${unique}`;
const managerProjectScopeId = `qc-audit-scope-project-${unique}`;
const managerActionScopeId = `qc-audit-scope-action-${unique}`;
const managerTaskId = `qc-audit-task-manager-${unique}`;
const managerNotificationId = `qc-audit-notification-manager-${unique}`;
const pdmTaskId = `qc-audit-task-pdm-${unique}`;
const pdmNotificationId = `qc-audit-notification-pdm-${unique}`;
const results = [];

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
    db.prepare("DELETE FROM approval_delegations WHERE id = ?").run(delegationId);
    db.prepare("DELETE FROM role_scope_rules WHERE id IN (?, ?)").run(managerProjectScopeId, managerActionScopeId);
    db.prepare("DELETE FROM numbering_task_items WHERE id IN (?, ?)").run(managerTaskId, pdmTaskId);
    db.prepare("DELETE FROM numbering_notifications WHERE id IN (?, ?)").run(managerNotificationId, pdmNotificationId);
    const requestIds = db.prepare("SELECT id FROM approval_requests WHERE id = ? OR payload_json LIKE ? OR reason LIKE ?").all(requestId, `%${unique}%`, `%${unique}%`).map((row) => row.id);
    if (requestIds.length > 0) {
      const placeholders = requestIds.map(() => "?").join(",");
      db.prepare(`DELETE FROM approval_decisions WHERE approval_request_id IN (${placeholders})`).run(...requestIds);
      db.prepare(`DELETE FROM approval_batch_items WHERE approval_request_id IN (${placeholders})`).run(...requestIds);
      db.prepare(`DELETE FROM approval_requests WHERE id IN (${placeholders})`).run(...requestIds);
    }
    db.prepare("DELETE FROM approval_batches WHERE id = ?").run(batchId);
    const roots = db.prepare("SELECT id FROM part_roots WHERE root_code = ?").all(rootCode);
    const rootIds = roots.map((row) => row.id);
    if (rootIds.length === 0) return;
    const rootPlaceholders = rootIds.map(() => "?").join(",");
    const partIds = db.prepare(`SELECT id FROM part_numbers WHERE part_root_id IN (${rootPlaceholders})`).all(...rootIds).map((row) => row.id);
    const drawingIds = db.prepare(`SELECT id FROM drawing_numbers WHERE part_root_id IN (${rootPlaceholders})`).all(...rootIds).map((row) => row.id);
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

function seedCrossRoleFixture() {
  const db = openDb();
  try {
    const now = new Date().toISOString();
    const manager = db.prepare("SELECT id FROM users WHERE email = ?").get("manager@example.com");
    const engineer = db.prepare("SELECT id FROM users WHERE email = ?").get("engineer@example.com");
    const managerRole = db.prepare("SELECT id FROM roles WHERE role_code = 'rd_manager'").get();
    record("Manager and engineer demo users exist", Boolean(manager?.id && engineer?.id && managerRole?.id), JSON.stringify({ manager, engineer, managerRole }));

    const rootId = `qc-audit-root-${unique}`;
    const partId = `qc-audit-part-${unique}`;
    const drawingId = `qc-audit-drawing-${unique}`;
    const partNumber = `P-${rootCode}-001`;
    const drawingNumber = `D-${rootCode}-MA1`;
    db.prepare(
      `INSERT INTO part_roots (
        id, root_code, core_name, item_kind, development_phase, record_status, rule_version_id, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, 'manufactured', 'DVT', 'PendingReview', 'numbering-rule-v1', 'user-engineer-demo', ?, ?)`
    ).run(rootId, rootCode, `QC cross-role audit root ${unique}`, now, now);
    db.prepare(
      `INSERT INTO part_numbers (
        id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, is_universal,
        development_phase, record_status, rule_version_id, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, 1, '001', ?, 'manufactured', 0, 'DVT', 'PendingReview', 'numbering-rule-v1', 'user-engineer-demo', ?, ?)`
    ).run(partId, rootId, partNumber, `QC cross-role audit part ${unique}`, now, now);
    db.prepare(
      `INSERT INTO drawing_numbers (
        id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no,
        is_primary_manufacturing, development_phase, record_status, rule_version_id, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, 'MA', 'Manufacturing drawing', 1, 1, 'DVT', 'PendingReview', 'numbering-rule-v1', 'user-engineer-demo', ?, ?)`
    ).run(drawingId, rootId, drawingNumber, now, now);
    db.prepare(
      "INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by, created_at) VALUES (?, ?, ?, 'primary_manufacturing', 'user-engineer-demo', ?)"
    ).run(`qc-audit-link-${unique}`, drawingId, partId, now);

    const payload = {
      rootCode,
      partNumber,
      drawingNumber,
      proxySubmitted: true,
      proxyReason: `QC proxy submission ${unique}`,
      riskFlags: ["impact_scope"],
      impactedPartNumbers: [partNumber],
      requiredDocuments: ["MA drawing", "DVT checklist"]
    };
    db.prepare(
      `INSERT INTO approval_requests (
        id, request_type, action_code, entity_type, entity_id, request_status,
        reason, payload_json, requested_by, requested_at, created_at, updated_at
      ) VALUES (?, 'numbering', 'dvt_promotion', 'part_number', ?, 'pending', ?, ?, 'user-engineer-demo', ?, ?, ?)`
    ).run(requestId, partId, `QC cross-role audit request ${unique}`, JSON.stringify(payload), now, now, now);
    db.prepare(
      `INSERT INTO approval_batches (
        id, batch_code, request_type, project_code, action_code, batch_status,
        submitted_by, submitted_at, created_at, updated_at
      ) VALUES (?, ?, 'numbering', ?, 'dvt_promotion', 'pending', 'user-engineer-demo', ?, ?, ?)`
    ).run(batchId, `NB-QCAUDIT-${unique}`, projectCode, now, now, now);
    db.prepare(
      "INSERT INTO approval_batch_items (id, batch_id, approval_request_id, item_status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?)"
    ).run(`qc-audit-batch-item-${unique}`, batchId, requestId, now, now);

    db.prepare(
      `INSERT INTO approval_delegations (
        id, delegated_from, delegated_to, project_code, action_code, starts_at, ends_at,
        reason, created_by, created_at
      ) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, 'user-admin-demo', ?)`
    ).run(
      delegationId,
      manager.id,
      engineer.id,
      new Date(Date.now() - 60_000).toISOString(),
      new Date(Date.now() + 3_600_000).toISOString(),
      `QC delegated review ${unique}`,
      now
    );
    db.prepare(
      `INSERT OR IGNORE INTO role_scope_rules (
        id, role_id, scope_kind, scope_code, allowed, created_by, created_at, updated_at
      ) VALUES (?, ?, 'project', ?, 1, 'user-admin-demo', ?, ?)`
    ).run(managerProjectScopeId, managerRole.id, projectCode, now, now);
    db.prepare(
      `INSERT OR IGNORE INTO role_scope_rules (
        id, role_id, scope_kind, scope_code, allowed, created_by, created_at, updated_at
      ) VALUES (?, ?, 'action', 'dvt_promotion', 1, 'user-admin-demo', ?, ?)`
    ).run(managerActionScopeId, managerRole.id, now, now);

    const detail = JSON.stringify({ projectCode, actionCode: "dvt_promotion", payload });
    db.prepare(
      `INSERT INTO numbering_task_items (
        id, task_type, entity_type, entity_id, title, message, risk_level, task_status,
        assigned_role, project_code, action_url, detail_json, created_by, created_at, updated_at
      ) VALUES (?, 'approval_request', 'approval_batch', ?, ?, ?, 'warning', 'open', 'rd_manager', ?, '/numbering/approvals', ?, 'user-admin-demo', ?, ?)`
    ).run(managerTaskId, batchId, `QC manager task ${unique}`, `QC manager task message ${unique}`, projectCode, detail, now, now);
    db.prepare(
      `INSERT INTO numbering_notifications (
        id, notification_type, entity_type, entity_id, title, message, severity,
        recipient_role, dismissible, action_url, detail_json, created_by, created_at, updated_at
      ) VALUES (?, 'approval_request_pending', 'approval_batch', ?, ?, ?, 'warning', 'rd_manager', 1, '/numbering/approvals', ?, 'user-admin-demo', ?, ?)`
    ).run(managerNotificationId, batchId, `QC manager notification ${unique}`, `QC manager notification message ${unique}`, detail, now, now);
    db.prepare(
      `INSERT INTO numbering_task_items (
        id, task_type, entity_type, entity_id, title, message, risk_level, task_status,
        assigned_role, project_code, action_url, detail_json, created_by, created_at, updated_at
      ) VALUES (?, 'approval_request', 'approval_batch', ?, ?, ?, 'warning', 'open', 'pdm_admin', ?, '/numbering/approvals', ?, 'user-admin-demo', ?, ?)`
    ).run(pdmTaskId, batchId, `QC PDM decoy task ${unique}`, `QC PDM decoy task message ${unique}`, projectCode, detail, now, now);
    db.prepare(
      `INSERT INTO numbering_notifications (
        id, notification_type, entity_type, entity_id, title, message, severity,
        recipient_role, dismissible, action_url, detail_json, created_by, created_at, updated_at
      ) VALUES (?, 'approval_request_pending', 'approval_batch', ?, ?, ?, 'warning', 'pdm_admin', 1, '/numbering/approvals', ?, 'user-admin-demo', ?, ?)`
    ).run(pdmNotificationId, batchId, `QC PDM decoy notification ${unique}`, `QC PDM decoy notification message ${unique}`, detail, now, now);

    return { partNumber, drawingNumber };
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

function findBatch(listResult) {
  return listResult.batches?.find((batch) => batch.id === batchId) ?? null;
}

function findTask(listResult, id) {
  return listResult.tasks?.find((task) => task.id === id) ?? null;
}

function findNotification(listResult, id) {
  return listResult.notifications?.find((notification) => notification.id === id) ?? null;
}

function markerCodes(item) {
  return (item?.markers ?? []).map((marker) => marker.code);
}

function requestMarkerCodes(batch) {
  return (batch?.items ?? []).flatMap((item) => item.request?.markers ?? []).map((marker) => marker.code);
}

function readBatchItems() {
  const db = openDb();
  try {
    return db.prepare("SELECT id, approval_request_id, item_status, resubmitted_from_item_id FROM approval_batch_items WHERE batch_id = ? ORDER BY created_at ASC, id ASC").all(batchId);
  } finally {
    db.close();
  }
}

function readLatestAudit(action) {
  const db = openDb();
  try {
    const rows = db.prepare("SELECT actor_id, detail_json FROM audit_logs WHERE action = ? ORDER BY created_at DESC LIMIT 20").all(action);
    for (const row of rows) {
      const detail = JSON.parse(row.detail_json || "{}");
      if (detail.batchId === batchId || detail.originalBatchId === batchId || detail.after?.batchId === batchId) {
        return { actorId: row.actor_id, detail };
      }
    }
    return null;
  } finally {
    db.close();
  }
}

let seeded = null;
try {
  cleanup();
  seeded = seedCrossRoleFixture();
  const managerCookie = await login("manager@example.com");
  const engineerCookie = await login("engineer@example.com");

  const managerBatches = await request("GET", "/api/numbering/approval-batches?status=all&scope=all&limit=100", managerCookie);
  const managerBatch = findBatch(managerBatches);
  record("Manager can see scoped approval batch", Boolean(managerBatch), JSON.stringify(managerBatches.summary));
  record("Manager direct batch view has no delegated marker", !markerCodes(managerBatch).includes("delegated_review"), JSON.stringify(markerCodes(managerBatch)));
  record("Manager batch request keeps proxy marker", requestMarkerCodes(managerBatch).includes("proxy_submission"), JSON.stringify(requestMarkerCodes(managerBatch)));

  const engineerBatches = await request("GET", "/api/numbering/approval-batches?status=all&scope=all&limit=100", engineerCookie);
  const engineerBatch = findBatch(engineerBatches);
  record("Delegated engineer can see manager approval batch", Boolean(engineerBatch), JSON.stringify(engineerBatches.summary));
  record("Delegated engineer batch view has delegated marker", markerCodes(engineerBatch).includes("delegated_review"), JSON.stringify(markerCodes(engineerBatch)));
  record("Delegated engineer batch request keeps proxy marker", requestMarkerCodes(engineerBatch).includes("proxy_submission"), JSON.stringify(requestMarkerCodes(engineerBatch)));

  const managerTasks = await request("GET", "/api/numbering/tasks?status=all", managerCookie);
  const managerTask = findTask(managerTasks, managerTaskId);
  record("Manager sees rd_manager task", Boolean(managerTask), JSON.stringify(managerTasks.summary));
  record("Manager does not see PDM-admin decoy task", !findTask(managerTasks, pdmTaskId), JSON.stringify(managerTasks.tasks?.map((task) => task.id).filter((id) => String(id).includes(unique))));
  record("Manager task keeps proxy and impact markers", markerCodes(managerTask).includes("proxy_submission") && markerCodes(managerTask).includes("impact_scope"), JSON.stringify(markerCodes(managerTask)));

  const engineerTasks = await request("GET", "/api/numbering/tasks?status=all", engineerCookie);
  const engineerTask = findTask(engineerTasks, managerTaskId);
  record("Delegated engineer sees rd_manager task", Boolean(engineerTask), JSON.stringify(engineerTasks.summary));
  record("Delegated engineer does not see PDM-admin decoy task", !findTask(engineerTasks, pdmTaskId), JSON.stringify(engineerTasks.tasks?.map((task) => task.id).filter((id) => String(id).includes(unique))));
  record("Delegated engineer task keeps proxy, impact, and delegated markers", markerCodes(engineerTask).includes("proxy_submission") && markerCodes(engineerTask).includes("impact_scope") && markerCodes(engineerTask).includes("delegated_review"), JSON.stringify(markerCodes(engineerTask)));

  const managerNotifications = await request("GET", "/api/numbering/notifications?read=all&handled=all", managerCookie);
  const managerNotification = findNotification(managerNotifications, managerNotificationId);
  record("Manager sees rd_manager notification", Boolean(managerNotification), JSON.stringify(managerNotifications.summary));
  record("Manager does not see PDM-admin decoy notification", !findNotification(managerNotifications, pdmNotificationId), JSON.stringify(managerNotifications.notifications?.map((notification) => notification.id).filter((id) => String(id).includes(unique))));
  record("Manager notification keeps proxy and impact markers", markerCodes(managerNotification).includes("proxy_submission") && markerCodes(managerNotification).includes("impact_scope"), JSON.stringify(markerCodes(managerNotification)));

  const engineerNotifications = await request("GET", "/api/numbering/notifications?read=all&handled=all", engineerCookie);
  const engineerNotification = findNotification(engineerNotifications, managerNotificationId);
  record("Delegated engineer sees rd_manager notification", Boolean(engineerNotification), JSON.stringify(engineerNotifications.summary));
  record("Delegated engineer does not see PDM-admin decoy notification", !findNotification(engineerNotifications, pdmNotificationId), JSON.stringify(engineerNotifications.notifications?.map((notification) => notification.id).filter((id) => String(id).includes(unique))));
  record("Delegated engineer notification keeps proxy, impact, and delegated markers", markerCodes(engineerNotification).includes("proxy_submission") && markerCodes(engineerNotification).includes("impact_scope") && markerCodes(engineerNotification).includes("delegated_review"), JSON.stringify(markerCodes(engineerNotification)));

  await request(
    "PATCH",
    `/api/numbering/approval-batches/${batchId}`,
    managerCookie,
    {
      decision: "rejected",
      approvalRequestIds: [requestId],
      comment: `QC manager reject ${unique}`
    },
    200
  );
  const rejectedItems = readBatchItems();
  record("Manager rejection marks original batch item rejected", rejectedItems.some((item) => item.approval_request_id === requestId && item.item_status === "rejected"), JSON.stringify(rejectedItems));
  const decisionAudit = readLatestAudit("numbering.approval_batch.decision");
  record("Batch decision audit has before/after/diff envelope", decisionAudit?.detail?.before === null && decisionAudit?.detail?.after?.decision === "rejected" && Boolean(decisionAudit?.detail?.diff), JSON.stringify(decisionAudit));

  const resubmitted = await request(
    "PATCH",
    `/api/numbering/approval-batches/${batchId}`,
    engineerCookie,
    {
      action: "resubmit_rejected",
      approvalRequestIds: [requestId],
      reason: `QC delegated resubmit ${unique}`
    },
    200
  );
  const newRequestId = resubmitted.requests?.[0]?.id;
  record("Delegated engineer resubmits rejected batch item", Boolean(newRequestId), JSON.stringify(resubmitted));
  const resubmittedItems = readBatchItems();
  record("Original item becomes resubmitted and new item is pending", resubmittedItems.some((item) => item.approval_request_id === requestId && item.item_status === "resubmitted") && resubmittedItems.some((item) => item.approval_request_id === newRequestId && item.item_status === "pending" && item.resubmitted_from_item_id), JSON.stringify(resubmittedItems));
  const resubmitAudit = readLatestAudit("numbering.approval_batch.resubmit_rejected");
  record("Batch resubmit audit has before/after/diff envelope", resubmitAudit?.actorId === "user-engineer-demo" && resubmitAudit?.detail?.before === null && resubmitAudit?.detail?.after?.newApprovalRequestIds?.includes(newRequestId) && Boolean(resubmitAudit?.detail?.diff), JSON.stringify(resubmitAudit));

  const activeEngineerBatches = await request("GET", "/api/numbering/approval-batches?status=active&scope=all&limit=100", engineerCookie);
  const activeEngineerBatch = findBatch(activeEngineerBatches);
  record("Resubmitted batch is active and visible to delegated engineer", activeEngineerBatch?.batchStatus === "pending", JSON.stringify(activeEngineerBatch));
  record("Resubmitted approval request keeps proxy marker", requestMarkerCodes(activeEngineerBatch).includes("proxy_submission"), JSON.stringify(requestMarkerCodes(activeEngineerBatch)));
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
      projectCode,
      rootCode,
      partNumber: seeded?.partNumber ?? null,
      drawingNumber: seeded?.drawingNumber ?? null,
      results
    },
    null,
    2
  )
);

if (failed.length > 0) {
  process.exit(1);
}
