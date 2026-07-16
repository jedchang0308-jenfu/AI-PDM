#!/usr/bin/env node

import Database from "better-sqlite3";
import { chromium } from "playwright";
import { assertNumberingQcRuntimeIsIsolated } from "./numbering-qc-runtime-guard.mjs";

const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://localhost:3100";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const { dbPath } = assertNumberingQcRuntimeIsIsolated({ scriptName: "qc-pdm-numbering-request-ui" });
const unique = Date.now().toString().slice(-8);
const duplicateCoreName = `QC 領號查重 ${unique}`;
const customRootName = `QC 客製申請 ${unique}`;
const drawingRootName = `QC 同步圖號 ${unique}`;
const customSpec = "L120 x W30 x H8";
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (process.env.PDM_QC_PROGRESS === "true") {
    console.error(`[qc-pdm-numbering-request-ui] ${passed ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
  }
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function loginAsManager(context) {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "manager@example.com", password })
  });
  record("Manager login succeeds", response.ok, `HTTP ${response.status}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  const [name, ...valueParts] = cookie.split("=");
  record("Manager login returns session cookie", Boolean(name && valueParts.length > 0), cookie ? "cookie received" : "missing cookie");
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
      .all(`QC%${unique}%`, customRootName, drawingRootName)
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
      ) VALUES (?, ?, ?, 'manufactured', 'EVT', 'Active', 'numbering-rule-v1', 'user-manager-demo', ?, ?)
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
        SELECT p.*, r.root_code, r.core_name, (
          SELECT COUNT(*) FROM drawing_numbers d WHERE d.part_root_id = p.part_root_id
        ) AS drawing_count, (
          SELECT d.drawing_number FROM drawing_numbers d WHERE d.part_root_id = p.part_root_id ORDER BY d.sequence_no LIMIT 1
        ) AS drawing_number
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

async function verifyNumberingResultDetailLinks(page, viewportWidth, created) {
  await page.getByRole("heading", { name: "領號結果" }).waitFor({ timeout: 10_000 });
  const resultPanel = page.locator("section.numbering-request-success").filter({ has: page.getByRole("heading", { name: "領號結果" }) }).last();
  const detailLinks = resultPanel.getByRole("link", { name: "明細" });
  record(`Result shows three detail links beside generated numbers at ${viewportWidth}px`, (await detailLinks.count()) === 3, `${await detailLinks.count()} links`);
  record(`Duplicate lifecycle block is removed from result at ${viewportWidth}px`, (await page.getByText("這張圖料現在在哪一步").count()) === 0);
  record(`Result actions block is removed at ${viewportWidth}px`, (await page.getByText("Actions").count()) === 0);

  const hrefs = await detailLinks.evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  const [rootHref, partHref, drawingHref] = hrefs;
  record(`Root detail link targets search detail at ${viewportWidth}px`, rootHref.includes(`/numbering/search?`) && rootHref.includes(`detail=${encodeURIComponent(created.root_code)}`), rootHref);
  record(`Part detail link targets part module detail at ${viewportWidth}px`, partHref.includes(`/parts?`) && partHref.includes(`detail=${encodeURIComponent(created.part_number)}`), partHref);
  record(`Drawing detail link targets drawing module detail at ${viewportWidth}px`, drawingHref.includes(`/numbering/drawings?`) && drawingHref.includes(`detail=${encodeURIComponent(created.drawing_number)}`), drawingHref);

  await page.goto(new URL(rootHref, apiBaseUrl).toString(), { waitUntil: "networkidle" });
  await page.getByRole("dialog", { name: "圖料明細" }).waitFor({ timeout: 10_000 });
  record(`Root detail link opens root detail drawer at ${viewportWidth}px`, await page.getByRole("dialog", { name: "圖料明細" }).isVisible());
  record(`Root detail drawer shows created root at ${viewportWidth}px`, (await page.getByText(created.root_code, { exact: true }).count()) >= 1, created.root_code);

  await page.goto(new URL(partHref, apiBaseUrl).toString(), { waitUntil: "networkidle" });
  await page.getByRole("dialog", { name: "料號明細" }).waitFor({ timeout: 10_000 });
  record(`Part detail link opens part detail drawer at ${viewportWidth}px`, await page.getByRole("dialog", { name: "料號明細" }).isVisible());
  record(`Part detail drawer shows created part at ${viewportWidth}px`, (await page.getByText(created.part_number, { exact: true }).count()) >= 1, created.part_number);

  await page.goto(new URL(drawingHref, apiBaseUrl).toString(), { waitUntil: "networkidle" });
  await page.getByRole("dialog", { name: "圖號治理明細" }).waitFor({ timeout: 10_000 });
  record(`Drawing detail link opens drawing detail drawer at ${viewportWidth}px`, await page.getByRole("dialog", { name: "圖號治理明細" }).isVisible());
  record(`Drawing detail drawer shows created drawing at ${viewportWidth}px`, (await page.getByText(created.drawing_number, { exact: true }).count()) >= 1, created.drawing_number);
}

async function verifyBrowserRestoredRootNameLock(context, viewportWidth) {
  const page = await context.newPage();
  await page.goto(`${apiBaseUrl}/numbering/request`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "建立圖料號" }).waitFor({ timeout: 10_000 });
  await page.getByLabel(/產品／零件名稱/).evaluate((input) => {
    if (input instanceof HTMLInputElement) input.value = "馬達";
  });
  await page.waitForFunction(() => document.body.innerText.includes("料號品名") && document.body.innerText.includes("馬達"));
  record(`Browser-restored root name locks part name at ${viewportWidth}px`, (await page.getByText("馬達", { exact: true }).count()) >= 1);
  record(`Editable part-name field is absent at ${viewportWidth}px`, (await page.getByText("品名（系統建議，可微調）").count()) === 0);
  await page.close();
}

async function verifyCustomPartBeforeDrawing(page, viewportWidth) {
  await page.getByRole("button", { name: "只建立料號", exact: true }).click();
  const duplicateResponsePromise = page.waitForResponse((response) => response.url().includes("/api/numbering/duplicate-check"));
  await page.getByLabel(/產品／零件名稱/).fill(customRootName);
  await page.getByLabel("料件類型").selectOption("custom");
  await page.getByLabel(/客製尺寸／規格/).fill(customSpec);
  record(`Part name sequence suggestion is removed at ${viewportWidth}px`, (await page.getByTestId("sequence-suggestion").count()) === 0);

  const requestPanel = page.locator(".numbering-request-page");
  record(`Root-locked part name is visible at ${viewportWidth}px`, (await page.getByText(customRootName).count()) >= 1, customRootName);

  const duplicateResponse = await duplicateResponsePromise;
  record(`Duplicate precheck succeeds at ${viewportWidth}px`, duplicateResponse.ok(), `HTTP ${duplicateResponse.status()}`);
  await page.getByRole("heading", { name: "查重結果" }).waitFor({ timeout: 10_000 });
  const duplicateBadges = await page.getByText(/阻擋|注意|可建立/).count();
  record(`Duplicate result renders at ${viewportWidth}px`, duplicateBadges >= 1, `${duplicateBadges} status badges`);

  const createResponsePromise = page.waitForResponse((response) => response.url().includes("/api/numbering/records") && response.request().method() === "POST");
  await requestPanel.getByRole("button", { name: "建立料號草稿" }).click();
  const createResponse = await createResponsePromise;
  record(`Custom part-before-drawing creation succeeds at ${viewportWidth}px`, createResponse.ok(), `HTTP ${createResponse.status()}`);
  await page.waitForTimeout(100);

  const created = getCreatedPart(customRootName);
  record(`Custom part name follows root name at ${viewportWidth}px`, created?.part_name === customRootName, JSON.stringify(created ?? {}));
  record(`Custom root name matches part name at ${viewportWidth}px`, created?.core_name === customRootName, JSON.stringify(created ?? {}));
  record(`Custom specification persisted at ${viewportWidth}px`, created?.custom_specification === customSpec, JSON.stringify(created ?? {}));
  record(`Part-before-drawing persists no drawing at ${viewportWidth}px`, created?.drawing_count === 0, JSON.stringify(created ?? {}));
}

async function verifyManufacturedWithDrawing(page, viewportWidth) {
  await page.goto(`${apiBaseUrl}/numbering/request`, { waitUntil: "networkidle" });
  record(`Initial phase is locked to EVT at ${viewportWidth}px`, (await page.getByTestId("initial-development-phase").innerText()).includes("EVT"));
  const rootName = `${drawingRootName} ${viewportWidth}`;
  const duplicateResponsePromise = page.waitForResponse((response) => response.url().includes("/api/numbering/duplicate-check"));
  await page.getByLabel(/產品／零件名稱/).fill(rootName);
  await page.getByLabel("料件類型").selectOption("manufactured");
  await page.getByRole("button", { name: /料號＋製造圖/ }).click();
  await page.getByLabel("圖面用途").selectOption("M");
  record(`Manufactured part name follows visible root name at ${viewportWidth}px`, (await page.getByText(rootName).count()) >= 1, rootName);

  const duplicateResponse = await duplicateResponsePromise;
  record(`Automatic duplicate precheck succeeds at ${viewportWidth}px`, duplicateResponse.ok(), `HTTP ${duplicateResponse.status()}`);
  const requestPanel = page.locator(".numbering-request-page");
  const createResponsePromise = page.waitForResponse((response) => response.url().includes("/api/numbering/records") && response.request().method() === "POST");
  await requestPanel.getByRole("button", { name: "建立料號與製造圖草稿" }).click();
  const createResponse = await createResponsePromise;
  record(`Manufactured part with drawing creation succeeds at ${viewportWidth}px`, createResponse.ok(), `HTTP ${createResponse.status()}`);
  await page.waitForTimeout(100);
  record(`Result includes compact drawing number at ${viewportWidth}px`, (await page.getByText(/(?:[A-Z]\d{4}|\d{5})-M\d{2}/).count()) >= 1);

  const created = getCreatedPart(rootName);
  record(`Drawing part name follows root name at ${viewportWidth}px`, created?.part_name === rootName, JSON.stringify(created ?? {}));
  record(`Drawing root name matches part name at ${viewportWidth}px`, created?.core_name === rootName, JSON.stringify(created ?? {}));
  record(`New numbering persists EVT initial phase at ${viewportWidth}px`, created?.development_phase === "EVT", JSON.stringify(created ?? {}));
  record(`Drawing created with manufactured part at ${viewportWidth}px`, created?.drawing_count === 1, JSON.stringify(created ?? {}));
  record(`Drawing number is available for result detail link validation at ${viewportWidth}px`, Boolean(created?.drawing_number), JSON.stringify(created ?? {}));
  await verifyNumberingResultDetailLinks(page, viewportWidth, created);
}

async function verifyViewport(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const consoleErrors = [];
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await loginAsManager(context);
  await verifyBrowserRestoredRootNameLock(context, viewport.width);
  await page.goto(`${apiBaseUrl}/numbering/request`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "建立圖料號" }).waitFor({ timeout: 10_000 });
  record(`Request wizard renders at ${viewport.width}px`, await page.getByRole("heading", { name: "這次要做什麼" }).isVisible());
  record(`Request wizard omits redundant workflow strip at ${viewport.width}px`, (await page.getByText("領號流程").count()) === 0);
  record(`Request wizard omits redundant lifecycle guidance at ${viewport.width}px`, (await page.getByText("需求與領號").count()) === 0);

  record(`Request wizard shows locked EVT initial phase at ${viewport.width}px`, (await page.getByTestId("initial-development-phase").innerText()).includes("EVT"));

  if (viewport.width >= 1000) {
    await verifyCustomPartBeforeDrawing(page, viewport.width);
    await verifyManufacturedWithDrawing(page, viewport.width);
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
