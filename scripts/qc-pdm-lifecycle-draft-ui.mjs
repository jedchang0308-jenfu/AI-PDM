#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const screenshotPath = path.join(root, "output", "playwright", "pdm-lifecycle-part-drafts-deleted-fixture.png");
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

function draftFixture(id, reservedPartNumber, status = "draft") {
  return {
    id,
    reservedPartNumber,
    draftType: "new_part",
    itemType: "purchased",
    status,
    sourcePartNumberId: null,
    sourceDrawingNumberId: null,
    sourcePartNumber: null,
    sourceDrawingNumber: null,
    sourceRevision: null,
    creatorName: "QC Admin",
    version: status === "voided" ? 2 : 1,
    recycledAt: null,
    recycleAvailableAt: status === "voided" ? "2026-07-06T00:00:00.000Z" : null,
    sameSourceUnfinishedDraftCount: 0,
    controlled: false,
    controlBoundaryReasons: [],
    warnings: [],
    updatedAt: "2026-06-29T00:00:00.000Z"
  };
}

function deletedDraftEntry(draft, canRestore) {
  return {
    draft,
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
              reasonCode: "LIFE_DRAFT_NUMBER_REUSED",
              message: "此草稿號已被重新使用，不能還原。"
            }
      }
    }
  };
}

async function runFixture(baseUrl, cookie) {
  const browser = await launchBrowser();
  const activeDraft = draftFixture("draft-active", "P-QC-DRAFT-001", "draft");
  const deletedDraft = draftFixture("draft-deleted", "P-QC-DELETED-001", "voided");
  const blockedDeletedDraft = draftFixture("draft-blocked", "P-QC-DELETED-BLOCKED", "voided");
  const restoredDraft = { ...deletedDraft, status: "draft", version: 3, recycleAvailableAt: null };
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

    await page.route("**/api/numbering/part-number-drafts**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const pathName = decodeURIComponent(url.pathname);
      if (pathName === "/api/numbering/part-number-drafts" && request.method() === "GET") {
        if (url.searchParams.get("surface") === "deleted_data") {
          return jsonResponse(route, {
            surface: "deleted_data",
            drafts: restored ? [deletedDraftEntry(blockedDeletedDraft, false)] : [deletedDraftEntry(deletedDraft, true), deletedDraftEntry(blockedDeletedDraft, false)]
          });
        }
        return jsonResponse(route, {
          summary: { total: restored ? 2 : 1, needsReconfirmation: 0, sameSourceWarnings: 0, recyclableVoided: 0 },
          drafts: restored ? [activeDraft, restoredDraft] : [activeDraft]
        });
      }
      if (pathName === "/api/numbering/part-number-drafts/draft-deleted/restore" && request.method() === "POST") {
        restored = true;
        restorePostCount += 1;
        return jsonResponse(route, { draft: restoredDraft, policy: { stageLabel: "草稿", uiSurface: "work_list", detailTags: [], actions: {} } });
      }
      return route.continue();
    });

    await page.goto(`${baseUrl}/numbering/part-drafts`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "料號草稿" }).waitFor({ timeout: 15000 });
    await page.getByText("P-QC-DRAFT-001").waitFor({ timeout: 15000 });
    record("work list renders active draft", await page.getByText("P-QC-DRAFT-001").isVisible());
    record("work list does not render deleted draft before deleted-data surface opens", (await page.getByText("P-QC-DELETED-001").count()) === 0);
    record("draft primary action uses delete vocabulary", await page.getByRole("button", { name: "刪除" }).isVisible());

    await page.locator("summary", { hasText: "已刪除資料" }).click();
    await page.getByText("P-QC-DELETED-001").waitFor({ timeout: 15000 });
    await page.getByText("P-QC-DELETED-BLOCKED").waitFor({ timeout: 15000 });
    record("deleted-data surface renders restorable deleted draft", await page.getByText("P-QC-DELETED-001").isVisible());
    record("deleted-data surface renders blocked deleted draft", await page.getByText("P-QC-DELETED-BLOCKED").isVisible());
    record("restorable tag is visible", await page.getByText("可還原", { exact: true }).isVisible());
    record("blocked restore reason is visible", await page.getByText("此草稿號已被重新使用，不能還原。").isVisible());

    await page.getByRole("button", { name: "還原", exact: true }).click();
    await page.getByText("P-QC-DELETED-001").waitFor({ timeout: 15000 });
    record("restore subresource was called once", restorePostCount === 1, `count=${restorePostCount}`);
    record("restored draft appears in work list", await page.getByText("P-QC-DELETED-001").isVisible());
    record("restored draft leaves deleted-data rows", (await page.locator("details.master-attachment-deleted tbody tr").filter({ hasText: "P-QC-DELETED-001" }).count()) === 0);

    const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    record("desktop viewport has no horizontal overflow", noHorizontalOverflow);
    record("no API responses failed", failedResponses.length === 0, failedResponses.join("\n"));
    record("no browser requests failed", failedRequests.length === 0, failedRequests.join("\n"));

    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    record("part-number draft deleted-data fixture screenshot captured", true, screenshotPath);
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
  console.log(`qc:pdm-lifecycle-draft-ui passed ${checks.length}/${checks.length} checks`);
  console.log(`screenshot: ${screenshotPath}`);
}

main().catch((error) => {
  console.error(JSON.stringify({ passed: checks.filter((check) => check.passed).length, failed: 1, checks, error: error.message }, null, 2));
  process.exit(1);
});
