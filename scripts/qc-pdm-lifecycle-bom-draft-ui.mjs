#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const screenshotPath = path.join(root, "output", "playwright", "pdm-lifecycle-bom-drafts-deleted-fixture.png");
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

function deletedEntry(draft, canRestore = true) {
  return {
    draft,
    policy: {
      stageLabel: "歷史",
      uiSurface: "deleted_data",
      traceabilityClass: "uncontrolled_deleted",
      detailTags: [canRestore ? "可還原" : "不可還原"],
      actions: {
        restore: canRestore ? { allowed: true } : { allowed: false, reasonCode: "LIFE_BOM_DRAFT_NOT_DELETED", message: "此 BOM 草稿尚未刪除。" }
      }
    }
  };
}

async function runFixture(baseUrl, cookie) {
  const browser = await launchBrowser();
  let activeDrafts = [draftFixture("draft-active", "Active BOM Draft", "Draft")];
  let deletedDrafts = [deletedEntry(draftFixture("draft-deleted", "Deleted BOM Draft", "Archived"))];
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
      if (pathName === "/api/bom/workbench" && request.method() === "GET") {
        if (url.searchParams.get("surface") === "deleted_data") return jsonResponse(route, { surface: "deleted_data", drafts: deletedDrafts });
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
      if (pathName === "/api/bom/drafts/draft-active/delete" && request.method() === "POST") {
        deletePostCount += 1;
        const archived = { ...activeDrafts[0], status: "Archived", is_active: 0 };
        activeDrafts = [];
        deletedDrafts = [deletedEntry(archived), ...deletedDrafts];
        return jsonResponse(route, { draft: draftDetail(archived), policy: deletedDrafts[0].policy });
      }
      if (pathName === "/api/bom/drafts/draft-deleted/restore" && request.method() === "POST") {
        restorePostCount += 1;
        const restored = { ...deletedDrafts.find((entry) => entry.draft.id === "draft-deleted").draft, status: "Draft", is_active: 0 };
        activeDrafts = [restored, ...activeDrafts];
        deletedDrafts = deletedDrafts.filter((entry) => entry.draft.id !== "draft-deleted");
        return jsonResponse(route, { draft: draftDetail(restored), policy: { stageLabel: "草稿", uiSurface: "work_list", detailTags: [], actions: {} } });
      }
      if (pathName === "/api/bom/drafts/draft-deleted" && request.method() === "GET") {
        const draft = activeDrafts.find((item) => item.id === "draft-deleted");
        return jsonResponse(route, { draft: draftDetail(draft) });
      }
      return route.continue();
    });

    await page.goto(`${baseUrl}/bom/workbench`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "BOM 工作台" }).waitFor({ timeout: 15000 });
    await page.getByText("P-BOM-PARENT").waitFor({ timeout: 15000 });
    await page.getByText("P-BOM-PARENT").click();
    const draftStrip = page.locator(".bom-draft-strip");
    await draftStrip.getByText("Active BOM Draft").waitFor({ timeout: 15000 });
    record("work list renders active BOM draft", await draftStrip.getByText("Active BOM Draft").isVisible());
    record("work list uses lifecycle stage label", await page.getByText("草稿", { exact: true }).first().isVisible());
    record("deleted BOM draft is hidden before deleted-data opens", (await page.getByText("Deleted BOM Draft").count()) === 0);

    await page.getByRole("button", { name: "刪除", exact: true }).click();
    record("delete subresource was called once", deletePostCount === 1, `count=${deletePostCount}`);

    await page.locator("summary", { hasText: "已刪除資料" }).click();
    const deletedTable = page.locator("details.master-attachment-deleted");
    await deletedTable.getByText("Deleted BOM Draft").waitFor({ timeout: 15000 });
    await deletedTable.getByText("Active BOM Draft").waitFor({ timeout: 15000 });
    record("deleted-data surface renders existing deleted BOM draft", await deletedTable.getByText("Deleted BOM Draft").isVisible());
    record("deleted-data surface renders newly deleted BOM draft", await deletedTable.getByText("Active BOM Draft").isVisible());
    record("deleted-data surface exposes restore vocabulary", await page.getByRole("button", { name: "還原", exact: true }).first().isVisible());

    await page.locator("details.master-attachment-deleted tr").filter({ hasText: "Deleted BOM Draft" }).getByRole("button", { name: "還原", exact: true }).click();
    await draftStrip.getByText("Deleted BOM Draft").waitFor({ timeout: 15000 });
    record("restore subresource was called once", restorePostCount === 1, `count=${restorePostCount}`);
    record("restored BOM draft appears in work list", await page.locator(".bom-draft-strip").getByText("Deleted BOM Draft").isVisible());

    const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    record("desktop viewport has no horizontal overflow", noHorizontalOverflow);
    record("no API responses failed", failedResponses.length === 0, failedResponses.join("\n"));
    record("no browser requests failed", failedRequests.length === 0, failedRequests.join("\n"));

    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    record("BOM draft deleted-data fixture screenshot captured", true, screenshotPath);
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
  console.log(`qc:pdm-lifecycle-bom-draft-ui passed ${checks.length}/${checks.length} checks`);
  console.log(`screenshot: ${screenshotPath}`);
}

main().catch((error) => {
  console.error(JSON.stringify({ passed: checks.filter((check) => check.passed).length, failed: 1, checks, error: error.message }, null, 2));
  process.exit(1);
});
