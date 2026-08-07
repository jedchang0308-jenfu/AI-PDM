#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3100";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const results = [];

function record(name, passed, detail = "") {
  const ok = Boolean(passed);
  results.push({ name, passed: ok, detail });
  if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function includesAll(source, needles) {
  return needles.every((needle) => source.includes(needle));
}

function rolePermissionEnabled(matrix, roleCode, permissionKind, permissionCode) {
  const role = matrix.roles.find((item) => item.roleCode === roleCode);
  if (!role) return false;
  return matrix.rolePermissions.some(
    (permission) =>
      permission.roleId === role.id &&
      permission.permissionKind === permissionKind &&
      permission.permissionCode === permissionCode &&
      permission.allowed
  );
}

function assertStaticContract() {
  const schema = read("db/schema.sql");
  record(
    "SQLite schema includes launch assignment governance columns",
    includesAll(schema, ["scope_template TEXT NOT NULL DEFAULT 'own_department'", "sponsor_user_id TEXT", "review_due_at TEXT", "hard_ends_at TEXT"])
  );
  record(
    "SQLite schema seeds launch access roles and external specialist permissions",
    includesAll(schema, ["role-external-specialist", "external_specialist", "pdm.comment.create", "pdm.advice.create"])
  );

  const postgresMigration = read("db/postgres/005_access_control_launch_governance.sql");
  record(
    "Postgres migration mirrors access-control launch schema",
    includesAll(postgresMigration, ["ADD COLUMN IF NOT EXISTS scope_template", "external_specialist", "pdm.comment.create", "pdm.advice.create"])
  );

  const route = read("src/app/api/numbering/admin/matrix/route.ts");
  record(
    "Admin matrix API accepts role assignment scope metadata",
    includesAll(route, ["scopeTemplate", "namedScope", "sponsorUserId", "reviewDueAt", "hardEndsAt"])
  );

  const repository = read("src/lib/repositories/numbering-repository.ts");
  record(
    "Sync repository enforces external specialist sponsor, named scope, and 90-day review default",
    includesAll(repository, [
      "NUMBERING_EXTERNAL_SPECIALIST_REQUIRES_NAMED_SCOPE",
      "NUMBERING_EXTERNAL_SPECIALIST_SPONSOR_REQUIRED",
      "reviewDueAt = reviewDueAt ?? defaultReviewDueDate(now)"
    ])
  );

  const asyncRepository = read("src/lib/repositories/numbering-async-repository.ts");
  record(
    "Async repository enforces same external specialist governance",
    includesAll(asyncRepository, [
      "NUMBERING_EXTERNAL_SPECIALIST_REQUIRES_NAMED_SCOPE",
      "NUMBERING_EXTERNAL_SPECIALIST_SPONSOR_REQUIRED",
      "reviewDueAt = reviewDueAt ?? defaultReviewDueDate(now)"
    ])
  );

  const settingsPage = read("src/app/settings/page.tsx");
  record(
    "Settings UI exposes workspace context, access tabs, scope, sponsor, review due, and permission preview",
    includesAll(settingsPage, [
      "access-workspace-context",
      "access-tab-${tab.id}",
      'id: "user_access"',
      'id: "external_specialists"',
      'id: "audit"',
      "role-assignment-scope-template",
      "role-assignment-sponsor",
      "role-assignment-review-due",
      "role-assignment-permission-preview"
    ])
  );
  record(
    "Approval rule UI uses predicted release/use controls",
    includesAll(settingsPage, ["是否需要審核", "標示方式", "withPredictedApprovalControls"]) &&
      !settingsPage.includes("阻擋使用") &&
      !settingsPage.includes("阻擋發行")
  );
  record(
    "Admin matrix API overrides manual approval blocking fields",
    includesAll(route, ["blocksUsage: false", "blocksRelease: true"])
  );
  record("Settings UI keeps company selection out of admin workflow", !settingsPage.includes("access-company-selector"));
}

async function login(email) {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  record(`${email} login succeeds`, response.status === 200, `HTTP ${response.status}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  record(`${email} login returns session cookie`, Boolean(cookie), cookie ? "cookie received" : "missing cookie");
  return cookie;
}

async function request(method, urlPath, cookie) {
  const response = await fetch(`${apiBaseUrl}${urlPath}`, {
    method,
    headers: { "content-type": "application/json", cookie }
  });
  const text = await response.text();
  record(`${method} ${urlPath} returns 200`, response.status === 200, `HTTP ${response.status}: ${text.slice(0, 240)}`);
  return text ? JSON.parse(text) : {};
}

async function assertApiContract(cookie) {
  const matrix = await request("GET", "/api/numbering/admin/matrix", cookie);
  const roleCodes = matrix.roles.map((role) => role.roleCode);
  record("Admin matrix includes launch roles", ["manufacturing", "procurement", "external_specialist"].every((roleCode) => roleCodes.includes(roleCode)), roleCodes.join(", "));
  record("Admin matrix exposes access audit events array", Array.isArray(matrix.auditEvents), typeof matrix.auditEvents);
  record(
    "Admin matrix exposes external specialist action codes",
    matrix.options.actionCodes.includes("pdm.comment.create") && matrix.options.actionCodes.includes("pdm.advice.create"),
    JSON.stringify(matrix.options.actionCodes)
  );
  const nonPredictedApprovalRules = matrix.approvalRules.filter((rule) => rule.blocksUsage || !rule.blocksRelease);
  record(
    "Admin matrix approval rules expose predicted use/release controls",
    nonPredictedApprovalRules.length === 0,
    JSON.stringify(nonPredictedApprovalRules.map((rule) => ({ id: rule.id, blocksUsage: rule.blocksUsage, blocksRelease: rule.blocksRelease })))
  );

  record("External specialist can search", rolePermissionEnabled(matrix, "external_specialist", "page", "numbering.search"));
  record("External specialist can view drawings", rolePermissionEnabled(matrix, "external_specialist", "page", "numbering.drawings.view"));
  record("External specialist can comment", rolePermissionEnabled(matrix, "external_specialist", "action", "pdm.comment.create"));
  record("External specialist can advise", rolePermissionEnabled(matrix, "external_specialist", "action", "pdm.advice.create"));
  record("External specialist cannot create numbering records by default", !rolePermissionEnabled(matrix, "external_specialist", "action", "numbering.create"));
  record("External specialist cannot approve release by default", !rolePermissionEnabled(matrix, "external_specialist", "action", "release"));
  record("External specialist cannot export by default", !rolePermissionEnabled(matrix, "external_specialist", "action", "numbering.export.create"));
  record("External specialist cannot administer settings by default", !rolePermissionEnabled(matrix, "external_specialist", "action", "settings.admin_matrix"));
}

async function addCookie(context, cookie) {
  const [name, ...valueParts] = cookie.split("=");
  const url = new URL(apiBaseUrl);
  await context.addCookies([
    {
      name,
      value: valueParts.join("="),
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax"
    }
  ]);
}

function diffDays(dateText) {
  const today = new Date().toISOString().slice(0, 10);
  return Math.round((Date.parse(`${dateText}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

async function assertSettingsUi(browser, cookie, viewportName, viewport) {
  const context = await browser.newContext({ viewport });
  const consoleErrors = [];
  const failedResponses = [];
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("response", (response) => {
    const url = response.url();
    const optionalLocalIntegration = url.includes("/api/settings/gdrive/folders");
    if (response.status() >= 500 && !url.includes("/_next/webpack-hmr") && !optionalLocalIntegration) {
      failedResponses.push(`${response.status()} ${url}`);
    }
  });
  try {
    await addCookie(context, cookie);
    await page.goto(`${apiBaseUrl}/settings/workflow`, { waitUntil: "networkidle" });
    await page.getByText("審核矩陣設定台").waitFor({ timeout: 10_000 });
    await page.locator('[data-testid="access-workspace-context"]').waitFor({ timeout: 10_000 });
    const workspaceText = await page.locator('[data-testid="access-workspace-context"]').innerText();
    record(`${viewportName} renders fixed Jenfu workspace context`, workspaceText.includes("鉦富 Jenfu PDM") && workspaceText.includes("不能在這裡切換公司"), workspaceText);
    record(`${viewportName} has no company selector`, (await page.locator('[data-testid="access-company-selector"]').count()) === 0);
    for (const tabName of ["角色管理", "使用者權限", "外部專員", "異動紀錄"]) {
      record(`${viewportName} 權限分頁使用中文名稱：${tabName}`, (await page.getByRole("tab", { name: tabName, exact: true }).count()) === 1);
    }
    record(
      `${viewportName} 權限分頁不顯示舊英文名稱`,
      (await page.getByRole("tab", { name: /^(Roles|User access|External specialists|Audit)$/ }).count()) === 0
    );

    await page.getByText("規則模板", { exact: true }).waitFor({ timeout: 10_000 });
    const rolesPanelText = await page.locator('[data-testid="approval-matrix-panel"]').innerText();
    const ruleSummaryValues = await page
      .locator('[data-testid="approval-rule-summary"]')
      .evaluateAll((items) => items.map((item) => item.textContent?.trim() ?? ""));
    const ruleSummaryRenderedTexts = await page
      .locator('[data-testid="approval-rule-summary"]')
      .evaluateAll((items) => items.map((item) => item.innerText?.trim() ?? ""));
    record(
      `${viewportName} 規則矩陣使用中文管理語言`,
      ruleSummaryValues.some((summary) => summary.includes("確認沒有主要製造圖仍要發行")) &&
        ruleSummaryValues.some((summary) => summary.includes("正式發行")) &&
        rolesPanelText.includes("自製件") &&
        rolesPanelText.includes("待審核") &&
        rolesPanelText.includes("編號不可重複"),
      `${ruleSummaryValues.join(" / ")}\n${rolesPanelText.slice(0, 1200)}`
    );
    const developerSummaryFragments = [" / ", "阻擋使用", "阻擋發行", "警示", "匯出標示", "僅記錄"];
    const hardToReadSummaries = ruleSummaryValues.filter(
      (summary) => !summary.includes("情境：") || !summary.includes("處理：") || developerSummaryFragments.some((fragment) => summary.includes(fragment))
    );
    record(`${viewportName} 規則摘要使用管理者可讀句型`, hardToReadSummaries.length === 0, hardToReadSummaries.join("\n"));
    const unwrappedSummaries = ruleSummaryRenderedTexts.filter((summary) => summary.includes("處理：") && !summary.includes("\n處理："));
    record(`${viewportName} 規則摘要將情境與處理分行`, unwrappedSummaries.length === 0, unwrappedSummaries.join("\n"));
    const oldBlockingControlsVisible = rolesPanelText.includes("阻擋使用") || rolesPanelText.includes("阻擋發行") || ruleSummaryValues.some((summary) => summary.includes("審核前不可使用"));
    record(
      `${viewportName} 審核矩陣改用系統預測的使用與發行控制`,
      rolesPanelText.includes("是否需要審核") &&
        rolesPanelText.includes("標示方式") &&
        rolesPanelText.includes("需要審核") &&
        rolesPanelText.includes("畫面提醒") &&
        ruleSummaryValues.every((summary) => summary.includes("不可正式發行") && summary.includes("使用處會標示風險")) &&
        !oldBlockingControlsVisible,
      oldBlockingControlsVisible ? rolesPanelText : ruleSummaryValues.join("\n")
    );
    record(
      `${viewportName} 規則摘要不可自由輸入`,
      (await page.locator('[data-testid="approval-rule-name"], [data-testid="approval-new-rule-name"], input[data-testid="approval-rule-summary"], input[data-testid="approval-new-rule-summary"]').count()) === 0
    );
    const developerTerms = [
      "main_drawing_restore",
      "merge_part_number",
      "obsolete_ma_drawing",
      "obsolete_part_number",
      "manufactured",
      "outsourced",
      "purchased",
      "PendingReview",
      "MainDrawingInvalid",
      "missing_primary_ma",
      "has_reference",
      "numbering-rule-v2",
      "DUPLICATE_CODE_HARD_BLOCK",
      "approval rules",
      "action_code"
    ];
    const combinedVisibleText = `${ruleSummaryValues.join("\n")}\n${rolesPanelText}`;
    const leakedDeveloperTerms = developerTerms.filter((term) => combinedVisibleText.includes(term));
    record(`${viewportName} 規則矩陣不顯示英文代碼與開發者語言`, leakedDeveloperTerms.length === 0, leakedDeveloperTerms.join(", "));
    const actionOptions = await page.locator('[data-testid="approval-rule-action"]').first().evaluate((select) => Array.from(select.options).map((option) => option.textContent?.trim() ?? ""));
    record(
      `${viewportName} 規則動作下拉選單使用中文選項`,
      actionOptions.includes("發行時缺少主要製造圖確認") && actionOptions.includes("正式發行審核") && !actionOptions.includes("release_missing_ma_confirm"),
      actionOptions.join(" / ")
    );
    const itemOptions = await page.locator('[data-testid="approval-rule-item-kind"]').first().evaluate((select) => Array.from(select.options).map((option) => option.textContent?.trim() ?? ""));
    record(`${viewportName} 料件下拉選單使用中文選項`, itemOptions.includes("自製件") && itemOptions.includes("委外件") && !itemOptions.includes("manufactured"), itemOptions.join(" / "));
    const riskOptions = await page.locator('[data-testid="approval-rule-risk"]').first().evaluate((select) => Array.from(select.options).map((option) => option.textContent?.trim() ?? ""));
    record(
      `${viewportName} 風險下拉選單使用中文選項`,
      riskOptions.includes("缺少主要製造圖") && riskOptions.includes("有參考關聯") && !riskOptions.includes("missing_primary_ma"),
      riskOptions.join(" / ")
    );
    await page.locator('[data-testid="approval-matrix-panel"]').evaluate((element) => element.scrollIntoView({ block: "start", inline: "nearest" }));
    const screenshotPath = path.join(root, "output", "playwright", `access-control-rule-matrix-${viewportName}.png`);
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: false });
    record(`${viewportName} 規則矩陣中文化截圖已保存`, fs.existsSync(screenshotPath), screenshotPath);

    await page.locator('[data-testid="access-tab-user_access"]').click();
    await page.locator('[data-testid="role-assignment-user"]').waitFor({ timeout: 10_000 });
    await page.locator('[data-testid="role-assignment-scope-template"]').waitFor({ timeout: 10_000 });
    await page.locator('[data-testid="role-assignment-permission-preview"]').waitFor({ timeout: 10_000 });
    for (const formLabel of ["適用範圍", "指定範圍", "內部負責人", "下次複核", "到期停用日"]) {
      record(`${viewportName} 使用者權限表單使用中文欄位：${formLabel}`, await page.locator("label").filter({ hasText: formLabel }).first().isVisible());
    }

    const roleSelect = page.locator('[data-testid="role-assignment-role"]');
    const externalRoleValue = await roleSelect.evaluate((select) => {
      const htmlSelect = select;
      return Array.from(htmlSelect.options).find((option) => option.textContent?.includes("外部專員"))?.value ?? "";
    });
    record(`${viewportName} role select includes external specialist`, Boolean(externalRoleValue));
    await roleSelect.selectOption(externalRoleValue);
    await page.waitForFunction(() => document.querySelector('[data-testid="role-assignment-scope-template"]')?.value === "named_scope");

    const reviewDue = await page.locator('[data-testid="role-assignment-review-due"]').inputValue();
    const days = diffDays(reviewDue);
    record(`${viewportName} external specialist defaults to about 90-day review`, days >= 89 && days <= 91, `${reviewDue} (${days} days)`);
    const previewText = await page.locator('[data-testid="role-assignment-permission-preview"]').innerText();
    record(
      `${viewportName} preview shows external specialist grants and high-risk denials`,
      previewText.includes("適用範圍") &&
        previewText.includes("通知分派") &&
        previewText.includes("留言") &&
        previewText.includes("提供建議") &&
        previewText.includes("建立號碼") &&
        previewText.includes("權限設定"),
      previewText
    );

    await page.locator('[data-testid="role-assignment-reason"]').fill("驗證預覽用");
    record(`${viewportName} save is blocked until named scope is filled`, await page.getByRole("button", { name: "儲存指派" }).isDisabled());
    await page.locator('[data-testid="role-assignment-named-scope"]').fill("驗證用指定範圍");
    record(`${viewportName} save is blocked until sponsor is selected`, await page.getByRole("button", { name: "儲存指派" }).isDisabled());
    const sponsorValue = await page.locator('[data-testid="role-assignment-sponsor"]').evaluate((select) => {
      const htmlSelect = select;
      return Array.from(htmlSelect.options).find((option) => option.value)?.value ?? "";
    });
    record(`${viewportName} sponsor selector has internal users`, Boolean(sponsorValue));
    await page.locator('[data-testid="role-assignment-sponsor"]').selectOption(sponsorValue);
    record(`${viewportName} external specialist draft can become savable after required metadata`, !(await page.getByRole("button", { name: "儲存指派" }).isDisabled()));

    await page.locator('[data-testid="access-tab-external_specialists"]').click();
    await page.getByText("外部專員").first().waitFor({ timeout: 10_000 });
    record(`${viewportName} 外部專員表格使用內部負責人欄位`, await page.getByText("內部負責人", { exact: true }).first().isVisible());
    await page.locator('[data-testid="access-tab-audit"]').click();
    await page.locator("strong").filter({ hasText: "權限異動紀錄" }).waitFor({ timeout: 10_000 });
    record(`${viewportName} 異動紀錄表格使用中文欄位`, (await page.getByText("操作者", { exact: true }).count()) > 0 && (await page.getByText("異動內容", { exact: true }).count()) > 0);

    const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    record(`${viewportName} access governance UI avoids page-level horizontal overflow`, bodyOverflow <= 2, `${bodyOverflow}px`);
    record(`${viewportName} access governance UI has no console errors`, consoleErrors.length === 0, consoleErrors.join("\n"));
    record(`${viewportName} access governance UI has no product 5xx responses`, failedResponses.length === 0, failedResponses.join("\n"));
  } finally {
    await context.close();
  }
}

assertStaticContract();
const adminCookie = await login("admin@example.com");
await assertApiContract(adminCookie);

const browser = await chromium.launch({ headless: true });
try {
  await assertSettingsUi(browser, adminCookie, "desktop", { width: 1440, height: 1200 });
  await assertSettingsUi(browser, adminCookie, "mobile", { width: 390, height: 920 });
} finally {
  await browser.close();
}

console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      baseUrl: apiBaseUrl,
      total: results.length,
      passed: results.filter((result) => result.passed).length,
      failed: results.filter((result) => !result.passed).length,
      results
    },
    null,
    2
  )
);
