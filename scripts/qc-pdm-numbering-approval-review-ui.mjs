#!/usr/bin/env node

import Database from "better-sqlite3";
import { chromium } from "playwright";
import path from "node:path";

const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://localhost:3100";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const dbPath = path.join(process.cwd(), "data", "ai-pdm.sqlite");
const unique = Date.now().toString().slice(-8);
const delegationId = `qc-appr-delegation-${unique}`;
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function openDb() {
  return new Database(dbPath);
}

function cleanupApprovalData() {
  const db = openDb();
  try {
    const roots = db.prepare("SELECT id FROM part_roots WHERE root_code LIKE ?").all(`QCAPPR${unique}%`);
    const rootIds = roots.map((row) => row.id);
    const requestIds = db.prepare("SELECT id FROM approval_requests WHERE id LIKE ?").all(`qc-appr-request-${unique}-%`).map((row) => row.id);
    const batchIds = db.prepare("SELECT id FROM approval_batches WHERE id LIKE ?").all(`qc-appr-batch-${unique}%`).map((row) => row.id);
    if (requestIds.length > 0) {
      const placeholders = requestIds.map(() => "?").join(",");
      db.prepare(`DELETE FROM approval_decisions WHERE approval_request_id IN (${placeholders})`).run(...requestIds);
      db.prepare(`DELETE FROM approval_batch_items WHERE approval_request_id IN (${placeholders})`).run(...requestIds);
      db.prepare(`DELETE FROM approval_requests WHERE id IN (${placeholders})`).run(...requestIds);
    }
    if (batchIds.length > 0) {
      const placeholders = batchIds.map(() => "?").join(",");
      db.prepare(`DELETE FROM approval_batches WHERE id IN (${placeholders})`).run(...batchIds);
    }
    if (rootIds.length > 0) {
      const placeholders = rootIds.map(() => "?").join(",");
      const partIds = db.prepare(`SELECT id FROM part_numbers WHERE part_root_id IN (${placeholders})`).all(...rootIds).map((row) => row.id);
      const drawingIds = db.prepare(`SELECT id FROM drawing_numbers WHERE part_root_id IN (${placeholders})`).all(...rootIds).map((row) => row.id);
      const entityIds = [...rootIds, ...partIds, ...drawingIds];
      if (entityIds.length > 0) {
        const entityPlaceholders = entityIds.map(() => "?").join(",");
        db.prepare(`DELETE FROM warning_events WHERE entity_id IN (${entityPlaceholders})`).run(...entityIds);
        db.prepare(`DELETE FROM numbering_task_items WHERE entity_id IN (${entityPlaceholders})`).run(...entityIds);
        db.prepare(`DELETE FROM numbering_notifications WHERE entity_id IN (${entityPlaceholders})`).run(...entityIds);
      }
      if (drawingIds.length > 0) {
        const drawingPlaceholders = drawingIds.map(() => "?").join(",");
        db.prepare(`DELETE FROM drawing_part_links WHERE drawing_number_id IN (${drawingPlaceholders})`).run(...drawingIds);
      }
      if (partIds.length > 0) {
        const partPlaceholders = partIds.map(() => "?").join(",");
        db.prepare(`DELETE FROM drawing_part_links WHERE part_number_id IN (${partPlaceholders})`).run(...partIds);
      }
      db.prepare(`DELETE FROM drawing_numbers WHERE part_root_id IN (${placeholders})`).run(...rootIds);
      db.prepare(`DELETE FROM part_numbers WHERE part_root_id IN (${placeholders})`).run(...rootIds);
      db.prepare(`DELETE FROM part_roots WHERE id IN (${placeholders})`).run(...rootIds);
    }
    db.prepare("DELETE FROM users WHERE id = ?").run(`qc-appr-admin-${unique}`);
    db.prepare("DELETE FROM approval_delegations WHERE id = ?").run(delegationId);
  } finally {
    db.close();
  }
}

function seedPart(suffix, { recordStatus = "PendingReview", developmentPhase = "DVT", itemKind = "manufactured" } = {}) {
  const db = openDb();
  try {
    const now = new Date().toISOString();
    const rootCode = `QCAPPR${unique}${suffix}`;
    const rootId = `qc-appr-root-${unique}-${suffix}`;
    const partId = `qc-appr-part-${unique}-${suffix}`;
    const drawingId = `qc-appr-drawing-${unique}-${suffix}`;
    const partNumber = `P-${rootCode}-001`;
    const drawingNumber = `D-${rootCode}-MA1`;
    db.prepare(
      `
      INSERT INTO part_roots (
        id, root_code, core_name, item_kind, development_phase, record_status, rule_version_id, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'numbering-rule-v1', ?, ?, ?)
    `
    ).run(rootId, rootCode, `QC approval ${suffix}`, itemKind, developmentPhase, recordStatus, `qc-appr-admin-${unique}`, now, now);
    db.prepare(
      `
      INSERT INTO part_numbers (
        id, part_root_id, part_number, sequence_no, sequence_code, part_name,
        item_kind, is_universal, development_phase, record_status, rule_version_id, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, 1, '001', ?, ?, 0, ?, ?, 'numbering-rule-v1', ?, ?, ?)
    `
    ).run(partId, rootId, partNumber, `QC approval ${suffix} part`, itemKind, developmentPhase, recordStatus, `qc-appr-admin-${unique}`, now, now);
    db.prepare(
      `
      INSERT INTO drawing_numbers (
        id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no,
        is_primary_manufacturing, development_phase, record_status, rule_version_id, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, 'MA', 'Manufacturing drawing', 1, 1, ?, ?, 'numbering-rule-v1', ?, ?, ?)
    `
    ).run(drawingId, rootId, drawingNumber, developmentPhase, recordStatus, `qc-appr-admin-${unique}`, now, now);
    db.prepare(
      "INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by, created_at) VALUES (?, ?, ?, 'primary_manufacturing', ?, ?)"
    ).run(`qc-appr-link-${unique}-${suffix}`, drawingId, partId, `qc-appr-admin-${unique}`, now);
    return { rootCode, rootId, partId, partNumber, drawingId, drawingNumber };
  } finally {
    db.close();
  }
}

function seedApprovalBatch() {
  const userDb = openDb();
  try {
    const now = new Date().toISOString();
    userDb.prepare(
      "INSERT OR IGNORE INTO users (id, display_name, email, role, created_at, updated_at) VALUES (?, ?, ?, 'Admin', ?, ?)"
    ).run(`qc-appr-admin-${unique}`, `QC proxy admin ${unique}`, `qc-appr-admin-${unique}@example.test`, now, now);
    const manager = userDb.prepare("SELECT id FROM users WHERE email = ?").get("manager@example.com");
    const engineer = userDb.prepare("SELECT id FROM users WHERE email = ?").get("engineer@example.com");
    record("Manager and engineer demo users exist for delegation", Boolean(manager?.id && engineer?.id), JSON.stringify({ manager, engineer }));
    userDb
      .prepare(
        `
        INSERT INTO approval_delegations (
          id, delegated_from, delegated_to, project_code, action_code, starts_at, ends_at,
          reason, created_by, created_at
        ) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, 'user-admin-demo', ?)
      `
      )
      .run(
        delegationId,
        manager.id,
        engineer.id,
        new Date(Date.now() - 60_000).toISOString(),
        new Date(Date.now() + 3_600_000).toISOString(),
        "QC 代理審核標示驗證",
        now
      );
  } finally {
    userDb.close();
  }

  const dvt = seedPart("DVT");
  const releaseOverride = seedPart("REL", { recordStatus: "MainDrawingInvalid", developmentPhase: "Release" });
  const db = openDb();
  try {
    const now = new Date().toISOString();
    const batchId = `qc-appr-batch-${unique}`;
    const dvtRequestId = `qc-appr-request-${unique}-dvt`;
    const releaseRequestId = `qc-appr-request-${unique}-release`;
    db.prepare(
      `
      INSERT INTO approval_requests (
        id, request_type, action_code, entity_type, entity_id, request_status,
        reason, payload_json, requested_by, requested_at, created_at, updated_at
      ) VALUES (?, 'numbering', ?, 'part_number', ?, 'pending', ?, ?, ?, ?, ?, ?)
    `
    ).run(
      dvtRequestId,
      "dvt_promotion",
      dvt.partId,
      "QC DVT approval review",
      JSON.stringify({ partNumber: dvt.partNumber, rootCode: dvt.rootCode, proxySubmitted: true, proxyReason: "QC 管理員代 RD 送審" }),
      `qc-appr-admin-${unique}`,
      now,
      now,
      now
    );
    db.prepare(
      `
      INSERT INTO approval_requests (
        id, request_type, action_code, entity_type, entity_id, request_status,
        reason, payload_json, requested_by, requested_at, created_at, updated_at
      ) VALUES (?, 'numbering', ?, 'part_number', ?, 'pending', ?, ?, ?, ?, ?, ?)
    `
    ).run(
      releaseRequestId,
      "release_missing_ma_confirm",
      releaseOverride.partId,
      "QC release override review",
      JSON.stringify({ partNumber: releaseOverride.partNumber, rootCode: releaseOverride.rootCode, proxySubmitted: true, proxyReason: "QC 發行缺 MA 再確認" }),
      `qc-appr-admin-${unique}`,
      now,
      now,
      now
    );
    db.prepare(
      `
      INSERT INTO approval_batches (
        id, batch_code, request_type, project_code, action_code, batch_status,
        submitted_by, submitted_at, created_at, updated_at
      ) VALUES (?, ?, 'numbering', ?, 'dvt_promotion', 'pending', ?, ?, ?, ?)
    `
    ).run(batchId, `NB-QCAPPR-${unique}`, `QCAPPR-${unique}`, `qc-appr-admin-${unique}`, now, now, now);
    db.prepare(
      "INSERT INTO approval_batch_items (id, batch_id, approval_request_id, item_status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?)"
    ).run(`qc-appr-batch-item-${unique}-dvt`, batchId, dvtRequestId, now, now);
    db.prepare(
      "INSERT INTO approval_batch_items (id, batch_id, approval_request_id, item_status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?)"
    ).run(`qc-appr-batch-item-${unique}-release`, batchId, releaseRequestId, now, now);
    return { batchId, dvtRequestId, releaseRequestId, dvt, releaseOverride };
  } finally {
    db.close();
  }
}

function readApprovalState(seeded) {
  const db = openDb();
  try {
    const batch = db.prepare("SELECT batch_status FROM approval_batches WHERE id = ?").get(seeded.batchId);
    const dvtDecision = db.prepare("SELECT decision, comment, approver_id, approver_role FROM approval_decisions WHERE approval_request_id = ?").get(seeded.dvtRequestId);
    const releaseDecision = db.prepare("SELECT decision, comment, approver_id, approver_role FROM approval_decisions WHERE approval_request_id = ?").get(seeded.releaseRequestId);
    const dvtPart = db.prepare("SELECT development_phase, record_status FROM part_numbers WHERE id = ?").get(seeded.dvt.partId);
    const itemStatuses = db.prepare("SELECT item_status FROM approval_batch_items WHERE batch_id = ? ORDER BY id").all(seeded.batchId);
    return { batch, dvtDecision, releaseDecision, dvtPart, itemStatuses };
  } finally {
    db.close();
  }
}

async function loginAsEngineer(context) {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "engineer@example.com", password })
  });
  record("Delegated engineer login succeeds", response.ok, `HTTP ${response.status}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  const [name, ...valueParts] = cookie.split("=");
  record("Delegated engineer login returns session cookie", Boolean(name && valueParts.length > 0), cookie ? "cookie received" : "missing cookie");
  const url = new URL(apiBaseUrl);
  await context.addCookies([{ name, value: valueParts.join("="), domain: url.hostname, path: "/", httpOnly: true, sameSite: "Lax" }]);
}

async function verifyDesktopFlow(page, seeded) {
  await page.goto(`${apiBaseUrl}/numbering/approvals`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "DVT/發行審核" }).waitFor({ timeout: 10_000 });
  const batchApiResponse = await page.request.get(`${apiBaseUrl}/api/numbering/approval-batches?scope=dvt_release&status=active&limit=50`);
  const batchApiBody = await batchApiResponse.json().catch(() => ({}));
  record("Approval batch API returns seeded batch", JSON.stringify(batchApiBody).includes(`NB-QCAPPR-${unique}`), JSON.stringify(batchApiBody).slice(0, 1000));
  try {
    await page.getByText(`NB-QCAPPR-${unique}`).first().waitFor({ timeout: 10_000 });
  } catch (error) {
    const bodyText = (await page.locator("body").textContent()) ?? "";
    record("Seeded approval batch renders in UI", false, bodyText.slice(0, 1200));
    throw error;
  }
  record("Approval review page renders desktop", (await page.getByText(`NB-QCAPPR-${unique}`).count()) >= 1);
  record("Same-project batch is visible", (await page.getByText(`QCAPPR-${unique}`).count()) >= 1);
  await page.locator("[data-approval-batch-row='true']", { hasText: `NB-QCAPPR-${unique}` }).click();
  await page.locator(".pdm-detail-drawer").waitFor({ timeout: 10_000 });
  const backdropColor = await page.locator(".pdm-detail-drawer-backdrop").evaluate((element) => getComputedStyle(element).backgroundColor);
  record("Approval detail opens as non-dark drawer", backdropColor === "rgba(0, 0, 0, 0)" || backdropColor === "transparent", backdropColor);
  record("DVT part is visible", await page.getByText(seeded.dvt.partNumber).isVisible());
  record("Release override part is visible", await page.getByText(seeded.releaseOverride.partNumber).isVisible());
  record("Proxy submission marker is visible", (await page.locator(".approval-marker-proxy").count()) >= 1);
  record("Delegated review marker is visible", (await page.locator(".approval-marker-delegated_review").count()) >= 1);
  record("Exception marker is visible", (await page.locator(".approval-marker-exception").count()) >= 1);
  record("Impact scope marker is visible", (await page.locator(".approval-marker-impact_scope").count()) >= 1);

  await page.getByLabel(`${seeded.releaseOverride.partNumber} 個別意見`).fill("QC exception item note");
  await page.getByLabel("共用意見").fill("QC shared approval comment");
  const responsePromise = page.waitForResponse((response) => response.url().includes(`/api/numbering/approval-batches/${seeded.batchId}`) && response.request().method() === "PATCH");
  await page.getByRole("button", { name: "核准選取" }).click();
  const response = await responsePromise;
  record("Batch approval PATCH succeeds", response.ok(), `HTTP ${response.status()}`);
  await page.getByRole("heading", { name: "審核結果" }).waitFor({ timeout: 10_000 });

  const state = readApprovalState(seeded);
  record("Approval batch becomes approved", state.batch?.batch_status === "approved", JSON.stringify(state.batch ?? {}));
  record("All batch items become approved", state.itemStatuses.every((item) => item.item_status === "approved"), JSON.stringify(state.itemStatuses));
  record("DVT decision uses shared comment", state.dvtDecision?.comment === "QC shared approval comment", JSON.stringify(state.dvtDecision ?? {}));
  record("Exception decision uses item-specific comment", state.releaseDecision?.comment === "QC exception item note", JSON.stringify(state.releaseDecision ?? {}));
  record("Delegated approval is recorded with manager role", state.dvtDecision?.approver_role === "rd_manager", JSON.stringify(state.dvtDecision ?? {}));
  record("Approved DVT part becomes active", state.dvtPart?.development_phase === "DVT" && state.dvtPart?.record_status === "Active", JSON.stringify(state.dvtPart ?? {}));
}

async function verifyMobileRender(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 920 } });
  const consoleErrors = [];
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await loginAsEngineer(context);
  await page.goto(`${apiBaseUrl}/numbering/approvals`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "DVT/發行審核" }).waitFor({ timeout: 10_000 });
  record("Approval review page renders mobile", await page.getByText("審核佇列").isVisible());
  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record("Approval review page avoids horizontal overflow at 390px", bodyOverflow <= 2, `${bodyOverflow}px`);
  record("No mobile browser console errors", consoleErrors.length === 0, consoleErrors.join("\n"));
  await context.close();
}

cleanupApprovalData();
const seeded = seedApprovalBatch();

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  const consoleErrors = [];
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await loginAsEngineer(context);
  await verifyDesktopFlow(page, seeded);
  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record("Approval review page avoids horizontal overflow at 1440px", bodyOverflow <= 2, `${bodyOverflow}px`);
  record("No desktop browser console errors", consoleErrors.length === 0, consoleErrors.join("\n"));
  await context.close();
  await verifyMobileRender(browser);
} finally {
  await browser.close();
  cleanupApprovalData();
}

console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      total: results.length,
      passed: results.filter((result) => result.passed).length,
      failed: results.filter((result) => !result.passed).length,
      results
    },
    null,
    2
  )
);
