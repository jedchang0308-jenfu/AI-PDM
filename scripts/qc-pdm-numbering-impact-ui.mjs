#!/usr/bin/env node

import Database from "better-sqlite3";
import { chromium } from "playwright";
import path from "node:path";

const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3100";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const dbPath = path.join(process.cwd(), "data", "ai-pdm.sqlite");
const unique = Date.now().toString().slice(-8);
const rootCode = `QCI${unique}`;
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

function cleanupImpactData() {
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
    db.prepare("DELETE FROM drawing_numbers WHERE part_root_id = ?").run(root.id);
    db.prepare("DELETE FROM part_numbers WHERE part_root_id = ?").run(root.id);
    db.prepare("DELETE FROM part_roots WHERE id = ?").run(root.id);
  } finally {
    db.close();
  }
}

function seedImpactData() {
  cleanupImpactData();
  const db = new Database(dbPath);
  try {
    const now = new Date().toISOString();
    db.prepare(
      `
      INSERT INTO part_roots (
        id, root_code, core_name, item_kind, development_phase, record_status, rule_version_id, created_by, created_at, updated_at
      ) VALUES (?, ?, 'QC MA impact root', 'manufactured', 'DVT', 'Active', 'numbering-rule-v1', 'user-admin-demo', ?, ?)
    `
    ).run(`qc-impact-root-${unique}`, rootCode, now, now);
    for (const [id, partNumber, partName, status, sequenceNo] of [
      [`qc-impact-part-a-${unique}`, partNumberA, "QC 影響主件", "Active", 1],
      [`qc-impact-part-b-${unique}`, partNumberB, "QC 影響同圖件", "Released", 2]
    ]) {
      db.prepare(
        `
        INSERT INTO part_numbers (
          id, part_root_id, part_number, sequence_no, sequence_code, part_name,
          item_kind, is_universal, development_phase, record_status, rule_version_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'manufactured', 0, 'DVT', ?, 'numbering-rule-v1', ?, ?)
      `
      ).run(id, `qc-impact-root-${unique}`, partNumber, sequenceNo, String(sequenceNo).padStart(3, "0"), partName, status, now, now);
    }
    db.prepare(
      `
      INSERT INTO drawing_numbers (
        id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no,
        is_primary_manufacturing, development_phase, record_status, rule_version_id, created_at, updated_at
      ) VALUES (?, ?, ?, 'MA', 'QC 影響製造圖', 1, 1, 'DVT', 'Released', 'numbering-rule-v1', ?, ?)
    `
    ).run(`qc-impact-drawing-${unique}`, `qc-impact-root-${unique}`, drawingNumber, now, now);
    for (const [id, partId] of [
      [`qc-impact-link-a-${unique}`, `qc-impact-part-a-${unique}`],
      [`qc-impact-link-b-${unique}`, `qc-impact-part-b-${unique}`]
    ]) {
      db.prepare(
        "INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_at) VALUES (?, ?, ?, 'primary_manufacturing', ?)"
      ).run(id, `qc-impact-drawing-${unique}`, partId, now);
    }
  } finally {
    db.close();
  }
}

function invalidationApplied() {
  const db = new Database(dbPath);
  try {
    const row = db
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM part_numbers
        WHERE part_root_id = ? AND record_status = 'MainDrawingInvalid'
      `
      )
      .get(`qc-impact-root-${unique}`);
    return row.count === 2;
  } finally {
    db.close();
  }
}

async function verifyViewport(browser, viewport) {
  seedImpactData();
  const context = await browser.newContext({ viewport });
  const consoleErrors = [];
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await loginAsAdmin(context);
  await page.goto(`${apiBaseUrl}/numbering/impact`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "MA 圖影響" }).waitFor({ timeout: 10_000 });
  record(`Impact page renders at ${viewport.width}px`, await page.getByText("影響範圍查詢").isVisible());

  await page.getByLabel("MA 圖號").fill(drawingNumber);
  await page.getByLabel("作廢原因").fill(`QC impact validation ${viewport.width}`);
  const analyzeResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/numbering/impact-analysis") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "分析影響" }).click();
  const analyzeResponse = await analyzeResponsePromise;
  record(`Impact analysis API succeeds at ${viewport.width}px`, analyzeResponse.ok(), `HTTP ${analyzeResponse.status()}`);
  await page.getByRole("heading", { name: "受影響料號" }).waitFor({ timeout: 10_000 });
  record(`Affected active part renders at ${viewport.width}px`, await page.getByText(partNumberA).isVisible());
  record(`Affected released part renders at ${viewport.width}px`, await page.getByText(partNumberB).isVisible());
  record(`Revision task list renders at ${viewport.width}px`, (await page.getByText("Released PDF package").count()) >= 1);
  record(`Warning markers render at ${viewport.width}px`, (await page.locator(".impact-warning-marker").count()) >= 2);

  await page.getByLabel("已確認影響料號、文件進版待辦與作廢原因").check();
  const applyResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/numbering/impact-analysis") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "套用失效" }).click();
  const applyResponse = await applyResponsePromise;
  record(`Apply invalidation succeeds at ${viewport.width}px`, applyResponse.ok(), `HTTP ${applyResponse.status()}`);
  await page.getByText("已套用失效").waitFor({ timeout: 10_000 });
  record(`Database marks affected parts invalid at ${viewport.width}px`, invalidationApplied());

  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record(`Impact page avoids page-level horizontal overflow at ${viewport.width}px`, bodyOverflow <= 2, `${bodyOverflow}px`);
  record(`No browser console errors at ${viewport.width}px`, consoleErrors.length === 0, consoleErrors.join("\n"));
  await context.close();
  cleanupImpactData();
}

const browser = await chromium.launch({ headless: true });
try {
  await verifyViewport(browser, { width: 1440, height: 1050 });
  await verifyViewport(browser, { width: 390, height: 920 });
} finally {
  await browser.close();
  cleanupImpactData();
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
