import { chromium } from "playwright";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3000";
const browserBaseUrl = toBrowserBaseUrl(apiBaseUrl);
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const unique = Date.now().toString().slice(-6);
const dataDir = path.resolve(process.cwd(), process.env.PDM_DATA_DIR?.trim() || "data");
const dbPath = path.join(dataDir, "ai-pdm.sqlite");
const repositoryDir = path.resolve(process.cwd(), process.env.PDM_REPOSITORY_DIR?.trim() || path.join(dataDir, "repository"));
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

function createSubmissionFixture() {
  const db = new Database(dbPath);
  const now = new Date().toISOString();
  const submissionId = `SUB-UI-${crypto.randomUUID().slice(0, 12).toUpperCase()}`;
  const itemId = crypto.randomUUID();
  const rootId = crypto.randomUUID();
  const partNumberId = crypto.randomUUID();
  const drawingNumberId = crypto.randomUUID();
  const drawingNumber = `UIE2E-${unique}`;
  const partNumber = `P-UIE2E-${unique}`;
  const rootCode = `Q${crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
  const fileId = crypto.randomUUID();
  const filename = `${drawingNumber}.pdf`;
  const fileBytes = Buffer.from("ui e2e pdf placeholder");
  const fixtureFolder = path.join(repositoryDir, "submissions", submissionId);
  const localPath = path.join(fixtureFolder, filename);
  fs.mkdirSync(fixtureFolder, { recursive: true });
  fs.writeFileSync(localPath, fileBytes);

  try {
    const ruleVersionId = db.prepare("SELECT id FROM numbering_rule_versions ORDER BY created_at ASC LIMIT 1").pluck().get();
    if (!ruleVersionId) throw new Error("UI fixture requires a numbering rule version");
    const snapshotJson = JSON.stringify({
      fixture_source: "ui_e2e_disposable_db",
      root: { id: rootId, root_code: rootCode },
      drawing: { id: drawingNumberId, drawing_number: drawingNumber },
      part: { id: partNumberId, part_number: partNumber }
    });

    db.transaction(() => {
      db.prepare(
        `INSERT INTO items (id, company_id, part_number, part_name, current_revision, created_at, updated_at)
         VALUES (?, 'company-jenfu', ?, 'UI E2E Part', NULL, ?, ?)`
      ).run(itemId, partNumber, now, now);
      db.prepare(
        `INSERT INTO part_roots (
          id, company_id, root_code, core_name, item_kind, record_status, rule_version_id, created_by, created_at, updated_at
        ) VALUES (?, 'company-jenfu', ?, 'UI E2E Part', 'manufactured', 'Active', ?, 'user-engineer-demo', ?, ?)`
      ).run(rootId, rootCode, ruleVersionId, now, now);
      db.prepare(
        `INSERT INTO part_numbers (
          id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind,
          record_status, rule_version_id, created_by, created_at, updated_at
        ) VALUES (?, 'company-jenfu', ?, ?, 1, '01', 'UI E2E Part', 'manufactured', 'Active', ?, 'user-engineer-demo', ?, ?)`
      ).run(partNumberId, rootId, partNumber, ruleVersionId, now, now);
      db.prepare(
        `INSERT INTO drawing_numbers (
          id, company_id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no,
          is_primary_manufacturing, record_status, rule_version_id, created_by, created_at, updated_at
        ) VALUES (?, 'company-jenfu', ?, ?, 'R', 'UI E2E reference drawing', 1, 0, 'Active', ?, 'user-engineer-demo', ?, ?)`
      ).run(drawingNumberId, rootId, drawingNumber, ruleVersionId, now, now);
      db.prepare(
        `INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by, created_at)
         VALUES (?, ?, ?, 'reference', 'user-engineer-demo', ?)`
      ).run(crypto.randomUUID(), drawingNumberId, partNumberId, now);
      db.prepare(
        `INSERT INTO submissions (
          id, company_id, item_id, drawing_number, revision, material, surface_finish, document_type,
          change_description, status, submitted_by, approval_required, source_entity_type, source_entity_id, created_at, updated_at
        ) VALUES (?, 'company-jenfu', ?, ?, 'A', 'S45C', 'Black Oxide', 'Drawing',
          'UI e2e validates review dashboard', 'Pending', 'user-engineer-demo', 1, 'drawing_number', ?, ?, ?)`
      ).run(submissionId, itemId, drawingNumber, drawingNumberId, now, now);
      db.prepare(
        `INSERT INTO submission_snapshots (
          id, submission_id, company_id, source_root_id, source_root_code,
          source_drawing_number_id, source_drawing_number, source_part_number_id, source_part_number,
          snapshot_version, rules_version, snapshot_hash, snapshot_json, captured_by, captured_at, created_at
        ) VALUES (?, ?, 'company-jenfu', ?, ?, ?, ?, ?, ?, 'drawing_part_submission_v1', ?, ?, ?, 'user-engineer-demo', ?, ?)`
      ).run(
        crypto.randomUUID(),
        submissionId,
        rootId,
        rootCode,
        drawingNumberId,
        drawingNumber,
        partNumberId,
        partNumber,
        ruleVersionId,
        crypto.createHash("sha256").update(snapshotJson).digest("hex"),
        snapshotJson,
        now,
        now
      );
      db.prepare(
        `INSERT INTO drawing_revision_packages (
          id, company_id, drawing_number_id, drawing_number, revision, status, source_submission_id,
          created_by, created_at, updated_at, submitted_at, snapshot_json
        ) VALUES (?, 'company-jenfu', ?, ?, 'A', 'Pending', ?, 'user-engineer-demo', ?, ?, ?, ?)`
      ).run(`DRP-UI-${crypto.randomUUID()}`, drawingNumberId, drawingNumber, submissionId, now, now, now, snapshotJson);
      db.prepare(
        `INSERT INTO submission_files (
          id, submission_id, file_role, original_filename, local_path, storage_provider, sha256, file_size, created_at
        ) VALUES (?, ?, 'pdf', ?, ?, 'local_repository', ?, ?, ?)`
      ).run(fileId, submissionId, filename, localPath, crypto.createHash("sha256").update(fileBytes).digest("hex"), fileBytes.length, now);
      db.prepare(
        `INSERT INTO audit_logs (id, submission_id, actor_id, action, detail_json, created_at)
         VALUES (?, ?, 'user-engineer-demo', 'Submit', ?, ?)`
      ).run(crypto.randomUUID(), submissionId, JSON.stringify({ fixtureSource: "ui_e2e_disposable_db" }), now);
    })();
    record("UI disposable seed submission created", true, submissionId);
    return submissionId;
  } finally {
    db.close();
  }
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
  await apiLogin("engineer@example.com");
  const submissionId = createSubmissionFixture();
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
    await adminPage.getByRole("heading", { name: "系統設定" }).waitFor({ timeout: 15000 });
    record("UI-013 admin can open settings", await adminPage.getByRole("heading", { name: "系統設定" }).isVisible());
    await adminPage.goto(`${browserBaseUrl}/settings/integrations`);
    await adminPage.getByRole("heading", { name: "Google Drive 設定" }).waitFor({ timeout: 15000 });
    record("UI-020 admin can open integration settings", await adminPage.getByRole("heading", { name: "Google Drive 設定" }).isVisible());
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
