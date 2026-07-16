#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const screenshotPath = path.join(root, "output", "playwright", "pdm-lifecycle-attachments-deleted-fixture.png");
const checks = [];

function record(name, passed, detail = "") {
  checks.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
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
  } catch (channelError) {
    try {
      return await chromium.launch({ headless: true });
    } catch (defaultError) {
      throw new Error(`Unable to launch Chromium. ${channel}: ${channelError.message}; default: ${defaultError.message}`);
    }
  }
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

function attachmentFixture(id, displayName, fileName, description) {
  return {
    id,
    documentCategory: "catalog",
    displayName,
    description,
    revision: "1",
    fileName,
    fileExt: "pdf",
    fileSize: 1536,
    gdriveFileId: null,
    gdriveStatus: "none",
    gdriveError: null,
    gdriveSyncedAt: null,
    uploadedByName: "QC Admin",
    createdAt: "2026-06-29T08:00:00.000Z"
  };
}

function deletedEntry(attachment, canRestore) {
  return {
    attachment,
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
              reasonCode: "LIFE_ATTACHMENT_DUPLICATE_ACTIVE",
              message: "同名有效附件已存在，請先處理有效附件後再還原"
            }
      }
    }
  };
}

async function runFixture(baseUrl, cookie) {
  const browser = await launchBrowser();
  const partNumber = "QC-LIFE-001";
  const partRecord = {
    id: "part-qc-life-001",
    rootCode: "QC-LIFE",
    coreName: "Lifecycle Attachment Fixture",
    partNumber,
    partName: "Lifecycle Attachment Fixture",
    itemKind: "manufactured",
    developmentPhase: "DVT",
    recordStatus: "Active",
    variant: null,
    primaryDrawingNumber: null,
    drawingCount: 0,
    standardCost: null,
    pendingCostRequestCount: 0
  };
  const restorable = attachmentFixture("deleted-restorable", "恢復測試附件", "restore-ok.pdf", "允許還原 fixture");
  const blocked = attachmentFixture("deleted-blocked", "封鎖測試附件", "restore-blocked.pdf", "衝突封鎖 fixture");
  const restoredActive = { ...restorable, id: "restored-active", description: "已還原到有效附件清單" };
  let restored = false;
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

    await page.route("**/api/parts**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const pathName = decodeURIComponent(url.pathname);
      if (pathName === "/api/parts") return jsonResponse(route, { parts: [partRecord] });
      if (pathName === `/api/parts/${partNumber}`) {
        return jsonResponse(route, {
          part: {
            ...partRecord,
            linkedDrawings: [],
            sameDrawingVariants: [],
            costProfiles: [],
            costChangeRequests: []
          }
        });
      }
      if (pathName === `/api/parts/${partNumber}/attachments` && request.method() === "GET") {
        if (url.searchParams.get("surface") === "deleted_data") {
          return jsonResponse(route, {
            entity: { type: "part_number", id: partRecord.id, code: partNumber },
            surface: "deleted_data",
            attachments: restored ? [deletedEntry(blocked, false)] : [deletedEntry(restorable, true), deletedEntry(blocked, false)]
          });
        }
        return jsonResponse(route, {
          entity: { type: "part_number", id: partRecord.id, code: partNumber },
          attachments: restored ? [restoredActive] : []
        });
      }
      if (pathName === `/api/parts/${partNumber}/attachments/deleted-restorable/restore` && request.method() === "POST") {
        restored = true;
        restorePostCount += 1;
        return jsonResponse(route, {
          attachment: restoredActive,
          policy: {
            stageLabel: "正式",
            uiSurface: "work_list",
            traceabilityClass: "working",
            detailTags: [],
            actions: { restore: { allowed: false, reasonCode: "LIFE_ATTACHMENT_NOT_DELETED", message: "附件不是已刪除狀態" } }
          }
        });
      }
      return route.continue();
    });

    await page.goto(`${baseUrl}/parts`, { waitUntil: "domcontentloaded" });
    await page.locator("[data-part-row='true']").first().click();
    await page.locator(".master-attachment-panel", { hasText: "料號附件庫" }).waitFor({ timeout: 15000 });
    await page.locator("summary", { hasText: "已刪除資料" }).click();
    await page.locator(".master-attachment-row.deleted", { hasText: "恢復測試附件" }).waitFor({ timeout: 15000 });
    await page.locator(".master-attachment-row.deleted", { hasText: "封鎖測試附件" }).waitFor({ timeout: 15000 });

    record("deleted-data surface renders two deleted rows", (await page.locator(".master-attachment-row.deleted").count()) === 2);
    record("restorable detail tag is visible", await page.locator(".master-attachment-status.restorable", { hasText: "可還原" }).isVisible());
    record("blocked detail tag is visible", await page.locator(".master-attachment-status.blocked", { hasText: "不可還原" }).isVisible());
    record("blocked restore reason is visible", await page.getByText("同名有效附件已存在，請先處理有效附件後再還原").isVisible());
    record("blocked restore button is disabled", await page.getByRole("button", { name: "同名有效附件已存在，請先處理有效附件後再還原" }).isDisabled());

    await page.getByRole("button", { name: "還原附件" }).click();
    await page.locator(".master-attachment-message.success", { hasText: "附件已還原" }).waitFor({ timeout: 15000 });
    record("restore subresource was called once", restorePostCount === 1, `count=${restorePostCount}`);
    await page.locator(".master-attachment-row.deleted").filter({ hasText: "恢復測試附件" }).waitFor({ state: "detached", timeout: 15000 });
    await page.locator("section.master-attachment-panel > div.master-attachment-list > article").filter({ hasText: "恢復測試附件" }).waitFor({ timeout: 15000 });
    record("restored row moved out of deleted surface", (await page.locator(".master-attachment-row.deleted").filter({ hasText: "恢復測試附件" }).count()) === 0);
    record("restored attachment appears in active list", (await page.locator("section.master-attachment-panel > div.master-attachment-list > article").filter({ hasText: "恢復測試附件" }).count()) === 1);

    const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    record("desktop viewport has no horizontal overflow", noHorizontalOverflow);
    record("no API responses failed", failedResponses.length === 0, failedResponses.join("\n"));
    record("no browser requests failed", failedRequests.length === 0, failedRequests.join("\n"));

    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    record("deleted-row restore fixture screenshot captured", true, screenshotPath);
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
  console.log(`qc:pdm-lifecycle-actions-ui passed ${checks.length}/${checks.length} checks`);
  console.log(`screenshot: ${screenshotPath}`);
}

main().catch((error) => {
  console.error(JSON.stringify({ passed: checks.filter((check) => check.passed).length, failed: 1, checks, error: error.message }, null, 2));
  process.exit(1);
});
