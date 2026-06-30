#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const screenshotDir = path.join(root, "output", "playwright");
const desktopScreenshotPath = path.join(screenshotDir, "pdm-lifecycle-controlled-history-desktop.png");
const mobileScreenshotPath = path.join(screenshotDir, "pdm-lifecycle-controlled-history-mobile.png");
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
  } catch (channelError) {
    try {
      return await chromium.launch({ headless: true });
    } catch (defaultError) {
      throw new Error(`Unable to launch Chromium. ${channel}: ${channelError.message}; default: ${defaultError.message}`);
    }
  }
}

function submissionFixture(overrides = {}) {
  return {
    id: "submission-daily-001",
    company_id: "company-qc",
    item_id: "item-daily-001",
    part_number: "P-QC-DAILY-001",
    part_name: "日常清單測試件",
    drawing_number: "D-QC-DAILY-001",
    revision: "A",
    product_line: "PDM",
    customer: "QC",
    project_code: "LIFE",
    process_name: "Machining",
    machine: "CNC",
    material: "SUS304",
    surface_finish: "NA",
    document_type: "Drawing",
    change_description: "fixture",
    status: "Released",
    submitted_by: "user-admin",
    submitted_by_name: "QC Admin",
    approval_required: 1,
    file_count: 2,
    file_roles: "pdf,dwg",
    has_release_package: 1,
    has_active_lock: 0,
    created_at: "2026-06-28T08:00:00.000Z",
    updated_at: "2026-06-29T08:00:00.000Z",
    released_at: "2026-06-29T08:00:00.000Z",
    rejected_at: null,
    reject_reason: null,
    release_error: null,
    superseded_by_submission_id: null,
    obsolete_at: null,
    obsolete_by: null,
    ...overrides
  };
}

function submissionDetailFixture(summary) {
  return {
    ...summary,
    files: [],
    references: [],
    bom: null,
    active_lock: null,
    release_package: null,
    approvals: [],
    audit_logs: [
      {
        id: "audit-history-001",
        actor_id: "user-manager",
        action: "submission_obsolete_approved",
        detail_json: JSON.stringify({ reason: "正式核准作廢 fixture" }),
        created_at: "2026-06-30T05:30:00.000Z"
      }
    ],
    lifecycle_requests: [
      {
        id: "lifecycle-history-001",
        submission_id: summary.id,
        action_code: "obsolete_submission",
        request_status: "approved",
        requested_by: "user-engineer",
        requested_by_name: "工程師 A",
        reason: "圖面已由新正式版取代",
        decided_by: "user-manager",
        decided_by_name: "研發主管 B",
        decision_reason: "已確認無未結製造交接",
        requested_at: "2026-06-30T05:00:00.000Z",
        decided_at: "2026-06-30T05:30:00.000Z",
        created_at: "2026-06-30T05:00:00.000Z",
        updated_at: "2026-06-30T05:30:00.000Z"
      }
    ]
  };
}

function controlledHistoryEntry(summary) {
  return {
    id: "controlled-history-submission-001",
    entity_type: "submission",
    target_id: summary.id,
    display_code: summary.drawing_number,
    secondary_code: `${summary.part_number} / Rev ${summary.revision}`,
    title: summary.part_name,
    stage_label: "歷史",
    result_label: "已作廢",
    traceability_class: "controlled_history",
    history_reason: "圖面已由新正式版取代",
    requested_by_name: "工程師 A",
    reviewed_by_name: "研發主管 B",
    requested_at: "2026-06-30T05:00:00.000Z",
    decided_at: "2026-06-30T05:30:00.000Z",
    history_at: "2026-06-30T05:30:00.000Z",
    decision_reason: "已確認無未結製造交接",
    source_status: "Obsolete",
    release_package_available: true,
    actions: { delete: false, restore: false, obsolete: false }
  };
}

function controlledHistoryPartEntry() {
  return {
    id: "numbering_part_number:part-history-001",
    entity_type: "numbering_part_number",
    target_id: "part-history-001",
    display_code: "P-QC-HISTORY-002",
    secondary_code: "ROOT-QC / Release",
    title: "正式料號歷史件",
    stage_label: "歷史",
    result_label: "已作廢",
    traceability_class: "controlled_history",
    history_reason: "正式料號已由替代料號取代",
    requested_by_name: "工程師 C",
    reviewed_by_name: "PDM 管理員 D",
    requested_at: "2026-06-30T04:00:00.000Z",
    decided_at: "2026-06-30T04:30:00.000Z",
    history_at: "2026-06-30T04:30:00.000Z",
    decision_reason: "替代料號已完成發布",
    source_status: "Obsolete",
    release_package_available: false,
    actions: { delete: false, restore: false, obsolete: false }
  };
}

function controlledHistoryDrawingEntry() {
  return {
    id: "numbering_drawing_number:drawing-history-001",
    entity_type: "numbering_drawing_number",
    target_id: "drawing-history-001",
    display_code: "D-QC-HISTORY-002",
    secondary_code: "P-QC-HISTORY-002 / Release",
    title: "MA",
    stage_label: "歷史",
    result_label: "已作廢",
    traceability_class: "controlled_history",
    history_reason: "正式圖號已由新版圖號取代",
    requested_by_name: "工程師 E",
    reviewed_by_name: "研發主管 F",
    requested_at: "2026-06-30T03:00:00.000Z",
    decided_at: "2026-06-30T03:30:00.000Z",
    history_at: "2026-06-30T03:30:00.000Z",
    decision_reason: "已確認下游不再使用",
    source_status: "Obsolete",
    release_package_available: false,
    actions: { delete: false, restore: false, obsolete: false }
  };
}

function controlledHistoryBomEntry() {
  return {
    id: "bom_release:bom-history-001",
    entity_type: "bom_release",
    target_id: "bom-history-001",
    display_code: "P-QC-BOM-001",
    secondary_code: "D-QC-BOM-001 / Rev A",
    title: "正式 BOM 歷史件",
    stage_label: "歷史",
    result_label: "已作廢",
    traceability_class: "controlled_history",
    history_reason: "正式 BOM 已由新結構取代",
    requested_by_name: "工程師 G",
    reviewed_by_name: "研發主管 H",
    requested_at: "2026-06-30T02:00:00.000Z",
    decided_at: "2026-06-30T02:30:00.000Z",
    history_at: "2026-06-30T02:30:00.000Z",
    decision_reason: "新 BOM 已核准發布",
    source_status: "Obsolete",
    release_package_available: false,
    actions: { delete: false, restore: false, obsolete: false }
  };
}

function emptyStorageEvidence() {
  return {
    source: { available: false, error: null, evidenceMarkdownPath: null },
    run: null,
    summary: null,
    readiness: { migrationReady: false, blockers: [], warnings: [] },
    thresholdUsage: { storage: null, egress: null },
    governance: null,
    recommendationCount: 0,
    nextActions: ["Run monthly storage evidence job."]
  };
}

async function installApiFixture(page) {
  const dailySubmission = submissionFixture();
  const historySubmission = submissionFixture({
    id: "submission-history-001",
    item_id: "item-history-001",
    part_number: "P-QC-HISTORY-001",
    part_name: "受控歷史測試件",
    drawing_number: "D-QC-HISTORY-001",
    revision: "B",
    status: "Obsolete",
    obsolete_at: "2026-06-30T05:30:00.000Z",
    obsolete_by: "user-manager",
    superseded_by_submission_id: "submission-daily-001"
  });
  const historyDetail = submissionDetailFixture(historySubmission);

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathName = decodeURIComponent(url.pathname);

    if (pathName === "/api/auth/me") {
      return jsonResponse(route, {
        user: { id: "user-admin", display_name: "QC Admin", email: "admin@example.com", role: "Admin" }
      });
    }
    if (pathName === "/api/numbering/permissions") {
      return jsonResponse(route, { generatedAt: "2026-06-30T00:00:00.000Z", pages: {}, actions: {} });
    }
    if (pathName === "/api/submissions" || pathName === "/api/search") {
      return jsonResponse(route, {
        submissions: [dailySubmission],
        pagination: { limit: 80, offset: 0, total: 1, hasMore: false },
        pdmCompany: { companyId: "company-qc", source: "fixture" }
      });
    }
    if (pathName === "/api/lifecycle/controlled-history") {
      return jsonResponse(route, {
        entries: [controlledHistoryEntry(historySubmission), controlledHistoryPartEntry(), controlledHistoryDrawingEntry(), controlledHistoryBomEntry()],
        pagination: { limit: 50, offset: 0, total: 4, hasMore: false },
        pdmCompany: { companyId: "company-qc", source: "fixture" }
      });
    }
    if (pathName === "/api/submissions/submission-history-001") {
      return jsonResponse(route, { submission: historyDetail });
    }
    if (pathName === "/api/notifications") {
      return jsonResponse(route, { notifications: [], summary: { total: 0, critical: 0, warning: 0, info: 0 } });
    }
    if (pathName === "/api/numbering/search") {
      return jsonResponse(route, { results: [] });
    }
    if (pathName === "/api/storage/evidence") {
      return jsonResponse(route, emptyStorageEvidence());
    }
    if (pathName.endsWith("/bom/diff")) return jsonResponse(route, { diff: null });
    if (pathName.includes("/where-used")) return jsonResponse(route, { whereUsed: [] });
    if (pathName.includes("/revisions")) return jsonResponse(route, { revisions: [] });
    if (pathName.endsWith("/ai-summary")) return jsonResponse(route, { summary: null });
    if (pathName.endsWith("/ai-risks")) return jsonResponse(route, { report: null });
    if (pathName.endsWith("/reuse-candidates") || pathName.endsWith("/duplicate-geometry")) return jsonResponse(route, { candidates: [] });
    if (
      pathName.endsWith("/sandbox") ||
      pathName.endsWith("/discussions") ||
      pathName.endsWith("/issues") ||
      pathName.endsWith("/changes") ||
      pathName.endsWith("/phase-gates") ||
      pathName.endsWith("/approval-matrix") ||
      pathName.endsWith("/pdf-markups") ||
      pathName.endsWith("/shares") ||
      pathName.endsWith("/supplier-responses")
    ) {
      return jsonResponse(route, {});
    }
    if (pathName.includes("/integrations/procurement/sync-runs")) return jsonResponse(route, { runs: [] });

    return jsonResponse(route, {});
  });
}

async function assertNoHorizontalOverflow(page, label) {
  const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  const detail = noHorizontalOverflow
    ? ""
    : await page.evaluate(() => {
        const viewportWidth = document.documentElement.clientWidth;
        return Array.from(document.querySelectorAll("body *"))
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              tag: element.tagName.toLowerCase(),
              className: typeof element.className === "string" ? element.className : "",
              text: (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80),
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              width: Math.round(rect.width)
            };
          })
          .filter((item) => item.right > viewportWidth + 1 || item.left < -1 || item.width > viewportWidth + 1)
          .sort((a, b) => b.width - a.width)
          .slice(0, 8);
      });
  record(`${label} viewport has no horizontal overflow`, noHorizontalOverflow, detail ? JSON.stringify(detail) : "");
}

async function runFixture(baseUrl, cookie) {
  const browser = await launchBrowser();
  const failedRequests = [];
  const failedResponses = [];

  try {
    const attachFailureListeners = (page) => {
      page.on("requestfailed", (request) => {
        const errorText = request.failure()?.errorText ?? "";
        if (errorText.includes("net::ERR_ABORTED")) return;
        failedRequests.push(`${request.method()} ${request.url()} ${errorText}`);
      });
      page.on("response", (response) => {
        if (response.url().includes("/api/") && response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
      });
    };

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies([{ name: cookie.name, value: cookie.value, url: baseUrl, httpOnly: true, sameSite: "Lax" }]);
    const page = await context.newPage();
    attachFailureListeners(page);
    await installApiFixture(page);

    await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "圖面資料", exact: true }).waitFor({ timeout: 15000 });
    await page.locator("[data-dashboard-submission-row='true']", { hasText: "D-QC-DAILY-001" }).waitFor({ timeout: 15000 });

    record("daily work list renders non-obsolete submission", await page.getByText("D-QC-DAILY-001").isVisible());
    record(
      "daily work list excludes obsolete history submission",
      (await page.locator("[data-dashboard-submission-row='true']", { hasText: "D-QC-HISTORY-001" }).count()) === 0
    );
    record("daily status tabs do not expose obsolete", (await page.locator(".status-tabs button", { hasText: "已作廢" }).count()) === 0);

    const panel = page.locator("[data-controlled-history-surface='true']");
    await panel.waitFor({ timeout: 15000 });
    await panel.locator("summary").click();
    await panel.locator("[data-controlled-history-row='submission']", { hasText: "D-QC-HISTORY-001" }).waitFor({ timeout: 15000 });

    record("controlled-history entry point renders count", await panel.locator("summary", { hasText: "4 筆" }).isVisible());
    record("controlled-history rows show obsolete result", (await panel.getByText("已作廢", { exact: true }).count()) === 4);
    record("controlled-history rows show history stage", (await panel.getByText("歷史", { exact: true }).count()) === 4);
    record("controlled-history rows show controlled traceability tag", (await panel.getByText("受控追溯", { exact: true }).count()) === 4);
    record("controlled-history row shows formal drawing label", await panel.getByText("正式圖面", { exact: true }).isVisible());
    record("controlled-history row shows formal part label", await panel.getByText("正式料號", { exact: true }).isVisible());
    record("controlled-history row shows formal drawing-number label", await panel.getByText("正式圖號", { exact: true }).isVisible());
    record("controlled-history row shows formal BOM label", await panel.getByText("正式 BOM", { exact: true }).isVisible());
    record("controlled-history row shows requester", await panel.getByText("工程師 A").isVisible());
    record("controlled-history row shows reviewer", await panel.getByText("研發主管 B").isVisible());
    record("controlled-history row shows reason", await panel.getByText("圖面已由新正式版取代").isVisible());
    record("controlled-history row shows decision reason", await panel.getByText("已確認無未結製造交接").isVisible());
    record("controlled-history shows non-submission responsibility-chain-only marker", (await panel.getByText("責任鏈已列出").count()) === 3);
    record("controlled-history has traceability action", await panel.getByRole("button", { name: "查看追溯" }).isVisible());
    record(
      "controlled-history has no destructive action buttons",
      (await panel.getByRole("button", { name: /刪除|還原|申請作廢|核准作廢|退回申請/u }).count()) === 0
    );
    record(
      "controlled-history immutable action contract is rendered",
      (await panel.locator("[data-controlled-history-actions='delete:false;restore:false;obsolete:false']").count()) === 4
    );

    await panel.getByRole("button", { name: "查看追溯" }).click();
    await page.locator(".dashboard-detail-drawer-panel", { hasText: "D-QC-HISTORY-001" }).waitFor({ timeout: 15000 });
    record("traceability action opens obsolete submission detail", await page.locator(".dashboard-detail-drawer-panel", { hasText: "已作廢" }).isVisible());

    await assertNoHorizontalOverflow(page, "desktop");
    record("no API responses failed", failedResponses.length === 0, failedResponses.join("\n"));
    record("no browser requests failed", failedRequests.length === 0, failedRequests.join("\n"));

    await fs.mkdir(screenshotDir, { recursive: true });
    await page.screenshot({ path: desktopScreenshotPath, fullPage: true });
    record("desktop controlled-history screenshot captured", true, desktopScreenshotPath);

    await context.close();

    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await mobileContext.addCookies([{ name: cookie.name, value: cookie.value, url: baseUrl, httpOnly: true, sameSite: "Lax" }]);
    const mobilePage = await mobileContext.newPage();
    attachFailureListeners(mobilePage);
    await installApiFixture(mobilePage);
    await mobilePage.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
    await mobilePage.getByRole("heading", { name: "圖面資料", exact: true }).waitFor({ timeout: 15000 });
    const mobilePanel = mobilePage.locator("[data-controlled-history-surface='true']");
    await mobilePanel.waitFor({ timeout: 15000 });
    await mobilePanel.evaluate((element) => element.setAttribute("open", ""));
    await mobilePanel.locator("[data-controlled-history-row='submission']", { hasText: "D-QC-HISTORY-001" }).waitFor({ timeout: 15000 });
    await mobilePanel.locator("[data-controlled-history-row='bom_release']", { hasText: "P-QC-BOM-001" }).waitFor({ timeout: 15000 });
    await assertNoHorizontalOverflow(mobilePage, "mobile");
    await mobilePage.screenshot({ path: mobileScreenshotPath, fullPage: true });
    record("mobile controlled-history screenshot captured", true, mobileScreenshotPath);
    record("no API responses failed after mobile render", failedResponses.length === 0, failedResponses.join("\n"));
    record("no browser requests failed after mobile render", failedRequests.length === 0, failedRequests.join("\n"));

    await mobileContext.close();
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
  console.log(`qc:pdm-lifecycle-controlled-history-ui passed ${checks.length}/${checks.length} checks`);
  console.log(`desktop screenshot: ${desktopScreenshotPath}`);
  console.log(`mobile screenshot: ${mobileScreenshotPath}`);
}

main().catch((error) => {
  console.error(JSON.stringify({ passed: checks.filter((check) => check.passed).length, failed: 1, checks, error: error.message }, null, 2));
  process.exit(1);
});
