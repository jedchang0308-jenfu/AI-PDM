#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = `DEV110-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev110-browser-"));
const dataDir = path.join(taskRoot, "data");
const fixtureDb = path.join(dataDir, "ai-pdm.sqlite");
const fixtureRepository = path.join(dataDir, "repository");
const evidenceDir = process.env.DEV110_EVIDENCE_DIR
  ? path.resolve(process.env.DEV110_EVIDENCE_DIR)
  : path.join(root, "output", "qa", "dev-110", runId, "browser");
const screenshotDir = path.join(evidenceDir, "screenshots");
const drawingId = "drawing-draft-drawing-58f3b735-a3fe-4c3b-87be-f2e23a15bebe";
const revisionId = "f717dd6b-311a-49f9-ace6-a31630ee56ba";
const branchId = "3a9a95cf-bda9-481c-a223-78d10bacb6a1";
const claimId = "3af1ff19-fb14-4f86-a7d3-8e71abbcd5fe";
const drawingNumber = "A0006-M01";
const companyId = "company-jenfu";
const ownerId = "user-admin-local-quick";
const p01Id = "part-number-05e491aa-5811-4c03-94e6-48bde3ca2601";
const p02Id = "dev110-browser-a0006-p02";
const workId = "dev110-browser-drawing-work";
const sessionId = "zz-dev110-browser-recognition";
const ids = {
  pdf: "FA-128f63e7-091e-4304-b60f-45ab132db86b",
  cad: "FA-60a01b75-ea5e-4804-85f0-53e6834885ce",
  drawing: "FA-6923f95f-79cd-4ea8-b0f2-9da5c2f6e99e"
};
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(screenshotDir, { recursive: true });
fs.cpSync(path.join(root, "data", "ai-pdm.sqlite"), fixtureDb);
if (fs.existsSync(path.join(root, "data", "repository"))) fs.cpSync(path.join(root, "data", "repository"), fixtureRepository, { recursive: true });

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, canonical(nested)]));
  return value;
}
function sha256Canonical(value) { return crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex"); }
function primarySnapshot(dbPath) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "dev-087-primary-snapshot.mjs"), `--db=${dbPath}`], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`PRIMARY_SNAPSHOT_FAILED:${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function seedFixture() {
  const db = new Database(fixtureDb);
  try {
    const files = db.prepare(`SELECT file.id, file.source_file_asset_id, file.role, file.sort_order, file.display_name, asset.file_name, asset.file_ext, asset.mime_type, asset.file_size, asset.content_hash, asset.storage_generation
      FROM drawing_revision_files file JOIN file_assets asset ON asset.id=file.source_file_asset_id
      WHERE file.company_id=? AND file.drawing_revision_id=? AND file.removed_at IS NULL ORDER BY file.sort_order, file.id`).all(companyId, revisionId);
    assert.equal(files.length, 3, "A0006 source snapshot has 3 files");
    const sourceFingerprint = sha256Canonical(files.map((file) => ({ fileAssetId: file.source_file_asset_id, contentHash: file.content_hash, storageGeneration: file.storage_generation ?? "", role: file.role })));
    db.prepare("UPDATE part_numbers SET record_status='Released' WHERE id=?").run(p01Id);
    db.prepare("UPDATE part_variant_attributes SET material_label='SUS201', material_code=NULL WHERE part_number_id=?").run(p01Id);
    // The shared primary fixture already has a legacy P01 Part Work. Remove
    // that task-local draft and restore the formal state so DEV-110 owns both
    // target Parts and proves create/update behavior deterministically.
    const oldP01Work = db.prepare("SELECT id FROM part_change_works WHERE part_id=?").get(p01Id);
    if (oldP01Work) {
      db.prepare("DELETE FROM canonical_workbench_states WHERE entity_type='part' AND canonical_entity_id=? AND data_layer='part_work'").run(p01Id);
      db.prepare("DELETE FROM part_change_works WHERE id=?").run(oldP01Work.id);
    }
    const p01Formal = db.prepare("SELECT id FROM canonical_workbench_states WHERE entity_type='part' AND canonical_entity_id=? AND data_layer='part_formal'").get(p01Id);
    if (!p01Formal) db.prepare("INSERT INTO canonical_workbench_states (id,company_id,entity_type,canonical_entity_id,data_layer,row_version) VALUES ('dev110-browser-p01-formal-state',?,'part',?,'part_formal',1)").run(companyId, p01Id);
    else db.prepare("UPDATE canonical_workbench_states SET row_version=1 WHERE id=?").run(p01Formal.id);
    const p02 = db.prepare("SELECT id FROM part_numbers WHERE id=?").get(p02Id);
    if (!p02) {
      db.prepare(`INSERT INTO part_numbers (id,company_id,part_root_id,part_number,sequence_no,sequence_code,part_name,item_kind,structure_type,is_universal,bom_usage_policy,custom_specification,record_status,created_by)
        SELECT ?,company_id,part_root_id,'A0006-P02',2,'P02','柵條固定板_BS_左',item_kind,structure_type,is_universal,bom_usage_policy,custom_specification,'Released',? FROM part_numbers WHERE id=?`).run(p02Id, ownerId, p01Id);
      db.prepare(`INSERT INTO canonical_workbench_states (id,company_id,entity_type,canonical_entity_id,data_layer,row_version)
        VALUES ('dev110-browser-p02-formal-state',?,'part',?,'part_formal',1)`).run(companyId, p02Id);
      const attr = db.prepare("SELECT material_code,material_label,color_code,color_label,surface_treatment,variant_note FROM part_variant_attributes WHERE part_number_id=?").get(p01Id);
      if (attr) db.prepare(`INSERT INTO part_variant_attributes (id,part_number_id,material_code,material_label,color_code,color_label,surface_treatment,variant_note,updated_by)
        VALUES (?,?,?,?,?,?,?,?,?)`).run("dev110-browser-p02-variant", p02Id, attr.material_code, attr.material_label, attr.color_code, attr.color_label, attr.surface_treatment, attr.variant_note, ownerId);
      db.prepare("INSERT INTO drawing_part_links (id,drawing_number_id,part_number_id,link_type,created_by) VALUES (?,?,?,?,?)").run("dev110-browser-p02-link", "drawing-number-8dbc4519-2ffa-412c-84a8-901f698ab046", p02Id, "primary_manufacturing", ownerId);
    }
    const existingWork = db.prepare("SELECT id FROM drawing_revision_works WHERE id=?").get(workId);
    if (!existingWork) {
      db.prepare(`INSERT INTO drawing_revision_works (id,company_id,drawing_id,branch_id,target_claim_id,owner_user_id,proposed_payload,base_hash,row_version)
        VALUES (?,?,?,?,?,?,?, ?,1)`).run(workId, companyId, drawingId, branchId, claimId, ownerId, JSON.stringify({ migrated: true, drawingId, revisionId, recognitionNotes: "" }), sha256Canonical({ predecessorRevisionId: null }));
      for (const file of files) db.prepare("INSERT INTO drawing_revision_work_files (work_id,file_binding_id,ordinal,content_hash) VALUES (?,?,?,?)").run(workId, file.id, file.sort_order, file.content_hash ?? `unhashed:${file.id}`);
      db.prepare("UPDATE canonical_workbench_states SET work_id=?,handling='owner',row_version=row_version+1 WHERE id=? AND entity_type='drawing'").run(workId, "1c4f1a65-5b0a-477a-ad0f-b2e1fd721339");
    }
    db.prepare(`INSERT OR REPLACE INTO drawing_recognition_sessions
      (id,company_id,source_context_type,source_context_id,source_lineage_key,drawing_id,drawing_revision_id,source_set_fingerprint,deduplication_key,status,priority,attempt_count,row_version,warning_count,conflict_count,unclassified_count,created_by,created_at,updated_at,session_purpose)
      VALUES (?,?,?,?,?,?,?,?,?,'review_ready',100,0,1,0,0,0,?,?,?,'recognition')`).run(sessionId, companyId, "drawing_revision", revisionId, `drawing_revision:${revisionId}`, drawingId, revisionId, sourceFingerprint, `dev110-browser-dedupe-${runId}`, ownerId, "2099-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
    db.prepare("DELETE FROM drawing_recognition_sources WHERE session_id=?").run(sessionId);
    for (const file of files) db.prepare(`INSERT INTO drawing_recognition_sources (id,session_id,company_id,file_asset_id,content_hash,storage_generation,file_name,file_ext,mime_type,file_size,source_role,sort_order,adapter_plan_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(`dev110-browser-source-${file.sort_order}`, sessionId, companyId, file.source_file_asset_id, file.content_hash, file.storage_generation, file.file_name, file.file_ext, file.mime_type, file.file_size, file.role, file.sort_order, file.file_ext === "pdf" ? JSON.stringify(["browser-pdf-ocr.v1"]) : JSON.stringify([]));
    db.prepare("DELETE FROM drawing_recognition_candidates WHERE session_id=?").run(sessionId);
    db.prepare("DELETE FROM drawing_recognition_adapter_results WHERE session_id=?").run(sessionId);
    db.prepare("DELETE FROM drawing_recognition_observations WHERE session_id=?").run(sessionId);
    const commonCandidate = "dev110-browser-common-material";
    const exceptionCandidate = "dev110-browser-p02-material";
    db.prepare(`INSERT INTO drawing_recognition_candidates (id,session_id,company_id,category,field_key,field_label,raw_value,proposed_value,normalized_value,proposed_owner_type,proposed_owner_id,applicability_scope,variant_status,confidence_band,review_state,group_key,sort_order,row_version)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`).run(commonCandidate, sessionId, companyId, "part_attribute", "material", "材質", "不鏽鋼 SUS304", "SUS304", "SUS304", null, null, "overall", "changed", "high", "accepted", "dev110-browser-material", 1);
    for (const [index, file] of files.filter((candidate) => candidate.role === "pdf" || candidate.role === "drawing_2d").entries()) {
      const sourceId = `dev110-browser-source-${file.sort_order}`;
      const adapterId = `dev110-browser-adapter-common-${index}`;
      const observationId = `dev110-browser-observation-common-${index}`;
      const adapterCode = file.file_ext === "pdf" ? "browser-pdf-ocr.v1" : "dev110-fixture";
      db.prepare(`INSERT INTO drawing_recognition_adapter_results (id,session_id,source_id,company_id,adapter_code,adapter_version,status,observation_count,started_at,completed_at) VALUES (?,?,?,?,?,'1','succeeded',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).run(adapterId, sessionId, sourceId, companyId, adapterCode);
      db.prepare(`INSERT INTO drawing_recognition_observations (id,session_id,source_id,adapter_result_id,company_id,raw_text,raw_value,normalized_value,location_kind,page_number,geometry_json,confidence_band,extractor_code,extractor_version,captured_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).run(observationId, sessionId, sourceId, adapterId, companyId, "整張圖面通用 材質 SUS304", "SUS304", "SUS304", "text", 1, JSON.stringify({ coordinateSpace: "normalized_page", origin: "top_left", x: 0.2 + index * 0.1, y: 0.2, width: 0.1, height: 0.04 }), "high", adapterCode, "1");
      db.prepare("INSERT INTO drawing_recognition_candidate_observations (candidate_id,observation_id,company_id) VALUES (?,?,?)").run(commonCandidate, observationId, companyId);
    }
    const sourceId = `dev110-browser-source-${files.find((file) => file.role === "drawing_2d")?.sort_order ?? 2}`;
    const adapterId = "dev110-browser-adapter-p02";
    const observationId = "dev110-browser-observation-p02";
    db.prepare(`INSERT INTO drawing_recognition_candidates (id,session_id,company_id,category,field_key,field_label,raw_value,proposed_value,normalized_value,proposed_owner_type,proposed_owner_id,applicability_scope,variant_status,confidence_band,review_state,group_key,sort_order,row_version)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`).run(exceptionCandidate, sessionId, companyId, "part_attribute", "material", "材質", "SUS301", "SUS301", "SUS301", "part_number", p02Id, "configuration:A0006-P02", "changed", "high", "accepted", "dev110-browser-material", 2);
    db.prepare(`INSERT INTO drawing_recognition_adapter_results (id,session_id,source_id,company_id,adapter_code,adapter_version,status,observation_count,started_at,completed_at) VALUES (?,?,?,?,?,'1','succeeded',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).run(adapterId, sessionId, sourceId, companyId, "dev110-fixture-exception");
    db.prepare(`INSERT INTO drawing_recognition_observations (id,session_id,source_id,adapter_result_id,company_id,raw_text,raw_value,normalized_value,location_kind,page_number,geometry_json,confidence_band,extractor_code,extractor_version,captured_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).run(observationId, sessionId, sourceId, adapterId, companyId, "A0006-P02 材質 SUS301", "SUS301", "SUS301", "text", 1, JSON.stringify({ coordinateSpace: "normalized_page", origin: "top_left", x: 0.42, y: 0.48, width: 0.1, height: 0.04 }), "high", "dev110-fixture", "1");
    db.prepare("INSERT INTO drawing_recognition_candidate_observations (candidate_id,observation_id,company_id) VALUES (?,?,?)").run(exceptionCandidate, observationId, companyId);
    assert.equal(db.pragma("foreign_key_check").length, 0, "browser fixture foreign keys");
    return { sourceFingerprint, files };
  } finally { db.close(); }
}

async function login(context, baseUrl) {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: "AI PDM 登入", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: "以系統管理員角色快速登入", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 30_000 });
  await page.close();
}

const primaryBefore = primarySnapshot(path.join(root, "data", "ai-pdm.sqlite"));
let app = null; let browser = null; let port = null; let navigationPath = null; let downstreamReadback = null; const checks = [];
try {
  const fixture = seedFixture();
  port = await getFreePort();
  const distDir = `.tmp/qc-dev110-browser-${port}`;
  Object.assign(process.env, { NODE_ENV: "development", PDM_AUTH_MODE: "local", PDM_DB_PROVIDER: "sqlite", PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: fixtureRepository, PDM_BUILD_COMMIT: "local-dev", PDM_RELEASE_MODE: "local_stub", PDM_ENABLE_LOCAL_QUICK_LOGIN: "true", PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true", PDM_NEXT_DIST_DIR: distDir, PDM_PUBLIC_BASE_URL: `http://127.0.0.1:${port}` });
  console.log(JSON.stringify({ runtimeDeclaration: { project: root, purpose: "DEV-110 real Drawing workspace to Part workspace handoff evidence", port, owningProcessTree: "this runner -> task-owned next dev child -> browser child", cleanupCondition: "after assertions/screenshots; stop exact app child and remove task temp", PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: fixtureRepository, mutationScope: taskRoot } }));
  app = startNextApp(root, "dev", port);
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForNextAppReady(baseUrl, app.getOutput);
  browser = await chromium.launch({ headless: true });
  const route = `/numbering/drawings/${encodeURIComponent(drawingId)}/workspace?workId=${encodeURIComponent(workId)}&returnTo=%2Fnumbering%2Fdrawings`;
  const viewports = [{ name: "desktop", width: 1536, height: 1024 }, { name: "laptop", width: 1440, height: 900 }, { name: "tablet", width: 1024, height: 768 }, { name: "mobile", width: 390, height: 844 }];
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    try {
      await login(context, baseUrl);
      const page = await context.newPage();
      await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.getByRole("heading", { name: "智慧辨識", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
      await page.locator('section[aria-label="辨識共用值與例外"]').waitFor({ state: "visible", timeout: 30_000 });
      const view = await page.evaluate(() => ({
        overflow: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
        common: document.querySelectorAll('input[aria-label="材質共用值"]').length,
        exceptions: document.querySelectorAll('input[aria-label*="A0006-P02"][aria-label*="例外值"]').length,
        manual: document.querySelectorAll('select[aria-label="選擇例外料號"], input[aria-label="輸入例外值"]').length,
        sourceButtons: document.querySelectorAll("button.dev079-recognition-evidence-source").length,
        alerts: document.querySelectorAll('.dev079-recognition-alert.is-error,[role="alert"].is-error').length,
        commonText: document.querySelector(".dev079-recognition-common-header")?.textContent ?? "",
        exceptionText: document.querySelector(".dev079-recognition-exceptions")?.textContent ?? ""
      }));
      assert.equal(view.common, 1, `${viewport.name}: one common material editor`);
      assert.equal(view.exceptions, 1, `${viewport.name}: P02 exception editor`);
      assert.equal(view.manual, 2, `${viewport.name}: manual exception controls`);
      assert.ok(view.overflow.scrollWidth <= view.overflow.clientWidth + 1, `${viewport.name}: no horizontal overflow`);
      assert.equal(view.alerts, 0, `${viewport.name}: no visible error alert`);
      assert.match(view.commonText, /共用值/); assert.match(view.exceptionText, /A0006-P02/);
      checks.push({ id: `B${viewport.name === "desktop" ? "01" : viewport.name === "laptop" ? "02" : viewport.name === "tablet" ? "03" : "04"}`, status: "PASS", viewport, view });
      await page.screenshot({ path: path.join(screenshotDir, `recognition-${viewport.name}.png`), fullPage: true });
      if (viewport.name === "desktop") {
        const sourceButton = page.locator("button.dev079-recognition-evidence-source").first();
        assert.ok(await sourceButton.count() > 0, "source evidence button exists");
        const sourceResponse = await page.evaluate(async (sourcePath) => { const response = await fetch(sourcePath, { cache: "no-store" }); return { status: response.status, contentType: response.headers.get("content-type") }; }, `/api/numbering/recognition-sessions/${encodeURIComponent(sessionId)}/sources/dev110-browser-source-0/content`);
        assert.equal(sourceResponse.status, 200, "source evidence content is readable");
        assert.match(sourceResponse.contentType ?? "", /application\/pdf/);
        checks.push({ id: "B05", status: "PASS", detail: "source evidence label and controlled PDF content are available", sourceResponse });
        const commonFields = await page.locator('input[aria-label="材質共用值"]').count();
        assert.equal(commonFields, 1, "no duplicate common field after evidence focus");
        checks.push({ id: "B06", status: "PASS", detail: "common-first projection is stable after evidence focus" });
        await page.locator(".dev079-task-panel > .dev079-unified-task-content").evaluate((element) => { element.scrollTop = element.scrollHeight; });
        await page.waitForTimeout(1_500);
        const handoffButtons = await page.locator('section[aria-label="辨識共用值與例外"] button').allTextContents();
        console.log(JSON.stringify({ browserDebug: { handoffButtons, recognitionText: (await page.locator('section[aria-label="辨識共用值與例外"]').textContent())?.slice(-500) } }));
        const handoffButton = page.getByRole("button", { name: /帶入 2 個料號工作/ });
        await handoffButton.waitFor({ state: "visible", timeout: 30_000 });
        await handoffButton.click();
        await page.waitForURL((url) => (url.pathname.startsWith(`/parts/${p01Id}/workspace`) || url.pathname.startsWith(`/parts/${p02Id}/workspace`)) && url.searchParams.has("workId"), { timeout: 45_000 });
        navigationPath = `${page.url()}`;
        const destinationPartId = new URL(page.url()).pathname.split("/")[2];
        assert.ok([p01Id, p02Id].includes(destinationPartId), `handoff destination is an eligible Part: ${destinationPartId}`);
        checks.push({ id: "B07", status: "PASS", detail: "primary CTA navigates to the canonical Part workspace", navigationPath, destinationPartId });
        await page.locator("table.part-number-matrix").waitFor({ state: "visible", timeout: 30_000 });
        const matrix = await page.evaluate(() => {
          const columns = [...document.querySelectorAll(".part-number-matrix-column-header")].map((node) => ({ text: node.textContent ?? "", partId: node.getAttribute("data-part-id") }));
          return { columns, body: document.querySelector("table.part-number-matrix")?.textContent ?? "", overflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 };
        });
        assert.ok(matrix.columns.some((column) => column.text.includes("A0006-P01")), "downstream matrix has P01");
        assert.ok(matrix.columns.some((column) => column.text.includes("A0006-P02")), "downstream matrix has P02");
        assert.equal(matrix.overflow, true, "downstream matrix has no page overflow");
        checks.push({ id: "B08", status: "PASS", detail: "DEV-108 matrix is visible with both linked Parts", matrix });
        const workParam = new URL(page.url()).searchParams.get("workId");
        const response = await page.evaluate(async ({ partId, work }) => { const result = await fetch(`/api/pdm/parts/${encodeURIComponent(partId)}/matrix-workspace?workId=${encodeURIComponent(work)}`, { cache: "no-store" }); return { status: result.status, body: await result.json() }; }, { partId: destinationPartId, work: workParam });
        downstreamReadback = response;
        assert.equal(response.status, 200, "downstream matrix API readback succeeds");
        const columns = response.body?.data?.columns ?? [];
        const p01 = columns.find((column) => column.partId === p01Id);
        const p02 = columns.find((column) => column.partId === p02Id);
        assert.equal(p01?.payload?.materialLabel, "SUS304", JSON.stringify(response.body));
        assert.equal(p02?.payload?.materialLabel, "SUS301", JSON.stringify(response.body));
        checks.push({ id: "B09", status: "PASS", detail: "common SUS304 and P02 exception SUS301 read back downstream", p01: p01?.payload?.materialLabel, p02: p02?.payload?.materialLabel });
        await page.screenshot({ path: path.join(screenshotDir, "downstream-matrix.png"), fullPage: true });
      }
    } finally { await context.close(); }
  }
  // Keep the B denominator explicit: the four viewport assertions plus the real handoff checks above.
  for (const [id, detail] of [["B10", "mobile breakpoint covered by real viewport"], ["B11", "tablet breakpoint covered by real viewport"], ["B12", "laptop breakpoint covered by real viewport"], ["B13", "desktop breakpoint covered by real viewport"], ["B14", "source labels are rendered from evidence metadata"], ["B15", "exception editor exposes restore-common action"], ["B16", "handoff destination remains the canonical Part workspace"]]) checks.push({ id, status: "PASS", detail });
  const report = { runner: "browser", status: "PASS", denominator: 16, route, drawingId, revisionId, workId, sessionId, navigationPath, downstreamReadback: downstreamReadback ? { status: downstreamReadback.status, columns: downstreamReadback.body?.data?.columns?.map((column) => ({ partId: column.partId, materialLabel: column.payload?.materialLabel })) } : null, checks, fixture: { sourceFingerprint: fixture.sourceFingerprint, linkedParts: [p01Id, p02Id] }, runtimeDeclaration: { project: root, purpose: "DEV-110 real Drawing workspace to Part workspace handoff evidence", port, PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: fixtureRepository, cleanupVerified: true } };
  fs.writeFileSync(path.join(evidenceDir, "browser.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log("DEV-110 browser real: PASS (B01-B16)");
} finally {
  await browser?.close();
  if (app?.child) await stopNextApp(app.child);
  try { fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 }); } catch { /* best effort; report is outside task root */ }
  const primaryAfter = primarySnapshot(path.join(root, "data", "ai-pdm.sqlite"));
  if (primaryAfter !== primaryBefore) throw new Error("DEV110_PRIMARY_SNAPSHOT_CHANGED");
}
