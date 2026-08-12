import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const root = process.cwd();
const runId = crypto.randomUUID();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev049-number-effectiveness-"));
const distDirRelative = `.tmp/next-qc-dev049-number-effectiveness-${runId}`;
const distDir = path.join(root, ...distDirRelative.split("/"));
const outputDir = path.join(root, "output", "playwright", "dev-049-number-effectiveness");
const password = "DEV049-Number-Effectiveness-QC";
const user = {
  id: "dev049-number-effectiveness-admin",
  displayName: "DEV049 Number Effectiveness Admin",
  email: "dev049.number.effectiveness@example.invalid",
  password,
  role: "Admin",
  companyCodes: ["JENFU"]
};
const snapshots = new Map(
  ["next-env.d.ts", "tsconfig.json"].map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")])
);
const results = [];
const browserErrors = [];
let app;
let browser;
let sequence = 0;

function record(id, passed, detail = {}) {
  results.push({ id, passed: Boolean(passed), detail });
}

function nextKey(label) {
  sequence += 1;
  return `dev049:number-effectiveness:${label}:${sequence}`;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => typeof address === "object" && address ? resolve(address.port) : reject(new Error("PORT_UNAVAILABLE")));
    });
  });
}

function startApp(port) {
  const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      PDM_AUTH_MODE: "managed",
      PDM_BOOTSTRAP_USERS: JSON.stringify([user]),
      PDM_DATA_DIR: tempDir,
      PDM_REPOSITORY_DIR: path.join(tempDir, "repository"),
      PDM_DB_PROVIDER: "sqlite",
      PDM_RELEASE_MODE: "local_stub",
      PDM_PUBLICATION_EVIDENCE_MODE: "local_fake",
      PDM_NUMBER_STATE_FLOW_V1: "true",
      PDM_NUMBER_LIFECYCLE_V2: "false",
      PDM_UNIFIED_DRAWING_WORKBENCH_V1: "false",
      PDM_UNIFIED_PART_RELATION_WORKBENCH_V1: "false",
      PDM_PRODUCTION_SLICE_MODE: "",
      GOOGLE_SERVICE_ACCOUNT_KEY_PATH: "",
      GOOGLE_DRIVE_MOCK_ACCESS_TOKEN: "",
      GOOGLE_DRIVE_API_BASE_URL: "",
      PDM_NEXT_DIST_DIR: distDirRelative
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output = (output + chunk.toString()).slice(-30000); });
  child.stderr.on("data", (chunk) => { output = (output + chunk.toString()).slice(-30000); });
  return { child, output: () => output };
}

async function waitForApp(baseUrl) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${baseUrl}/login`)).ok) return;
    } catch {}
    await delay(400);
  }
  throw new Error(`SERVER_START_TIMEOUT\n${app?.output() ?? ""}`);
}

async function stopApp() {
  if (!app || app.child.exitCode !== null) return;
  app.child.kill("SIGINT");
  await Promise.race([
    new Promise((resolve) => app.child.once("exit", resolve)),
    delay(4000).then(() => { if (app.child.exitCode === null) app.child.kill("SIGTERM"); })
  ]);
}

async function removeTempDir(target) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      return;
    } catch {
      await delay(300);
    }
  }
}

async function api(context, baseUrl, input) {
  const response = await context.request.fetch(`${baseUrl}${input.path}`, {
    method: input.method ?? "GET",
    headers: {
      "x-pdm-company-code": "JENFU",
      ...(input.key ? { "Idempotency-Key": input.key } : {})
    },
    data: input.body
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok()) throw new Error(`API_FAILED:${input.path}:${response.status()}:${JSON.stringify(body)}`);
  return body;
}

function workspaceBody(label, autoAcquireCandidates, scope = "both") {
  const includePart = scope === "both" || scope === "part";
  const includeDrawing = scope === "both" || scope === "drawing";
  return {
    draftMode: "new_bundle",
    autoAcquireCandidates,
    root: { coreName: `${label} Root`, itemKind: "manufactured" },
    parts: includePart ? [{ clientKey: "part-1", partName: `${label} Part`, itemKind: "manufactured" }] : [],
    drawings: includeDrawing ? [{ clientKey: "drawing-1", purposeCode: "M", purposeDescription: "", isPrimaryManufacturing: true }] : [],
    relations: includePart && includeDrawing ? [{ drawingClientKey: "drawing-1", partClientKey: "part-1", linkType: "primary_manufacturing", isPrimary: true }] : []
  };
}

async function createWorkspace(context, baseUrl, label, autoAcquireCandidates, scope = "both") {
  return api(context, baseUrl, {
    method: "POST",
    path: "/api/numbering/draft-workspaces",
    key: nextKey(`create-${label.replace(/[^a-z0-9]+/gi, "-")}`),
    body: workspaceBody(label, autoAcquireCandidates, scope)
  });
}

async function pageMetrics(page) {
  return page.evaluate(() => {
    const popover = document.querySelector("[data-status-scope-help='true'][data-status-scope='numberStateWorkspace']");
    const rect = popover?.getBoundingClientRect();
    const items = popover ? [...popover.querySelectorAll(".status-help-item")] : [];
    const itemRects = items.map((item) => item.getBoundingClientRect());
    const visibleHelpButtons = [...document.querySelectorAll("button.status-scope-help-button, button.status-help-button")]
      .filter((button) => {
        const buttonRect = button.getBoundingClientRect();
        const style = window.getComputedStyle(button);
        return buttonRect.width > 0 && buttonRect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      });
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      popoverRect: rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } : null,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      popoverVisible: Boolean(rect && rect.width > 0 && rect.height > 0),
      popoverInsideViewport: Boolean(rect && rect.left >= 0 && rect.right <= window.innerWidth && rect.top >= 0 && rect.bottom <= window.innerHeight),
      popoverContentOverflow: Boolean(popover && popover.scrollWidth > popover.clientWidth + 1),
      popoverItemOverlap: itemRects.some((item, index) => index > 0 && itemRects[index - 1].bottom > item.top + 1),
      helpButtonVisible: Boolean(document.querySelector('[data-status-scope-help-trigger="numberStateWorkspace"] button')),
      visibleHelpButtonCount: visibleHelpButtons.length
    };
  });
}

async function reservedLayoutMetrics(page) {
  return page.locator(".number-state-list-panel").evaluate((panel) => {
    const table = panel.querySelector("table");
    const headers = [...panel.querySelectorAll("thead th")].map((header) => header.textContent?.trim() ?? "");
    const rowCellCounts = [...panel.querySelectorAll("tbody tr")].map((row) => row.querySelectorAll("td").length);
    const codeValues = [...panel.querySelectorAll(".number-state-row-link")].map((code) => code.textContent?.trim() ?? "");
    const applicationNames = [...panel.querySelectorAll(".pdm-identity-name")].map((name) => name.textContent?.trim() ?? "");
    const contentValues = [...panel.querySelectorAll('td[data-label="內容"]')].map((cell) => cell.textContent?.trim() ?? "");
    return {
      headers,
      rowCellCounts,
      codeValues,
      applicationNames,
      contentValues,
      usesMasterTable: Boolean(table?.classList.contains("pdm-identity-table")),
      hasLegacyPanelHeader: Boolean(panel.querySelector(".panel-header")),
      hasNextStepText: Boolean(panel.querySelector(".number-state-next-label")),
      hasOperationColumn: headers.includes("操作") || Boolean(panel.querySelector('[data-label="操作"]'))
    };
  });
}

try {
  fs.mkdirSync(outputDir, { recursive: true });
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  app = startApp(port);
  await waitForApp(baseUrl);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const login = await context.request.post(`${baseUrl}/api/auth/login`, { data: { email: user.email, password } });
  if (!login.ok()) throw new Error(`LOGIN_FAILED:${login.status()}`);

  const unnumbered = await createWorkspace(context, baseUrl, "Unnumbered", false);
  let reserved = await createWorkspace(context, baseUrl, "Reserved", true);
  if (reserved.workspace?.projection?.numberQualification !== "candidate") {
    reserved = await api(context, baseUrl, {
      method: "POST",
      path: `/api/numbering/draft-workspaces/${reserved.workspace.id}/candidate-numbers`,
      key: nextKey("reserve-explicitly"),
      body: { expectedRowVersion: reserved.workspace.rowVersion }
    });
  }
  const partOnly = await createWorkspace(context, baseUrl, "Part Only", true, "part");
  const drawingOnly = await createWorkspace(context, baseUrl, "Drawing Only", true, "drawing");
  record(
    "NE-BROWSER-000 isolated fixtures project unnumbered and reserved states",
    unnumbered.workspace?.projection?.numberQualification === "unnumbered" &&
      [reserved, partOnly, drawingOnly].every((result) => result.workspace?.projection?.numberQualification === "candidate"),
    {
      unnumbered: unnumbered.workspace?.projection?.numberQualification,
      reserved: reserved.workspace?.projection?.numberQualification,
      partOnly: partOnly.workspace?.projection?.numberQualification,
      drawingOnly: drawingOnly.workspace?.projection?.numberQualification,
      reservedCodes: reserved.workspace?.reservations?.map((item) => item.candidateCode) ?? []
    }
  );

  const page = await context.newPage();
  page.on("pageerror", (error) => browserErrors.push({ type: "pageerror", message: error.message }));
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push({ type: "console", message: message.text() }); });
  page.on("response", (response) => { if (response.status() >= 500) browserErrors.push({ type: "network", status: response.status(), url: response.url() }); });
  await page.goto(`${baseUrl}/parts?tab=drafts`, { waitUntil: "networkidle" });
  const numberingRegion = page.getByRole("region", { name: "編號申請清單" });
  try {
    await numberingRegion.waitFor({ state: "visible" });
  } catch (error) {
    const bodyText = await page.locator("body").innerText().catch(() => "");
    const statusBody = await page.evaluate(async () => fetch("/api/numbering/state-flow/status", { cache: "no-store" }).then((response) => response.text()).catch(() => ""));
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nBODY=${bodyText.slice(0, 4000)}\nSTATUS=${statusBody}`);
  }
  await page.getByText("尚未產生料號", { exact: true }).first().waitFor({ state: "visible" });

  const retiredTerms = ["候選", "未領號", "號碼資格", "號碼效力", "舊制保留", "保留號"];
  const bodyText = await page.locator("body").innerText();
  const closedDesktopMetrics = await pageMetrics(page);
  record(
    "NE-BROWSER-001 desktop list uses simplified effectiveness terms",
    retiredTerms.every((term) => !bodyText.includes(term)) &&
      bodyText.includes("申請狀態") &&
      bodyText.includes("尚未產生料號") &&
      bodyText.includes("編輯中") &&
      closedDesktopMetrics.visibleHelpButtonCount === 1 &&
      !closedDesktopMetrics.popoverVisible,
    {
      retiredTermsFound: retiredTerms.filter((term) => bodyText.includes(term)),
      hiddenHelpCopyVisible: bodyText.includes("保留號碼與正式資料分開保存"),
      closedDesktopMetrics
    }
  );
  await page.screenshot({ path: path.join(outputDir, "number-effectiveness-desktop-clean-1440.png") });

  const expectedByRoute = {
    "/parts?tab=drafts": {
      headers: ["料號", "申請名稱", "內容", "申請狀態"],
      reservedCode: "A0001-P01",
      emptyCode: "尚未產生料號",
      forbiddenCode: "A0001-M01",
      includedApplications: ["Reserved Root", "Unnumbered Root", "Part Only Root"],
      excludedApplications: ["Drawing Only Root"],
      contents: ["1 料號"]
    },
    "/numbering/drawings?tab=reserved": {
      headers: ["圖號", "申請名稱", "內容", "申請狀態"],
      reservedCode: "A0001-M01",
      emptyCode: "尚未產生圖號",
      forbiddenCode: "A0001-P01",
      includedApplications: ["Reserved Root", "Unnumbered Root", "Drawing Only Root"],
      excludedApplications: ["Part Only Root"],
      contents: ["1 圖號"]
    },
    "/numbering/search?tab=reserved": {
      headers: ["圖號 / 料號", "申請名稱", "內容", "申請狀態"],
      reservedCode: "A0001-P01、A0001-M01",
      emptyCode: "尚未產生圖料號",
      forbiddenCode: "A0001、",
      includedApplications: ["Reserved Root", "Unnumbered Root", "Part Only Root", "Drawing Only Root"],
      excludedApplications: [],
      contents: ["1 圖號 · 1 料號", "0 圖號 · 1 料號", "1 圖號 · 0 料號"]
    }
  };
  const moduleLayouts = [];
  for (const moduleRoute of Object.keys(expectedByRoute)) {
    if (new URL(page.url()).pathname + new URL(page.url()).search !== moduleRoute) {
      await page.goto(`${baseUrl}${moduleRoute}`, { waitUntil: "networkidle" });
      await page.getByRole("region", { name: "編號申請清單" }).waitFor({ state: "visible" });
    }
    moduleLayouts.push({ moduleRoute, ...(await reservedLayoutMetrics(page)) });
  }
  record(
    "NE-BROWSER-001A reserved lists keep module-specific number boundaries",
    moduleLayouts.every((layout) => {
      const expected = expectedByRoute[layout.moduleRoute];
      return JSON.stringify(layout.headers) === JSON.stringify(expected.headers) &&
        layout.rowCellCounts.length > 0 &&
        layout.rowCellCounts.every((count) => count === 4) &&
        layout.codeValues.includes(expected.reservedCode) &&
        layout.codeValues.includes(expected.emptyCode) &&
        layout.codeValues.every((code) => !code.includes(expected.forbiddenCode)) &&
        expected.includedApplications.every((name) => layout.applicationNames.includes(name)) &&
        expected.excludedApplications.every((name) => !layout.applicationNames.includes(name)) &&
        layout.contentValues.every((content) => expected.contents.includes(content)) &&
        layout.usesMasterTable &&
        !layout.hasLegacyPanelHeader &&
        !layout.hasNextStepText &&
        !layout.hasOperationColumn;
    }),
    { expectedByRoute, moduleLayouts }
  );
  await page.goto(`${baseUrl}/parts?tab=drafts`, { waitUntil: "networkidle" });
  await page.getByRole("region", { name: "編號申請清單" }).waitFor({ state: "visible" });

  await page.getByRole("button", { name: "查看編號申請分頁說明" }).click();
  const help = page.getByRole("dialog", { name: "編號申請分頁說明" });
  await help.waitFor({ state: "visible" });
  const helpText = await help.innerText();
  const desktopMetrics = await pageMetrics(page);
  record(
    "NE-BROWSER-002 help explains the 3+1 vocabulary",
    ["編輯中", "申請中", "已發布", "已取消"].every((term) => helpText.includes(term)) && desktopMetrics.visibleHelpButtonCount === 1 && desktopMetrics.popoverInsideViewport &&
      !desktopMetrics.popoverContentOverflow && !desktopMetrics.popoverItemOverlap,
    { helpText, desktopMetrics }
  );
  await page.screenshot({ path: path.join(outputDir, "number-effectiveness-desktop-1440.png") });

  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(outputDir, "number-effectiveness-mobile-clean-390.png") });
  await page.getByRole("button", { name: "查看編號申請分頁說明" }).click();
  await help.waitFor({ state: "visible" });
  const mobileMetrics = await pageMetrics(page);
  record(
    "NE-BROWSER-003 mobile keeps help reachable without horizontal overflow",
    mobileMetrics.helpButtonVisible && mobileMetrics.visibleHelpButtonCount === 1 && mobileMetrics.popoverInsideViewport && !mobileMetrics.horizontalOverflow &&
      !mobileMetrics.popoverContentOverflow && !mobileMetrics.popoverItemOverlap,
    { mobileMetrics }
  );
  await page.screenshot({ path: path.join(outputDir, "number-effectiveness-mobile-390.png") });
  record("NE-BROWSER-004 browser run has no console, page, or 5xx errors", browserErrors.length === 0, { browserErrors });
  fs.writeFileSync(path.join(outputDir, "number-effectiveness-metrics.json"), JSON.stringify({ results, browserErrors }, null, 2));
  await context.close();
} catch (error) {
  record("NE-BROWSER-FIXTURE", false, {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    browserErrors,
    serverTail: app?.output() ?? ""
  });
} finally {
  await browser?.close().catch(() => undefined);
  await stopApp();
  for (const [file, content] of snapshots) fs.writeFileSync(path.join(root, file), content, "utf8");
  await removeTempDir(distDir);
  await removeTempDir(tempDir);
}

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ suite: "DEV-049 number effectiveness browser QC", passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exit(1);
