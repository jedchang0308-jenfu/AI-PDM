#!/usr/bin/env node

import Database from "better-sqlite3";
import { chromium } from "playwright";
import path from "node:path";

const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://localhost:3100";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const dbPath = path.join(process.cwd(), "data", "ai-pdm.sqlite");
const unique = Date.now().toString().slice(-8);
const duplicateCoreName = `QC 領號查重 ${unique}`;
const customPartName = `QC 客製申請 ${unique}`;
const drawingPartName = `QC 同步圖號 ${unique}`;
const customSpec = "L120 x W30 x H8";
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
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

function cleanupRequestData() {
  const db = new Database(dbPath);
  try {
    const rootIds = db
      .prepare(
        `
        SELECT DISTINCT r.id
        FROM part_roots r
        LEFT JOIN part_numbers p ON p.part_root_id = r.id
        WHERE r.core_name LIKE ? OR p.part_name IN (?, ?)
      `
      )
      .all(`QC%${unique}%`, customPartName, drawingPartName)
      .map((row) => row.id);
    for (const rootId of rootIds) {
      const partIds = db.prepare("SELECT id FROM part_numbers WHERE part_root_id = ?").all(rootId).map((row) => row.id);
      const drawingIds = db.prepare("SELECT id FROM drawing_numbers WHERE part_root_id = ?").all(rootId).map((row) => row.id);
      for (const drawingId of drawingIds) db.prepare("DELETE FROM same_drawing_variants WHERE drawing_number_id = ?").run(drawingId);
      for (const partId of partIds) db.prepare("DELETE FROM same_drawing_variants WHERE part_number_id = ?").run(partId);
      for (const drawingId of drawingIds) db.prepare("DELETE FROM drawing_part_links WHERE drawing_number_id = ?").run(drawingId);
      for (const partId of partIds) db.prepare("DELETE FROM drawing_part_links WHERE part_number_id = ?").run(partId);
      db.prepare("DELETE FROM warning_events WHERE entity_id IN (?, ?, ?)").run(rootId, partIds[0] ?? "", drawingIds[0] ?? "");
      db.prepare("DELETE FROM drawing_numbers WHERE part_root_id = ?").run(rootId);
      db.prepare("DELETE FROM part_numbers WHERE part_root_id = ?").run(rootId);
      db.prepare("DELETE FROM part_roots WHERE id = ?").run(rootId);
    }
  } finally {
    db.close();
  }
}

function seedDuplicateCandidate() {
  cleanupRequestData();
  const db = new Database(dbPath);
  try {
    const now = new Date().toISOString();
    db.prepare(
      `
      INSERT INTO part_roots (
        id, root_code, core_name, item_kind, development_phase, record_status, rule_version_id, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, 'manufactured', 'EVT', 'Active', 'numbering-rule-v1', 'user-admin-demo', ?, ?)
    `
    ).run(`qc-request-duplicate-root-${unique}`, `QCR${unique}`, duplicateCoreName, now, now);
    db.prepare(
      `
      INSERT INTO part_numbers (
        id, part_root_id, part_number, sequence_no, sequence_code, part_name,
        item_kind, is_universal, development_phase, record_status, rule_version_id, created_at, updated_at
      ) VALUES (?, ?, ?, 1, '001', ?, 'manufactured', 0, 'EVT', 'Active', 'numbering-rule-v1', ?, ?)
    `
    ).run(`qc-request-duplicate-part-${unique}`, `qc-request-duplicate-root-${unique}`, `P-QCR${unique}-001`, `QC 既有領號 ${unique}`, now, now);
  } finally {
    db.close();
  }
}

function getCreatedPart(partName) {
  const db = new Database(dbPath);
  try {
    return db
      .prepare(
        `
        SELECT p.*, r.root_code, (
          SELECT COUNT(*) FROM drawing_numbers d WHERE d.part_root_id = p.part_root_id
        ) AS drawing_count
        FROM part_numbers p
        JOIN part_roots r ON r.id = p.part_root_id
        WHERE p.part_name = ?
        ORDER BY p.created_at DESC
        LIMIT 1
      `
      )
      .get(partName);
  } finally {
    db.close();
  }
}

async function verifyCustomPartBeforeDrawing(page, viewportWidth) {
  await page.locator('input:not([type="checkbox"])').nth(0).fill(duplicateCoreName);
  await page.locator("select").nth(0).selectOption("custom");
  await page.locator('input:not([type="checkbox"])').nth(1).fill("QC");
  await page.locator('input:not([type="checkbox"])').nth(2).fill(customSpec);
  await page.locator('input[type="checkbox"]').last().uncheck();
  await page.getByTestId("sequence-suggestion").waitFor({ timeout: 10_000 });
  record(`System sequence suggestion renders at ${viewportWidth}px`, await page.getByTestId("sequence-suggestion").isVisible());

  await page.waitForFunction(() => {
    const panel = document.querySelector("section.panel");
    const button = panel?.querySelector("button.secondary-button");
    return button instanceof HTMLButtonElement && !button.disabled;
  });
  const customGeneratedName = await page.locator('input:not([type="checkbox"])').nth(4).inputValue();
  record(`Suggested custom part name includes generated sequence at ${viewportWidth}px`, /_A$/.test(customGeneratedName), customGeneratedName);

  const requestPanel = page.locator("section.panel").first();
  const duplicateResponsePromise = page.waitForResponse((response) => response.url().includes("/api/numbering/duplicate-check"));
  await requestPanel.locator("button.secondary-button").first().click();
  const duplicateResponse = await duplicateResponsePromise;
  record(`Duplicate precheck succeeds at ${viewportWidth}px`, duplicateResponse.ok(), `HTTP ${duplicateResponse.status()}`);
  await page.waitForTimeout(100);
  record(`Duplicate warning renders at ${viewportWidth}px`, (await page.getByText("warning").count()) >= 1);

  const createResponsePromise = page.waitForResponse((response) => response.url().includes("/api/numbering/records") && response.request().method() === "POST");
  await requestPanel.locator("button.primary-button").click();
  const createResponse = await createResponsePromise;
  record(`Custom part-before-drawing creation succeeds at ${viewportWidth}px`, createResponse.ok(), `HTTP ${createResponse.status()}`);
  await page.waitForTimeout(100);

  const created = getCreatedPart(customGeneratedName);
  record(`Custom generated name persisted at ${viewportWidth}px`, created?.part_name === customGeneratedName, JSON.stringify(created ?? {}));
  record(`Custom specification persisted at ${viewportWidth}px`, created?.custom_specification === customSpec, JSON.stringify(created ?? {}));
  record(`Part-before-drawing persists no drawing at ${viewportWidth}px`, created?.drawing_count === 0, JSON.stringify(created ?? {}));
}

async function verifyManufacturedWithDrawing(page, viewportWidth) {
  await page.goto(`${apiBaseUrl}/numbering/request`, { waitUntil: "networkidle" });
  await page.locator('input:not([type="checkbox"])').nth(0).fill(`QC Drawing Sync ${unique} ${viewportWidth}`);
  await page.locator("select").nth(0).selectOption("manufactured");
  await page.locator("select").nth(1).selectOption("EVT");
  await page.locator('input:not([type="checkbox"])').nth(1).fill("QC");
  await page.locator('input:not([type="checkbox"])').nth(2).fill("MA");
  await page.locator('input[type="checkbox"]').last().check();
  await page.locator("select").nth(2).selectOption("MA");
  await page.getByTestId("sequence-suggestion").waitFor({ timeout: 10_000 });
  const drawingGeneratedName = await page.locator('input:not([type="checkbox"])').nth(3).inputValue();
  record(`Suggested manufactured part name includes generated sequence at ${viewportWidth}px`, /_A$/.test(drawingGeneratedName), drawingGeneratedName);

  const requestPanel = page.locator("section.panel").first();
  const createResponsePromise = page.waitForResponse((response) => response.url().includes("/api/numbering/records") && response.request().method() === "POST");
  await requestPanel.locator("button.primary-button").click();
  const createResponse = await createResponsePromise;
  record(`Manufactured part with drawing creation succeeds at ${viewportWidth}px`, createResponse.ok(), `HTTP ${createResponse.status()}`);
  await page.waitForTimeout(100);
  record(`Result includes drawing number at ${viewportWidth}px`, (await page.getByText(/D-\d{4}-MA1/).count()) >= 1);

  const created = getCreatedPart(drawingGeneratedName);
  record(`Drawing generated name persisted at ${viewportWidth}px`, created?.part_name === drawingGeneratedName, JSON.stringify(created ?? {}));
  record(`Drawing created with manufactured part at ${viewportWidth}px`, created?.drawing_count === 1, JSON.stringify(created ?? {}));
}

async function verifyViewport(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const consoleErrors = [];
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await loginAsAdmin(context);
  await page.goto(`${apiBaseUrl}/numbering/request`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "領號申請" }).waitFor({ timeout: 10_000 });
  record(`Request wizard renders at ${viewport.width}px`, await page.getByText("基本資料").isVisible());

  if (viewport.width >= 1000) {
    await verifyCustomPartBeforeDrawing(page, viewport.width);
  } else {
    await verifyManufacturedWithDrawing(page, viewport.width);
  }

  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(250);
  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record(`Request wizard avoids page-level horizontal overflow at ${viewport.width}px`, bodyOverflow <= 2, `${bodyOverflow}px`);
  record(`No browser console errors at ${viewport.width}px`, consoleErrors.length === 0, consoleErrors.join("\n"));
  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  seedDuplicateCandidate();
  await verifyViewport(browser, { width: 1440, height: 1050 });
  await verifyViewport(browser, { width: 390, height: 920 });
} finally {
  await browser.close();
  cleanupRequestData();
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
