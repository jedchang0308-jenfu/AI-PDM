import { chromium } from "playwright";
import Database from "better-sqlite3";
import path from "node:path";

const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3000";
const browserBaseUrl = toBrowserBaseUrl(apiBaseUrl);
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const unique = Date.now().toString().slice(-6);
const dbPath = path.join(process.cwd(), "data", "ai-pdm.sqlite");
const results = [];

function toBrowserBaseUrl(value) {
  const url = new URL(value);
  if (url.hostname === "127.0.0.1") {
    url.hostname = "localhost";
  }
  return url.toString().replace(/\/$/, "");
}

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) {
    throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
  }
}

async function apiLogin(email) {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  record(`API login ${email}`, response.ok, `HTTP ${response.status}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  const [name, ...valueParts] = cookie.split("=");
  return { header: cookie, name, value: valueParts.join("=") };
}

async function createSubmission(cookie) {
  const form = new FormData();
  form.set("drawing_number", `UIE2E-${unique}`);
  form.set("part_number", `P-UIE2E-${unique}`);
  form.set("part_name", "UI E2E Part");
  form.set("revision", "A");
  form.set("material", "S45C");
  form.set("surface_finish", "Black Oxide");
  form.set("document_type", "Drawing");
  form.set("change_description", "UI e2e validates review dashboard");
  form.append("files", new File([Buffer.from("ui e2e pdf placeholder")], `UIE2E-${unique}.pdf`, { type: "application/pdf" }));

  const response = await fetch(`${apiBaseUrl}/api/submissions`, {
    method: "POST",
    headers: { cookie: cookie.header },
    body: form
  });
  const body = await response.json().catch(() => ({}));
  record("UI seed submission created", response.status === 201, `HTTP ${response.status}`);
  return body.submissionId;
}

function attachMockDriveFile(submissionId) {
  const db = new Database(dbPath);
  try {
    const fileId = `mock-drive-ui-${unique}`;
    const result = db
      .prepare("UPDATE submission_files SET gdrive_file_id = ?, gdrive_status = 'uploaded' WHERE submission_id = ? AND file_role = 'pdf'")
      .run(fileId, submissionId);
    record("UI seed PDF marked as Google Drive uploaded", result.changes === 1, `${result.changes} rows`);
    return fileId;
  } finally {
    db.close();
  }
}

async function authenticatedPage(browser, email, options = {}) {
  const cookie = await apiLogin(email);
  const context = await browser.newContext(options);
  await context.addCookies([
    {
      name: cookie.name,
      value: cookie.value,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
  const page = await context.newPage();
  await page.goto(`${browserBaseUrl}/`);
  await page.locator('section[aria-label="PDM search"]').waitFor({ timeout: 15000 });
  return { context, page };
}

async function openSubmissionByDrawing(page, drawingNumber) {
  await page.locator("tbody tr", { hasText: drawingNumber }).first().click();
}

async function run() {
  const engineerCookie = await apiLogin("engineer@example.com");
  const submissionId = await createSubmission(engineerCookie);
  const driveFileId = attachMockDriveFile(submissionId);
  const browser = await chromium.launch({ headless: true });

  try {
    const loginContext = await browser.newContext();
    const loginPage = await loginContext.newPage();
    await loginPage.goto(`${browserBaseUrl}/login`);
    record("UI-001 login page loads", await loginPage.locator('input[type="email"]').count().then((count) => count === 1));
    await loginContext.close();

    const { context: managerContext, page: managerPage } = await authenticatedPage(browser, "manager@example.com");
    record(
      "UI-002 manager dashboard loads",
      await managerPage
        .locator('section[aria-label="AI PDM multi-role workbench"]')
        .count()
        .then((count) => count === 1)
    );
    await openSubmissionByDrawing(managerPage, `UIE2E-${unique}`);
    await managerPage.locator(".detail-quick-actions").waitFor({ timeout: 15000 });
    record("UI-003 manager can open seeded submission detail", await managerPage.locator(".detail-quick-actions").isVisible());
    await managerPage.locator(".engineering-context > summary").click();
    record("UI-004 revision history is visible", await managerPage.locator(".engineering-context .revision-history").isVisible());
    await managerPage.locator(".collaboration-review > summary").click();
    record("UI-005 manager sees approve control", await managerPage.getByRole("button", { name: /核准/ }).count().then((count) => count > 0));
    record("UI-006 manager sees reject control", await managerPage.locator('button.danger-button:has-text("駁回")').count().then((count) => count > 0));
    record("UI-007 file preview link is visible", await managerPage.getByRole("link", { name: /預覽/ }).count().then((count) => count > 0));
    record("UI-008 file download link is visible", await managerPage.getByRole("link", { name: /下載/ }).count().then((count) => count > 0));
    record("UI-018 Drive preview link is visible", await managerPage.getByRole("link", { name: /Drive 預覽/ }).count().then((count) => count > 0));
    await managerPage.locator(".system-diagnostics > summary").click();
    await managerPage.locator(".system-diagnostics .file-diagnostic-item > summary").first().click();
    record(
      "UI-019 Drive PDF iframe uses mock file id",
      await managerPage
        .locator(`iframe[src="https://drive.google.com/file/d/${driveFileId}/preview"]`)
        .isVisible()
    );

    await managerPage.goto(`${browserBaseUrl}/settings`);
    await managerPage.getByText("需要系統管理員權限").waitFor({ timeout: 15000 });
    record("UI-009 manager is blocked from settings", await managerPage.getByText("只有系統管理員可以管理系統設定。").count().then((count) => count > 0));
    await managerContext.close();

    const { context: engineerContext, page: engineerPage } = await authenticatedPage(browser, "engineer@example.com");
    await openSubmissionByDrawing(engineerPage, `UIE2E-${unique}`);
    await engineerPage.locator(".detail-quick-actions").waitFor({ timeout: 15000 });
    record("UI-010 engineer can see own submission", await engineerPage.locator(".detail-quick-actions").isVisible());
    await engineerPage.locator(".collaboration-review > summary").click();
    record("UI-011 engineer does not see approve control", await engineerPage.getByRole("button", { name: /核准/ }).count().then((count) => count === 0));
    record("UI-012 engineer does not see reject control", await engineerPage.locator('button.danger-button:has-text("駁回")').count().then((count) => count === 0));
    await engineerContext.close();

    const { context: adminContext, page: adminPage } = await authenticatedPage(browser, "admin@example.com");
    await adminPage.goto(`${browserBaseUrl}/settings`);
    await adminPage.getByText("Google Drive 設定").waitFor({ timeout: 15000 });
    record("UI-013 admin can open settings", await adminPage.getByText("環境設定").count().then((count) => count > 0));
    await adminContext.close();

    const { context: mobileContext, page: mobilePage } = await authenticatedPage(browser, "manager@example.com", {
      viewport: { width: 390, height: 844 },
      isMobile: true
    });
    await mobilePage.getByRole("button", { name: "開啟 AI 助手" }).waitFor({ timeout: 15000 });
    record("UI-014 mobile AI chat toggle is visible", await mobilePage.getByRole("button", { name: "開啟 AI 助手" }).isVisible());
    await mobilePage.getByRole("button", { name: "開啟 AI 助手" }).click();
    record("UI-015 mobile AI chat panel opens", await mobilePage.locator(".chat.mobile-open").count().then((count) => count === 1));
    await mobilePage.locator(".chat-form textarea").fill("summary");
    await mobilePage.locator(".chat-form button.primary-button").click();
    await mobilePage.locator(".message.assistant", { hasText: /待審核|已發布|已駁回|發布失敗/ }).last().waitFor({ timeout: 15000 });
    record("UI-016 mobile AI chat returns an answer", await mobilePage.locator(".message.assistant", { hasText: /待審核|已發布|已駁回|發布失敗/ }).count().then((count) => count > 0));
    await mobilePage.getByRole("button", { name: "關閉 AI 助手" }).click();
    record("UI-017 mobile AI chat panel closes", await mobilePage.locator(".chat.mobile-open").count().then((count) => count === 0));
    await mobileContext.close();
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
}

run().catch((error) => {
  const failed = results.filter((result) => !result.passed).length || 1;
  console.error(JSON.stringify({ passed: results.length - failed, failed, results, error: error.message }, null, 2));
  process.exit(1);
});
