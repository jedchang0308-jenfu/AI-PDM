#!/usr/bin/env node

import Database from "better-sqlite3";
import { chromium } from "playwright";
import path from "node:path";

const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://localhost:3100";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const dbPath = path.join(process.cwd(), "data", "ai-pdm.sqlite");
const unique = Date.now().toString().slice(-8);
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function openDb() {
  return new Database(dbPath);
}

function cleanupDvtData() {
  const db = openDb();
  try {
    const roots = db.prepare("SELECT id FROM part_roots WHERE root_code LIKE ?").all(`QCDVT${unique}%`);
    const rootIds = roots.map((row) => row.id);
    if (rootIds.length === 0) return;
    const placeholders = rootIds.map(() => "?").join(",");
    const partIds = db.prepare(`SELECT id FROM part_numbers WHERE part_root_id IN (${placeholders})`).all(...rootIds).map((row) => row.id);
    const drawingIds = db.prepare(`SELECT id FROM drawing_numbers WHERE part_root_id IN (${placeholders})`).all(...rootIds).map((row) => row.id);
    const entityIds = [...rootIds, ...partIds, ...drawingIds];
    if (partIds.length > 0) {
      const partPlaceholders = partIds.map(() => "?").join(",");
      const requestIds = db.prepare(`SELECT id FROM approval_requests WHERE entity_id IN (${partPlaceholders})`).all(...partIds).map((row) => row.id);
      if (requestIds.length > 0) {
        const requestPlaceholders = requestIds.map(() => "?").join(",");
        const batchIds = db.prepare(`SELECT DISTINCT batch_id FROM approval_batch_items WHERE approval_request_id IN (${requestPlaceholders})`).all(...requestIds).map((row) => row.batch_id);
        db.prepare(`DELETE FROM approval_batch_items WHERE approval_request_id IN (${requestPlaceholders})`).run(...requestIds);
        db.prepare(`DELETE FROM approval_requests WHERE id IN (${requestPlaceholders})`).run(...requestIds);
        if (batchIds.length > 0) {
          const batchPlaceholders = batchIds.map(() => "?").join(",");
          db.prepare(`DELETE FROM approval_batches WHERE id IN (${batchPlaceholders})`).run(...batchIds);
        }
      }
    }
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
    db.prepare(`DELETE FROM drawing_numbers WHERE part_root_id IN (${placeholders})`).run(...rootIds);
    db.prepare(`DELETE FROM part_numbers WHERE part_root_id IN (${placeholders})`).run(...rootIds);
    db.prepare(`DELETE FROM part_roots WHERE id IN (${placeholders})`).run(...rootIds);
  } finally {
    db.close();
  }
}

function seedDvtPart(suffix, { itemKind = "manufactured", withMa = false, partName = "" } = {}) {
  const db = openDb();
  try {
    const now = new Date().toISOString();
    const rootCode = `QCDVT${unique}${suffix}`;
    const rootId = `qc-dvt-root-${unique}-${suffix}`;
    const partId = `qc-dvt-part-${unique}-${suffix}`;
    const partNumber = `P-${rootCode}-001`;
    db.prepare(
      `
      INSERT INTO part_roots (
        id, root_code, core_name, item_kind, development_phase, record_status, rule_version_id, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'EVT', 'Draft', 'numbering-rule-v1', 'user-admin-demo', ?, ?)
    `
    ).run(rootId, rootCode, `QC DVT ${suffix} ${unique}`, itemKind, now, now);
    db.prepare(
      `
      INSERT INTO part_numbers (
        id, part_root_id, part_number, sequence_no, sequence_code, part_name,
        item_kind, is_universal, development_phase, record_status, rule_version_id, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, 1, '001', ?, ?, 0, 'EVT', 'Draft', 'numbering-rule-v1', 'user-admin-demo', ?, ?)
    `
    ).run(partId, rootId, partNumber, partName || `QC DVT ${suffix} part`, itemKind, now, now);
    let drawingNumber = null;
    if (withMa) {
      const drawingId = `qc-dvt-drawing-${unique}-${suffix}`;
      drawingNumber = `D-${rootCode}-MA1`;
      db.prepare(
        `
        INSERT INTO drawing_numbers (
          id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no,
          is_primary_manufacturing, development_phase, record_status, rule_version_id, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, 'MA', 'Manufacturing drawing', 1, 1, 'EVT', 'Draft', 'numbering-rule-v1', 'user-admin-demo', ?, ?)
      `
      ).run(drawingId, rootId, drawingNumber, now, now);
      db.prepare(
        `
        INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by, created_at)
        VALUES (?, ?, ?, 'primary_manufacturing', 'user-admin-demo', ?)
      `
      ).run(`qc-dvt-link-${unique}-${suffix}`, drawingId, partId, now);
    }
    return { rootCode, partNumber, drawingNumber };
  } finally {
    db.close();
  }
}

function getPart(partNumber) {
  const db = openDb();
  try {
    return db
      .prepare(
        `
        SELECT p.*, r.root_code
        FROM part_numbers p
        JOIN part_roots r ON r.id = p.part_root_id
        WHERE p.part_number = ?
      `
      )
      .get(partNumber);
  } finally {
    db.close();
  }
}

function countDvtApprovalRequests(partNumber) {
  const db = openDb();
  try {
    return db
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM approval_requests ar
        JOIN part_numbers p ON p.id = ar.entity_id
        WHERE p.part_number = ?
          AND ar.action_code = 'dvt_promotion'
      `
      )
      .get(partNumber).count;
  } finally {
    db.close();
  }
}

async function loginAsAdmin(context) {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password })
  });
  record("Admin login succeeds", response.ok, `HTTP ${response.status}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  const [name, ...valueParts] = cookie.split("=");
  record("Admin login returns session cookie", Boolean(name && valueParts.length > 0), cookie ? "cookie received" : "missing cookie");
  const url = new URL(apiBaseUrl);
  await context.addCookies([{ name, value: valueParts.join("="), domain: url.hostname, path: "/", httpOnly: true, sameSite: "Lax" }]);
}

async function verifyDesktopFlow(page, seeded) {
  await page.goto(`${apiBaseUrl}/numbering/dvt`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "階段晉升：EVT → DVT" }).waitFor({ timeout: 10_000 });
  record("DVT promotion page renders desktop", await page.getByText(seeded.ready.partNumber).isVisible());
  record("Ready candidate is classified", (await page.getByText("可送審").count()) >= 1);
  record("Incomplete candidate is classified", (await page.getByText("待補/Override").count()) >= 1);
  const missingRow = page.locator("tr").filter({ hasText: seeded.incomplete.partNumber });
  record("Missing MA next step is visible", await missingRow.getByText(/需補：.*MA|主要 MA/).first().isVisible());
  record("Missing MA recovery tells user what to do", await missingRow.getByText("現在請回圖號模組指定主要 MA 圖，再回來送 DVT。").isVisible());

  const batchResponsePromise = page.waitForResponse((response) => response.url().includes("/api/numbering/dvt-candidates") && response.request().method() === "POST");
  await page.getByRole("button", { name: "批次送審 DVT 階段" }).click();
  const batchResponse = await batchResponsePromise;
  record("Batch DVT submission succeeds", batchResponse.ok(), `HTTP ${batchResponse.status()}`);
  await page.getByRole("heading", { name: "處理結果" }).waitFor({ timeout: 10_000 });

  const readyPart = getPart(seeded.ready.partNumber);
  const incompletePart = getPart(seeded.incomplete.partNumber);
  record("Ready part moved to DVT PendingReview", readyPart?.development_phase === "DVT" && readyPart?.record_status === "PendingReview", JSON.stringify(readyPart ?? {}));
  record("DVT approval request created", countDvtApprovalRequests(seeded.ready.partNumber) === 1);
  record("Incomplete part remains EVT Draft", incompletePart?.development_phase === "EVT" && incompletePart?.record_status === "Draft", JSON.stringify(incompletePart ?? {}));

  const incompleteRow = page.locator("tr").filter({ hasText: seeded.incomplete.partNumber });
  await incompleteRow.locator("select").selectOption("disable_evt");
  await incompleteRow.getByLabel(`${seeded.incomplete.partNumber} 原因`).fill("QC EVT stop");
  const disableResponsePromise = page.waitForResponse((response) => response.url().includes("/api/numbering/dvt-candidates") && response.request().method() === "POST");
  await incompleteRow.getByRole("button", { name: "套用" }).click();
  const disableResponse = await disableResponsePromise;
  record("EVT disable action succeeds", disableResponse.ok(), `HTTP ${disableResponse.status()}`);
  const disabledPart = getPart(seeded.incomplete.partNumber);
  record("Incomplete part moved to EVTDisabled", disabledPart?.record_status === "EVTDisabled", JSON.stringify(disabledPart ?? {}));
}

async function verifyDirectActions(page, seeded) {
  const keepResponse = await page.request.post(`${apiBaseUrl}/api/numbering/dvt-candidates`, {
    data: { decisions: [{ partNumber: seeded.keep.partNumber, action: "keep_evt", reason: "QC keep EVT" }] }
  });
  record("Keep EVT API action succeeds", keepResponse.ok(), `HTTP ${keepResponse.status()}`);
  const keptPart = getPart(seeded.keep.partNumber);
  record("Keep EVT preserves phase and status", keptPart?.development_phase === "EVT" && keptPart?.record_status === "Draft", JSON.stringify(keptPart ?? {}));

  const obsoleteResponse = await page.request.post(`${apiBaseUrl}/api/numbering/dvt-candidates`, {
    data: { decisions: [{ partNumber: seeded.obsolete.partNumber, action: "obsolete", reason: "QC obsolete" }] }
  });
  record("Obsolete API action succeeds", obsoleteResponse.ok(), `HTTP ${obsoleteResponse.status()}`);
  const obsoletePart = getPart(seeded.obsolete.partNumber);
  record("Obsolete action updates record status", obsoletePart?.record_status === "Obsolete", JSON.stringify(obsoletePart ?? {}));
}

async function verifyMobileRender(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 920 } });
  const consoleErrors = [];
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await loginAsAdmin(context);
  await page.goto(`${apiBaseUrl}/numbering/dvt`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "階段晉升：EVT → DVT" }).waitFor({ timeout: 10_000 });
  record("DVT promotion page renders mobile", await page.getByText("晉升概況").isVisible());
  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record("DVT promotion page avoids horizontal overflow at 390px", bodyOverflow <= 2, `${bodyOverflow}px`);
  record("No mobile browser console errors", consoleErrors.length === 0, consoleErrors.join("\n"));
  await context.close();
}

cleanupDvtData();
const seeded = {
  ready: seedDvtPart("READY", { withMa: true, partName: `QC DVT ready ${unique}` }),
  incomplete: seedDvtPart("MISS", { withMa: false, partName: `QC DVT missing MA ${unique}` })
};

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  const consoleErrors = [];
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await loginAsAdmin(context);
  await verifyDesktopFlow(page, seeded);
  seeded.keep = seedDvtPart("KEEP", { itemKind: "purchased", partName: `QC DVT keep ${unique}` });
  seeded.obsolete = seedDvtPart("OBS", { itemKind: "purchased", partName: `QC DVT obsolete ${unique}` });
  await verifyDirectActions(page, seeded);
  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record("DVT promotion page avoids horizontal overflow at 1440px", bodyOverflow <= 2, `${bodyOverflow}px`);
  record("No desktop browser console errors", consoleErrors.length === 0, consoleErrors.join("\n"));
  await context.close();
  await verifyMobileRender(browser);
} finally {
  await browser.close();
  cleanupDvtData();
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
