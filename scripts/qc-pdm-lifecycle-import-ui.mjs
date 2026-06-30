#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const screenshotPath = path.join(root, "output", "playwright", "pdm-lifecycle-import-batches-deleted-fixture.png");
const checks = [];

function record(name, passed, detail = "") {
  checks.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function jsonResponse(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(body)
  });
}

async function isAppReady(baseUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(`${baseUrl}/login`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function login(baseUrl) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password })
  });
  record("admin login succeeds", response.ok, `HTTP ${response.status}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  const [name, ...valueParts] = cookie.split("=");
  record("admin login returns session cookie", Boolean(name && valueParts.length), cookie ? "cookie present" : "missing cookie");
  return { name, value: valueParts.join("=") };
}

async function launchBrowser() {
  const channel = process.env.PLAYWRIGHT_CHROMIUM_CHANNEL ?? "chrome";
  try {
    return await chromium.launch({ channel, headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}

function batchFixture(id, sourceFilename, status = "staged") {
  return {
    id,
    sourceFilename,
    sourceHash: null,
    status,
    summary: { total: 2, valid: 1, needInfo: 0, conflict: 1 },
    importedBy: "user-qc-admin",
    confirmedBy: null,
    confirmedAt: null,
    rows: [
      {
        id: `${id}-row-1`,
        importBatchId: id,
        rowNo: 1,
        raw: { rootCode: "QC-IMP-001", partNumber: "QC-IMP-001-001", drawingNumber: "QC-IMP-001-MA1" },
        checkStatus: "valid",
        issues: []
      },
      {
        id: `${id}-row-2`,
        importBatchId: id,
        rowNo: 2,
        raw: { rootCode: "QC-IMP-002", partNumber: "QC-IMP-002-001", drawingNumber: "" },
        checkStatus: "conflict",
        issues: [{ code: "PART_EXISTS", message: "Part already exists" }]
      }
    ]
  };
}

function deletedEntry(batch, canRestore = true) {
  return {
    batch,
    policy: {
      stageLabel: "歷史",
      uiSurface: "deleted_data",
      traceabilityClass: "uncontrolled_deleted",
      detailTags: [canRestore ? "可還原" : "不可還原"],
      actions: {
        restore: canRestore
          ? { allowed: true }
          : {
              allowed: false,
              reasonCode: "LIFE_IMPORT_CONFIRMED",
              message: "此匯入批次已確認轉正式資料，不能還原。"
            }
      }
    }
  };
}

async function runFixture(baseUrl, cookie) {
  const browser = await launchBrowser();
  const activeBatch = batchFixture("import-active", "active-import.csv", "staged");
  const deletedBatch = batchFixture("import-deleted", "deleted-import.csv", "rejected");
  let active = [activeBatch];
  let deleted = [deletedEntry(deletedBatch)];
  let deletePostCount = 0;
  let restorePostCount = 0;
  const failedRequests = [];
  const failedResponses = [];

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies([{ name: cookie.name, value: cookie.value, url: baseUrl, httpOnly: true, sameSite: "Lax" }]);
    const page = await context.newPage();
    page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`));
    page.on("response", (response) => {
      if (response.url().includes("/api/") && response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
    });

    await page.route("**/api/numbering/import-batches**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const pathName = decodeURIComponent(url.pathname);
      if (pathName === "/api/numbering/import-batches" && request.method() === "GET") {
        if (url.searchParams.get("surface") === "deleted_data") return jsonResponse(route, { surface: "deleted_data", batches: deleted });
        return jsonResponse(route, { batches: active });
      }
      if (pathName === "/api/numbering/import-batches/import-active/delete" && request.method() === "POST") {
        deletePostCount += 1;
        active = [];
        deleted = [deletedEntry({ ...activeBatch, status: "rejected" }), ...deleted];
        return jsonResponse(route, { batch: { ...activeBatch, status: "rejected" }, policy: deleted[0].policy });
      }
      if (pathName === "/api/numbering/import-batches/import-deleted/restore" && request.method() === "POST") {
        restorePostCount += 1;
        active = [{ ...deletedBatch, status: "staged" }, ...active];
        deleted = deleted.filter((entry) => entry.batch.id !== "import-deleted");
        return jsonResponse(route, { batch: { ...deletedBatch, status: "staged" }, policy: { stageLabel: "草稿", uiSurface: "work_list", detailTags: [], actions: {} } });
      }
      return route.continue();
    });

    await page.goto(`${baseUrl}/numbering/imports`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "總表匯入" }).waitFor({ timeout: 15000 });
    await page.getByText("active-import.csv").waitFor({ timeout: 15000 });
    record("work list renders staged import batch", await page.getByText("active-import.csv").isVisible());
    record("work list does not render deleted import batch before deleted-data opens", (await page.getByText("deleted-import.csv").count()) === 0);
    record("staged import batch exposes delete vocabulary", await page.getByRole("button", { name: "刪除", exact: true }).isVisible());

    await page.getByRole("button", { name: "刪除", exact: true }).click();
    await page.getByText("active-import.csv").waitFor({ state: "detached", timeout: 15000 });
    record("delete subresource was called once", deletePostCount === 1, `count=${deletePostCount}`);

    await page.locator("summary", { hasText: "已刪除資料" }).click();
    await page.getByText("deleted-import.csv").waitFor({ timeout: 15000 });
    await page.getByText("active-import.csv").waitFor({ timeout: 15000 });
    record("deleted-data surface renders previously deleted batch", await page.getByText("deleted-import.csv").isVisible());
    record("deleted-data surface renders newly deleted batch", await page.getByText("active-import.csv").isVisible());
    record("restorable tag is visible", await page.getByText("可還原", { exact: true }).first().isVisible());

    await page.locator("details.master-attachment-deleted tr").filter({ hasText: "deleted-import.csv" }).getByRole("button", { name: "還原", exact: true }).click();
    await page.getByText("deleted-import.csv").waitFor({ timeout: 15000 });
    record("restore subresource was called once", restorePostCount === 1, `count=${restorePostCount}`);
    record("restored batch appears in active list", await page.locator("section.panel").filter({ hasText: "近期匯入批次" }).getByText("deleted-import.csv").isVisible());

    const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    record("desktop viewport has no horizontal overflow", noHorizontalOverflow);
    record("no API responses failed", failedResponses.length === 0, failedResponses.join("\n"));
    record("no browser requests failed", failedRequests.length === 0, failedRequests.join("\n"));

    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    record("import batch deleted-data fixture screenshot captured", true, screenshotPath);
    await context.close();
  } finally {
    await browser.close();
  }
}

async function main() {
  const configuredBaseUrl = process.env.PDM_BASE_URL?.replace(/\/$/u, "");
  let baseUrl = configuredBaseUrl ?? null;
  let app = null;
  try {
    if (!baseUrl) {
      for (const candidate of ["http://127.0.0.1:3000", "http://localhost:3000"]) {
        if (await isAppReady(candidate)) {
          baseUrl = candidate;
          break;
        }
      }
    }
    if (!baseUrl) {
      const port = await getFreePort();
      baseUrl = `http://127.0.0.1:${port}`;
      app = startNextApp(root, "dev", port);
      await waitForNextAppReady(baseUrl, app.getOutput);
    }
    const cookie = await login(baseUrl);
    await runFixture(baseUrl, cookie);
  } finally {
    if (app) await stopNextApp(app.child);
  }
  console.log(`qc:pdm-lifecycle-import-ui passed ${checks.length}/${checks.length} checks`);
  console.log(`screenshot: ${screenshotPath}`);
}

main().catch((error) => {
  console.error(JSON.stringify({ passed: checks.filter((check) => check.passed).length, failed: 1, checks, error: error.message }, null, 2));
  process.exit(1);
});
