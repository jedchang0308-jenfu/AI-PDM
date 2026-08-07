#!/usr/bin/env node

import Database from "better-sqlite3";
import { chromium } from "playwright";
import { assertNumberingQcRuntimeIsIsolated } from "./numbering-qc-runtime-guard.mjs";

const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://localhost:3000";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const { dbPath } = assertNumberingQcRuntimeIsIsolated({ scriptName: "qc-pdm-numbering-search-ui" });
const unique = Date.now().toString().slice(-8);
const rootCode = `QCS${unique}`;
const partNumberA = `P-${rootCode}-001`;
const partNumberB = `P-${rootCode}-002`;
const drawingNumber = `D-${rootCode}-MA1`;
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

function cleanupSearchData() {
  const db = new Database(dbPath);
  try {
    const root = db.prepare("SELECT id FROM part_roots WHERE root_code = ?").get(rootCode);
    if (!root) return;
    const partIds = db.prepare("SELECT id FROM part_numbers WHERE part_root_id = ?").all(root.id).map((row) => row.id);
    const drawingIds = db.prepare("SELECT id FROM drawing_numbers WHERE part_root_id = ?").all(root.id).map((row) => row.id);
    for (const drawingId of drawingIds) db.prepare("DELETE FROM same_drawing_variants WHERE drawing_number_id = ?").run(drawingId);
    for (const partId of partIds) db.prepare("DELETE FROM same_drawing_variants WHERE part_number_id = ?").run(partId);
    for (const drawingId of drawingIds) db.prepare("DELETE FROM drawing_part_links WHERE drawing_number_id = ?").run(drawingId);
    for (const partId of partIds) db.prepare("DELETE FROM drawing_part_links WHERE part_number_id = ?").run(partId);
    const warningEntityIds = [root.id, ...partIds, ...drawingIds];
    if (warningEntityIds.length > 0) {
      db.prepare(`DELETE FROM warning_events WHERE entity_id IN (${warningEntityIds.map(() => "?").join(", ")})`).run(...warningEntityIds);
    }
    db.prepare("DELETE FROM drawing_numbers WHERE part_root_id = ?").run(root.id);
    db.prepare("DELETE FROM part_numbers WHERE part_root_id = ?").run(root.id);
    db.prepare("DELETE FROM part_roots WHERE id = ?").run(root.id);
  } finally {
    db.close();
  }
}

function seedSearchData() {
  cleanupSearchData();
  const db = new Database(dbPath);
  try {
    const now = new Date().toISOString();
    db.prepare(
      `
      INSERT INTO part_roots (
        id, root_code, core_name, item_kind, record_status, rule_version_id, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, 'manufactured', 'Active', 'numbering-rule-v2', 'user-engineer-demo', ?, ?)
    `
    ).run(`qc-search-root-${unique}`, rootCode, "QC 查詢支架", now, now);
    db.prepare(
      `
      INSERT INTO part_numbers (
        id, part_root_id, part_number, sequence_no, sequence_code, part_name,
        item_kind, is_universal, record_status, rule_version_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'manufactured', 0, ?, 'numbering-rule-v2', ?, ?)
    `
    ).run(`qc-search-part-a-${unique}`, `qc-search-root-${unique}`, partNumberA, 1, "001", "QC 查詢主件", "Active", now, now);
    db.prepare(
      `
      INSERT INTO part_numbers (
        id, part_root_id, part_number, sequence_no, sequence_code, part_name,
        item_kind, is_universal, record_status, rule_version_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'manufactured', 0, ?, 'numbering-rule-v2', ?, ?)
    `
    ).run(`qc-search-part-b-${unique}`, `qc-search-root-${unique}`, partNumberB, 2, "002", "QC 查詢同圖件", "MainDrawingInvalid", now, now);
    db.prepare(
      `
      INSERT INTO drawing_numbers (
        id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no,
        is_primary_manufacturing, record_status, rule_version_id, created_at, updated_at
      ) VALUES (?, ?, ?, 'MA', 'QC 製造用圖', 1, 1, 'Released', 'numbering-rule-v2', ?, ?)
    `
    ).run(`qc-search-drawing-${unique}`, `qc-search-root-${unique}`, drawingNumber, now, now);
    for (const [id, partId] of [
      [`qc-search-link-a-${unique}`, `qc-search-part-a-${unique}`],
      [`qc-search-link-b-${unique}`, `qc-search-part-b-${unique}`]
    ]) {
      db.prepare(
        "INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_at) VALUES (?, ?, ?, 'primary_manufacturing', ?)"
      ).run(id, `qc-search-drawing-${unique}`, partId, now);
    }
    db.prepare(
      "INSERT INTO same_drawing_variants (id, drawing_number_id, part_number_id, field_name, field_value, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(`qc-search-variant-${unique}`, `qc-search-drawing-${unique}`, `qc-search-part-b-${unique}`, "尺寸", "客製高度", now);
    db.prepare(
      `
      INSERT INTO warning_events (
        id, warning_code, severity, entity_type, entity_id, title, message, detail_json, created_at
      ) VALUES (?, 'HIGH_SIMILARITY_NUMBERING', 'warning', 'part_number', ?, 'High similarity', 'warning only', '{}', ?)
    `
    ).run(`qc-search-warning-${unique}`, `qc-search-part-b-${unique}`, now);
    db.prepare(
      "INSERT INTO audit_logs (id, actor_id, action, detail_json, created_at) VALUES (?, 'user-engineer-demo', 'numbering.create', ?, ?)"
    ).run(`qc-search-audit-${unique}`, JSON.stringify({ rootCode, partNumber: partNumberA, drawingNumber }), now);
  } finally {
    db.close();
  }
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
  await page.goto(`${apiBaseUrl}/numbering/search`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "圖料模組" }).waitFor({ timeout: 10_000 });
  await page.locator(".pdm-master-toolbar").waitFor({ timeout: 10_000 });
  record(`Search page renders at ${viewport.width}px`, await page.locator(".pdm-master-toolbar").isVisible());
  record(`Relation view switch renders at ${viewport.width}px`, await page.getByRole("tab", { name: "關係樹" }).isVisible());

  await page.getByLabel("關鍵字").fill(rootCode);
  await page.getByRole("button", { name: "查詢", exact: true }).click();
  await page.getByText(partNumberA).first().waitFor({ timeout: 10_000 });
  record(`Root renders once in relation view at ${viewport.width}px`, (await page.locator(".pdm-relation-root", { hasText: rootCode }).count()) === 1);
  record(`Part number result renders at ${viewport.width}px`, await page.getByText(partNumberA).first().isVisible());
  record(`Drawing number result renders at ${viewport.width}px`, await page.getByText(drawingNumber).first().isVisible());

  await page.locator(".pdm-relation-root-header", { hasText: rootCode }).first().click();
  await page.getByRole("heading", { name: `主根明細 ${rootCode}` }).waitFor({ timeout: 10_000 });
  record(`Root detail opens at ${viewport.width}px`, await page.getByText("QC 查詢同圖件").first().isVisible());
  record(`Warning markers render at ${viewport.width}px`, (await page.locator(".search-warning-marker").count()) >= 1);

  const impactResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/numbering/impact-analysis") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "影響範圍" }).click();
  const impactResponse = await impactResponsePromise;
  record(`Impact analysis API succeeds at ${viewport.width}px`, impactResponse.ok(), `HTTP ${impactResponse.status()}`);
  await page.getByRole("heading", { name: "製造圖作廢影響" }).waitFor({ timeout: 10_000 });
  record(`Impact panel shows affected part at ${viewport.width}px`, await page.getByText(partNumberB).first().isVisible());

  await page.keyboard.press("Escape");
  await page.locator(".pdm-detail-drawer").waitFor({ state: "hidden", timeout: 10_000 });
  record(`Search detail drawer closes before changing filters at ${viewport.width}px`, await page.locator(".pdm-detail-drawer").count() === 0);

  await page.getByLabel("類型").selectOption("drawing_number");
  await page.getByRole("button", { name: "查詢", exact: true }).click();
  await page.getByText(drawingNumber).first().waitFor({ timeout: 10_000 });
  record(`Drawing filter keeps drawing relation result at ${viewport.width}px`, await page.locator(".pdm-relation-root", { hasText: drawingNumber }).first().isVisible());

  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record(`Search page avoids page-level horizontal overflow at ${viewport.width}px`, bodyOverflow <= 2, `${bodyOverflow}px`);
  record(`No browser console errors at ${viewport.width}px`, consoleErrors.length === 0, consoleErrors.join("\n"));
  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  seedSearchData();
  await verifyViewport(browser, { width: 1440, height: 1050 });
  await verifyViewport(browser, { width: 390, height: 920 });
} finally {
  await browser.close();
  cleanupSearchData();
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
