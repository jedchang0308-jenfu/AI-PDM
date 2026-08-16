#!/usr/bin/env node

import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const distDirRelative = `.tmp/next-qc-bom-ui-${randomUUID()}`;
const distDir = path.join(root, ...distDirRelative.split("/"));
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const screenshotPath = path.join(root, "output", "playwright", "pdm-bom-work-list-fixture.png");
const editorScreenshotPath = path.join(root, "output", "playwright", "pdm-bom-editor-independent-page-fixture.png");
const checks = [];

function record(name, passed, detail = "") {
  checks.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function jsonResponse(route, body, status = 200) {
  return route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) });
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
  let response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com", password })
  });
  if (!response.ok) {
    response = await fetch(`${baseUrl}/api/auth/login?account=Admin`, {
      redirect: "manual"
    });
  }
  record("admin login succeeds", response.ok || response.status === 303, `HTTP ${response.status}`);
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

function draftFixture(id, name, status = "Draft") {
  return {
    id,
    parent_item_id: "item-bom-parent",
    parent_submission_id: "sub-bom-parent",
    parent_revision: "1",
    draft_name: name,
    status,
    source: "manual",
    is_active: status === "Draft" && id === "draft-active" ? 1 : 0,
    line_count: 1,
    review_attempt: 0,
    created_by: "user-qc-admin",
    updated_by: "user-qc-admin",
    created_at: "2026-06-29T08:00:00.000Z",
    updated_at: "2026-06-29T08:00:00.000Z"
  };
}

function draftDetail(draft) {
  return {
    ...draft,
    lines: [
      {
        id: `${draft.id}-line-1`,
        bom_draft_id: draft.id,
        parent_line_id: null,
        node_type: "item",
        item_id: "item-child",
        part_number: "P-BOM-001",
        part_name: "BOM child",
        revision: "1",
        group_name: null,
        quantity: 1,
        sequence_no: 1,
        source: "manual",
        source_priority: 30,
        source_ref_id: null,
        source_filename: null,
        created_by: "user-qc-admin",
        updated_by: "user-qc-admin",
        created_at: "2026-06-29T08:00:00.000Z",
        updated_at: "2026-06-29T08:00:00.000Z"
      }
    ],
    reconfirmation_flags: []
  };
}

function workListRecord(draft) {
  return {
    ...draft,
    parent_part_number: "P-BOM-PARENT",
    parent_part_name: "BOM parent"
  };
}

async function runFixture(baseUrl, cookie) {
  const browser = await launchBrowser();
  const activeDrafts = [draftFixture("draft-active", "Active BOM Draft", "Draft")];
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

    await page.route("**/api/auth/me", (route) =>
      jsonResponse(route, {
        user: { id: "user-qc-admin", display_name: "QC Admin", email: "admin@example.com", role: "Admin" }
      })
    );
    await page.route("**/api/numbering/permissions", (route) =>
      jsonResponse(route, { generatedAt: "2026-06-29T08:00:00.000Z", pages: {}, actions: {} })
    );

    await page.route("**/api/submissions**", async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      return jsonResponse(route, {
        submissions: [
          {
            id: "sub-bom-parent",
            item_id: "item-bom-parent",
            part_number: "P-BOM-PARENT",
            part_name: "BOM parent",
            drawing_number: "D-BOM-PARENT",
            revision: "1",
            status: "Pending",
            submitted_by_name: "QC Admin",
            updated_at: "2026-06-29T08:00:00.000Z"
          }
        ]
      });
    });

    await page.route("**/api/bom/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const pathName = decodeURIComponent(url.pathname);
      if (pathName === "/api/bom/drafts" && request.method() === "GET" && url.searchParams.get("surface") === "work_list") {
        return jsonResponse(route, { drafts: activeDrafts.map(workListRecord) });
      }
      if (pathName === "/api/bom/workbench" && request.method() === "GET") {
        const activeDraft = activeDrafts.find((draft) => draft.is_active === 1) ?? null;
        return jsonResponse(route, {
          workbench: {
            parent_submission_id: "sub-bom-parent",
            parent_item_id: "item-bom-parent",
            parent_part_number: "P-BOM-PARENT",
            parent_part_name: "BOM parent",
            parent_drawing_number: "D-BOM-PARENT",
            parent_revision: "1",
            parent_status: "Pending",
            drafts: activeDrafts,
            active_draft: activeDraft ? draftDetail(activeDraft) : null
          }
        });
      }
      const draftDetailMatch = pathName.match(/^\/api\/bom\/drafts\/([^/]+)$/u);
      if (draftDetailMatch && request.method() === "GET") {
        const draft = activeDrafts.find((item) => item.id === draftDetailMatch[1]);
        return draft ? jsonResponse(route, { draft: draftDetail(draft) }) : jsonResponse(route, { error: "BOM_DRAFT_NOT_FOUND" }, 404);
      }
      return route.continue();
    });

    await page.goto(`${baseUrl}/bom/workbench`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "BOM 工作台" }).waitFor({ timeout: 15000 });
    const draftStrip = page.locator(".bom-draft-strip");
    await draftStrip.getByText("Active BOM Draft").waitFor({ timeout: 15000 });
    record("legacy material and drawing sidebar is removed", (await page.getByRole("complementary", { name: "料號與圖面搜尋" }).count()) === 0);
    record("BOM list occupies the primary workbench panel", await page.getByRole("region", { name: "BOM 清單", exact: true }).isVisible());
    record("work list renders active BOM draft", await draftStrip.getByText("Active BOM Draft").isVisible());
    record("work list uses lifecycle stage label", await draftStrip.getByText("草稿", { exact: true }).isVisible());
    record("list page does not render the BOM editor", (await page.getByTestId("bom-flow-canvas").count()) === 0);
    record("list page does not render deleted-data controls", (await page.getByText("已刪除資料", { exact: true }).count()) === 0);

    await draftStrip.getByText("Active BOM Draft").click();
    await page.waitForURL(`${baseUrl}/bom/workbench/draft-active`, { timeout: 15000 });
    await page.getByRole("region", { name: "BOM 編輯器" }).waitFor({ timeout: 15000 });
    await page.getByTestId("bom-flow-canvas").waitFor({ state: "visible", timeout: 15000 });
    record("work-list click opens the canonical independent editor route", page.url() === `${baseUrl}/bom/workbench/draft-active`, page.url());
    record("editor page no longer renders the BOM list", (await page.getByRole("region", { name: "BOM 清單", exact: true }).count()) === 0);
    record("editor page renders the BOM canvas", await page.getByTestId("bom-flow-canvas").isVisible());
    record("editor removes the duplicate page title", (await page.getByRole("heading", { name: "BOM 編輯", exact: true }).count()) === 0);
    record("editor removes the engineering eyebrow", (await page.getByText("工程 BOM 管理", { exact: true }).count()) === 0);
    record("editor removes lifecycle guidance", (await page.getByText("BOM 建立與審核", { exact: true }).count()) === 0);
    record("editor removes normal load-success noise", (await page.getByText(/已載入草稿/u).count()) === 0);
    record("editor removes deleted-data controls", (await page.getByText("已刪除資料", { exact: true }).count()) === 0);
    const flowNodeText = await page.locator("[data-bom-flow-node-id]").allTextContents();
    record("flow nodes hide revision, quantity and level noise", flowNodeText.every((text) => !/(BOM Rev|\bRev\b|\bQty\b|\bLevel\b)/u.test(text)), flowNodeText.join(" | "));
    record("editor combines identity and metadata into one context bar", await page.locator(".bom-editor-context").isVisible());
    record("editor context bar contains the three required metadata fields", (await page.locator(".bom-editor-context dl > div").count()) === 3);
    record("editor does not render separate summary cards", (await page.locator(".bom-parent-summary").count()) === 0);
    record("editor keeps the explicit return action", await page.getByRole("link", { name: "返回 BOM 清單" }).isVisible());
    record("editor keeps the BOM identity summary", await page.getByRole("heading", { name: "P-BOM-PARENT · BOM Rev 1" }).isVisible());
    record("editor keeps the editing toolbar", await page.getByRole("button", { name: "新增群組", exact: true }).isVisible());
    const insertItemButton = page.getByRole("button", { name: "插入料件", exact: true });
    record("editor exposes the insert-item action", await insertItemButton.isVisible());
    await insertItemButton.click();
    await page.getByRole("dialog", { name: "插入料件" }).waitFor({ state: "visible", timeout: 15000 });
    record("insert-item drawer provides a search field", await page.getByRole("textbox", { name: "搜尋料件" }).isVisible());
    const insertOption = page.getByRole("option", { name: "插入 P-BOM-PARENT" });
    await insertOption.waitFor({ state: "visible", timeout: 15000 });
    await insertOption.click();
    record("selecting an item adds a BOM node", (await page.locator("[data-bom-flow-node-id]").count()) === 3);
    record("selecting an item marks the draft as unsaved", await page.getByText("未儲存", { exact: true }).isVisible());
    const editorNoHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    record("editor viewport has no horizontal overflow", editorNoHorizontalOverflow);
    await fs.mkdir(path.dirname(editorScreenshotPath), { recursive: true });
    await page.screenshot({ path: editorScreenshotPath, fullPage: true });
    record("independent BOM editor screenshot captured", true, editorScreenshotPath);

    await page.getByRole("button", { name: "復原", exact: true }).click();
    record("insert-item test can be safely undone", await page.getByText("已同步", { exact: true }).isVisible());
    await page.getByRole("link", { name: "返回 BOM 清單" }).click();
    await page.waitForURL(`${baseUrl}/bom/workbench`, { timeout: 15000 });
    await draftStrip.getByText("Active BOM Draft").waitFor({ timeout: 15000 });
    record("editor provides an explicit return to the BOM list", page.url() === `${baseUrl}/bom/workbench`, page.url());
    record("active BOM draft remains available in the work list", await draftStrip.getByText("Active BOM Draft").isVisible());

    const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    record("desktop viewport has no horizontal overflow", noHorizontalOverflow);
    record("no API responses failed", failedResponses.length === 0, failedResponses.join("\n"));
    record("no browser requests failed", failedRequests.length === 0, failedRequests.join("\n"));

    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    record("BOM work-list fixture screenshot captured", true, screenshotPath);

    await page.goto(`${baseUrl}/bom/workbench?draftId=draft-active`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(`${baseUrl}/bom/workbench/draft-active`, { timeout: 15000 });
    record("legacy draftId query redirects to the canonical editor route", page.url() === `${baseUrl}/bom/workbench/draft-active`, page.url());
    await context.close();
  } finally {
    await browser.close();
  }
}

async function main() {
  const configuredBaseUrl = process.env.PDM_BASE_URL?.replace(/\/$/u, "");
  let baseUrl = configuredBaseUrl ?? null;
  let app = null;
  let fixtureDir = null;
  try {
    if (!baseUrl && process.env.PDM_QC_FORCE_ISOLATED !== "1") {
      for (const candidate of ["http://127.0.0.1:3000", "http://localhost:3000"]) {
        if (await isAppReady(candidate)) {
          baseUrl = candidate;
          break;
        }
      }
    }
    if (!baseUrl) {
      const port = await getFreePort();
      baseUrl = `http://localhost:${port}`;
      fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-pdm-bom-ui-"));
      await fs.copyFile(path.join(root, "data", "ai-pdm.sqlite"), path.join(fixtureDir, "ai-pdm.sqlite"));
      await fs.mkdir(path.join(fixtureDir, "repository"), { recursive: true });
      process.env.PDM_AUTH_MODE = "demo";
      process.env.PDM_DB_PROVIDER = "sqlite";
      process.env.PDM_DATA_DIR = fixtureDir;
      process.env.PDM_REPOSITORY_DIR = path.join(fixtureDir, "repository");
      process.env.PDM_LOCAL_FULL_FUNCTION_VALIDATION = "true";
      process.env.PDM_PUBLIC_BASE_URL = baseUrl;
      process.env.PDM_QC_ISOLATED_TARGET = "1";
      process.env.PDM_NEXT_DIST_DIR = distDirRelative;
      app = startNextApp(root, "dev", port);
      await waitForNextAppReady(baseUrl, app.getOutput);
    }
    const cookie = await login(baseUrl);
    await runFixture(baseUrl, cookie);
  } finally {
    if (app) await stopNextApp(app.child);
    if (app) await fs.rm(distDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 }).catch(() => undefined);
    if (fixtureDir) await fs.rm(fixtureDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 }).catch(() => undefined);
  }
  console.log(`qc:pdm-lifecycle-bom-draft-ui passed ${checks.length}/${checks.length} checks`);
  console.log(`screenshot: ${screenshotPath}`);
}

main().catch((error) => {
  console.error(JSON.stringify({ passed: checks.filter((check) => check.passed).length, failed: 1, checks, error: error.message }, null, 2));
  process.exit(1);
});
