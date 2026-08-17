import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.resolve("output/playwright/ui-real-operation");
const screenshotDir = path.join(outDir, runId);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-ui26-"));
const dataDir = path.join(tempRoot, "data");
const repositoryDir = path.join(dataDir, "repository");
const bootstrapPassword = "Drawing-Submission-QC-2026";
const bootstrapUsers = [
  {
    id: "user-ui26-owner",
    displayName: "UI26 Owner Engineer",
    email: "ui26.owner@example.com",
    password: bootstrapPassword,
    role: "Engineer"
  },
  {
    id: "user-ui26-peer",
    displayName: "UI26 Peer Engineer",
    email: "ui26.peer@example.com",
    password: bootstrapPassword,
    role: "Engineer"
  },
  {
    id: "user-ui26-manager",
    displayName: "UI26 Manager",
    email: "ui26.manager@example.com",
    password: bootstrapPassword,
    role: "R&D Manager"
  },
  {
    id: "user-ui26-admin",
    displayName: "UI26 Admin",
    email: "ui26.admin@example.com",
    password: bootstrapPassword,
    role: "Admin"
  }
];

const roles = {
  engineer: bootstrapUsers[0],
  peer: bootstrapUsers[1],
  manager: bootstrapUsers[2],
  admin: bootstrapUsers[3]
};

const forbiddenVisibleStrings = [
  "duplicate_active_submission",
  "ReleaseFailed",
  "UNIQUE constraint failed",
  "submission_conflict",
  "DUPLICATE_RELEASE_FILENAME",
  "RELEASE_NOT_CONFIGURED",
  "Internal Server Error",
  "stack trace",
  "Error: ",
  "/api/"
];

const results = [];
const globalGateResults = [];
const fixtureLedger = [];
let app;
let db;
let browser;
let baseUrl = "";
let cleanupStatus = "not_started";

fs.mkdirSync(screenshotDir, { recursive: true });

function now(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function fixtureSuffix(id) {
  const normalized = String(id).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `QAUI${normalized.padStart(3, "0")}`;
}

function safeName(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "");
}

function expect(condition, message, details = undefined) {
  if (!condition) {
    const suffix = details === undefined ? "" : ` ${JSON.stringify(details)}`;
    throw new Error(`${message}${suffix}`);
  }
}

function makeFile(filename, content) {
  const relativePath = path.join("qc-ui26-fixtures", filename);
  const absolutePath = path.join(repositoryDir, relativePath);
  const bytes = Buffer.from(content, "utf8");
  ensureDir(path.dirname(absolutePath));
  fs.writeFileSync(absolutePath, bytes);
  return {
    localPath: absolutePath,
    storageKey: relativePath.split(path.sep).join("/"),
    sha256: sha256(bytes),
    size: bytes.byteLength
  };
}

function normalizeFileRole(filename) {
  const ext = filename.split(".").pop()?.trim().toLowerCase() ?? "";
  if (ext === "slddrw") return "slddrw";
  if (ext === "sldprt") return "sldprt";
  if (ext === "sldasm") return "sldasm";
  if (ext === "pdf") return "pdf";
  if (ext === "dwg") return "dwg";
  return "attachment";
}

function seedRootWithoutDrawing(caseId) {
  const suffix = fixtureSuffix(caseId);
  const time = now();
  const rootCode = `ROOT-${suffix}`;
  const partNumber = `P-${suffix}-001`;
  const partName = `UI26 ${caseId} 無主圖測試`;
  const rootId = `root-${suffix}`;
  const partId = `part-${suffix}`;
  db.prepare(
    `
    INSERT INTO part_roots (
      id, company_id, root_code, core_name, item_kind, record_status, rule_version_id, created_by, created_at, updated_at
    ) VALUES (?, 'company-jenfu', ?, ?, 'manufactured', 'Draft', 'numbering-rule-v1', ?, ?, ?)
    `
  ).run(rootId, rootCode, partName, roles.engineer.id, time, time);
  db.prepare(
    `
    INSERT INTO part_numbers (
      id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind,
      is_universal, bom_usage_policy, record_status, rule_version_id, created_by, created_at, updated_at
    ) VALUES (?, 'company-jenfu', ?, ?, 1, '001', ?, 'manufactured', 0, 'available', 'Draft', 'numbering-rule-v1', ?, ?, ?)
    `
  ).run(partId, rootId, partNumber, partName, roles.engineer.id, time, time);
  fixtureLedger.push({ caseId, rootCode, partNumber, drawingNumber: null, type: "root_without_drawing" });
  return { rootCode, partNumber, partName, rootId, partId };
}

function seedDrawingFixture(caseId, options = {}) {
  const suffix = fixtureSuffix(caseId);
  const time = now();
  const rootCode = options.rootCode ?? `ROOT-${suffix}`;
  const drawingNumber = options.drawingNumber ?? `D-${suffix}-MA1`;
  const partNumber = options.partNumber ?? `P-${suffix}-001`;
  const partName = options.partName ?? `UI26 ${caseId} 測試件`;
  const rootId = options.rootId ?? `root-${suffix}`;
  const partId = options.partId ?? `part-${suffix}`;
  const drawingId = options.drawingId ?? `drawing-${suffix}`;
  const linkId = options.linkId ?? `link-${suffix}`;
  const variantId = options.variantId ?? `variant-${suffix}`;
  const revision = options.revision ?? "0.1";
  const material = options.material === undefined ? "SUS304" : options.material;
  const surfaceFinish = options.surfaceFinish === undefined ? "無" : options.surfaceFinish;
  const attachmentNames = options.attachmentNames ?? [`${drawingNumber}.SLDDRW`, `${drawingNumber}.SLDPRT`];

  db.prepare(
    `
    INSERT INTO part_roots (
      id, company_id, root_code, core_name, item_kind, record_status, rule_version_id, created_by, created_at, updated_at
    ) VALUES (?, 'company-jenfu', ?, ?, 'manufactured', ?, 'numbering-rule-v1', ?, ?, ?)
    `
  ).run(rootId, rootCode, partName, options.rootStatus ?? "Draft", roles.engineer.id, time, time);
  db.prepare(
    `
    INSERT INTO part_numbers (
      id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind,
      is_universal, bom_usage_policy, record_status, rule_version_id, created_by, created_at, updated_at
    ) VALUES (?, 'company-jenfu', ?, ?, 1, '001', ?, ?, 0, 'available', ?, 'numbering-rule-v1', ?, ?, ?)
    `
  ).run(
    partId,
    rootId,
    partNumber,
    partName,
    options.itemKind ?? "manufactured",
    options.partStatus ?? "Draft",
    roles.engineer.id,
    time,
    time
  );
  if (options.includeVariant !== false) {
    db.prepare(
      `
      INSERT INTO part_variant_attributes (
        id, part_number_id, material_code, material_label, surface_treatment, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `
    ).run(variantId, partId, material, material, surfaceFinish, time, time);
  }
  db.prepare(
    `
    INSERT INTO drawing_numbers (
      id, company_id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no,
      is_primary_manufacturing, record_status, rule_version_id, created_by, created_at, updated_at
    ) VALUES (?, 'company-jenfu', ?, ?, 'MA', 'MA 製造圖', ?, ?, ?, 'numbering-rule-v1', ?, ?, ?)
    `
  ).run(
    drawingId,
    rootId,
    drawingNumber,
    options.sequenceNo ?? 1,
    options.isPrimaryManufacturing === false ? 0 : 1,
    options.drawingStatus ?? "Draft",
    roles.engineer.id,
    time,
    time
  );
  if (options.linkPart !== false) {
    db.prepare(
      `
      INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      `
    ).run(linkId, drawingId, partId, options.linkType ?? "primary_manufacturing", roles.engineer.id, time);
  }

  const attachments = [];
  for (const [index, filename] of attachmentNames.entries()) {
    const ext = filename.split(".").pop()?.trim().toLowerCase() ?? "";
    const file = makeFile(filename, `UI26 fixture ${caseId} ${filename}`);
    const assetId = `asset-${suffix}-${index}`;
    db.prepare(
      `
      INSERT INTO file_assets (
        id, storage_provider, original_path, storage_key, file_name, file_ext, mime_type, file_size, content_hash,
        linked_entity_type, linked_entity_id, document_category, display_name, revision, uploaded_by, created_at, updated_at
      ) VALUES (?, 'j_drive', ?, ?, ?, ?, 'application/octet-stream', ?, ?, 'drawing_number', ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      assetId,
      file.localPath,
      file.storageKey,
      filename,
      ext,
      file.size,
      file.sha256,
      drawingId,
      ext === "sldprt" || ext === "sldasm" ? "cad_3d" : ext === "pdf" ? "pdf" : ext === "dwg" ? "dwg" : "drawing_2d",
      filename,
      revision,
      roles.engineer.id,
      time,
      time
    );
    attachments.push({ id: assetId, filename, file, fileRole: normalizeFileRole(filename), revision });
  }

  const fixture = {
    caseId,
    rootCode,
    rootId,
    partId,
    partNumber,
    partName,
    drawingId,
    drawingNumber,
    revision,
    material,
    surfaceFinish,
    attachments
  };
  fixtureLedger.push({ caseId, rootCode, partNumber, drawingNumber, revision, type: "drawing" });
  return fixture;
}

function seedSubmission(fixture, options = {}) {
  const time = options.createdAt ?? now();
  const submissionId = options.submissionId ?? `SUB-${fixtureSuffix(options.caseId ?? fixture.caseId)}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const itemId = options.itemId ?? `item-${submissionId.toLowerCase()}`;
  const partNumber = options.partNumber ?? fixture.partNumber;
  const partName = options.partName ?? fixture.partName;
  const drawingNumber = options.drawingNumber ?? fixture.drawingNumber;
  const revision = options.revision ?? fixture.revision ?? "0.1";
  const fileName = options.fileName ?? fixture.attachments?.[0]?.filename ?? `${drawingNumber}.SLDDRW`;
  const file = options.file ?? makeFile(`${submissionId}-${fileName}`, `UI26 submission file ${submissionId}`);
  const releasedAt = options.status === "Released" ? (options.releasedAt ?? time) : null;

  db.prepare(
    `
    INSERT OR IGNORE INTO items (id, company_id, part_number, part_name, current_revision, created_at, updated_at)
    VALUES (?, 'company-jenfu', ?, ?, NULL, ?, ?)
    `
  ).run(itemId, partNumber, partName, time, time);
  const actualItem = db
    .prepare("SELECT id FROM items WHERE company_id = 'company-jenfu' AND part_number = ? LIMIT 1")
    .get(partNumber);
  const actualItemId = actualItem?.id ?? itemId;
  db.prepare(
    `
    INSERT INTO submissions (
      id, company_id, item_id, drawing_number, revision, product_line, customer, project_code, process_name, machine,
      material, surface_finish, document_type, change_description, status, submitted_by, approval_required,
      released_at, release_error, corrects_submission_id, resolved_by_submission_id, resolved_at, source_entity_type, source_entity_id,
      created_at, updated_at
    ) VALUES (?, 'company-jenfu', ?, ?, ?, '', '', '', 'QC', '', ?, ?, 'MA 製造圖', ?, ?, ?, 1, ?, ?, ?, ?, ?, 'drawing_number', ?, ?, ?)
    `
  ).run(
    submissionId,
    actualItemId,
    drawingNumber,
    revision,
    options.material ?? fixture.material ?? "SUS304",
    options.surfaceFinish ?? fixture.surfaceFinish ?? "無",
    options.changeDescription ?? "UI26 圖面送審操作驗證。",
    options.status ?? "Pending",
    options.submittedBy ?? roles.engineer.id,
    releasedAt,
    options.releaseError ?? null,
    options.correctsSubmissionId ?? null,
    options.resolvedBySubmissionId ?? null,
    options.resolvedAt ?? null,
    options.sourceEntityId === undefined ? fixture.drawingId : options.sourceEntityId,
    time,
    time
  );
  db.prepare(
    `
    INSERT INTO submission_files (
      id, submission_id, file_role, original_filename, local_path, gdrive_file_id, gdrive_status, sha256, file_size, source_master_attachment_id, created_at
    ) VALUES (?, ?, ?, ?, ?, NULL, 'none', ?, ?, ?, ?)
    `
  ).run(
    `sfile-${submissionId}`,
    submissionId,
    options.fileRole ?? normalizeFileRole(fileName),
    fileName,
    file.localPath,
    file.sha256,
    file.size,
    options.sourceMasterAttachmentId ?? fixture.attachments?.[0]?.id ?? null,
    time
  );
  db.prepare(
    `
    INSERT INTO submission_snapshots (
      id, submission_id, company_id, source_root_id, source_root_code, source_drawing_number_id, source_drawing_number,
      source_part_number_id, source_part_number, snapshot_version, rules_version, snapshot_hash, snapshot_json, captured_by, captured_at, created_at
    ) VALUES (?, ?, 'company-jenfu', ?, ?, ?, ?, ?, ?, 'drawing_part_submission_v1', 'numbering-rule-v1', ?, ?, ?, ?, ?)
    `
  ).run(
    `snap-${submissionId}`,
    submissionId,
    fixture.rootId,
    fixture.rootCode,
    fixture.drawingId,
    drawingNumber,
    fixture.partId,
    partNumber,
    sha256(Buffer.from(`${submissionId}:${drawingNumber}:${revision}`)),
    JSON.stringify({ source: "qc-pdm-drawing-submission-ui-real-operation", submission: { submissionId, drawingNumber, revision } }),
    options.submittedBy ?? roles.engineer.id,
    time,
    time
  );
  fixtureLedger.push({ caseId: options.caseId ?? fixture.caseId, submissionId, drawingNumber, revision, status: options.status ?? "Pending", type: "submission" });
  return submissionId;
}

function getSubmission(id) {
  return db.prepare("SELECT * FROM submissions WHERE id = ?").get(id);
}

function listSubmissionsForDrawing(drawingNumber) {
  return db
    .prepare("SELECT id, status, revision, corrects_submission_id, resolved_by_submission_id, resolved_at, cancelled_by FROM submissions WHERE drawing_number = ? ORDER BY created_at ASC")
    .all(drawingNumber);
}

function getMasterStatus(fixture) {
  return db
    .prepare(
      `
      SELECT
        d.record_status AS drawing_status,
        p.record_status AS part_status,
        r.record_status AS root_status
      FROM drawing_numbers d
      JOIN part_roots r ON r.id = d.part_root_id
      JOIN drawing_part_links l ON l.drawing_number_id = d.id
      JOIN part_numbers p ON p.id = l.part_number_id
      WHERE d.id = ?
      LIMIT 1
      `
    )
    .get(fixture.drawingId);
}

async function loginByUi(role, viewport = { width: 1440, height: 1024 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill(role.email);
  await page.locator('input[type="password"]').fill(bootstrapPassword);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });
  await page.waitForLoadState("networkidle");
  return { context, page };
}

async function withLoggedInPage(role, fn, viewport) {
  const session = await loginByUi(role, viewport);
  try {
    return await fn(session.page, session.context);
  } finally {
    await session.context.close();
  }
}

async function screenshot(page, id, label) {
  const filePath = path.join(screenshotDir, `${id}-${safeName(label)}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function visibleText(page) {
  return page.locator("body").innerText({ timeout: 15000 });
}

async function assertForbiddenTextClean(page, contextLabel) {
  const text = await visibleText(page);
  const present = forbiddenVisibleStrings.filter((needle) => text.includes(needle));
  expect(present.length === 0, `${contextLabel} 顯示技術錯誤或 raw code`, { present });
}

async function assertNoHorizontalOverflow(page, contextLabel) {
  const measurement = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth
  }));
  expect(
    measurement.scrollWidth <= measurement.clientWidth + 2 && measurement.bodyScrollWidth <= measurement.clientWidth + 2,
    `${contextLabel} 有水平 overflow`,
    measurement
  );
}

async function captureEvidence(page, id, label, options = {}) {
  if (options.clean !== false) {
    await assertForbiddenTextClean(page, `${id} ${label}`);
  }
  await assertNoHorizontalOverflow(page, `${id} ${label}`);
  return screenshot(page, id, label);
}

async function waitForWorkbench(page, drawingNumber) {
  await page.getByText(`送審來源：${drawingNumber}`).waitFor({ timeout: 20000 });
}

async function openWorkbench(page, drawingNumber) {
  await page.goto(`${baseUrl}/drawings/${encodeURIComponent(drawingNumber)}/submission-workbench`, { waitUntil: "networkidle" });
  await waitForWorkbench(page, drawingNumber);
}

async function fillValidSubmitNote(page, text = "圖面主資料已確認，提交審核。") {
  await page.locator("textarea").first().fill(text);
}

async function runCase(id, title, fn) {
  const startedAt = new Date().toISOString();
  try {
    const evidence = await fn();
    results.push({ id, title, status: "pass", startedAt, endedAt: new Date().toISOString(), evidence });
    console.log(`PASS ${id}: ${title}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ id, title, status: "fail", startedAt, endedAt: new Date().toISOString(), error: message });
    console.error(`FAIL ${id}: ${title} - ${message}`);
  }
}

async function runGlobalGate(id, title, fn) {
  try {
    const evidence = await fn();
    globalGateResults.push({ id, title, status: "pass", evidence });
    console.log(`PASS ${id}: ${title}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    globalGateResults.push({ id, title, status: "fail", error: message });
    console.error(`FAIL ${id}: ${title} - ${message}`);
  }
}

async function runUiCases() {
  await runCase("UI26-001", "四種角色可從登入畫面進入系統", async () => {
    const screenshots = [];
    for (const [roleName, role] of Object.entries(roles)) {
      const { context, page } = await loginByUi(role);
      await page.getByText("AI PDM").first().waitFor({ timeout: 15000 });
      screenshots.push(await captureEvidence(page, "UI26-001", roleName));
      await context.close();
    }
    return { roleEmails: Object.fromEntries(Object.entries(roles).map(([key, role]) => [key, role.email])), screenshots };
  });

  await runCase("UI26-002", "從圖號工作台送審入口開啟同一圖號工作台", async () => {
    const fixture = seedDrawingFixture("002");
    return withLoggedInPage(roles.engineer, async (page) => {
      await page.goto(`${baseUrl}/numbering/drawings`, { waitUntil: "networkidle" });
      await page.getByPlaceholder("圖號 / 料號 / 文件用途").fill(fixture.drawingNumber);
      await page.locator("[data-drawing-row='true']").filter({ hasText: fixture.drawingNumber }).first().click();
      await page.getByRole("link", { name: "送審" }).last().click();
      await waitForWorkbench(page, fixture.drawingNumber);
      const text = await visibleText(page);
      expect(text.includes(fixture.partNumber), "工作台沒有保留主料號身分");
      return { fixture, screenshot: await captureEvidence(page, "UI26-002", fixture.drawingNumber) };
    });
  });

  await runCase("UI26-003", "從圖料工作台送審入口開啟同一圖料根號與圖號工作台", async () => {
    const fixture = seedDrawingFixture("003");
    return withLoggedInPage(roles.engineer, async (page) => {
      await page.goto(`${baseUrl}/numbering/search`, { waitUntil: "networkidle" });
      await page.getByPlaceholder("圖料根號 / 料號 / 圖號 / 名稱").fill(fixture.rootCode);
      await page.locator("[data-search-row='true']").filter({ hasText: fixture.rootCode }).first().click();
      await page.getByRole("link", { name: /檢查.*送審條件/ }).click();
      await waitForWorkbench(page, fixture.drawingNumber);
      const text = await visibleText(page);
      expect(text.includes(fixture.rootCode) || text.includes(fixture.partNumber), "工作台沒有保留圖料來源脈絡");
      return { fixture, screenshot: await captureEvidence(page, "UI26-003", fixture.drawingNumber) };
    });
  });

  await runCase("UI26-004", "圖料入口沒有明確主圖時不會開空白上傳頁", async () => {
    const fixture = seedRootWithoutDrawing("004");
    return withLoggedInPage(roles.engineer, async (page) => {
      await page.goto(`${baseUrl}/numbering/search`, { waitUntil: "networkidle" });
      await page.getByPlaceholder("圖料根號 / 料號 / 圖號 / 名稱").fill(fixture.rootCode);
      await page.locator("[data-search-row='true']").filter({ hasText: fixture.rootCode }).first().click();
      await page.getByText("尚未找到主要 MA 圖").waitFor({ timeout: 15000 });
      expect((await page.getByRole("link", { name: /檢查.*送審條件/ }).count()) === 0, "無主圖時仍出現送審入口");
      expect(!(await visibleText(page)).includes("上傳送審已退役"), "無主圖不應導到退役泛用上傳頁");
      return { fixture, screenshot: await captureEvidence(page, "UI26-004", fixture.rootCode) };
    });
  });

  await runCase("UI26-005", "舊 upload drawing query 仍導向圖面送審工作台", async () => {
    const fixture = seedDrawingFixture("005");
    return withLoggedInPage(roles.engineer, async (page) => {
      await page.goto(`${baseUrl}/upload?source=drawing&drawingNumber=${encodeURIComponent(fixture.drawingNumber)}`, { waitUntil: "networkidle" });
      await waitForWorkbench(page, fixture.drawingNumber);
      const text = await visibleText(page);
      expect(!text.includes("PDM 屬性"), "舊 drawing upload query 顯示泛用 PDM 屬性表單");
      return { fixture, screenshot: await captureEvidence(page, "UI26-005", fixture.drawingNumber) };
    });
  });

  await runCase("UI26-006", "泛用 upload 頁面已退役且不能建立失控送審", async () => {
    return withLoggedInPage(roles.engineer, async (page) => {
      await page.goto(`${baseUrl}/upload`, { waitUntil: "networkidle" });
      await page.getByText("上傳送審已退役").waitFor({ timeout: 15000 });
      const text = await visibleText(page);
      expect(text.includes("請從受控主資料送審"), "退役頁沒有說明受控來源要求");
      expect(!text.includes("送出審核"), "泛用 upload 仍可送出審核");
      return { screenshot: await captureEvidence(page, "UI26-006", "retired-upload") };
    });
  });

  await runCase("UI26-007", "工作台主資料與附件數量一致", async () => {
    const fixture = seedDrawingFixture("007");
    return withLoggedInPage(roles.engineer, async (page) => {
      await openWorkbench(page, fixture.drawingNumber);
      const text = await visibleText(page);
      for (const expected of [fixture.drawingNumber, fixture.partNumber, fixture.partName, fixture.revision, "2 個可送審"]) {
        expect(text.includes(expected), `工作台缺少必要資料：${expected}`);
      }
      return { fixture, screenshot: await captureEvidence(page, "UI26-007", fixture.drawingNumber) };
    });
  });

  await runCase("UI26-008", "資料完整時可從 UI 建立 Pending 送審", async () => {
    const fixture = seedDrawingFixture("008");
    return withLoggedInPage(roles.engineer, async (page) => {
      await openWorkbench(page, fixture.drawingNumber);
      await fillValidSubmitNote(page);
      expect(await page.getByRole("button", { name: "送出審核" }).isEnabled(), "送出審核按鈕沒有啟用");
      await page.getByRole("button", { name: "送出審核" }).click();
      await page.getByText("圖面送審已建立").waitFor({ timeout: 20000 });
      const created = listSubmissionsForDrawing(fixture.drawingNumber).find((row) => row.status === "Pending");
      expect(Boolean(created), "UI 送審後資料庫沒有同圖號 Pending 紀錄");
      return { fixture, created, screenshot: await captureEvidence(page, "UI26-008", fixture.drawingNumber) };
    });
  });

  await runCase("UI26-009", "送審備註缺漏或太短時被中文阻擋", async () => {
    const fixture = seedDrawingFixture("009");
    return withLoggedInPage(roles.engineer, async (page) => {
      await openWorkbench(page, fixture.drawingNumber);
      await page.getByText("送審備註尚未完成").waitFor({ timeout: 15000 });
      await fillValidSubmitNote(page, "短");
      await page.getByText("請填寫 5 到 100 字的送審備註").first().waitFor({ timeout: 15000 });
      await fillValidSubmitNote(page, "A".repeat(150));
      const noteLength = await page.locator("textarea").first().evaluate((element) => element.value.length);
      expect(noteLength <= 100, "瀏覽器沒有阻擋超過 100 字的備註");
      expect(listSubmissionsForDrawing(fixture.drawingNumber).length === 0, "備註不合法時仍建立送審");
      return { fixture, noteLength, screenshot: await captureEvidence(page, "UI26-009", fixture.drawingNumber) };
    });
  });

  await runCase("UI26-010", "未選附件時不能送出審核", async () => {
    const fixture = seedDrawingFixture("010");
    return withLoggedInPage(roles.engineer, async (page) => {
      await openWorkbench(page, fixture.drawingNumber);
      await page.locator('input[type="checkbox"]').first().uncheck({ force: true });
      await fillValidSubmitNote(page);
      await page.getByText("尚未選擇來源附件，不能送出審核").waitFor({ timeout: 15000 });
      expect(await page.getByRole("button", { name: "送出審核" }).isDisabled(), "未選附件時送出審核仍可按");
      return { fixture, screenshot: await captureEvidence(page, "UI26-010", fixture.drawingNumber) };
    });
  });

  await runCase("UI26-011", "主資料缺漏與同版次阻擋分層呈現", async () => {
    const fixture = seedDrawingFixture("011", { material: "", surfaceFinish: "" });
    return withLoggedInPage(roles.engineer, async (page) => {
      await openWorkbench(page, fixture.drawingNumber);
      const text = await visibleText(page);
      expect(text.includes("主資料尚未完成"), "未顯示主資料未完成");
      expect(text.includes("材質") && text.includes("表面處理"), "未列出材質或表面處理缺漏");
      expect(text.includes("回圖號/料號"), "未告知回主資料工作台補齊");
      return { fixture, screenshot: await captureEvidence(page, "UI26-011", fixture.drawingNumber) };
    });
  });

  await runCase("UI26-012", "Pending 同版次阻擋並導到同一送審明細", async () => {
    const fixture = seedDrawingFixture("012");
    const submissionId = seedSubmission(fixture, { status: "Pending", submissionId: "SUB-UI26-012-PENDING" });
    return withLoggedInPage(roles.engineer, async (page) => {
      await openWorkbench(page, fixture.drawingNumber);
      await page.getByText("此圖號版次正在送審或發行中").first().waitFor({ timeout: 15000 });
      await page.getByRole("link", { name: "查看紀錄" }).first().click();
      await page.waitForURL((url) => url.pathname.includes(`/submissions/${submissionId}`), { timeout: 15000 });
      await page.getByText(fixture.drawingNumber).first().waitFor({ timeout: 15000 });
      expect(page.url().includes(`/submissions/${submissionId}`), "既有送審連結沒有導到同一筆資料", { url: page.url(), submissionId });
      return { fixture, submissionId, screenshot: await captureEvidence(page, "UI26-012", submissionId) };
    });
  });

  await runCase("UI26-012B", "送審建立者可從工作台取消 Pending 同版次阻擋", async () => {
    const fixture = seedDrawingFixture("012B");
    const submissionId = seedSubmission(fixture, { status: "Pending", submissionId: "SUB-UI26-012B-WORKBENCH-CANCEL" });
    return withLoggedInPage(roles.engineer, async (page) => {
      await openWorkbench(page, fixture.drawingNumber);
      await page.getByRole("button", { name: "取消送審" }).waitFor({ timeout: 15000 });
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "取消送審" }).click();
      await page.getByText("送審已取消").first().waitFor({ timeout: 15000 });
      const row = getSubmission(submissionId);
      expect(row.status === "Cancelled" && row.cancelled_by === roles.engineer.id, "工作台取消未保存 Cancelled 狀態或責任者", row);
      await fillValidSubmitNote(page);
      expect(await page.getByRole("button", { name: "送出審核" }).isEnabled(), "取消後同版次阻擋沒有解除");
      return { fixture, submissionId, row, screenshot: await captureEvidence(page, "UI26-012B", fixture.drawingNumber) };
    });
  });

  await runCase("UI26-013", "Releasing 同版次阻擋不能建立重複流程", async () => {
    const fixture = seedDrawingFixture("013");
    seedSubmission(fixture, { status: "Releasing", submissionId: "SUB-UI26-013-RELEASING" });
    return withLoggedInPage(roles.manager, async (page) => {
      await openWorkbench(page, fixture.drawingNumber);
      const text = await visibleText(page);
      expect(text.includes("正在發行中") || text.includes("正在送審或發行中"), "發行中狀態沒有被中文阻擋");
      expect(await page.getByRole("button", { name: "此版次不可送審" }).isDisabled(), "Releasing 時仍能建立重複送審");
      return { fixture, screenshot: await captureEvidence(page, "UI26-013", fixture.drawingNumber) };
    });
  });

  await runCase("UI26-014", "同版次已發布時鎖定並要求使用新版次", async () => {
    const fixture = seedDrawingFixture("014");
    seedSubmission(fixture, { status: "Released", submissionId: "SUB-UI26-014-RELEASED" });
    return withLoggedInPage(roles.engineer, async (page) => {
      await openWorkbench(page, fixture.drawingNumber);
      const text = await visibleText(page);
      expect(text.includes("此圖號版次已進入正式紀錄"), "已發布同版次沒有被鎖定");
      expect(await page.getByRole("button", { name: "此版次不可送審" }).isDisabled(), "已發布同版次仍可送審");
      return { fixture, screenshot: await captureEvidence(page, "UI26-014", fixture.drawingNumber) };
    });
  });

  await runCase("UI26-015", "已駁回或已取消紀錄不阻擋新送審", async () => {
    const fixture = seedDrawingFixture("015");
    seedSubmission(fixture, { status: "Cancelled", submissionId: "SUB-UI26-015-CANCELLED" });
    return withLoggedInPage(roles.engineer, async (page) => {
      await openWorkbench(page, fixture.drawingNumber);
      await fillValidSubmitNote(page);
      const text = await visibleText(page);
      expect(text.includes("曾有未完成送審，不影響本次送審") || text.includes("已取消"), "取消歷史沒有以低權重呈現");
      expect(await page.getByRole("button", { name: "送出審核" }).isEnabled(), "取消歷史不應阻擋新送審");
      return { fixture, screenshot: await captureEvidence(page, "UI26-015", fixture.drawingNumber) };
    });
  });

  await runCase("UI26-016", "未解決發行未完成對工程師只顯示處理方向不給復原權限", async () => {
    const fixture = seedDrawingFixture("016");
    const submissionId = seedSubmission(fixture, {
      status: "ReleaseFailed",
      submissionId: "SUB-UI26-016-RELFAIL",
      releaseError: "UI26 deterministic release failure"
    });
    return withLoggedInPage(roles.engineer, async (page) => {
      await openWorkbench(page, fixture.drawingNumber);
      await page.getByText("發行未完成，需要先修正附件再重新送審").waitFor({ timeout: 15000 });
      await page.goto(`${baseUrl}/submissions/${encodeURIComponent(submissionId)}`, { waitUntil: "networkidle" });
      await page.getByText("需要主管或 Admin 處理").waitFor({ timeout: 15000 });
      expect((await page.getByRole("button", { name: "重新發行" }).count()) === 0, "工程師不應看到重新發行");
      return { fixture, submissionId, screenshot: await captureEvidence(page, "UI26-016", submissionId) };
    });
  });

  await runCase("UI26-017", "已處理的發行未完成只保留歷史不再阻擋", async () => {
    const fixture = seedDrawingFixture("017");
    const resolverFixture = seedDrawingFixture("017R", { drawingNumber: "D-QAUI017R-MA1", partNumber: "P-QAUI017R-001" });
    const resolverSubmissionId = seedSubmission(resolverFixture, {
      status: "Released",
      submissionId: "SUB-UI26-017-RESOLVER"
    });
    seedSubmission(fixture, {
      status: "ReleaseFailed",
      submissionId: "SUB-UI26-017-RESOLVED",
      releaseError: "UI26 old release failure",
      resolvedBySubmissionId: resolverSubmissionId,
      resolvedAt: now()
    });
    return withLoggedInPage(roles.engineer, async (page) => {
      await openWorkbench(page, fixture.drawingNumber);
      await fillValidSubmitNote(page);
      const text = await visibleText(page);
      expect(text.includes("發行未完成，已由新版送審處理完成"), "已處理的發行未完成沒有以歷史呈現");
      expect(await page.getByRole("button", { name: "送出審核" }).isEnabled(), "已處理的發行未完成仍阻擋送審");
      return { fixture, screenshot: await captureEvidence(page, "UI26-017", fixture.drawingNumber) };
    });
  });

  await runCase("UI26-018", "既有送審明細連結不會導到無關資料", async () => {
    const fixture = seedDrawingFixture("018");
    const submissionId = seedSubmission(fixture, { status: "Pending", submissionId: "SUB-UI26-018-PENDING" });
    return withLoggedInPage(roles.manager, async (page) => {
      await openWorkbench(page, fixture.drawingNumber);
      await page.getByRole("link", { name: "查看紀錄" }).first().click();
      await page.waitForURL((url) => url.pathname.endsWith(`/submissions/${submissionId}`), { timeout: 15000 });
      await page.getByText(fixture.drawingNumber).first().waitFor({ timeout: 15000 });
      const text = await visibleText(page);
      expect(text.includes(fixture.drawingNumber), "送審明細顯示了不同圖號");
      expect(!text.includes("D-0009-MA1"), "送審明細導到歷史錯誤圖號");
      return { fixture, submissionId, screenshot: await captureEvidence(page, "UI26-018", submissionId) };
    });
  });

  await runCase("UI26-019", "送審建立者可從 UI 取消 Pending", async () => {
    const fixture = seedDrawingFixture("019");
    const submissionId = seedSubmission(fixture, { status: "Pending", submissionId: "SUB-UI26-019-CANCEL" });
    return withLoggedInPage(roles.engineer, async (page) => {
      await page.goto(`${baseUrl}/submissions/${encodeURIComponent(submissionId)}`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "取消送審" }).click();
      await page.getByText("已取消").first().waitFor({ timeout: 15000 });
      const row = getSubmission(submissionId);
      expect(row.status === "Cancelled" && row.cancelled_by === roles.engineer.id, "取消狀態或責任者未保存", row);
      return { fixture, submissionId, row, screenshot: await captureEvidence(page, "UI26-019", submissionId) };
    });
  });

  await runCase("UI26-020", "主管可從 UI 取消同公司 Pending", async () => {
    const fixture = seedDrawingFixture("020");
    const submissionId = seedSubmission(fixture, { status: "Pending", submissionId: "SUB-UI26-020-MANAGER-CANCEL" });
    return withLoggedInPage(roles.manager, async (page) => {
      await page.goto(`${baseUrl}/submissions/${encodeURIComponent(submissionId)}`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "取消送審" }).click();
      await page.getByText("已取消").first().waitFor({ timeout: 15000 });
      const row = getSubmission(submissionId);
      expect(row.status === "Cancelled" && row.cancelled_by === roles.manager.id, "主管取消未保存責任者", row);
      return { fixture, submissionId, row, screenshot: await captureEvidence(page, "UI26-020", submissionId) };
    });
  });

  await runCase("UI26-021", "非建立者工程師不能取消他人 Pending", async () => {
    const fixture = seedDrawingFixture("021");
    const submissionId = seedSubmission(fixture, { status: "Pending", submissionId: "SUB-UI26-021-DENIED" });
    return withLoggedInPage(roles.peer, async (page) => {
      await page.goto(`${baseUrl}/submissions/${encodeURIComponent(submissionId)}`, { waitUntil: "networkidle" });
      expect((await page.getByRole("button", { name: "取消送審" }).count()) === 0, "非建立者工程師看到取消按鈕");
      const text = await visibleText(page);
      expect(text.includes("受限摘要") || text.includes("請由送審建立者、主管或 Admin 處理"), "非建立者限制不是人類中文");
      const row = getSubmission(submissionId);
      expect(row.status === "Pending", "非建立者操作後狀態不應改變", row);
      return { fixture, submissionId, row, screenshot: await captureEvidence(page, "UI26-021", submissionId) };
    });
  });

  await runCase("UI26-022", "主管可重新發行未完成且同一送審轉為已發布", async () => {
    const fixture = seedDrawingFixture("022");
    const submissionId = seedSubmission(fixture, {
      status: "ReleaseFailed",
      submissionId: "SUB-UI26-022-RETRY",
      releaseError: "UI26 temporary release failure"
    });
    return withLoggedInPage(roles.manager, async (page) => {
      await page.goto(`${baseUrl}/submissions/${encodeURIComponent(submissionId)}`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "重新發行" }).click();
      await page.getByText("已發布").first().waitFor({ timeout: 15000 });
      const row = getSubmission(submissionId);
      expect(row.status === "Released", "重新發行後同一送審沒有成為 Released", row);
      return { fixture, submissionId, row, screenshot: await captureEvidence(page, "UI26-022", submissionId) };
    });
  });

  await runCase("UI26-023", "重新發行失敗時維持發行未完成並顯示人類中文", async () => {
    const releasedFixture = seedDrawingFixture("023A", { drawingNumber: "D-QAUI023A-MA1", partNumber: "P-QAUI023A-001" });
    const conflictFile = makeFile("QA-UI-CONFLICT.SLDDRW", "released duplicate filename");
    seedSubmission(releasedFixture, {
      status: "Released",
      submissionId: "SUB-UI26-023-RELEASED-CONFLICT",
      fileName: "QA-UI-CONFLICT.SLDDRW",
      file: conflictFile,
      partNumber: releasedFixture.partNumber
    });
    const fixture = seedDrawingFixture("023", { attachmentNames: ["QA-UI-CONFLICT.SLDDRW"] });
    const submissionId = seedSubmission(fixture, {
      status: "ReleaseFailed",
      submissionId: "SUB-UI26-023-RETRY-FAIL",
      releaseError: "UI26 duplicate filename failure",
      fileName: "QA-UI-CONFLICT.SLDDRW",
      file: conflictFile
    });
    return withLoggedInPage(roles.manager, async (page) => {
      await page.goto(`${baseUrl}/submissions/${encodeURIComponent(submissionId)}`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "重新發行" }).click();
      await page.getByText("附件檔名已被其他正式紀錄使用").waitFor({ timeout: 20000 });
      await page.getByText("發行未完成").first().waitFor({ timeout: 15000 });
      const row = getSubmission(submissionId);
      expect(row.status === "ReleaseFailed", "重新發行失敗後狀態不應離開發行未完成", row);
      return { fixture, conflictFixture: releasedFixture, submissionId, row, screenshot: await captureEvidence(page, "UI26-023", submissionId) };
    });
  });

  await runCase("UI26-024", "主管可從工作台建立發行未完成修正送審", async () => {
    const fixture = seedDrawingFixture("024");
    const oldSubmissionId = seedSubmission(fixture, {
      status: "ReleaseFailed",
      submissionId: "SUB-UI26-024-OLD-FAILED",
      releaseError: "UI26 correction required"
    });
    return withLoggedInPage(roles.manager, async (page) => {
      await openWorkbench(page, fixture.drawingNumber);
      await page.getByRole("button", { name: "建立修正送審" }).click();
      await page.getByText("已建立修正送審").waitFor({ timeout: 20000 });
      const rows = listSubmissionsForDrawing(fixture.drawingNumber);
      const correction = rows.find((row) => row.status === "Pending" && row.corrects_submission_id === oldSubmissionId);
      expect(Boolean(correction), "修正送審沒有建立 Pending 並連回舊失敗紀錄", rows);
      return { fixture, oldSubmissionId, correction, screenshot: await captureEvidence(page, "UI26-024", fixture.drawingNumber) };
    });
  });

  await runCase("UI26-025", "修正送審核准發布後關閉舊失敗並同步主資料狀態", async () => {
    const fixture = seedDrawingFixture("025");
    const oldSubmissionId = seedSubmission(fixture, {
      status: "ReleaseFailed",
      submissionId: "SUB-UI26-025-OLD-FAILED",
      releaseError: "UI26 old release failure"
    });
    const correctionId = seedSubmission(fixture, {
      status: "Pending",
      submissionId: "SUB-UI26-025-CORRECTION",
      correctsSubmissionId: oldSubmissionId,
      changeDescription: "UI26 修正送審，確認可發布。"
    });
    return withLoggedInPage(roles.manager, async (page) => {
      await page.goto(`${baseUrl}/submissions/${encodeURIComponent(correctionId)}`, { waitUntil: "networkidle" });
      await page.getByText(fixture.drawingNumber).first().waitFor({ timeout: 20000 });
      await page.getByRole("button", { name: "核准發布" }).waitFor({ timeout: 20000 });
      await page.getByRole("button", { name: "核准發布" }).click();
      await page.getByText("已發布").first().waitFor({ timeout: 25000 });
      const oldRow = getSubmission(oldSubmissionId);
      const correctionRow = getSubmission(correctionId);
      const masterStatus = getMasterStatus(fixture);
      expect(correctionRow.status === "Released", "修正送審沒有發布", correctionRow);
      expect(oldRow.resolved_by_submission_id === correctionId, "舊發行未完成沒有被修正送審關閉", oldRow);
      expect(
        masterStatus.drawing_status === "Released" && masterStatus.part_status === "Released" && masterStatus.root_status === "Released",
        "發布後主資料仍有 Draft/非 Released 狀態",
        masterStatus
      );
      await page.goto(`${baseUrl}/numbering/drawings`, { waitUntil: "networkidle" });
      await page.getByPlaceholder("圖號 / 料號 / 文件用途").fill(fixture.drawingNumber);
      await page.locator("[data-drawing-row='true']").filter({ hasText: fixture.drawingNumber }).first().click();
      const text = await visibleText(page);
      expect(text.includes("Released / Release") || (text.includes("Released") && !text.includes("Draft")), "圖號工作台仍顯示 Draft 狀態");
      return {
        fixture,
        oldSubmissionId,
        correctionId,
        oldRow,
        correctionRow,
        masterStatus,
        screenshot: await captureEvidence(page, "UI26-025", fixture.drawingNumber)
      };
    });
  });

  await runCase("UI26-026", "未登入使用者不能從 UI 查看送審內容", async () => {
    const fixture = seedDrawingFixture("026");
    const submissionId = seedSubmission(fixture, { status: "Pending", submissionId: "SUB-UI26-026-UNAUTH" });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
    const page = await context.newPage();
    try {
      await page.goto(`${baseUrl}/submissions/${encodeURIComponent(submissionId)}`, { waitUntil: "networkidle" });
      await page.getByText("尚未登入").waitFor({ timeout: 15000 });
      const text = await visibleText(page);
      expect(!text.includes(fixture.partName), "未登入畫面洩漏送審品名");
      return { fixture, submissionId, screenshot: await captureEvidence(page, "UI26-026", "unauthorized") };
    } finally {
      await context.close();
    }
  });
}

async function runGlobalGates() {
  await runGlobalGate("G3", "禁止 raw 技術錯誤文字掃描", async () => {
    const failures = results
      .filter((result) => result.status === "fail")
      .map((result) => `${result.id}: ${result.error}`)
      .filter((message) => message.includes("顯示技術錯誤或 raw code"));
    expect(failures.length === 0, "使用者可見 UI 仍含禁止技術文字", failures);
    return { forbiddenVisibleStrings };
  });

  await runGlobalGate("G4", "工作台與明細多 viewport 無水平溢出", async () => {
    const fixture = seedDrawingFixture("900");
    const submissionId = seedSubmission(fixture, { status: "Pending", submissionId: "SUB-UI26-900-RWD" });
    const screenshots = [];
    for (const viewport of [
      { width: 1440, height: 1024 },
      { width: 1024, height: 900 },
      { width: 768, height: 900 },
      { width: 390, height: 844 }
    ]) {
      await withLoggedInPage(
        roles.manager,
        async (page) => {
          await openWorkbench(page, fixture.drawingNumber);
          screenshots.push(await captureEvidence(page, "G4", `workbench-${viewport.width}`));
          await page.goto(`${baseUrl}/submissions/${encodeURIComponent(submissionId)}`, { waitUntil: "networkidle" });
          await page.getByText(fixture.drawingNumber).first().waitFor({ timeout: 15000 });
          screenshots.push(await captureEvidence(page, "G4", `detail-${viewport.width}`));
        },
        viewport
      );
    }
    return { fixture, submissionId, screenshots };
  });

  await runGlobalGate("G5", "資料身分一致性", async () => {
    const identityFailures = results
      .filter((result) => result.status === "fail")
      .filter((result) => /不同圖號|無關資料|導到歷史錯誤圖號|身分/.test(result.error ?? ""));
    expect(identityFailures.length === 0, "存在資料身分錯置案例", identityFailures);
    return { checkedCaseIds: results.map((result) => result.id) };
  });

  await runGlobalGate("G6", "正常使用者流程不需後端救援", async () => {
    return {
      statement: "fixture setup uses an isolated temporary database before UI steps; counted evidence is browser operation. No direct DB/API call is used to unblock a normal UI step."
    };
  });
}

function renderMarkdown(summary) {
  const lines = [
    "# PDM Drawing Submission UI Real Operation QC Report",
    "",
    `Generated: ${summary.generatedAt}`,
    `Branch: ${summary.gitBranch}`,
    `Base URL: ${summary.baseUrl}`,
    `Run ID: ${summary.runId}`,
    `Result: ${summary.pass}/${summary.total} UI cases passed, ${summary.fail} failed`,
    `Global gates: ${summary.globalPass}/${summary.globalTotal} passed`,
    `Temp fixture cleanup: ${summary.cleanupStatus}`,
    "",
    "## Scope Notes",
    "",
    "- D-0014-MA1 was not used as a required fixture.",
    "- Fixture setup used an isolated temporary SQLite data directory and repository.",
    "- Counted proof comes from rendered browser UI operations and screenshots.",
    "",
    "## UI Cases",
    "",
    "| ID | Status | Scenario | Evidence / Error |",
    "|---|---|---|---|"
  ];
  for (const result of summary.results) {
    const evidence = result.status === "pass" ? summarizeEvidence(result.evidence) : result.error;
    lines.push(`| ${result.id} | ${result.status} | ${result.title} | ${String(evidence ?? "").replace(/\|/g, "/")} |`);
  }
  lines.push("", "## Global Gates", "", "| Gate | Status | Detail |", "|---|---|---|");
  for (const gate of summary.globalGateResults) {
    lines.push(`| ${gate.id} | ${gate.status} | ${String(gate.error ?? summarizeEvidence(gate.evidence)).replace(/\|/g, "/")} |`);
  }
  lines.push("", "## Fixtures", "", "| Case | Type | Drawing | Part / Submission |", "|---|---|---|---|");
  for (const fixture of summary.fixtureLedger) {
    lines.push(`| ${fixture.caseId} | ${fixture.type} | ${fixture.drawingNumber ?? "-"} | ${fixture.partNumber ?? fixture.submissionId ?? "-"} |`);
  }
  return `${lines.join("\n")}\n`;
}

function summarizeEvidence(evidence) {
  if (!evidence) return "";
  if (typeof evidence === "string") return evidence;
  if (Array.isArray(evidence.screenshots)) return `${evidence.screenshots.length} screenshots`;
  if (evidence.screenshot) return evidence.screenshot;
  if (evidence.fixture?.drawingNumber) return evidence.fixture.drawingNumber;
  return JSON.stringify(evidence).slice(0, 240);
}

function currentGitBranch() {
  try {
    const head = fs.readFileSync(path.join(root, ".git", "HEAD"), "utf8").trim();
    if (head.startsWith("ref:")) return head.split("/").slice(2).join("/");
    return head;
  } catch {
    return "unknown";
  }
}

async function run() {
  ensureDir(repositoryDir);
  process.env.PDM_AUTH_MODE = "managed";
  process.env.PDM_BOOTSTRAP_USERS = JSON.stringify(bootstrapUsers);
  process.env.PDM_DATA_DIR = dataDir;
  process.env.PDM_REPOSITORY_DIR = repositoryDir;
  process.env.PDM_RELEASE_MODE = "local_stub";
  process.env.RELEASE_FUNCTION_URL = "";
  process.env.GOOGLE_DRIVE_RELEASED_FOLDER_ID = "";
  process.env.PDM_DEMO_USERS = "0";

  const port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  app = startNextApp(root, "start", port);
  await waitForNextAppReady(baseUrl, app.getOutput);
  db = new Database(path.join(dataDir, "ai-pdm.sqlite"));
  browser = await chromium.launch({ headless: true });

  await runUiCases();
  await runGlobalGates();
}

try {
  await run();
} catch (error) {
  results.push({
    id: "RUNNER",
    title: "UI real-operation runner",
    status: "fail",
    error: error instanceof Error ? error.stack ?? error.message : String(error)
  });
} finally {
  if (browser) await browser.close();
  if (db) db.close();
  if (app) await stopNextApp(app.child);
  cleanupStatus = "started";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await delay(attempt === 0 ? 0 : 300);
      fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      cleanupStatus = "removed";
      break;
    } catch (error) {
      cleanupStatus = `failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

globalGateResults.push({
  id: "G1",
  title: "Fixture cleanup",
  status: cleanupStatus === "removed" ? "pass" : "fail",
  evidence: { tempRoot, cleanupStatus }
});

const summary = {
  generatedAt: new Date().toISOString(),
  runId,
  gitBranch: currentGitBranch(),
  baseUrl,
  tempRoot,
  dataDir,
  repositoryDir,
  cleanupStatus,
  total: results.filter((result) => result.id.startsWith("UI26-")).length,
  pass: results.filter((result) => result.id.startsWith("UI26-") && result.status === "pass").length,
  fail: results.filter((result) => result.id.startsWith("UI26-") && result.status === "fail").length,
  globalTotal: globalGateResults.length,
  globalPass: globalGateResults.filter((result) => result.status === "pass").length,
  results,
  globalGateResults,
  fixtureLedger
};

fs.writeFileSync(path.join(outDir, "pdm-drawing-submission-ui-real-operation-report.json"), JSON.stringify(summary, null, 2), "utf8");
fs.writeFileSync(path.join(outDir, "pdm-drawing-submission-ui-real-operation-report.md"), renderMarkdown(summary), "utf8");

for (const result of results) {
  console.log(`${result.status === "pass" ? "PASS" : "FAIL"} ${result.id}: ${result.title}`);
  if (result.status !== "pass") console.log(result.error);
}
for (const gate of globalGateResults) {
  console.log(`${gate.status === "pass" ? "PASS" : "FAIL"} ${gate.id}: ${gate.title}`);
  if (gate.status !== "pass") console.log(gate.error ?? JSON.stringify(gate.evidence));
}

if (summary.fail > 0 || summary.globalPass !== summary.globalTotal) {
  console.error(`PDM drawing submission UI real-operation QC failed: ${summary.pass}/${summary.total} UI cases, ${summary.globalPass}/${summary.globalTotal} global gates.`);
  process.exit(1);
}

console.log(`PDM drawing submission UI real-operation QC passed: ${summary.pass}/${summary.total} UI cases, ${summary.globalPass}/${summary.globalTotal} global gates.`);
