import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";

const baseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3000";
const outDir = path.resolve("output/playwright/ui-operation-scenarios");
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const now = new Date().toISOString();
const results = [];
let fixtureInfo = null;

const realRouteFixture = {
  rootId: "root-qc-submit-ui",
  rootCode: "QC-SUBMIT",
  partId: "part-qc-submit-ui-001",
  partNumber: "P-QC-SUBMIT-001",
  partName: "QC 送審測試件",
  drawingId: "drawing-qc-submit-ui-ma1",
  drawingNumber: "D-QC-SUBMIT-MA1",
  drawingBaseName: "D-QC-SUBMIT-MA1",
  linkId: "link-qc-submit-ui-primary",
  variantId: "variant-qc-submit-ui",
  itemId: "item-qc-submit-ui-001",
  submissionId: "SUB-QC-SUBMIT-RELEASED",
  snapshotId: "snapshot-qc-submit-ui"
};

const forbiddenVisibleStrings = [
  "duplicate_active_submission",
  "ReleaseFailed",
  "UNIQUE constraint failed",
  "submission_conflict",
  "DUPLICATE_RELEASE_FILENAME",
  "Internal Server Error",
  "stack trace",
  "Error: ",
  " at ",
  "/api/"
];

fs.mkdirSync(outDir, { recursive: true });

function ensureRealRouteFixture() {
  const dbPath = path.resolve("data/ai-pdm.sqlite");
  const database = new Database(dbPath);
  try {
    const existing = database
      .prepare("SELECT id FROM drawing_numbers WHERE company_id = ? AND drawing_number = ? LIMIT 1")
      .get("company-jenfu", realRouteFixture.drawingNumber);
    if (existing) {
      fixtureInfo = {
        drawingNumber: realRouteFixture.drawingNumber,
        action: "existing",
        detail: `${realRouteFixture.drawingNumber} already existed; QC did not modify the existing QC-owned drawing fixture.`
      };
      console.log(`INFO FIXTURE-001: ${realRouteFixture.drawingNumber} already exists; using existing QC-owned fixture.`);
      return;
    }

    const repositoryDir = path.resolve("data/repository/qc-fixtures/drawing-submission-ui");
    fs.mkdirSync(repositoryDir, { recursive: true });
    const drawingPath = path.join(repositoryDir, `${realRouteFixture.drawingBaseName}.SLDDRW`);
    const modelPath = path.join(repositoryDir, `${realRouteFixture.drawingBaseName}.SLDPRT`);
    fs.writeFileSync(drawingPath, `QC fixture drawing for ${realRouteFixture.drawingNumber}\n`);
    fs.writeFileSync(modelPath, `QC fixture model for ${realRouteFixture.drawingNumber}\n`);
    const drawingBytes = fs.readFileSync(drawingPath);
    const modelBytes = fs.readFileSync(modelPath);
    const drawingHash = crypto.createHash("sha256").update(drawingBytes).digest("hex");
    const modelHash = crypto.createHash("sha256").update(modelBytes).digest("hex");

    const insert = database.transaction(() => {
      database
        .prepare(
          `INSERT OR IGNORE INTO part_roots (
            id, company_id, root_code, core_name, item_kind, development_phase, record_status,
            rule_version_id, created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          realRouteFixture.rootId,
          "company-jenfu",
          realRouteFixture.rootCode,
          realRouteFixture.partName,
          "manufactured",
          "Release",
          "Released",
          "numbering-rule-v1",
          "user-admin-demo",
          now,
          now
        );
      database
        .prepare(
          `INSERT OR IGNORE INTO part_numbers (
            id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name,
            item_kind, development_phase, record_status, rule_version_id, created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          realRouteFixture.partId,
          "company-jenfu",
          realRouteFixture.rootId,
          realRouteFixture.partNumber,
          1,
          "001",
          realRouteFixture.partName,
          "manufactured",
          "Release",
          "Released",
          "numbering-rule-v1",
          "user-admin-demo",
          now,
          now
        );
      database
        .prepare(
          `INSERT OR IGNORE INTO drawing_numbers (
            id, company_id, part_root_id, drawing_number, purpose_code, purpose_description,
            sequence_no, is_primary_manufacturing, development_phase, record_status,
            rule_version_id, created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          realRouteFixture.drawingId,
          "company-jenfu",
          realRouteFixture.rootId,
          realRouteFixture.drawingNumber,
          "MA",
          "MA 製造圖",
          1,
          1,
          "Release",
          "Released",
          "numbering-rule-v1",
          "user-admin-demo",
          now,
          now
        );
      database
        .prepare(
          `INSERT OR IGNORE INTO drawing_part_links (
            id, drawing_number_id, part_number_id, link_type, created_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          realRouteFixture.linkId,
          realRouteFixture.drawingId,
          realRouteFixture.partId,
          "primary_manufacturing",
          "user-admin-demo",
          now
        );
      database
        .prepare(
          `INSERT OR IGNORE INTO part_variant_attributes (
            id, part_number_id, material_code, material_label, surface_treatment,
            updated_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          realRouteFixture.variantId,
          realRouteFixture.partId,
          "SUS304",
          "SUS304",
          "無",
          "user-admin-demo",
          now,
          now
        );
      database
        .prepare(
          "INSERT OR IGNORE INTO items (id, company_id, part_number, part_name, current_revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .run(
          realRouteFixture.itemId,
          "company-jenfu",
          realRouteFixture.partNumber,
          realRouteFixture.partName,
          "0.1",
          now,
          now
        );
      for (const asset of [
        {
          id: "asset-qc-submit-ui-slddrw",
          path: drawingPath,
          fileName: `${realRouteFixture.drawingBaseName}.SLDDRW`,
          ext: "slddrw",
          category: "drawing_2d",
          hash: drawingHash,
          size: drawingBytes.length
        },
        {
          id: "asset-qc-submit-ui-sldprt",
          path: modelPath,
          fileName: `${realRouteFixture.drawingBaseName}.SLDPRT`,
          ext: "sldprt",
          category: "cad_3d",
          hash: modelHash,
          size: modelBytes.length
        }
      ]) {
        database
          .prepare(
            `INSERT OR IGNORE INTO file_assets (
              id, storage_provider, original_path, storage_key, file_name, file_ext, file_size,
              content_hash, linked_entity_type, linked_entity_id, document_category, display_name,
              revision, uploaded_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            asset.id,
            "j_drive",
            asset.path,
            asset.path,
            asset.fileName,
            asset.ext,
            asset.size,
            asset.hash,
            "drawing_number",
            realRouteFixture.drawingId,
            asset.category,
            asset.fileName,
            "0.1",
            "user-admin-demo",
            now,
            now
          );
      }
      database
        .prepare(
          `INSERT OR IGNORE INTO submissions (
            id, company_id, item_id, drawing_number, revision, product_line, process_name,
            material, surface_finish, document_type, change_description, status, submitted_by,
            approval_required, released_at, source_entity_type, source_entity_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          realRouteFixture.submissionId,
          "company-jenfu",
          realRouteFixture.itemId,
          realRouteFixture.drawingNumber,
          "0.1",
          "QA",
          "焊接",
          "SUS304",
          "無",
          "Drawing",
          "QC fixture released submission for UI operation validation.",
          "Released",
          "user-engineer-demo",
          1,
          now,
          "drawing_number",
          realRouteFixture.drawingNumber,
          now,
          now
        );
      for (const file of [
        {
          id: "file-qc-submit-ui-slddrw",
          role: "slddrw",
          name: `${realRouteFixture.drawingBaseName}.SLDDRW`,
          path: drawingPath,
          hash: drawingHash,
          size: drawingBytes.length
        },
        {
          id: "file-qc-submit-ui-sldprt",
          role: "sldprt",
          name: `${realRouteFixture.drawingBaseName}.SLDPRT`,
          path: modelPath,
          hash: modelHash,
          size: modelBytes.length
        }
      ]) {
        database
          .prepare(
            `INSERT OR IGNORE INTO submission_files (
              id, submission_id, file_role, original_filename, local_path, gdrive_status,
              sha256, file_size, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(file.id, realRouteFixture.submissionId, file.role, file.name, file.path, "none", file.hash, file.size, now);
      }
      const snapshotJson = {
        source: "qc-pdm-drawing-submission-ui-operation",
        drawingNumber: realRouteFixture.drawingNumber,
        partNumber: realRouteFixture.partNumber,
        revision: "0.1"
      };
      const snapshotText = JSON.stringify(snapshotJson);
      database
        .prepare(
          `INSERT OR IGNORE INTO submission_snapshots (
            id, submission_id, company_id, source_root_id, source_root_code,
            source_drawing_number_id, source_drawing_number, source_part_number_id, source_part_number,
            snapshot_version, rules_version, snapshot_hash, snapshot_json, captured_by, captured_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          realRouteFixture.snapshotId,
          realRouteFixture.submissionId,
          "company-jenfu",
          realRouteFixture.rootId,
          realRouteFixture.rootCode,
          realRouteFixture.drawingId,
          realRouteFixture.drawingNumber,
          realRouteFixture.partId,
          realRouteFixture.partNumber,
          "drawing_part_submission_v1",
          "numbering-rule-v1",
          crypto.createHash("sha256").update(snapshotText).digest("hex"),
          snapshotText,
          "user-admin-demo",
          now,
          now
        );
    });

    insert();
    fixtureInfo = {
      drawingNumber: realRouteFixture.drawingNumber,
      action: "created",
      detail: `Created minimal local ${realRouteFixture.drawingNumber} fixture for real UI route checks; setup is not counted as UI evidence.`
    };
    console.log(`INFO FIXTURE-001: Created ${realRouteFixture.drawingNumber} local QC fixture for real UI route checks.`);
  } finally {
    database.close();
  }
}

function cleanupRealRouteFixture() {
  if (!fixtureInfo || fixtureInfo.drawingNumber !== realRouteFixture.drawingNumber) return;
  const dbPath = path.resolve("data/ai-pdm.sqlite");
  const database = new Database(dbPath);
  try {
    const cleanup = database.transaction(() => {
      database.prepare("DELETE FROM submission_snapshots WHERE submission_id = ?").run(realRouteFixture.submissionId);
      database.prepare("DELETE FROM submission_files WHERE submission_id = ?").run(realRouteFixture.submissionId);
      database.prepare("DELETE FROM submissions WHERE id = ?").run(realRouteFixture.submissionId);
      database.prepare("DELETE FROM file_assets WHERE linked_entity_type = 'drawing_number' AND linked_entity_id = ?").run(realRouteFixture.drawingId);
      database.prepare("DELETE FROM part_variant_attributes WHERE part_number_id = ?").run(realRouteFixture.partId);
      database.prepare("DELETE FROM drawing_part_links WHERE drawing_number_id = ?").run(realRouteFixture.drawingId);
      database.prepare("DELETE FROM drawing_numbers WHERE id = ?").run(realRouteFixture.drawingId);
      database.prepare("DELETE FROM items WHERE id = ?").run(realRouteFixture.itemId);
      database.prepare("DELETE FROM part_numbers WHERE id = ?").run(realRouteFixture.partId);
      database.prepare("DELETE FROM part_roots WHERE id = ?").run(realRouteFixture.rootId);
    });
    cleanup();
    fs.rmSync(path.resolve("data/repository/qc-fixtures/drawing-submission-ui"), { recursive: true, force: true });
    fixtureInfo.cleanup = "removed";
    fixtureInfo.detail += " QC-owned fixture rows and local files were removed after browser evidence was captured.";
    console.log(`INFO FIXTURE-002: Removed ${realRouteFixture.drawingNumber} QC fixture after UI validation.`);
  } catch (error) {
    fixtureInfo.cleanup = "failed";
    fixtureInfo.cleanupError = error instanceof Error ? error.message : String(error);
    record("FIXTURE-CLEANUP", "QC fixture cleanup", "fail", `QC 專用 fixture 清理失敗：${fixtureInfo.cleanupError}`);
  } finally {
    database.close();
  }
}

function record(id, title, status, detail, evidence = {}) {
  results.push({ id, title, status, detail, evidence });
  const marker = status === "pass" ? "PASS" : status === "fail" ? "FAIL" : "INFO";
  console.log(`${marker} ${id}: ${title}${detail ? ` - ${detail}` : ""}`);
}

async function runScenario(id, title, fn) {
  try {
    await fn();
  } catch (error) {
    record(id, title, "fail", error instanceof Error ? error.message : String(error));
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function loginByUi(browser, role, viewport = { width: 1440, height: 1024 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const email =
    role === "Admin"
      ? "admin@example.com"
      : role === "R&D Manager"
        ? "manager@example.com"
        : "engineer@example.com";
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /登入/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });
  await page.waitForLoadState("networkidle");
  return { context, page, email };
}

async function screenshot(page, name) {
  const filePath = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function visibleText(page) {
  return page.locator("body").innerText({ timeout: 10000 });
}

async function assertVisibleErrorClean(page, contextLabel) {
  const text = await visibleText(page);
  const present = forbiddenVisibleStrings.filter((needle) => text.includes(needle));
  expect(present.length === 0, `${contextLabel} 出現技術或錯誤文字：${present.join(", ")}`);
}

async function assertNoHorizontalOverflow(page, contextLabel) {
  const measurement = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth
  }));
  expect(
    measurement.scrollWidth <= measurement.clientWidth + 2 && measurement.bodyScrollWidth <= measurement.clientWidth + 2,
    `${contextLabel} 有水平 overflow：${JSON.stringify(measurement)}`
  );
}

function buildWorkbenchContext({
  drawingNumber,
  partNumber = "P-QA-001",
  partName = "QA 測試件",
  revision = "0.1",
  material = "SUS304",
  surfaceFinish = "無",
  attachments = [],
  blockers = [],
  sameRevisionRecords = [],
  nonBlockingHistory = []
}) {
  return {
    pdmCompany: { companyId: "COMP-JENFU", companyCode: "JENFU", displayName: "鉦富" },
    drawing: {
      id: `DRAWING-${drawingNumber}`,
      drawingNumber,
      purposeCode: "MA",
      purposeLabel: "MA 製造圖",
      recordStatus: "Draft",
      developmentPhase: "EVT",
      coreName: partName
    },
    primaryPart: {
      id: `ITEM-${partNumber}`,
      partNumber,
      partName,
      itemKind: "manufactured",
      material,
      surfaceFinish,
      processName: "焊接",
      productSeries: "QA"
    },
    linkedParts: [{ id: `ITEM-${partNumber}`, partNumber, partName, isPrimary: true }],
    attachments,
    suggestedRevision: { revision, source: "latest_attachment" },
    blockers,
    sameRevisionRecords,
    nonBlockingHistory
  };
}

function attachment(id, fileName, options = {}) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "file";
  return {
    id,
    displayName: fileName,
    fileName,
    fileExt: ext,
    fileSize: options.fileSize ?? 89123,
    documentCategory: options.documentCategory ?? (ext === "sldprt" ? "cad_3d" : "drawing_2d"),
    revision: options.revision ?? "0.1",
    createdAt: "2026-07-02T12:00:00.000Z",
    eligibleForSubmission: options.eligibleForSubmission ?? true,
    ...(options.ineligibleReason ? { ineligibleReason: options.ineligibleReason } : {}),
    ...(options.releaseConflict ? { releaseConflict: options.releaseConflict } : {})
  };
}

function blocker(code, message, status = "Pending", submissionId = `SUB-${code.toUpperCase()}`) {
  return {
    code,
    group: "submission_conflict",
    severity: "blocker",
    message,
    recoveryHref: `/submissions/${submissionId}`,
    recoveryLabel: "查看紀錄",
    existingSubmission: {
      submissionId,
      drawingNumber: "D-QA-BLOCK-MA1",
      revision: "0.1",
      status,
      createdAt: "2026-07-02T12:00:00.000Z",
      submittedByDisplayName: "Demo Engineer",
      releaseError: null,
      resolvedBySubmissionId: null,
      resolvedAt: null,
      correctsSubmissionId: null
    }
  };
}

function submissionDetail(id, status, overrides = {}) {
  return {
    id,
    item_id: overrides.item_id ?? "ITEM-QA",
    part_number: overrides.part_number ?? "P-QA-001",
    part_name: overrides.part_name ?? "QA 測試件",
    drawing_number: overrides.drawing_number ?? "D-QA-MA1",
    revision: overrides.revision ?? "0.1",
    product_line: "QA",
    customer: "",
    project_code: "",
    process_name: "焊接",
    machine: "",
    material: "SUS304",
    surface_finish: "無",
    document_type: "Drawing",
    change_description: overrides.change_description ?? "UI 操作驗證送審。",
    status,
    submitted_by: overrides.submitted_by ?? "user-engineer-demo",
    submitted_by_name: overrides.submitted_by_name ?? "Demo Engineer",
    approval_required: 1,
    file_count: 1,
    created_at: "2026-07-02T12:00:00.000Z",
    updated_at: "2026-07-02T12:00:00.000Z",
    released_at: status === "Released" ? "2026-07-02T12:20:00.000Z" : null,
    rejected_at: null,
    reject_reason: null,
    release_error: overrides.release_error ?? null,
    superseded_by_submission_id: null,
    obsolete_at: null,
    obsolete_by: null,
    source_entity_type: "drawing_number",
    source_entity_id: overrides.drawing_number ?? "D-QA-MA1",
    cancelled_at: status === "Cancelled" ? "2026-07-02T12:30:00.000Z" : null,
    cancelled_by: status === "Cancelled" ? "user-engineer-demo" : null,
    cancel_reason: status === "Cancelled" ? "UI 操作驗證取消。" : null,
    returned_for_correction_at: null,
    returned_for_correction_by: null,
    returned_for_correction_reason: null,
    corrects_submission_id: overrides.corrects_submission_id ?? null,
    resolved_by_submission_id: overrides.resolved_by_submission_id ?? null,
    resolved_at: overrides.resolved_at ?? null,
    files: [
      {
        id: `${id}-FILE-1`,
        submission_id: id,
        file_role: "slddrw",
        original_filename: `${overrides.drawing_number ?? "D-QA-MA1"}.SLDDRW`,
        local_path: "mock",
        gdrive_file_id: null,
        gdrive_status: "none",
        sha256: "mock",
        file_size: 89123,
        created_at: "2026-07-02T12:00:00.000Z"
      }
    ],
    references: [],
    bom: null,
    active_lock: null,
    release_package: null,
    approvals: [],
    audit_logs: [],
    lifecycle_requests: []
  };
}

async function mockWorkbenchRoute(page, drawingNumber, getContext) {
  await page.route(`**/api/numbering/drawings/${encodeURIComponent(drawingNumber)}/submission-workbench`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(getContext()) });
  });
}

async function mockSubmissionDetail(page, id, getSubmission, options = {}) {
  await page.route(`**/api/submissions/${encodeURIComponent(id)}`, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    if (options.notFound) {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "not_found" }) });
      return;
    }
    if (options.restricted) {
      await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "forbidden" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ submission: getSubmission() }) });
  });
  if (options.restricted) {
    await page.route(`**/api/submissions/${encodeURIComponent(id)}/recovery-summary`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          message: "你可以查看同公司既有送審摘要；完整附件與審核內容需由送審建立者、主管或管理員查看。",
          summary: {
            id,
            drawing_number: "D-QA-RESTRICTED-MA1",
            part_number: "P-QA-001",
            part_name: "QA 受限件",
            revision: "0.1",
            status: "Pending",
            submitted_by_name: "Demo Engineer",
            created_at: "2026-07-02T12:00:00.000Z",
            updated_at: "2026-07-02T12:00:00.000Z",
            file_count: 1,
            file_roles: ["slddrw"]
          }
        })
      });
    });
  }
}

async function run() {
  const fixtureFile = path.join(outDir, "D-QA-RELFAIL-MA1.SLDDRW");
  fs.writeFileSync(fixtureFile, "mock drawing file for UI operation validation");
  ensureRealRouteFixture();

  const browser = await chromium.launch({ headless: true });
  try {
    await runScenario("AUTH-001", "三種測試角色可用登入頁表單登入", async () => {
      for (const role of ["Engineer", "R&D Manager", "Admin"]) {
        const { context, page } = await loginByUi(browser, role);
        await page.getByText("AI PDM").first().waitFor({ timeout: 15000 });
        await assertVisibleErrorClean(page, `${role} 登入後首頁`);
        await context.close();
      }
      record("AUTH-001", "三種測試角色可用登入頁表單登入", "pass", "Engineer / R&D Manager / Admin 均完成 UI 登入");
    });

    await runScenario("REAL-001", "從圖號模組點選 QC 專用圖號送審入口", async () => {
      const { context, page } = await loginByUi(browser, "Admin");
      await page.goto(`${baseUrl}/numbering/drawings`, { waitUntil: "networkidle" });
      await page.locator("input").first().fill(realRouteFixture.drawingNumber);
      await page.getByRole("button", { name: /查詢/ }).click();
      await page.getByRole("button", { name: realRouteFixture.drawingNumber }).click();
      await page.getByRole("link", { name: "送審", exact: true }).click();
      await page.waitForURL(new RegExp(`/drawings/${realRouteFixture.drawingNumber}/submission-workbench`));
      await page.getByText(`送審來源：${realRouteFixture.drawingNumber}`).waitFor({ timeout: 15000 });
      await page.getByText("此版次不可送審").waitFor({ timeout: 15000 });
      expect(await page.locator("textarea").first().isDisabled(), "正式版次備註欄應鎖定");
      expect(await page.locator('input[type="checkbox"]').first().isDisabled(), "正式版次附件勾選應鎖定");
      await assertVisibleErrorClean(page, `${realRouteFixture.drawingNumber} 圖號入口`);
      await assertNoHorizontalOverflow(page, `${realRouteFixture.drawingNumber} 圖號入口`);
      const filePath = await screenshot(page, "REAL-001-qc-submit-drawing-entry");
      await context.close();
      record("REAL-001", "從圖號模組點選 QC 專用圖號送審入口", "pass", "導到同一圖號工作台且正式版次被鎖定", { screenshot: filePath });
    });

    await runScenario("REAL-002", "Legacy drawing upload route 不回到泛用上傳表單", async () => {
      const { context, page } = await loginByUi(browser, "Admin");
      await page.goto(`${baseUrl}/upload?source=drawing&drawingNumber=${realRouteFixture.drawingNumber}`, { waitUntil: "networkidle" });
      await page.getByText(`送審來源：${realRouteFixture.drawingNumber}`).waitFor({ timeout: 15000 });
      const text = await visibleText(page);
      expect(!text.includes("Windows 檔案送審"), "Legacy drawing route 不應顯示泛用 Windows 上傳送審");
      expect(text.includes("此版次不可送審"), "同版次正式紀錄應顯示不可送審");
      await assertVisibleErrorClean(page, "Legacy drawing upload route");
      const filePath = await screenshot(page, "REAL-002-legacy-route");
      await context.close();
      record("REAL-002", "Legacy drawing upload route 不回到泛用上傳表單", "pass", "仍呈現圖面送審工作台", { screenshot: filePath });
    });

    await runScenario("REAL-003", "泛用 /upload 已退役且導向受控來源", async () => {
      const { context, page } = await loginByUi(browser, "Admin");
      await page.goto(`${baseUrl}/upload`, { waitUntil: "networkidle" });
      await page.getByText("上傳送審已退役").waitFor({ timeout: 15000 });
      await page.getByRole("link", { name: "前往圖料模組" }).waitFor({ timeout: 15000 });
      await assertVisibleErrorClean(page, "泛用 upload 退役頁");
      const filePath = await screenshot(page, "REAL-003-retired-upload");
      await context.close();
      record("REAL-003", "泛用 /upload 已退役且導向受控來源", "pass", "未出現空白送審表單", { screenshot: filePath });
    });

    await runScenario("REAL-004", "既有送審明細導向同一 QC 專用正式紀錄", async () => {
      const { context, page } = await loginByUi(browser, "Admin");
      await page.goto(`${baseUrl}/drawings/${realRouteFixture.drawingNumber}/submission-workbench`, { waitUntil: "networkidle" });
      await page.getByText(`送審來源：${realRouteFixture.drawingNumber}`).waitFor({ timeout: 15000 });
      await page.getByRole("link", { name: /查看正式紀錄|查看紀錄/ }).first().click();
      await page.waitForURL(/\/submissions\//);
      await page.getByText(realRouteFixture.drawingNumber).first().waitFor({ timeout: 15000 });
      await page.getByText("已發布").first().waitFor({ timeout: 15000 });
      await assertVisibleErrorClean(page, `${realRouteFixture.drawingNumber} 正式紀錄明細`);
      const filePath = await screenshot(page, "REAL-004-qc-submit-submission-detail");
      await context.close();
      record("REAL-004", "既有送審明細導向同一 QC 專用正式紀錄", "pass", "未導到無關圖號", { screenshot: filePath });
    });

    await runScenario("MOCK-READY-001", "可送審狀態：備註與附件條件控制送出審核", async () => {
      const { context, page } = await loginByUi(browser, "Engineer");
      const drawingNumber = "D-QA-READY-MA1";
      await mockWorkbenchRoute(page, drawingNumber, () =>
        buildWorkbenchContext({
          drawingNumber,
          attachments: [attachment("ATT-READY-1", "D-QA-READY-MA1.SLDDRW"), attachment("ATT-READY-2", "D-QA-READY-MA1.SLDPRT")]
        })
      );
      await page.route(`**/api/numbering/drawings/${drawingNumber}/submissions`, async (route) => {
        expect(route.request().method() === "POST", "可送審情境應透過 UI POST 建立送審");
        await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ submissionId: "SUB-QA-READY", revision: "0.1" }) });
      });
      await page.goto(`${baseUrl}/drawings/${drawingNumber}/submission-workbench`, { waitUntil: "networkidle" });
      await page.getByText("送審備註尚未完成").waitFor({ timeout: 15000 });
      expect(await page.getByRole("button", { name: "送出審核" }).isDisabled(), "備註未完成時應不能送出");
      await page.locator("textarea").fill("圖面主資料已確認，提交審核。");
      await page.getByText("主資料、附件與送審備註已通過").waitFor({ timeout: 15000 });
      expect(await page.getByRole("button", { name: "送出審核" }).isEnabled(), "備註與附件完成後應可送出");
      await page.getByRole("button", { name: "送出審核" }).click();
      await page.getByText("圖面送審已建立").waitFor({ timeout: 15000 });
      await assertVisibleErrorClean(page, "可送審狀態");
      const filePath = await screenshot(page, "MOCK-READY-001-ready-submit");
      await context.close();
      record("MOCK-READY-001", "可送審狀態：備註與附件條件控制送出審核", "pass", "UI 完成送出審核成功訊息", { screenshot: filePath });
    });

    await runScenario("MOCK-READY-002", "未選附件時阻擋送審", async () => {
      const { context, page } = await loginByUi(browser, "Engineer");
      const drawingNumber = "D-QA-NOATT-MA1";
      await mockWorkbenchRoute(page, drawingNumber, () =>
        buildWorkbenchContext({ drawingNumber, attachments: [attachment("ATT-NOATT-1", "D-QA-NOATT-MA1.SLDDRW")] })
      );
      await page.goto(`${baseUrl}/drawings/${drawingNumber}/submission-workbench`, { waitUntil: "networkidle" });
      const checkbox = page.locator('input[type="checkbox"]').first();
      await checkbox.uncheck();
      await page.getByText("尚未選擇來源附件").waitFor({ timeout: 15000 });
      await page.locator("textarea").fill("圖面主資料已確認，提交審核。");
      expect(await page.getByRole("button", { name: "送出審核" }).isDisabled(), "沒有附件時不能送出");
      await assertVisibleErrorClean(page, "未選附件狀態");
      const filePath = await screenshot(page, "MOCK-READY-002-no-attachment");
      await context.close();
      record("MOCK-READY-002", "未選附件時阻擋送審", "pass", "顯示附件需求並鎖住送出", { screenshot: filePath });
    });

    await runScenario("MOCK-BLOCKER-001", "主資料缺漏 blocker 與同版次 blocker 分層顯示", async () => {
      const { context, page } = await loginByUi(browser, "Engineer");
      const drawingNumber = "D-QA-MISSING-MA1";
      await mockWorkbenchRoute(page, drawingNumber, () =>
        buildWorkbenchContext({
          drawingNumber,
          material: "",
          surfaceFinish: "",
          attachments: [attachment("ATT-MISS-1", "D-QA-MISSING-MA1.SLDDRW")],
          blockers: [
            {
              code: "missing_material",
              group: "master_data_missing",
              severity: "blocker",
              message: "主料號缺少材質，請回圖號/料號主資料補齊。",
              recoveryHref: "/numbering/drawings",
              recoveryLabel: "回主資料處理"
            }
          ]
        })
      );
      await page.goto(`${baseUrl}/drawings/${drawingNumber}/submission-workbench`, { waitUntil: "networkidle" });
      await page.getByText("主資料尚未完成").waitFor({ timeout: 15000 });
      await page.getByText("主料號缺少材質").waitFor({ timeout: 15000 });
      expect(await page.locator("textarea").isDisabled(), "主資料缺漏時備註不應成為解法");
      await assertVisibleErrorClean(page, "主資料缺漏 blocker");
      const filePath = await screenshot(page, "MOCK-BLOCKER-001-master-data-missing");
      await context.close();
      record("MOCK-BLOCKER-001", "主資料缺漏 blocker 與同版次 blocker 分層顯示", "pass", "主資料缺漏以中文說明並阻擋送審", { screenshot: filePath });
    });

    await runScenario("MOCK-BLOCKER-002", "Pending / Releasing / Released / History 狀態 UI 分流", async () => {
      const states = [
        {
          id: "pending",
          code: "same_revision_in_progress",
          status: "Pending",
          text: "此圖號版次正在送審或發行中",
          expectedButton: "此版次不可送審"
        },
        {
          id: "releasing",
          code: "same_revision_in_progress",
          status: "Releasing",
          text: "此圖號版次正在送審或發行中",
          expectedButton: "此版次不可送審"
        },
        {
          id: "released",
          code: "released_revision_exists",
          status: "Released",
          text: "此圖號版次已進入正式紀錄",
          expectedButton: "此版次不可送審"
        },
        {
          id: "history",
          code: null,
          status: "Cancelled",
          text: "已取消",
          expectedButton: "送出審核"
        }
      ];
      const { context, page } = await loginByUi(browser, "Engineer");
      for (const state of states) {
        const drawingNumber = `D-QA-${state.id.toUpperCase()}-MA1`;
        await page.unrouteAll({ behavior: "ignoreErrors" });
        await mockWorkbenchRoute(page, drawingNumber, () =>
          buildWorkbenchContext({
            drawingNumber,
            attachments: [attachment(`ATT-${state.id}`, `${drawingNumber}.SLDDRW`)],
            blockers: state.code ? [blocker(state.code, state.text, state.status, `SUB-${state.id.toUpperCase()}`)] : [],
            sameRevisionRecords: [
              {
                submissionId: `SUB-${state.id.toUpperCase()}`,
                drawingNumber,
                revision: "0.1",
                status: state.status,
                userLabel: state.text,
                blocking: Boolean(state.code),
                resolved: false,
                historyMessage: state.code ? state.text : "已取消，不影響本次送審。",
                submittedByDisplayName: "Demo Engineer",
                releaseError: null,
                resolvedBySubmissionId: null,
                resolvedAt: null,
                correctsSubmissionId: null
              }
            ]
          })
        );
        await page.goto(`${baseUrl}/drawings/${drawingNumber}/submission-workbench`, { waitUntil: "networkidle" });
        await page.getByText(state.text).first().waitFor({ timeout: 15000 });
        await page.getByRole("button", { name: state.expectedButton }).waitFor({ timeout: 15000 });
        if (state.code) expect(await page.getByRole("button", { name: state.expectedButton }).isDisabled(), `${state.status} 應阻擋同版次`);
        await assertVisibleErrorClean(page, `${state.status} 同版次狀態`);
        await screenshot(page, `MOCK-BLOCKER-002-${state.id}`);
      }
      await context.close();
      record("MOCK-BLOCKER-002", "Pending / Releasing / Released / History 狀態 UI 分流", "pass", "四種同版次狀態皆完成 UI 模擬");
    });

    await runScenario("MOCK-RELFAIL-001", "發行未完成可整理附件並建立修正送審", async () => {
      const { context, page } = await loginByUi(browser, "Admin");
      const drawingNumber = "D-QA-RELFAIL-MA1";
      let attachments = [
        attachment("ATT-GOOD", "D-QA-RELFAIL-MA1.SLDDRW"),
        attachment("ATT-CONFLICT", "水槽本體2.SLDPRT", {
          releaseConflict: { submissionId: "SUB-OLD", drawingNumber: "水槽本體2", revision: "0.1", originalFilename: "水槽本體2.SLDPRT" }
        })
      ];
      const currentContext = () =>
        buildWorkbenchContext({
          drawingNumber,
          attachments,
          blockers: [
            {
              code: "release_incomplete_conflict",
              group: "submission_conflict",
              severity: "blocker",
              message: "發行未完成：此圖號版次已通過審核，但尚未完成發行，需要主管或 Admin 處理。",
              recoveryHref: "/submissions/SUB-QA-FAILED",
              recoveryLabel: "處理發行未完成",
              existingSubmission: {
                submissionId: "SUB-QA-FAILED",
                drawingNumber,
                revision: "0.1",
                status: "ReleaseFailed",
                createdAt: "2026-07-02T12:00:00.000Z",
                submittedByDisplayName: "Demo Admin",
                releaseError: "DUPLICATE_RELEASE_FILENAME: 水槽本體2.SLDPRT (水槽本體2 rev 0.1)",
                resolvedBySubmissionId: null,
                resolvedAt: null,
                correctsSubmissionId: null
              }
            }
          ],
          sameRevisionRecords: [
            {
              submissionId: "SUB-QA-FAILED",
              drawingNumber,
              revision: "0.1",
              status: "ReleaseFailed",
              userLabel: "發行未完成",
              blocking: true,
              resolved: false,
              historyMessage: "發行未完成，需要主管或 Admin 處理。",
              submittedByDisplayName: "Demo Admin",
              releaseError: "DUPLICATE_RELEASE_FILENAME: 水槽本體2.SLDPRT (水槽本體2 rev 0.1)",
              resolvedBySubmissionId: null,
              resolvedAt: null,
              correctsSubmissionId: null
            }
          ]
        });
      await mockWorkbenchRoute(page, drawingNumber, currentContext);
      await page.route(`**/api/numbering/drawings/${drawingNumber}/attachments/ATT-CONFLICT`, async (route) => {
        expect(route.request().method() === "DELETE", "移除附件應透過 UI DELETE");
        attachments = attachments.filter((item) => item.id !== "ATT-CONFLICT");
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      });
      await page.route(`**/api/numbering/drawings/${drawingNumber}/attachments`, async (route) => {
        expect(route.request().method() === "POST", "上傳附件應透過 UI multipart POST");
        attachments = [...attachments, attachment("ATT-UPLOADED", "D-QA-RELFAIL-MA1-UPLOADED.SLDDRW")];
        await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ attachment: attachments.at(-1) }) });
      });
      await page.route("**/api/submissions/SUB-QA-FAILED/return-for-correction", async (route) => {
        expect(route.request().method() === "POST", "建立修正送審應由 UI POST return-for-correction");
        const body = JSON.parse(route.request().postData() ?? "{}");
        expect(Array.isArray(body.selectedAttachmentIds) && body.selectedAttachmentIds.includes("ATT-GOOD"), "修正送審應帶入明確 selectedAttachmentIds");
        await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ submissionId: "SUB-QA-CORRECTION", revision: "0.1" }) });
      });
      page.on("dialog", async (dialog) => {
        expect(dialog.message().includes("從圖號附件庫移除"), "移除附件需有確認對話");
        await dialog.accept();
      });

      await page.goto(`${baseUrl}/drawings/${drawingNumber}/submission-workbench`, { waitUntil: "networkidle" });
      await page.getByText("發行未完成，需要先修正附件再重新送審").waitFor({ timeout: 15000 });
      await page.getByText("此檔名已被正式紀錄").waitFor({ timeout: 15000 });
      expect(await page.locator('input[type="checkbox"]').nth(1).isDisabled(), "衝突附件不可選");
      await page.getByRole("button", { name: "移除" }).nth(1).click();
      await page.getByText("附件已從目前圖號附件庫移除").waitFor({ timeout: 15000 });
      await page.locator('input[type="file"]').setInputFiles(fixtureFile);
      await page.getByRole("button", { name: "加入附件庫" }).click();
      await page.getByText("附件已加入圖號附件庫").waitFor({ timeout: 15000 });
      await page.locator("textarea").fill("修正送審附件後重新送審。");
      await page.getByRole("button", { name: "建立修正送審" }).click();
      await page.getByText("已建立修正送審").waitFor({ timeout: 15000 });
      await assertVisibleErrorClean(page, "發行未完成附件修正流程");
      const filePath = await screenshot(page, "MOCK-RELFAIL-001-correction-flow");
      await context.close();
      record("MOCK-RELFAIL-001", "發行未完成可整理附件並建立修正送審", "pass", "移除、上傳、選取、建立修正送審皆由 UI 完成", { screenshot: filePath });
    });

    await runScenario("MOCK-PERM-001", "建立修正送審被權限阻擋時顯示中文", async () => {
      const { context, page } = await loginByUi(browser, "Engineer");
      const drawingNumber = "D-QA-FORBID-MA1";
      await mockWorkbenchRoute(page, drawingNumber, () =>
        buildWorkbenchContext({
          drawingNumber,
          attachments: [attachment("ATT-FORBID", "D-QA-FORBID-MA1.SLDDRW")],
          blockers: [
            {
              code: "release_incomplete_conflict",
              group: "submission_conflict",
              severity: "blocker",
              message: "發行未完成：此圖號版次已通過審核，但尚未完成發行，需要主管或 Admin 處理。",
              recoveryHref: "/submissions/SUB-QA-FORBID",
              recoveryLabel: "處理發行未完成",
              existingSubmission: {
                submissionId: "SUB-QA-FORBID",
                drawingNumber,
                revision: "0.1",
                status: "ReleaseFailed",
                releaseError: null,
                resolvedBySubmissionId: null,
                resolvedAt: null,
                correctsSubmissionId: null
              }
            }
          ],
          sameRevisionRecords: []
        })
      );
      await page.route("**/api/submissions/SUB-QA-FORBID/return-for-correction", async (route) => {
        await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ message: "你沒有權限建立修正送審，請通知主管或 Admin。" }) });
      });
      await page.goto(`${baseUrl}/drawings/${drawingNumber}/submission-workbench`, { waitUntil: "networkidle" });
      await page.locator("textarea").fill("修正送審附件後重新送審。");
      await page.getByRole("button", { name: "建立修正送審" }).click();
      await page.getByText("你沒有權限建立修正送審").waitFor({ timeout: 15000 });
      await assertVisibleErrorClean(page, "修正送審權限阻擋");
      const filePath = await screenshot(page, "MOCK-PERM-001-correction-forbidden");
      await context.close();
      record("MOCK-PERM-001", "建立修正送審被權限阻擋時顯示中文", "pass", "權限不足由中文說明處理人", { screenshot: filePath });
    });

    await runScenario("MOCK-DETAIL-001", "送審明細：Pending 取消、非建立者限制、發行未完成角色差異", async () => {
      const { context: engineerContext, page: engineerPage } = await loginByUi(browser, "Engineer");
      let pendingOwnStatus = "Pending";
      await mockSubmissionDetail(engineerPage, "SUB-QA-PENDING-OWN", () => submissionDetail("SUB-QA-PENDING-OWN", pendingOwnStatus));
      await engineerPage.route("**/api/submissions/SUB-QA-PENDING-OWN/cancel", async (route) => {
        expect(route.request().method() === "POST", "取消送審應由 UI POST");
        pendingOwnStatus = "Cancelled";
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ message: "送審已取消。" }) });
      });
      await engineerPage.goto(`${baseUrl}/submissions/SUB-QA-PENDING-OWN`, { waitUntil: "networkidle" });
      await engineerPage.getByRole("button", { name: "取消送審" }).click();
      await engineerPage.getByText("已取消").first().waitFor({ timeout: 15000 });
      await assertVisibleErrorClean(engineerPage, "Pending 自己取消");
      await screenshot(engineerPage, "MOCK-DETAIL-001-pending-cancel");

      await engineerPage.unrouteAll({ behavior: "ignoreErrors" });
      await mockSubmissionDetail(engineerPage, "SUB-QA-PENDING-OTHER", () =>
        submissionDetail("SUB-QA-PENDING-OTHER", "Pending", { submitted_by: "user-other", submitted_by_name: "Other Engineer" })
      );
      await engineerPage.goto(`${baseUrl}/submissions/SUB-QA-PENDING-OTHER`, { waitUntil: "networkidle" });
      expect((await engineerPage.getByRole("button", { name: "取消送審" }).count()) === 0, "非建立者 Engineer 不應看到取消按鈕");
      await engineerPage.getByText("請由送審建立者、主管或 Admin 處理").waitFor({ timeout: 15000 });
      await assertVisibleErrorClean(engineerPage, "Pending 非建立者限制");
      await screenshot(engineerPage, "MOCK-DETAIL-001-pending-other");

      await engineerPage.unrouteAll({ behavior: "ignoreErrors" });
      await mockSubmissionDetail(engineerPage, "SUB-QA-RELFAIL-ENG", () =>
        submissionDetail("SUB-QA-RELFAIL-ENG", "ReleaseFailed", { release_error: "human readable failure" })
      );
      await engineerPage.goto(`${baseUrl}/submissions/SUB-QA-RELFAIL-ENG`, { waitUntil: "networkidle" });
      expect((await engineerPage.getByRole("button", { name: "重新發行" }).count()) === 0, "Engineer 不應看到重新發行");
      await engineerPage.getByText("需要主管或 Admin 處理").waitFor({ timeout: 15000 });
      await assertVisibleErrorClean(engineerPage, "Engineer 發行未完成明細");
      await screenshot(engineerPage, "MOCK-DETAIL-001-releasefailed-engineer");
      await engineerContext.close();

      const { context: managerContext, page: managerPage } = await loginByUi(browser, "R&D Manager");
      let retryStatus = "ReleaseFailed";
      await mockSubmissionDetail(managerPage, "SUB-QA-RELFAIL-MGR", () =>
        submissionDetail("SUB-QA-RELFAIL-MGR", retryStatus, { release_error: retryStatus === "ReleaseFailed" ? "temporary failure" : null })
      );
      await managerPage.route("**/api/submissions/SUB-QA-RELFAIL-MGR/retry-release", async (route) => {
        retryStatus = "Released";
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ message: "重新發行完成。" }) });
      });
      await managerPage.goto(`${baseUrl}/submissions/SUB-QA-RELFAIL-MGR`, { waitUntil: "networkidle" });
      await managerPage.getByRole("button", { name: "重新發行" }).click();
      await managerPage.getByText("已發布").first().waitFor({ timeout: 15000 });
      await assertVisibleErrorClean(managerPage, "Manager 重新發行");
      const filePath = await screenshot(managerPage, "MOCK-DETAIL-001-releasefailed-manager-retry");
      await managerContext.close();
      record("MOCK-DETAIL-001", "送審明細：Pending 取消、非建立者限制、發行未完成角色差異", "pass", "四個明細角色/狀態分支皆完成 UI 操作", { screenshot: filePath });
    });

    await runScenario("MOCK-DETAIL-002", "送審明細：受限摘要與找不到資料", async () => {
      const { context, page } = await loginByUi(browser, "Engineer");
      await mockSubmissionDetail(page, "SUB-QA-RESTRICTED", () => null, { restricted: true });
      await page.goto(`${baseUrl}/submissions/SUB-QA-RESTRICTED`, { waitUntil: "networkidle" });
      await page.getByText("只能查看受限摘要").waitFor({ timeout: 15000 });
      await assertVisibleErrorClean(page, "受限摘要");
      await screenshot(page, "MOCK-DETAIL-002-restricted");
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await mockSubmissionDetail(page, "SUB-QA-NOTFOUND", () => null, { notFound: true });
      await page.goto(`${baseUrl}/submissions/SUB-QA-NOTFOUND`, { waitUntil: "networkidle" });
      await page.getByText("找不到送審資料").waitFor({ timeout: 15000 });
      const text = await visibleText(page);
      expect(!text.includes("讀取失敗"), "404 應是找不到資料，不應是泛用讀取失敗");
      await screenshot(page, "MOCK-DETAIL-002-not-found");
      await context.close();
      record("MOCK-DETAIL-002", "送審明細：受限摘要與找不到資料", "pass", "受限與 404 狀態皆以人類中文呈現");
    });

    await runScenario("RWD-001", "核心工作台 viewport 無水平 overflow", async () => {
      for (const viewport of [
        { width: 1440, height: 1024 },
        { width: 1024, height: 900 },
        { width: 768, height: 900 },
        { width: 390, height: 844 }
      ]) {
        const { context, page } = await loginByUi(browser, "Admin", viewport);
        await page.goto(`${baseUrl}/upload?source=drawing&drawingNumber=${realRouteFixture.drawingNumber}`, { waitUntil: "networkidle" });
        await page.getByText(`送審來源：${realRouteFixture.drawingNumber}`).waitFor({ timeout: 15000 });
        await assertNoHorizontalOverflow(page, `${realRouteFixture.drawingNumber} viewport ${viewport.width}`);
        await assertVisibleErrorClean(page, `${realRouteFixture.drawingNumber} viewport ${viewport.width}`);
        await screenshot(page, `RWD-001-qc-submit-${viewport.width}`);
        await context.close();
      }
      record("RWD-001", "核心工作台 viewport 無水平 overflow", "pass", "1440/1024/768/390 皆完成 UI 檢查");
    });
  } finally {
    await browser.close();
  }
  cleanupRealRouteFixture();

  const summary = {
    generatedAt: now,
    baseUrl,
    fixture: fixtureInfo,
    total: results.length,
    pass: results.filter((item) => item.status === "pass").length,
    fail: results.filter((item) => item.status === "fail").length,
    results
  };
  fs.writeFileSync(path.join(outDir, "pdm-drawing-submission-ui-operation-report.json"), JSON.stringify(summary, null, 2), "utf8");
  fs.writeFileSync(path.join(outDir, "pdm-drawing-submission-ui-operation-report.md"), renderMarkdown(summary), "utf8");

  if (summary.fail > 0) {
    console.error(`UI operation scenario validation failed: ${summary.fail}/${summary.total}`);
    process.exit(1);
  }
  console.log(`UI operation scenario validation passed: ${summary.pass}/${summary.total}`);
}

function renderMarkdown(summary) {
  const lines = [
    "# PDM Drawing Submission UI Operation Scenario Report",
    "",
    `Generated: ${summary.generatedAt}`,
    `Base URL: ${summary.baseUrl}`,
    `Result: ${summary.pass}/${summary.total} passed, ${summary.fail} failed`,
    "",
    "## Fixture Setup",
    "",
    summary.fixture
      ? `- ${summary.fixture.drawingNumber}: ${summary.fixture.action} - ${summary.fixture.detail}`
      : "- No local fixture setup recorded.",
    "- Fixture setup is test data preparation only; pass/fail evidence comes from browser UI operations and screenshots.",
    "",
    "| ID | Status | Scenario | Detail |",
    "|---|---|---|---|"
  ];
  for (const item of summary.results) {
    lines.push(`| ${item.id} | ${item.status} | ${item.title} | ${String(item.detail ?? "").replace(/\|/g, "/")} |`);
  }
  return `${lines.join("\n")}\n`;
}

run().catch((error) => {
  record("RUNNER", "UI 操作驗證腳本執行", "fail", error instanceof Error ? error.stack ?? error.message : String(error));
  const summary = {
    generatedAt: now,
    baseUrl,
    fixture: fixtureInfo,
    total: results.length,
    pass: results.filter((item) => item.status === "pass").length,
    fail: results.filter((item) => item.status === "fail").length,
    results
  };
  fs.writeFileSync(path.join(outDir, "pdm-drawing-submission-ui-operation-report.json"), JSON.stringify(summary, null, 2), "utf8");
  fs.writeFileSync(path.join(outDir, "pdm-drawing-submission-ui-operation-report.md"), renderMarkdown(summary), "utf8");
  process.exit(1);
});
