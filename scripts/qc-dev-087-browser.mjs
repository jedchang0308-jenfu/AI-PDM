#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { getFreePort, removeTaskOwnedWorkspaceTempDir, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = `DEV087-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const parentRunId = process.env.DEV087_PARENT_RUN_ID ?? null;
const formalFocus = process.env.QC_DEV087_FORMAL_FOCUS === "1";
const outputDir = path.join(root, "output", "qa", "dev-087", runId);
const screenshotDir = path.join(outputDir, "screenshots");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev087-browser-"));
const fixtureDataDir = path.join(tempRoot, "data");
const fixtureDb = path.join(fixtureDataDir, "ai-pdm.sqlite");
const sourceDb = path.resolve(process.env.PDM_QC_SOURCE_DB?.trim() || process.env.PDM_PRIMARY_DB_PATH?.trim() || path.join(root, "data", "ai-pdm.sqlite"));
const sourceRepository = path.resolve(process.env.PDM_QC_SOURCE_REPOSITORY?.trim() || process.env.PDM_PRIMARY_REPOSITORY_DIR?.trim() || path.join(root, "data", "repository"));
const fixtureRepository = path.join(fixtureDataDir, "repository");
const drawingUpload2d = path.join(tempRoot, "DEV087-FUNCTIONAL.SLDDRW");
const drawingUpload3d = path.join(tempRoot, "DEV087-FUNCTIONAL.SLDPRT");
const checks = [];
const failures = [];
const consoleErrors = [];
const fixtureMutationLedger = [];
const caseReceipts = [];
const functionalCaseReceipts = [];
const matrixMutationRequests = [];
let sourceInvariantCheckedBeforeMutation = false;
let expectedMissingRecognitionSessionResponses = 0;
let expectedMatrixConflictResponses = 0;
let expectedMatrixConflictConsoleErrors = 0;
let expectedFffNotApplicableResponses = 0;
let expectedFffNotApplicableConsoleErrors = 0;
let expectedHistoryFailureResponses = 0;
let expectedHistoryFailureConsoleErrors = 0;
let expectedLegacyApprovalPdmProbeConsoleErrors = 0;
let expectedRetiredTaskCenterResponses = 0;
let expectedRetiredTaskCenterConsoleErrors = 0;
let app = null;
let browser = null;
let port = null;
let runtimeDistDir = null;
function sha256Json(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
let baseUrl = "";
let primaryBefore = null;
let primaryAfter = null;
const nextEnvPath = path.join(root, "next-env.d.ts");
const originalNextEnvContent = fs.existsSync(nextEnvPath) ? fs.readFileSync(nextEnvPath, "utf8") : null;

function check(name, condition, detail = "") {
  const pass = Boolean(condition);
  checks.push({ name, pass, detail });
  if (!pass) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function stableHash(value) {
  const sortValue = (input) => Array.isArray(input)
    ? input.map(sortValue)
    : input && typeof input === "object"
      ? Object.fromEntries(Object.entries(input).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, sortValue(child)]))
      : input;
  return crypto.createHash("sha256").update(JSON.stringify(sortValue(value))).digest("hex");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function safeJson(value) {
  try { return JSON.stringify(value); } catch { return String(value); }
}

function readInvariantSnapshot(databasePath = sourceDb) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "dev-087-primary-snapshot.mjs"), `--db=${databasePath}`], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`PRIMARY_SNAPSHOT_FAILED:${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout.trim());
}

function invariantSnapshotIsSafe(snapshot) {
  return snapshot
    && Object.values(snapshot.counts ?? {}).every((count) => Number(count) > 0)
    && Number(snapshot.migrationResidue?.unresolved ?? -1) === 0
    && Object.values(snapshot.rootReferenceViolations ?? {}).every((count) => Number(count) === 0)
    && Number(snapshot.foreignKeyViolations ?? -1) === 0;
}

function relationDbSnapshot(rootCode) {
  const database = new Database(fixtureDb, { readonly: true, fileMustExist: true });
  try {
    const rootRow = database.prepare("SELECT id, company_id, root_code FROM part_roots WHERE root_code = ?").get(rootCode);
    if (!rootRow) return { root: null, drawings: [], parts: [], links: [], hash: stableHash(null) };
    const drawings = database.prepare("SELECT id, drawing_number AS number FROM drawing_numbers WHERE part_root_id = ? ORDER BY drawing_number, id").all(rootRow.id);
    const parts = database.prepare("SELECT id, part_number AS number FROM part_numbers WHERE part_root_id = ? ORDER BY part_number, id").all(rootRow.id);
    const links = database.prepare(`SELECT link.drawing_number_id AS drawingNumberId, link.part_number_id AS partNumberId,
        link.link_type AS storageLinkType,
        CASE link.link_type WHEN 'primary_manufacturing' THEN 'manufacturing_basis' ELSE 'reference' END AS relationType
      FROM drawing_part_links link
      JOIN drawing_numbers drawing ON drawing.id = link.drawing_number_id
      WHERE drawing.part_root_id = ?
      ORDER BY link.drawing_number_id, link.part_number_id`).all(rootRow.id);
    const snapshot = { root: rootRow, drawings, parts, links };
    return { ...snapshot, hash: stableHash(snapshot) };
  } finally {
    database.close();
  }
}

function relationSideEffectSnapshot() {
  const database = new Database(fixtureDb, { readonly: true, fileMustExist: true });
  try {
    const count = (table) => database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name=?").get(table).count
      ? Number(database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count)
      : 0;
    return {
      workReviewRequests: count("pdm_work_review_requests"),
      numberingTasks: count("numbering_tasks"),
      numberingNotifications: count("numbering_notifications")
    };
  } finally {
    database.close();
  }
}

async function detailReadback(page, endpoint) {
  const rowKey = new URL(page.url()).searchParams.get("detail");
  check(`${endpoint} detail key exists`, Boolean(rowKey), page.url());
  return page.evaluate(async ({ detailEndpoint, selectedRowKey }) => {
    const response = await fetch(`${detailEndpoint}/${encodeURIComponent(selectedRowKey)}`, { cache: "no-store" });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, { detailEndpoint: endpoint, selectedRowKey: rowKey });
}

function matrixProjection(readback) {
  return readback?.body?.data?.presentation?.relationMatrix ?? null;
}

function matrixProjectionHash(projection) {
  if (!projection) return stableHash(null);
  return stableHash({
    rootId: projection.rootId,
    rootCode: projection.rootCode,
    drawings: projection.drawings,
    parts: projection.parts,
    cells: [...(projection.cells ?? [])].sort((left, right) => `${left.drawingNumberId}:${left.partNumberId}`.localeCompare(`${right.drawingNumberId}:${right.partNumberId}`))
  });
}

async function openExactDrawer(context, { route, heading, code }) {
  const page = await openWorkbench(context, route, heading);
  const row = page.locator("[data-canonical-workbench-row='true']").filter({ hasText: code }).first();
  check(`${code} row is visible`, await row.count() === 1);
  await row.locator(".canonical-row-open").click();
  await page.getByRole("complementary", { name: new RegExp(code.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u") }).waitFor({ state: "visible", timeout: 30_000 });
  await page.locator(".canonical-drawer-message").waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
  await page.getByRole("heading", { name: "關聯矩陣", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  return page;
}

async function completeMatrixCase(page, caseId, input) {
  const caseDir = path.join(outputDir, "cases", caseId);
  fs.mkdirSync(caseDir, { recursive: true });
  const screenshotPath = path.join(caseDir, `${caseId}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true, caret: "initial" });
  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    activeRole: document.activeElement?.getAttribute("role") ?? document.activeElement?.tagName.toLowerCase() ?? null,
    activeText: document.activeElement?.textContent?.trim() ?? null
  }));
  const visibleErrors = (await page.locator("[role='alert']:visible").evaluateAll((nodes) => nodes
    .filter((node) => node.id !== "__next-route-announcer__" && !node.closest("next-route-announcer"))
    .map((node) => node.textContent ?? ""))).map((message) => message.trim()).filter(Boolean);
  if (!input.expectedVisibleError) check(`${caseId} visible error sweep clean`, visibleErrors.length === 0, JSON.stringify(visibleErrors));
  else check(`${caseId} expected visible error present`, visibleErrors.some((message) => message.includes(input.expectedVisibleError)), JSON.stringify(visibleErrors));
  const receiptPath = path.join(caseDir, "receipt.json");
  const receipt = {
    caseId,
    result: "PASS",
    assertionIds: input.assertionIds,
    renderedUiActions: input.actions,
    viewport,
    apiReadback: input.apiReadback,
    dbReadback: input.dbReadback,
    visibleErrorSweep: { expected: input.expectedVisibleError ?? null, actual: visibleErrors },
    mutationLedger: input.mutationLedger ?? [],
    screenshot: path.relative(root, screenshotPath).replaceAll("\\", "/"),
    source: "fresh task-owned DEV-087 isolated browser runtime"
  };
  writeJson(receiptPath, receipt);
  caseReceipts.push({ caseId, receipt: path.relative(root, receiptPath).replaceAll("\\", "/"), screenshot: receipt.screenshot });
}

async function completeFunctionalCase(page, caseId, input) {
  const caseDir = path.join(outputDir, "cases", caseId);
  fs.mkdirSync(caseDir, { recursive: true });
  const screenshotPath = path.join(caseDir, `${caseId}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true, caret: "initial" });
  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    activeRole: document.activeElement?.getAttribute("role") ?? document.activeElement?.tagName.toLowerCase() ?? null,
    activeText: document.activeElement?.textContent?.trim() ?? null
  }));
  const visibleErrors = (await page.locator("[role='alert']:visible").evaluateAll((nodes) => nodes
    .filter((node) => node.id !== "__next-route-announcer__" && !node.closest("next-route-announcer"))
    .map((node) => node.textContent ?? ""))).map((message) => message.trim()).filter(Boolean);
  if (!input.expectedVisibleError) check(`${caseId} visible error sweep clean`, visibleErrors.length === 0, JSON.stringify(visibleErrors));
  else check(`${caseId} expected visible error present`, visibleErrors.some((message) => message.includes(input.expectedVisibleError)), JSON.stringify(visibleErrors));
  const receiptPath = path.join(caseDir, "receipt.json");
  const receipt = {
    caseId,
    result: "PASS",
    assertionIds: input.assertionIds,
    renderedUiActions: input.actions,
    viewport,
    apiReadback: input.apiReadback,
    dbReadback: input.dbReadback,
    visibleErrorSweep: { expected: input.expectedVisibleError ?? null, actual: visibleErrors },
    mutationLedger: input.mutationLedger ?? [],
    screenshot: path.relative(root, screenshotPath).replaceAll("\\", "/"),
    source: "fresh task-owned DEV-087 isolated functional browser runtime"
  };
  writeJson(receiptPath, receipt);
  functionalCaseReceipts.push({ caseId, receipt: path.relative(root, receiptPath).replaceAll("\\", "/"), screenshot: receipt.screenshot });
}

async function writeNextEnvWithRetry(content) {
  let lastError = null;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      fs.mkdirSync(path.dirname(nextEnvPath), { recursive: true });
      fs.writeFileSync(nextEnvPath, content, "utf8");
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 12) await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError;
}

function prepareBrowserFixture(database) {
  const drawing = database.prepare(`
    SELECT id, company_id, created_by
      FROM drawings
     WHERE drawing_number = 'A0002-M01' AND formal_drawing_number_id IS NOT NULL
     ORDER BY id
     LIMIT 1`).get();
  const baseRevision = drawing
    ? database.prepare(`SELECT * FROM drawing_revisions WHERE drawing_id = ? ORDER BY CASE WHEN revision = '0.1' THEN 0 ELSE 1 END, revision LIMIT 1`).get(drawing.id)
    : null;
  check("browser fixture has A0002 canonical drawing revision source", Boolean(drawing && baseRevision), JSON.stringify({ drawing, baseRevision }));
  const existingProduction = database.prepare("SELECT id FROM drawing_revisions WHERE drawing_id = ? AND revision = '1'").get(drawing.id);
  const existingRd = database.prepare("SELECT id FROM drawing_revisions WHERE drawing_id = ? AND revision = '1.1'").get(drawing.id);
  if (!existingProduction && !existingRd) {
    const cloneRevision = (id, revision, lifecycleState) => {
      database.prepare(`
        INSERT INTO drawing_revisions (
          id, company_id, drawing_id, revision, lifecycle_state, policy_snapshot_json,
          override_reason, row_version, approval_request_id, review_snapshot_hash,
          source_candidate_revision_id, source_revision_package_id, created_by, created_at,
          updated_by, updated_at, submitted_at, controlled_at, released_at,
          superseded_at, cancelled_at
        ) SELECT ?, company_id, drawing_id, ?, ?, policy_snapshot_json,
          override_reason, 1, NULL, NULL, source_candidate_revision_id,
          source_revision_package_id, created_by, created_at, updated_by, updated_at,
          submitted_at, controlled_at, CASE WHEN ? = 'released' THEN CURRENT_TIMESTAMP ELSE NULL END,
          NULL, NULL
        FROM drawing_revisions WHERE id = ?`).run(id, revision, "preparing", lifecycleState, baseRevision.id);
      const files = database.prepare("SELECT * FROM drawing_revision_files WHERE drawing_revision_id = ? AND removed_at IS NULL ORDER BY sort_order, id").all(baseRevision.id);
      files.forEach((file, index) => database.prepare(`
        INSERT INTO drawing_revision_files (
          id, company_id, drawing_revision_id, source_file_asset_id, source_candidate_file_id,
          source_package_file_id, role, role_source, display_name, description, sort_order,
          is_primary, removed_at, removed_by, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)
      `).run(`${id}-file-${index + 1}`, file.company_id, id, file.source_file_asset_id,
        file.source_candidate_file_id, file.source_package_file_id, file.role, file.role_source,
        file.display_name, file.description, file.sort_order, file.is_primary, file.created_by,
         file.created_at, file.updated_at));
      database.prepare("UPDATE drawing_revisions SET lifecycle_state = ?, released_at = CASE WHEN ? = 'released' THEN CURRENT_TIMESTAMP ELSE NULL END, controlled_at = CASE WHEN ? = 'rd_controlled' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = ?").run(lifecycleState, lifecycleState, lifecycleState, id);
    };
    cloneRevision("qa-dev087-browser-production-revision", "1", "released");
    cloneRevision("qa-dev087-browser-rd-revision", "1.1", "rd_controlled");
    fixtureMutationLedger.push({ action: "seed-A0002-production-and-rd-revisions", scope: "disposable fixture only" });
  }
  database.prepare("UPDATE drawing_numbers SET record_status = 'Released', updated_at = CURRENT_TIMESTAMP WHERE drawing_number = 'A0002-M01'").run();
  database.prepare("UPDATE part_numbers SET record_status = 'Released', updated_at = CURRENT_TIMESTAMP WHERE part_number = 'A0002-P01'").run();
  database.prepare("UPDATE drawings SET lifecycle_state = 'released', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(drawing.id);
  fixtureMutationLedger.push({
    action: "prepare-valid-formal-obsolete-fixture",
    identities: ["A0002-M01", "A0002-P01"],
    statuses: { drawingNumber: "Released", partNumber: "Released", canonicalDrawing: "released" },
    scope: "disposable fixture only"
  });
  const targetTables = [
    "pdm_review_traces", "pdm_work_review_requests", "drawing_revision_work_files",
    "canonical_workbench_states", "drawing_revision_works", "drawing_revision_claims",
    "drawing_rd_branches", "pdm_workbench_aggregates", "part_change_works",
    "pdm_workbench_migration_quarantine"
  ];
  const targetTablePlaceholders = targetTables.map(() => "?").join(", ");
  const targetTableGuards = database.prepare(`
    SELECT name, sql
      FROM sqlite_master
     WHERE type = 'trigger'
       AND tbl_name IN (${targetTablePlaceholders})
     ORDER BY name`).all(...targetTables);
  if (targetTableGuards.some((guard) => !guard.name || !guard.sql)) {
    throw new Error(`fixture target guard SQL missing: ${safeJson(targetTableGuards)}`);
  }
  database.transaction(() => {
    for (const guard of targetTableGuards) database.exec(`DROP TRIGGER IF EXISTS "${String(guard.name).replaceAll('"', '""')}"`);
    for (const table of targetTables) database.prepare(`DELETE FROM ${table}`).run();
    for (const guard of targetTableGuards) database.exec(guard.sql);
  })();
  const restoredGuardNames = database.prepare(`
    SELECT name
      FROM sqlite_master
     WHERE type = 'trigger'
       AND tbl_name IN (${targetTablePlaceholders})
     ORDER BY name`).all(...targetTables).map((guard) => String(guard.name));
  const expectedGuardNames = targetTableGuards.map((guard) => String(guard.name));
  if (safeJson(restoredGuardNames) !== safeJson(expectedGuardNames)) {
    throw new Error(`fixture target guards not restored: ${safeJson({ expectedGuardNames, restoredGuardNames })}`);
  }
  fixtureMutationLedger.push({
    action: "clear-preexisting-canonical-target-residue",
    tables: targetTables,
    targetTableGuards: { preserved: true, names: expectedGuardNames },
    scope: "disposable fixture only before product runtime"
  });
  const blankMatrixRoot = database.prepare("SELECT id FROM part_roots WHERE root_code='A0003'").get();
  check("browser fixture has A0003 two-axis matrix source", Boolean(blankMatrixRoot)
    && database.prepare("SELECT COUNT(*) AS count FROM drawing_numbers WHERE part_root_id=?").get(blankMatrixRoot.id).count > 0
    && database.prepare("SELECT COUNT(*) AS count FROM part_numbers WHERE part_root_id=?").get(blankMatrixRoot.id).count > 0);
  database.prepare(`DELETE FROM drawing_part_links
    WHERE drawing_number_id IN (SELECT id FROM drawing_numbers WHERE part_root_id=?)
       OR part_number_id IN (SELECT id FROM part_numbers WHERE part_root_id=?)`).run(blankMatrixRoot.id, blankMatrixRoot.id);
  const singleAxisRoot = database.prepare("SELECT id FROM part_roots WHERE root_code='A0010'").get();
  check("browser fixture has A0010 single-axis source", Boolean(singleAxisRoot)
    && database.prepare("SELECT COUNT(*) AS count FROM drawing_numbers WHERE part_root_id=?").get(singleAxisRoot.id).count === 0
    && database.prepare("SELECT COUNT(*) AS count FROM part_numbers WHERE part_root_id=?").get(singleAxisRoot.id).count > 0);
  fixtureMutationLedger.push({ action: "prepare-inline-matrix-read-fixtures", roots: ["A0999", "A0003", "A0010"], scope: "disposable fixture only" });
}

function prepareFunctionalBrowserFixture(database) {
  database.prepare(`INSERT OR IGNORE INTO part_roots (
    id, company_id, root_code, core_name, item_kind, record_status, rule_version_id,
    created_by, created_at, updated_at
  ) VALUES (
    'qa-dev087-root-only-a0999', 'company-jenfu', 'A0999', 'DEV087 root-only fixture',
    'purchased', 'Draft', 'numbering-rule-v3-alpha-root', 'production-user-0003',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )`).run();
  const rootRow = database.prepare("SELECT id, company_id FROM part_roots WHERE root_code='A0002'").get();
  const sourcePart = database.prepare("SELECT created_by FROM part_numbers WHERE part_number='A0002-P01'").get();
  check("browser fixture has A0002 root and source Part for functional cases", Boolean(rootRow && sourcePart));
  const insertPart = (input) => {
    database.prepare(`INSERT OR IGNORE INTO part_numbers (
      id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name,
      item_kind, record_status, series_code, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'manufactured', 'Released', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
      .run(input.id, rootRow.company_id, rootRow.id, input.code, input.sequence, input.sequenceCode, input.name, input.seriesCode, sourcePart.created_by);
    database.prepare("INSERT OR IGNORE INTO pdm_workbench_aggregates (id, company_id, entity_type, canonical_entity_id) VALUES (?, ?, 'part', ?)")
      .run(`aggregate-${input.id}`, rootRow.company_id, input.id);
    database.prepare("INSERT OR IGNORE INTO canonical_workbench_states (id, company_id, entity_type, canonical_entity_id, data_layer) VALUES (?, ?, 'part', ?, 'part_formal')")
      .run(`state-${input.id}`, rootRow.company_id, input.id);
  };
  insertPart({ id: "qa-dev087-functional-a0002-p02", code: "A0002-P02", sequence: 2, sequenceCode: "P02", name: "DEV087 replacement Part", seriesCode: "BS" });
  database.prepare(`INSERT OR IGNORE INTO drawing_numbers (
    id, company_id, part_root_id, drawing_number, purpose_code, purpose_description,
    sequence_no, is_primary_manufacturing, record_status, created_by, created_at, updated_at
  ) VALUES (
    '87000000-0000-4000-8000-000000000001', ?, ?, 'A0002-R99', 'R', 'DEV087 首版參考圖',
    99, 0, 'Draft', 'user-admin-local-quick', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )`).run(rootRow.company_id, rootRow.id);
  database.prepare("INSERT OR IGNORE INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by) VALUES ('87000000-0000-4000-8000-000000000002', '87000000-0000-4000-8000-000000000001', (SELECT id FROM part_numbers WHERE part_number='A0002-P01'), 'reference', 'user-admin-local-quick')").run();
  database.prepare(`INSERT OR IGNORE INTO drawings (
    id, company_id, drawing_number, lifecycle_state, formal_drawing_number_id, part_root_id,
    purpose_code, purpose_description, sequence_no, owner_id, created_by, created_at, updated_at
  ) VALUES (
    '87000000-0000-4000-8000-000000000003', ?, 'A0002-R99', 'building', '87000000-0000-4000-8000-000000000001', ?,
    'R', 'DEV087 首版參考圖', 99, 'user-admin-local-quick', 'user-admin-local-quick', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )`).run(rootRow.company_id, rootRow.id);
  database.prepare("INSERT OR IGNORE INTO pdm_workbench_aggregates (id, company_id, entity_type, canonical_entity_id, open_branch_count) VALUES ('87000000-0000-4000-8000-000000000004', ?, 'drawing', '87000000-0000-4000-8000-000000000003', 1)").run(rootRow.company_id);
  database.prepare("INSERT OR IGNORE INTO drawing_rd_branches (id, company_id, drawing_id, base_production_revision_id, status) VALUES ('87000000-0000-4000-8000-000000000005', ?, '87000000-0000-4000-8000-000000000003', NULL, 'open')").run(rootRow.company_id);
  database.prepare("INSERT OR IGNORE INTO drawing_revision_claims (id, company_id, drawing_id, branch_id, target_major, target_minor, target_label, predecessor_revision_id, claim_state) VALUES ('87000000-0000-4000-8000-000000000006', ?, '87000000-0000-4000-8000-000000000003', '87000000-0000-4000-8000-000000000005', 0, 1, '0.1', NULL, 'work')").run(rootRow.company_id);
  database.prepare("INSERT OR IGNORE INTO drawing_revisions (id, company_id, drawing_id, revision, lifecycle_state, created_by) VALUES ('87000000-0000-4000-8000-000000000007', ?, '87000000-0000-4000-8000-000000000003', '0.1', 'preparing', 'user-admin-local-quick')").run(rootRow.company_id);
  database.prepare("INSERT OR IGNORE INTO drawing_revision_works (id, company_id, drawing_id, branch_id, target_claim_id, owner_user_id, proposed_payload, base_hash) VALUES ('87000000-0000-4000-8000-000000000008', ?, '87000000-0000-4000-8000-000000000003', '87000000-0000-4000-8000-000000000005', '87000000-0000-4000-8000-000000000006', 'user-admin-local-quick', ?, ?)").run(rootRow.company_id, JSON.stringify({ recognitionNotes: "" }), sha256Json({ predecessorRevisionId: null }));
  database.prepare("INSERT OR IGNORE INTO canonical_workbench_states (id, company_id, entity_type, canonical_entity_id, data_layer, branch_id, revision_id, work_id, handling) VALUES ('87000000-0000-4000-8000-000000000009', ?, 'drawing', '87000000-0000-4000-8000-000000000003', 'drawing_rd', '87000000-0000-4000-8000-000000000005', '87000000-0000-4000-8000-000000000007', '87000000-0000-4000-8000-000000000008', 'owner')").run(rootRow.company_id);
  database.prepare(`INSERT OR IGNORE INTO part_variant_attributes (
    id, part_number_id, material_code, material_label, color_code, color_label,
    surface_treatment, variant_note, updated_by, created_at, updated_at
  ) VALUES (
    'qa-dev087-functional-variant-p02', 'qa-dev087-functional-a0002-p02',
    'SUS304', 'SUS 304', 'BK', 'Black', 'BA', 'DEV087 filter fixture', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )`).run(sourcePart.created_by);
  for (let sequence = 3; sequence <= 47; sequence += 1) {
    const suffix = `P${String(sequence).padStart(2, "0")}`;
    insertPart({ id: `qa-dev087-pagination-a0002-${suffix.toLowerCase()}`, code: `A0002-${suffix}`, sequence, sequenceCode: suffix, name: `DEV087 pagination ${suffix}`, seriesCode: "QA-PAGE" });
  }
  database.prepare("DELETE FROM numbering_task_items WHERE id LIKE 'qa-dev087-browser-task-%'").run();
  database.prepare("DELETE FROM numbering_notifications WHERE id LIKE 'qa-dev087-browser-notification-%'").run();
  const taskInsert = database.prepare(`INSERT INTO numbering_task_items (
    id, company_id, task_type, entity_type, entity_id, title, message, risk_level,
    task_status, assigned_to, action_url, detail_json, created_by, created_at, updated_at
  ) VALUES (?, 'company-jenfu', 'manual', 'part_number', ?, ?, ?, ?, 'open',
    'user-admin-local-quick', ?, ?, 'user-admin-local-quick', ?, ?)`);
  taskInsert.run("qa-dev087-browser-task-critical-early", "qa-dev087-functional-a0002-p02", "高風險早到期", "先處理的高風險待辦", "critical", "/parts?query=A0002-P02", JSON.stringify({ dueAt: "2026-08-28T00:00:00.000Z" }), "2026-08-26T01:00:00.000Z", "2026-08-26T01:00:00.000Z");
  taskInsert.run("qa-dev087-browser-task-critical-late", "qa-dev087-functional-a0002-p02", "高風險晚到期", "第二筆高風險待辦", "critical", "/parts?query=A0002-P02", JSON.stringify({ dueAt: "2026-08-29T00:00:00.000Z" }), "2026-08-26T03:00:00.000Z", "2026-08-26T03:00:00.000Z");
  taskInsert.run("qa-dev087-browser-task-info", "qa-dev087-functional-a0002-p02", "一般風險待辦", "最後處理的一般待辦", "info", "/numbering/drawings", JSON.stringify({ dueAt: "2026-08-27T00:00:00.000Z" }), "2026-08-26T02:00:00.000Z", "2026-08-26T02:00:00.000Z");
  const notificationInsert = database.prepare(`INSERT INTO numbering_notifications (
    id, company_id, notification_type, entity_type, entity_id, title, message, severity,
    recipient_id, dismissible, action_url, detail_json, created_by, created_at, updated_at
  ) VALUES (?, 'company-jenfu', 'qa_browser', 'part_number', ?, ?, ?, ?,
    'user-admin-local-quick', 1, ?, '{}', 'user-admin-local-quick', ?, ?)`);
  notificationInsert.run("qa-dev087-browser-notification-critical", "qa-dev087-functional-a0002-p02", "未讀高風險通知", "請確認高風險待辦", "critical", "/numbering/drawings", "2026-08-26T04:00:00.000Z", "2026-08-26T04:00:00.000Z");
  notificationInsert.run("qa-dev087-browser-notification-info", "qa-dev087-functional-a0002-p02", "一般通知", "可標示已讀與處理", "info", "/parts?query=A0002-P02", "2026-08-26T05:00:00.000Z", "2026-08-26T05:00:00.000Z");
  fixtureMutationLedger.push({ action: "seed-functional-browser-part-task-notification-pagination-fixtures", ids: ["A0002-P02", "A0002-P03..P47", "A0002-R99 initial 0.1 work", "qa-dev087-browser-task-*", "qa-dev087-browser-notification-*"], scope: "disposable fixture only after canonical migration" });
}
function monitor(page, label) {
  page.on("request", (request) => {
    if (request.method() === "GET" || request.method() === "HEAD" || request.method() === "OPTIONS") return;
    if (request.url().includes("/api/pdm/relations/") && request.url().endsWith("/matrix")) {
      matrixMutationRequests.push({ label, method: request.method(), url: request.url(), postData: request.postData(), at: new Date().toISOString() });
    }
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // The cancelled-editor journey intentionally deletes its disposable
    // recognition session; the follow-up GET is therefore an expected 404.
    if (expectedMissingRecognitionSessionResponses > 0 && text === "Failed to load resource: the server responded with a status of 404 (Not Found)") {
      expectedMissingRecognitionSessionResponses -= 1;
      return;
    }
    if (expectedMatrixConflictConsoleErrors > 0 && text === "Failed to load resource: the server responded with a status of 409 (Conflict)") {
      expectedMatrixConflictConsoleErrors -= 1;
      return;
    }
    if (expectedHistoryFailureConsoleErrors > 0 && text.includes("404")) {
      expectedHistoryFailureConsoleErrors -= 1;
      return;
    }
    if (expectedLegacyApprovalPdmProbeConsoleErrors > 0 && text === "Failed to load resource: the server responded with a status of 404 (Not Found)") {
      expectedLegacyApprovalPdmProbeConsoleErrors -= 1;
      return;
    }
    if (expectedRetiredTaskCenterConsoleErrors > 0 && label === "retired-task-center" && text === "Failed to load resource: the server responded with a status of 404 (Not Found)") {
      expectedRetiredTaskCenterConsoleErrors -= 1;
      return;
    }
    if (expectedFffNotApplicableConsoleErrors > 0 && text === "Failed to load resource: the server responded with a status of 422 (Unprocessable Entity)") {
      expectedFffNotApplicableConsoleErrors -= 1;
      return;
    }
    consoleErrors.push({ label, message: text });
  });
  page.on("pageerror", (error) => failures.push({ label, kind: "pageerror", message: error.message }));
  page.on("requestfailed", (request) => {
    if (request.failure()?.errorText !== "net::ERR_ABORTED") failures.push({ label, kind: "requestfailed", url: request.url(), message: request.failure()?.errorText });
  });
  page.on("response", (response) => {
    if (response.status() === 404 && response.url().includes("/api/numbering/recognition-sessions/")) {
      expectedMissingRecognitionSessionResponses += 1;
      return;
    }
    if (response.status() === 409 && response.url().includes("/api/pdm/relations/") && expectedMatrixConflictResponses > 0) {
      expectedMatrixConflictResponses -= 1;
      return;
    }
    if (response.status() === 404 && response.url().includes("/history/qa-dev087-missing-history") && expectedHistoryFailureResponses > 0) {
      expectedHistoryFailureResponses -= 1;
      return;
    }
    if (response.status() === 404 && response.url().includes("/api/pdm/review-requests/legacy%3Alegacy_numbering")) {
      expectedLegacyApprovalPdmProbeConsoleErrors += 1;
      return;
    }
    if (response.status() === 404 && label === "retired-task-center" && new URL(response.url()).pathname === "/numbering/tasks" && expectedRetiredTaskCenterResponses > 0) {
      expectedRetiredTaskCenterResponses -= 1;
      expectedRetiredTaskCenterConsoleErrors += 1;
      return;
    }
    if (response.status() === 422 && response.url().includes("/api/pdm/drawing-revision-works/87000000-0000-4000-8000-000000000008") && expectedFffNotApplicableResponses > 0) {
      expectedFffNotApplicableResponses -= 1;
      return;
    }
    if (response.status() >= 400) failures.push({ label, kind: "http", status: response.status(), url: response.url() });
  });
}
async function login(context, roleLabel = "系統管理員") {
  const page = await context.newPage(); monitor(page, "login");
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: "AI PDM 登入", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: `以${roleLabel}角色快速登入`, exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 30_000 });
  check(`${roleLabel} login via rendered UI`, !page.url().endsWith("/login"), page.url());
  await page.close();
}
async function openWorkbench(context, route, title, allowError = false) {
  const page = await context.newPage(); monitor(page, title);
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: title, exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.locator(".canonical-list-meta").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(() => {
    const list = document.querySelector(".canonical-list");
    return list?.getAttribute("aria-busy") === "false"
      && Boolean(document.querySelector(".canonical-row-open, .canonical-error[role='alert'], .canonical-empty"));
  }, null, { timeout: 30_000 });
  const visibleErrors = await page.locator(".canonical-error[role='alert']:visible").allTextContents();
  if (!allowError) check(`${title} loads without visible error`, visibleErrors.length === 0, JSON.stringify(visibleErrors));
  return page;
}
async function waitForWorkbenchList(page, heading) {
  await page.getByRole("heading", { name: heading, exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.locator(".canonical-list-meta").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false", null, { timeout: 30_000 });
}
async function verifyWorkbench(page, name) {
  const headers = await page.locator(".canonical-table-wrap thead th").allTextContents();
  const expectedHeaders = ["編號", "品名", "版本", "資料狀態", "處理"];
  check(`${name} five-column list`, JSON.stringify(headers.map((item) => item.trim())) === JSON.stringify(expectedHeaders), JSON.stringify(headers));
  const labelLocator = page.locator(".canonical-toolbar > label > span, .canonical-toolbar > .pdm-workbench-multi-select-filter > .pdm-workbench-multi-select-label");
  const expectedLabels = name.startsWith("drawing/") ? ["搜尋", "版本", "處理", "用途", "系列"] : ["搜尋", "資料", "處理", "料件類型", "系列", "材質", "顏色"];
  await labelLocator.last().waitFor({ state: "visible", timeout: 30_000 });
  const labels = await labelLocator.allTextContents();
  check(`${name} only domain filters`, JSON.stringify(labels.map((item) => item.trim())) === JSON.stringify(expectedLabels), JSON.stringify(labels));
  const oldTerms = await page.locator(".canonical-toolbar").innerText();
  check(`${name} old filters absent`, !/工作狀態|資料狀態|版本列|系列代號/u.test(oldTerms), oldTerms);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  check(`${name} no page horizontal overflow`, overflow);
}

async function verifyWorkbenchInteractions(page, input) {
  const rows = page.locator("[data-canonical-workbench-row='true']");
  check(`${input.name} has consecutive rows for keyboard QC`, await rows.count() >= 2, String(await rows.count()));
  const list = page.getByRole("region", { name: "工作台資料清單" });
  const search = page.locator(".canonical-toolbar input").first();
  const selectedBeforeInput = await page.locator("[data-canonical-workbench-row='true'][aria-selected='true']").count();
  await search.focus();
  await search.press("ArrowDown");
  check(`${input.name} editable input keeps ArrowDown`, await page.locator("[data-canonical-workbench-row='true'][aria-selected='true']").count() === selectedBeforeInput);

  await list.focus();
  await list.press("ArrowDown");
  check(`${input.name} ArrowDown selects first row`, await rows.nth(0).getAttribute("aria-selected") === "true");
  await list.press("ArrowDown");
  check(`${input.name} second ArrowDown selects next row`, await rows.nth(1).getAttribute("aria-selected") === "true");
  await list.press("ArrowUp");
  check(`${input.name} ArrowUp selects previous row`, await rows.nth(0).getAttribute("aria-selected") === "true");
  await list.press("Enter");
  await page.locator(".pdm-entity-detail-drawer").waitFor({ state: "visible", timeout: 30_000 });
  const initialDetailKey = new URL(page.url()).searchParams.get("detail");
  check(`${input.name} Enter opens selected detail`, Boolean(initialDetailKey), String(initialDetailKey));

  const drawer = page.locator(".pdm-entity-detail-drawer");
  const expectedWidth = await page.evaluate((storageKey) => Number.parseInt(window.localStorage.getItem(storageKey) ?? "0", 10), input.storageKey);
  const initialWidth = (await drawer.boundingBox())?.width ?? 0;
  check(`${input.name} reads its own remembered width`, Math.abs(initialWidth - expectedWidth) <= 2, `${initialWidth} != ${expectedWidth}`);
  const storageBefore = await page.evaluate(() => Object.fromEntries([
    "pdm-drawing-detail-drawer-width",
    "pdm-part-detail-drawer-width",
    "pdm-search-detail-drawer-width"
  ].map((key) => [key, window.localStorage.getItem(key)])));
  const handle = page.getByRole("button", { name: "調整明細欄寬度" });
  const handleBox = await handle.boundingBox();
  check(`${input.name} resize handle is measurable`, Boolean(handleBox), JSON.stringify(handleBox));
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + Math.min(30, handleBox.height / 2));
  await page.mouse.down();
  await page.mouse.move(handleBox.x - 90, handleBox.y + Math.min(30, handleBox.height / 2), { steps: 5 });
  await page.mouse.up();
  const resizedWidth = (await drawer.boundingBox())?.width ?? 0;
  const storedWidth = await page.evaluate((storageKey) => Number.parseInt(window.localStorage.getItem(storageKey) ?? "0", 10), input.storageKey);
  check(`${input.name} actual drag changes drawer width`, resizedWidth > initialWidth + 50, `${initialWidth} -> ${resizedWidth}`);
  check(`${input.name} drag persists measured width`, Math.abs(resizedWidth - storedWidth) <= 2, `${resizedWidth} != ${storedWidth}`);
  const storageAfter = await page.evaluate(() => Object.fromEntries([
    "pdm-drawing-detail-drawer-width",
    "pdm-part-detail-drawer-width",
    "pdm-search-detail-drawer-width"
  ].map((key) => [key, window.localStorage.getItem(key)])));
  for (const [key, value] of Object.entries(storageBefore)) {
    if (key !== input.storageKey) check(`${input.name} does not overwrite ${key}`, storageAfter[key] === value, `${storageAfter[key]} != ${value}`);
  }

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".pdm-entity-detail-drawer").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator(".canonical-drawer-message").waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
  const reloadedWidth = (await page.locator(".pdm-entity-detail-drawer").boundingBox())?.width ?? 0;
  check(`${input.name} remembered width survives reload`, Math.abs(reloadedWidth - storedWidth) <= 2, `${reloadedWidth} != ${storedWidth}`);
  const scrollPrepared = await page.locator(".canonical-drawer-body").evaluate((element) => {
    element.style.maxHeight = "120px";
    element.style.overflowY = "auto";
    element.scrollTop = element.scrollHeight;
    return element.scrollTop > 0;
  });
  check(`${input.name} drawer scroll fixture reaches a non-zero position`, scrollPrepared);

  const close = page.getByRole("button", { name: "關閉明細" });
  await close.focus();
  const firstKey = new URL(page.url()).searchParams.get("detail");
  await close.press("ArrowDown");
  await page.waitForFunction((previous) => new URL(window.location.href).searchParams.get("detail") !== previous, firstKey, { timeout: 30_000 });
  const secondKey = new URL(page.url()).searchParams.get("detail");
  check(`${input.name} drawer ArrowDown changes rowKey`, Boolean(secondKey && secondKey !== firstKey), `${firstKey} -> ${secondKey}`);
  check(`${input.name} drawer ArrowDown selects second row`, await page.locator("[data-canonical-workbench-row='true']").nth(1).getAttribute("aria-selected") === "true");
  await page.locator(".canonical-drawer-message").waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
  await page.waitForFunction(() => document.querySelector(".canonical-drawer-body")?.scrollTop === 0, null, { timeout: 30_000 });
  check(`${input.name} row switching resets drawer scroll`, await page.locator(".canonical-drawer-body").evaluate((element) => element.scrollTop === 0));
  const secondLayer = (await page.locator("[data-canonical-workbench-row='true']").nth(1).locator(".canonical-layer").innerText()).trim();
  const secondCode = (await page.locator("[data-canonical-workbench-row='true']").nth(1).locator(".canonical-row-open").innerText()).trim();
  const drawerLayer = (await page.locator(".pdm-entity-drawer-status .canonical-layer").innerText()).trim();
  const drawerCode = (await page.locator(".pdm-entity-drawer-copy h2").innerText()).trim();
  const detailResult = await page.evaluate(async ({ endpoint, rowKey }) => {
    const response = await fetch(`${endpoint}/${encodeURIComponent(rowKey ?? "")}`, { cache: "no-store" });
    return { status: response.status, body: await response.json() };
  }, { endpoint: input.detailEndpoint, rowKey: secondKey });
  check(`${input.name} switched detail API 200`, detailResult.status === 200, String(detailResult.status));
  check(`${input.name} URL/API/selected row stay aligned`, detailResult.body?.data?.row?.rowKey === secondKey && detailResult.body?.data?.row?.layerLabel === secondLayer && detailResult.body?.data?.row?.code === secondCode && drawerLayer === secondLayer && drawerCode === secondCode, JSON.stringify({ secondKey, apiKey: detailResult.body?.data?.row?.rowKey, secondCode, apiCode: detailResult.body?.data?.row?.code, drawerCode, secondLayer, apiLayer: detailResult.body?.data?.row?.layerLabel, drawerLayer }));

  await close.press("ArrowUp");
  await page.waitForFunction((expected) => new URL(window.location.href).searchParams.get("detail") === expected, firstKey, { timeout: 30_000 });
  await close.press("ArrowDown");
  await close.press("ArrowUp");
  await close.press("ArrowDown");
  await page.waitForFunction((expected) => new URL(window.location.href).searchParams.get("detail") === expected, secondKey, { timeout: 30_000 });
  await page.locator(".canonical-drawer-message").waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
  check(`${input.name} rapid switching leaves final selected row aligned`, await page.locator("[data-canonical-workbench-row='true']").nth(1).getAttribute("aria-selected") === "true" && (await page.locator(".pdm-entity-drawer-status .canonical-layer").innerText()).trim() === secondLayer);
  await page.screenshot({ path: path.join(screenshotDir, `${input.screenshot}.png`), fullPage: true, caret: "initial" });

  await close.press("Escape");
  await page.locator(".pdm-entity-detail-drawer").waitFor({ state: "hidden", timeout: 30_000 });
  check(`${input.name} Escape returns focus to list`, await list.evaluate((element) => element.contains(document.activeElement)));
}

function functionalTaskDbReadback() {
  const database = new Database(fixtureDb, { readonly: true, fileMustExist: true });
  try {
    return {
      tasks: database.prepare("SELECT id, risk_level, task_status, action_url, detail_json FROM numbering_task_items WHERE id LIKE 'qa-dev087-browser-task-%' ORDER BY id").all(),
      notifications: database.prepare("SELECT id, severity, read_at, handled_at, action_url FROM numbering_notifications WHERE id LIKE 'qa-dev087-browser-notification-%' ORDER BY id").all()
    };
  } finally { database.close(); }
}

async function verifyRetiredTaskCenter(context) {
  const page = await context.newPage();
  monitor(page, "retired-task-center");
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  const sidebarTaskLink = await page.locator('a[href="/numbering/tasks"]').count();
  const dashboardTaskLink = await page.locator('main a[href="/numbering/tasks"]').count();
  expectedRetiredTaskCenterResponses += 1;
  const retiredResponse = await page.goto(`${baseUrl}/numbering/tasks`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  const taskHeading = await page.getByRole("heading", { name: "待辦與通知", exact: true }).count();
  check("QA-087-193 task center page and formal entry are retired", sidebarTaskLink === 0 && dashboardTaskLink === 0 && retiredResponse?.status() === 404 && taskHeading === 0, JSON.stringify({ sidebarTaskLink, dashboardTaskLink, status: retiredResponse?.status(), taskHeading }));
  await completeFunctionalCase(page, "QA-087-193", {
    assertionIds: ["QA-087-193:PAGE_ENTRY_AND_COMPONENT_RETIRED"],
    actions: ["scan sidebar and dashboard for retired href", "open retired URL directly", "verify unmatched 404 without old heading"],
    apiReadback: { directUrlStatus: retiredResponse?.status() },
    dbReadback: functionalTaskDbReadback()
  });
  await page.close();
}
function formalObsoleteDbReadback(entityType, code, requestId) {
  const database = new Database(fixtureDb, { readonly: true, fileMustExist: true });
  try {
    const table = entityType === "drawing" ? "drawing_numbers" : "part_numbers";
    const codeColumn = entityType === "drawing" ? "drawing_number" : "part_number";
    const row = database.prepare(`SELECT id, company_id, ${codeColumn} AS code, record_status, updated_at FROM ${table} WHERE ${codeColumn}=?`).get(code);
    const requests = database.prepare("SELECT id, action_code, request_status, payload_json, resolved_by, resolved_at FROM approval_requests WHERE id=? ORDER BY created_at, id").all(requestId ?? "");
    const decisions = requests.flatMap((request) => database.prepare("SELECT approval_request_id AS request_id, decision, approver_id, comment FROM approval_decisions WHERE approval_request_id=? ORDER BY decided_at, id").all(request.id));
    return { row, requests, decisions };
  } finally { database.close(); }
}

async function verifyFormalObsoleteDecision(ownerContext, input) {
  const ownerPage = await openWorkbench(ownerContext, input.route, input.heading);
  const rowCandidates = ownerPage.locator("[data-canonical-workbench-row='true']").filter({ hasText: input.code });
  const formalLayer = ownerPage.locator(".canonical-layer").filter({ hasText: input.entityType === "drawing" ? /^量產版(?:\s|$)/u : /^正式資料$/u });
  const formalRow = rowCandidates.filter({ has: formalLayer }).first();
  check(`${input.caseId} exact formal row is visible`, await formalRow.count() === 1, input.code);
  await formalRow.locator(".canonical-row-open").click();
  const obsoleteAction = ownerPage.getByRole("button", { name: "申請作廢", exact: true });
  await obsoleteAction.waitFor({ state: "visible", timeout: 30_000 });
  await obsoleteAction.click();
  const modal = ownerPage.getByRole("dialog", { name: "申請正式資料作廢", exact: true });
  await modal.waitFor({ state: "visible", timeout: 30_000 });
  await modal.getByLabel("作廢原因", { exact: true }).fill(`DEV087 ${input.caseId} rendered formal obsolete ${input.decision}`);
  const requestResponsePromise = ownerPage.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/lifecycle/obsolete-requests"), { timeout: 30_000 });
  await modal.getByRole("button", { name: "送出作廢申請", exact: true }).click();
  const requestResponse = await requestResponsePromise;
  const requestBody = await requestResponse.json().catch(() => null);
  check(`${input.caseId} formal obsolete request accepted from rendered modal`, requestResponse.status() === 201, JSON.stringify(requestBody));
  await ownerPage.close();

  const reviewerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(reviewerContext, "研發主管");
  const reviewer = await reviewerContext.newPage();
  monitor(reviewer, `${input.caseId}-formal-obsolete-review`);
  const initialInboxResponsePromise = reviewer.waitForResponse((response) => response.url().includes("/api/approvals/inbox?") && response.url().includes("status=active") && response.status() === 200, { timeout: 30_000 });
  await reviewer.goto(`${baseUrl}/approvals?status=active`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await reviewer.getByRole("heading", { name: /審核工作台/u }).waitFor({ state: "visible", timeout: 30_000 });
  await initialInboxResponsePromise;
  const search = reviewer.getByLabel("搜尋圖號、料號、品名或送審者", { exact: true });
  const inboxResponsePromise = reviewer.waitForResponse((response) => response.url().includes("/api/approvals/inbox?") && response.url().includes(`query=${encodeURIComponent(input.code)}`) && response.status() === 200, { timeout: 30_000 });
  await search.fill(input.code);
  const inboxResponse = await inboxResponsePromise;
  const inboxBody = await inboxResponse.json().catch(() => null);
  const expectedInboxId = `legacy:legacy_numbering:${requestBody?.approvalRequest?.id ?? ""}`;
  const expectedInboxIndex = Array.isArray(inboxBody?.items) ? inboxBody.items.findIndex((item) => item?.id === expectedInboxId) : -1;
  check(`${input.caseId} reviewer inbox contains the exact created request`, expectedInboxIndex >= 0, JSON.stringify({ expectedInboxId, inboxIds: inboxBody?.items?.map?.((item) => item?.id) ?? [] }));
  const approvalRow = reviewer.locator("[data-approval-workbench-row='true']").nth(expectedInboxIndex);
  await approvalRow.waitFor({ state: "visible", timeout: 30_000 });
  await approvalRow.click();
  const decisionWorkspace = reviewer.locator("section[aria-label='審核證據與決策']");
  await decisionWorkspace.waitFor({ state: "visible", timeout: 30_000 });
  const decisionLabel = input.decision === "approved" ? "核准" : "退回修正";
  const decisionResponsePromise = reviewer.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/api/approvals/requests/") && response.url().endsWith("/decisions"), { timeout: 30_000 });
  await decisionWorkspace.getByRole("button", { name: decisionLabel, exact: true }).click();
  const decisionResponse = await decisionResponsePromise;
  const decisionBody = await decisionResponse.json().catch(() => null);
  const dbReadback = formalObsoleteDbReadback(input.entityType, input.code, requestBody?.approvalRequest?.id);
  const expectedStatus = input.decision === "approved" ? "Obsolete" : "Released";
  check(`${input.caseId} formal obsolete decision has exact terminal readback`, decisionResponse.status() === 200 && dbReadback.row?.record_status === expectedStatus && dbReadback.decisions.some((decision) => decision.decision === input.decision), JSON.stringify({ decisionBody, dbReadback, expectedStatus }));
  await completeFunctionalCase(reviewer, input.caseId, {
    assertionIds: [`${input.caseId}:FORMAL_${input.entityType.toUpperCase()}_OBSOLETE_${input.decision.toUpperCase()}_UI_DB`],
    actions: [`open exact formal ${input.entityType} row`, "click rendered 作廢 action", "fill reason and submit modal", `open exact approval and click ${decisionLabel}`],
    apiReadback: { requestStatus: requestResponse.status(), requestBody, decisionStatus: decisionResponse.status(), decisionBody },
    dbReadback,
    mutationLedger: [{ method: "POST", route: "/api/lifecycle/obsolete-requests", status: requestResponse.status() }, { method: "POST", route: "/api/approvals/requests/:id/decisions", status: decisionResponse.status() }]
  });
  await reviewer.close();
  await reviewerContext.close();
}

async function verifyInlineMatrixCases(context) {
  const drawingEndpoint = "/api/numbering/drawings/workbench";
  const partEndpoint = "/api/parts/workbench";
  const drawingRoute = "/numbering/drawings?query=A0002-M01";
  const partRoute = "/parts?query=A0002-P01";

  const drawing = await openExactDrawer(context, { route: drawingRoute, heading: "圖號工作台", code: "A0002-M01" });
  const drawingReadback = await detailReadback(drawing, drawingEndpoint);
  const drawingMatrix = matrixProjection(drawingReadback);
  const drawingDb = relationDbSnapshot("A0002");
  check("I01 drawing matrix projection exists", Boolean(drawingMatrix?.rootId));
  check("I01 drawing has one matrix and no direct relation block", await drawing.getByRole("heading", { name: "關聯矩陣", exact: true }).count() === 1 && await drawing.getByText("直接關聯", { exact: true }).count() === 0);
  const part = await openExactDrawer(context, { route: partRoute, heading: "料號工作台", code: "A0002-P01" });
  const partReadback = await detailReadback(part, partEndpoint);
  const partMatrix = matrixProjection(partReadback);
  check("I01 Drawing and Part use identical matrix projection", matrixProjectionHash(drawingMatrix) === matrixProjectionHash(partMatrix), JSON.stringify({ drawing: matrixProjectionHash(drawingMatrix), part: matrixProjectionHash(partMatrix) }));
  check("I01 DB formal links match projected cells", drawingDb.links.length === drawingMatrix.cells.length && drawingDb.links.every((link) => drawingMatrix.cells.some((cell) => cell.drawingNumberId === link.drawingNumberId && cell.partNumberId === link.partNumberId && cell.relationType === link.relationType)));
  await completeMatrixCase(drawing, "I01", {
    assertionIds: ["I01:DRAWING_PART_SAME_FORMAL_MATRIX", "I01:NO_DIRECT_RELATION_BLOCK"],
    actions: ["open Drawing drawer from rendered list", "open Part drawer from rendered list"],
    apiReadback: { drawingStatus: drawingReadback.status, partStatus: partReadback.status, matrixHash: matrixProjectionHash(drawingMatrix) },
    dbReadback: drawingDb
  });
  await part.close();
  await drawing.close();

  const layerPage = await openWorkbench(context, drawingRoute, "圖號工作台");
  const productionRow = layerPage.locator("[data-canonical-workbench-row='true']").filter({ hasText: "量產版 1" }).first();
  const rdRow = layerPage.locator("[data-canonical-workbench-row='true']").filter({ hasText: "研發版 1.1" }).first();
  check("I02 production and RD rows exist", await productionRow.count() === 1 && await rdRow.count() === 1);
  await productionRow.locator(".canonical-row-open").click();
  await layerPage.getByRole("heading", { name: "關聯矩陣", exact: true }).waitFor({ state: "visible" });
  const productionDetail = await detailReadback(layerPage, drawingEndpoint);
  await rdRow.locator(".canonical-row-open").click();
  await layerPage.waitForFunction(() => document.querySelector(".pdm-entity-drawer-status")?.textContent?.includes("研發版 1.1"), null, { timeout: 30_000 });
  const rdDetail = await detailReadback(layerPage, drawingEndpoint);
  check("I02 production and RD rows keep same root matrix", matrixProjectionHash(matrixProjection(productionDetail)) === matrixProjectionHash(matrixProjection(rdDetail)));
  check("I02 matrix does not expose source layer", !(await layerPage.locator(".canonical-drawer-matrix").innerText()).includes("來源資料層"));
  await completeMatrixCase(layerPage, "I02", {
    assertionIds: ["I02:LAYER_SWITCH_PRESERVES_MATRIX_AUTHORITY"],
    actions: ["open production row", "switch to RD row"],
    apiReadback: { productionStatus: productionDetail.status, rdStatus: rdDetail.status, productionHash: matrixProjectionHash(matrixProjection(productionDetail)), rdHash: matrixProjectionHash(matrixProjection(rdDetail)) },
    dbReadback: relationDbSnapshot("A0002")
  });
  await layerPage.close();

  const relationSideEffectsBeforePartWork = relationSideEffectSnapshot();
  const partWorkPage = await openExactDrawer(context, { route: partRoute, heading: "料號工作台", code: "A0002-P01" });
  await partWorkPage.getByRole("button", { name: "建立修改", exact: true }).click();
  await partWorkPage.waitForURL((url) => url.pathname.endsWith("/workspace") && url.searchParams.has("workId"), { timeout: 30_000 });
  await partWorkPage.getByRole("heading", { name: "料號資料", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  const functionalPartWorkId = new URL(partWorkPage.url()).searchParams.get("workId");
  check("I03 Part create-change enters canonical owner workspace", await partWorkPage.getByRole("button", { name: "取消本次工作", exact: true }).isEnabled());
  await partWorkPage.getByLabel("材質", { exact: true }).fill("SUS 304");
  await partWorkPage.getByLabel("顏色", { exact: true }).fill("Black");
  await partWorkPage.getByLabel("表面處理", { exact: true }).fill("BA");
  await partWorkPage.locator(".pdm-edit-page-field-wide textarea").fill("DEV087 browser variant snapshot");
  const partSaveResponsePromise = partWorkPage.waitForResponse((response) => response.request().method() === "PATCH" && response.url().endsWith(`/api/pdm/part-change-works/${functionalPartWorkId}`), { timeout: 30_000 });
  await partWorkPage.getByRole("button", { name: "儲存", exact: true }).click();
  const partSaveResponse = await partSaveResponsePromise;
  await partWorkPage.getByText("工作資料已儲存。", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await partWorkPage.reload({ waitUntil: "domcontentloaded" });
  await partWorkPage.getByRole("heading", { name: "料號資料", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  const partVariantUi = {
    materialLabel: await partWorkPage.getByLabel("材質", { exact: true }).inputValue(),
    colorLabel: await partWorkPage.getByLabel("顏色", { exact: true }).inputValue(),
    surfaceTreatment: await partWorkPage.getByLabel("表面處理", { exact: true }).inputValue(),
    variantNote: await partWorkPage.locator(".pdm-edit-page-field-wide textarea").inputValue()
  };
  const partVariantApi = await partWorkPage.evaluate(async (workId) => {
    const response = await fetch(`/api/pdm/part-change-works/${encodeURIComponent(workId)}`, { cache: "no-store" });
    return { status: response.status, body: await response.json() };
  }, functionalPartWorkId);
  const partVariantDb = (() => { const database = new Database(fixtureDb, { readonly: true, fileMustExist: true }); try { return database.prepare("SELECT id, part_id, proposed_payload, row_version FROM part_change_works WHERE id=?").get(functionalPartWorkId); } finally { database.close(); } })();
  check("QA-087-203 Part variant fields persist across UI reload and API DB readback", partSaveResponse.status() === 200 && partVariantApi.status === 200 && Object.entries(partVariantUi).every(([key, value]) => partVariantApi.body?.data?.payload?.[key] === value) && Object.entries(partVariantUi).every(([key, value]) => JSON.parse(partVariantDb.proposed_payload)[key] === value), JSON.stringify({ partVariantUi, partVariantApi, partVariantDb }));
  await completeFunctionalCase(partWorkPage, "QA-087-203", {
    assertionIds: ["QA-087-203:FOUR_VARIANT_FIELDS_UI_API_DB_RELOAD"],
    actions: ["fill 材質", "fill 顏色", "fill 表面處理", "fill 變體備註", "click 儲存", "reload rendered workspace"],
    apiReadback: partVariantApi,
    dbReadback: partVariantDb,
    mutationLedger: [{ method: "PATCH", route: `/api/pdm/part-change-works/${functionalPartWorkId}`, status: partSaveResponse.status() }]
  });
  await partWorkPage.goto(`${baseUrl}${partRoute}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await waitForWorkbenchList(partWorkPage, "料號工作台");
  const formalPartRow = partWorkPage.locator("[data-canonical-workbench-row='true']").filter({ hasText: "正式資料" }).first();
  const workPartRow = partWorkPage.locator("[data-canonical-workbench-row='true']").filter({ hasText: "修改中" }).first();
  check("I03 Part formal and work rows are both rendered", await formalPartRow.count() === 1 && await workPartRow.count() === 1);
  await formalPartRow.locator(".canonical-row-open").click();
  await partWorkPage.getByRole("heading", { name: "關聯矩陣", exact: true }).waitFor({ state: "visible" });
  const formalPartDetail = await detailReadback(partWorkPage, partEndpoint);
  await workPartRow.locator(".canonical-row-open").click();
  await partWorkPage.waitForFunction(() => document.querySelector(".pdm-entity-drawer-status")?.textContent?.includes("修改中"), null, { timeout: 30_000 });
  const workPartDetail = await detailReadback(partWorkPage, partEndpoint);
  const relationSideEffectsAfterPartWork = relationSideEffectSnapshot();
  check("I03 formal/work Part rows use identical formal matrix", matrixProjectionHash(matrixProjection(formalPartDetail)) === matrixProjectionHash(matrixProjection(workPartDetail)));
  check("I03 Part work creates no Relation work/task/review", JSON.stringify(relationSideEffectsAfterPartWork) === JSON.stringify(relationSideEffectsBeforePartWork), JSON.stringify({ before: relationSideEffectsBeforePartWork, after: relationSideEffectsAfterPartWork }));
  await completeMatrixCase(partWorkPage, "I03", {
    assertionIds: ["I03:PART_FORMAL_WORK_SAME_MATRIX", "I03:NO_RELATION_WORK_TASK_REVIEW"],
    actions: ["create Part work from rendered drawer", "open formal Part row", "open Part work row"],
    apiReadback: { formalStatus: formalPartDetail.status, workStatus: workPartDetail.status, matrixHash: matrixProjectionHash(matrixProjection(workPartDetail)) },
    dbReadback: { matrix: relationDbSnapshot("A0002"), sideEffectsBefore: relationSideEffectsBeforePartWork, sideEffectsAfter: relationSideEffectsAfterPartWork }
  });
  await partWorkPage.getByRole("button", { name: "進行編輯", exact: true }).click();
  await partWorkPage.waitForURL((url) => url.pathname.endsWith("/workspace") && url.searchParams.has("workId"), { timeout: 30_000 });
  const partSubmitResponsePromise = partWorkPage.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith(`/api/pdm/part-change-works/${functionalPartWorkId}/submit`), { timeout: 30_000 });
  await partWorkPage.getByRole("button", { name: "送出審核", exact: true }).click();
  const partSubmitResponse = await partSubmitResponsePromise;
  check("QA-087-204 Part variant work submits through rendered UI", partSubmitResponse.status() === 200);
  await partWorkPage.getByRole("heading", { name: "料號工作台", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  const partReviewerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(partReviewerContext, "研發主管");
  const partReviewer = await openWorkbench(partReviewerContext, "/parts?query=A0002-P01", "料號工作台");
  const partReviewerProjection = await partReviewer.evaluate(async () => {
    const response = await fetch("/api/parts/workbench?query=A0002-P01", { cache: "no-store" });
    return { status: response.status, body: await response.json() };
  });
  const partReviewerRows = (partReviewerProjection.body?.data?.groups ?? []).flatMap((group) => group.rows ?? []);
  const partReviewRow = partReviewerRows.find((row) => row.actions?.some((action) => action.key === "review"));
  const partReviewHref = partReviewRow?.actions?.find((action) => action.key === "review")?.href;
  check("QA-087-204 Part reviewer action resolves exact submitted work", Boolean(partReviewHref) && partReviewerRows.filter((row) => row.actions?.some((action) => action.key === "review")).length === 1, JSON.stringify(partReviewerRows));
  await partReviewer.goto(`${baseUrl}${partReviewHref}?returnTo=${encodeURIComponent("/parts?query=A0002-P01")}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await partReviewer.getByRole("heading", { name: "料號資料", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  const reviewerVariantUi = {
    materialLabel: await partReviewer.getByLabel("材質", { exact: true }).inputValue(),
    colorLabel: await partReviewer.getByLabel("顏色", { exact: true }).inputValue(),
    surfaceTreatment: await partReviewer.getByLabel("表面處理", { exact: true }).inputValue(),
    variantNote: await partReviewer.locator(".pdm-edit-page-field-wide textarea").inputValue()
  };
  const reviewerVariantDisabled = await Promise.all([
    ...["材質", "顏色", "表面處理"].map((label) => partReviewer.getByLabel(label, { exact: true }).isDisabled()),
    partReviewer.locator(".pdm-edit-page-field-wide textarea").isDisabled()
  ]);
  check("QA-087-204 reviewer sees exact readonly Part variant snapshot", JSON.stringify(reviewerVariantUi) === JSON.stringify(partVariantUi) && reviewerVariantDisabled.every(Boolean), JSON.stringify({ reviewerVariantUi, reviewerVariantDisabled }));
  await completeFunctionalCase(partReviewer, "QA-087-204", {
    assertionIds: ["QA-087-204:REVIEWER_EXACT_READONLY_PART_VARIANT_SNAPSHOT"],
    actions: ["submit saved Part work", "open exact canonical reviewer action", "compare four disabled fields"],
    apiReadback: partReviewerProjection,
    dbReadback: (() => { const database = new Database(fixtureDb, { readonly: true, fileMustExist: true }); try { return { work: database.prepare("SELECT id, proposed_payload, row_version FROM part_change_works WHERE id=?").get(functionalPartWorkId), request: database.prepare("SELECT id, snapshot_payload, snapshot_hash, request_status FROM pdm_work_review_requests WHERE work_id=?").get(functionalPartWorkId) }; } finally { database.close(); } })()
  });
  const partReturnResponsePromise = partReviewer.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/decisions"), { timeout: 30_000 });
  await partReviewer.getByRole("button", { name: "退回修改", exact: true }).click();
  const partReturnResponse = await partReturnResponsePromise;
  check("QA-087-205 Part reviewer return succeeds", partReturnResponse.status() === 200);
  await partReviewer.close();
  await partReviewerContext.close();
  await partWorkPage.reload({ waitUntil: "domcontentloaded" });
  await waitForWorkbenchList(partWorkPage, "料號工作台");
  const returnedPartRow = partWorkPage.locator("[data-canonical-workbench-row='true']").filter({ hasText: "修改中" }).first();
  await returnedPartRow.locator(".canonical-row-open").click();
  await partWorkPage.getByRole("button", { name: "進行編輯", exact: true }).click();
  await partWorkPage.getByRole("heading", { name: "料號資料", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  check("QA-087-205 returned Part work preserves variant fields", await partWorkPage.locator(".pdm-edit-page-field-wide textarea").inputValue() === partVariantUi.variantNote);
  await completeFunctionalCase(partWorkPage, "QA-087-205", {
    assertionIds: ["QA-087-205:RETURN_PRESERVES_PART_VARIANT_AND_CANCEL_ZERO_FORMAL_WRITE"],
    actions: ["reviewer clicks 退回修改", "owner reopens returned Part work", "compare variant values", "prepare rendered cancel"],
    apiReadback: { submitStatus: partSubmitResponse.status(), returnStatus: partReturnResponse.status() },
    dbReadback: (() => { const database = new Database(fixtureDb, { readonly: true, fileMustExist: true }); try { return { work: database.prepare("SELECT proposed_payload, row_version FROM part_change_works WHERE id=?").get(functionalPartWorkId), formalVariant: database.prepare("SELECT material_label, color_label, surface_treatment, variant_note FROM part_variant_attributes WHERE part_number_id=(SELECT id FROM part_numbers WHERE part_number='A0002-P01')").get() ?? null }; } finally { database.close(); } })()
  });
  partWorkPage.once("dialog", (dialog) => dialog.accept());
  await partWorkPage.getByRole("button", { name: "取消本次工作", exact: true }).click();
  await partWorkPage.getByRole("heading", { name: "料號工作台", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await partWorkPage.close();

  const editPage = await openExactDrawer(context, { route: drawingRoute, heading: "圖號工作台", code: "A0002-M01" });
  const editDbBefore = relationDbSnapshot("A0002");
  const editMutationStart = matrixMutationRequests.length;
  await editPage.getByRole("button", { name: "編輯關聯", exact: true }).click();
  check("I04 edit stays in drawer", new URL(editPage.url()).pathname === "/numbering/drawings" && await editPage.locator(".pdm-relation-matrix-cell-button").count() > 0);
  check("I04 entering edit emits no mutation", matrixMutationRequests.length === editMutationStart && relationDbSnapshot("A0002").hash === editDbBefore.hash);
  await completeMatrixCase(editPage, "I04", {
    assertionIds: ["I04:INLINE_EDIT_NO_ROUTE_OR_WRITE"],
    actions: ["click 編輯關聯"],
    apiReadback: { detail: await detailReadback(editPage, drawingEndpoint), mutationRequests: matrixMutationRequests.length - editMutationStart },
    dbReadback: { before: editDbBefore, after: relationDbSnapshot("A0002") }
  });

  let cellButton = editPage.locator(".pdm-relation-matrix-cell-button").first();
  const initialCellLabel = (await cellButton.innerText()).trim();
  const keyboardStates = [initialCellLabel];
  await cellButton.focus();
  await cellButton.press("Enter"); keyboardStates.push((await cellButton.innerText()).trim());
  await cellButton.press("Enter"); keyboardStates.push((await cellButton.innerText()).trim());
  await cellButton.press("Enter");
  check("I05 keyboard exposes three distinguishable states", new Set(keyboardStates).size === 3 && keyboardStates.includes("—") && keyboardStates.includes("製造") && keyboardStates.includes("參考"), JSON.stringify(keyboardStates));
  check("I05 states have accessible cell names", (await cellButton.getAttribute("aria-label"))?.includes("點擊切換"));
  check("I05 draft cycling emits no mutation", matrixMutationRequests.length === editMutationStart && relationDbSnapshot("A0002").hash === editDbBefore.hash);
  await completeMatrixCase(editPage, "I05", {
    assertionIds: ["I05:KEYBOARD_THREE_STATE_ACCESSIBLE"],
    actions: ["focus relation cell", "press Enter three times"],
    apiReadback: { mutationRequests: matrixMutationRequests.length - editMutationStart, states: keyboardStates },
    dbReadback: relationDbSnapshot("A0002")
  });

  await cellButton.press("Enter");
  check("I06 draft is dirty before cancel", await editPage.getByRole("status").getByText(/已變更 1 格/u).count() === 1);
  await editPage.getByRole("button", { name: "取消", exact: true }).click();
  check("I06 cancel returns to view mode", await editPage.getByRole("button", { name: "編輯關聯", exact: true }).count() === 1 && await editPage.locator(".pdm-relation-matrix-cell-button").count() === 0);
  check("I06 cancel leaves formal links and write count unchanged", relationDbSnapshot("A0002").hash === editDbBefore.hash && matrixMutationRequests.length === editMutationStart);
  await completeMatrixCase(editPage, "I06", {
    assertionIds: ["I06:CANCEL_DISCARDS_DRAFT_ZERO_WRITE"],
    actions: ["change relation cell", "click 取消"],
    apiReadback: { mutationRequests: matrixMutationRequests.length - editMutationStart },
    dbReadback: { before: editDbBefore, after: relationDbSnapshot("A0002") }
  });

  await editPage.getByRole("button", { name: "編輯關聯", exact: true }).click();
  cellButton = editPage.locator(".pdm-relation-matrix-cell-button").first();
  await cellButton.press("Enter");
  const dismissAndCapture = async (action) => {
    let message = "";
    editPage.once("dialog", async (dialog) => { message = dialog.message(); await dialog.dismiss(); });
    await action();
    await editPage.waitForTimeout(100);
    return message;
  };
  const closeGuard = await dismissAndCapture(() => editPage.getByRole("button", { name: "關閉明細" }).click());
  const switchGuard = await dismissAndCapture(() => editPage.locator("[data-canonical-workbench-row='true']").nth(1).click());
  const identityGuard = await dismissAndCapture(() => editPage.locator(".pdm-relation-matrix-identity").first().click());
  check("I07 close/switch/navigation all guard dirty draft", [closeGuard, switchGuard, identityGuard].every((message) => message.includes("關聯矩陣尚未儲存")), JSON.stringify({ closeGuard, switchGuard, identityGuard }));
  check("I07 staying preserves draft and zero-write", await editPage.getByRole("status").getByText(/已變更 1 格/u).count() === 1 && relationDbSnapshot("A0002").hash === editDbBefore.hash && matrixMutationRequests.length === editMutationStart);
  await completeMatrixCase(editPage, "I07", {
    assertionIds: ["I07:DIRTY_GUARD_ALL_EXIT_PATHS"],
    actions: ["dirty relation cell", "dismiss close guard", "dismiss row-switch guard", "dismiss identity-navigation guard"],
    apiReadback: { guards: { closeGuard, switchGuard, identityGuard }, mutationRequests: matrixMutationRequests.length - editMutationStart },
    dbReadback: { before: editDbBefore, after: relationDbSnapshot("A0002") }
  });
  await completeFunctionalCase(editPage, "QA-087-213", {
    assertionIds: ["QA-087-213:DRAWING_TO_PART_DIRTY_NAVIGATION_GUARD"],
    actions: ["dirty Drawing relation matrix", "attempt Part identity navigation", "dismiss explicit guard and remain on Drawing"],
    apiReadback: { identityGuard, finalUrl: editPage.url(), mutationRequests: matrixMutationRequests.length - editMutationStart },
    dbReadback: { before: editDbBefore, after: relationDbSnapshot("A0002") },
    expectedVisibleError: null
  });
  await editPage.getByRole("button", { name: "取消", exact: true }).click();

  const i08Before = relationDbSnapshot("A0002");
  const i08MutationStart = matrixMutationRequests.length;
  await editPage.getByRole("button", { name: "編輯關聯", exact: true }).click();
  cellButton = editPage.locator(".pdm-relation-matrix-cell-button").first();
  const i08OriginalLabel = (await cellButton.innerText()).trim();
  await cellButton.click();
  const i08ChangedLabel = (await cellButton.innerText()).trim();
  const i08ResponsePromise = editPage.waitForResponse((response) => response.request().method() === "PATCH" && response.url().includes("/api/pdm/relations/") && response.url().endsWith("/matrix"));
  await editPage.getByRole("button", { name: "儲存關聯", exact: true }).click();
  const i08Response = await i08ResponsePromise;
  check("I08 single PATCH succeeds", i08Response.status() === 200);
  await editPage.getByRole("button", { name: "編輯關聯", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  const i08After = relationDbSnapshot("A0002");
  check("I08 formal relation changes exactly once", i08After.hash !== i08Before.hash && matrixMutationRequests.length - i08MutationStart === 1, JSON.stringify({ before: i08Before, after: i08After, requests: matrixMutationRequests.slice(i08MutationStart) }));
  await completeMatrixCase(editPage, "I08", {
    assertionIds: ["I08:SINGLE_PATCH_SINGLE_REFRESH_ATOMIC_FORMAL_WRITE"],
    actions: ["click 編輯關聯", `change cell ${i08OriginalLabel}→${i08ChangedLabel}`, "click 儲存關聯"],
    apiReadback: { patchStatus: i08Response.status(), detail: await detailReadback(editPage, drawingEndpoint) },
    dbReadback: { before: i08Before, after: i08After },
    mutationLedger: matrixMutationRequests.slice(i08MutationStart)
  });
  await editPage.getByRole("button", { name: "編輯關聯", exact: true }).click();
  cellButton = editPage.locator(".pdm-relation-matrix-cell-button").first();
  await cellButton.click(); await cellButton.click();
  const i08Restore = editPage.waitForResponse((response) => response.request().method() === "PATCH" && response.url().endsWith("/matrix"));
  await editPage.getByRole("button", { name: "儲存關聯", exact: true }).click();
  check("I08 UI cleanup restores original formal matrix", (await i08Restore).status() === 200 && relationDbSnapshot("A0002").hash === i08Before.hash);
  await editPage.close();

  const staleA = await openExactDrawer(context, { route: drawingRoute, heading: "圖號工作台", code: "A0002-M01" });
  const staleB = await openExactDrawer(context, { route: drawingRoute, heading: "圖號工作台", code: "A0002-M01" });
  const staleBefore = relationDbSnapshot("A0002");
  const staleMutationStart = matrixMutationRequests.length;
  await staleA.getByRole("button", { name: "編輯關聯", exact: true }).click();
  await staleB.getByRole("button", { name: "編輯關聯", exact: true }).click();
  await staleA.locator(".pdm-relation-matrix-cell-button").first().click();
  await staleB.locator(".pdm-relation-matrix-cell-button").first().click();
  const staleWinnerSave = staleA.getByRole("button", { name: "儲存關聯", exact: true });
  const staleLoserSave = staleB.getByRole("button", { name: "儲存關聯", exact: true });
  check("I09 both tabs hold independently dirty drafts", await staleA.getByRole("status").getByText(/已變更 1 格/u).count() === 1
    && await staleB.getByRole("status").getByText(/已變更 1 格/u).count() === 1
    && await staleWinnerSave.isEnabled() && await staleLoserSave.isEnabled());
  const [staleWinner] = await Promise.all([
    staleA.waitForResponse((response) => response.request().method() === "PATCH" && response.url().endsWith("/matrix")),
    staleWinnerSave.click()
  ]);
  check("I09 first tab commits", staleWinner.status() === 200);
  await staleA.getByRole("button", { name: "編輯關聯", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  const staleAfterWinner = relationDbSnapshot("A0002");
  expectedMatrixConflictResponses += 1;
  expectedMatrixConflictConsoleErrors += 1;
  const [staleLoser] = await Promise.all([
    staleB.waitForResponse((response) => response.request().method() === "PATCH" && response.url().endsWith("/matrix")),
    staleLoserSave.click()
  ]);
  check("I09 stale tab fails closed", staleLoser.status() === 409);
  const matrixConflictAlert = staleB.getByRole("alert").filter({ hasText: "關聯矩陣" });
  await matrixConflictAlert.waitFor({ state: "visible", timeout: 30_000 });
  check("I09 failed draft is preserved", await staleB.getByRole("status").getByText(/已變更 1 格/u).count() === 1);
  check("I09 error receives keyboard focus", await matrixConflictAlert.evaluate((element) => element === document.activeElement));
  check("I09 stale failure adds no partial write", relationDbSnapshot("A0002").hash === staleAfterWinner.hash && matrixMutationRequests.length - staleMutationStart === 2);
  await completeMatrixCase(staleB, "I09", {
    assertionIds: ["I09:STALE_SAVE_PRESERVES_DRAFT_ZERO_PARTIAL_WRITE", "I09:ERROR_FOCUS"],
    actions: ["open same matrix in two rendered tabs", "change same cell in both", "save winner", "save stale loser"],
    apiReadback: { winnerStatus: 200, loserStatus: staleLoser.status() },
    dbReadback: { before: staleBefore, afterWinner: staleAfterWinner, afterLoser: relationDbSnapshot("A0002") },
    mutationLedger: matrixMutationRequests.slice(staleMutationStart),
    expectedVisibleError: "關聯矩陣"
  });
  await staleB.getByRole("button", { name: "取消", exact: true }).click();
  await staleA.getByRole("button", { name: "編輯關聯", exact: true }).click();
  cellButton = staleA.locator(".pdm-relation-matrix-cell-button").first();
  await cellButton.click(); await cellButton.click();
  const staleRestore = staleA.waitForResponse((response) => response.request().method() === "PATCH" && response.url().endsWith("/matrix"));
  await staleA.getByRole("button", { name: "儲存關聯", exact: true }).click();
  check("I09 UI cleanup restores original matrix", (await staleRestore).status() === 200 && relationDbSnapshot("A0002").hash === staleBefore.hash);
  await staleA.close(); await staleB.close();

  const rootSearch = await context.newPage(); monitor(rootSearch, "I10-root-only-search");
  const rootMatrixRequests = [];
  rootSearch.on("request", (request) => { if (request.url().includes("/api/pdm/relations/")) rootMatrixRequests.push(request.url()); });
  await rootSearch.goto(`${baseUrl}/numbering/search?query=A0999`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await rootSearch.getByRole("heading", { name: "編號搜尋", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await rootSearch.getByRole("row").filter({ hasText: "A0999" }).waitFor({ state: "visible", timeout: 30_000 });
  const rootSearchText = await rootSearch.locator("main").innerText();
  check("I10 root-only identity is minimal", rootSearchText.includes("A0999") && !rootSearchText.includes("關聯矩陣") && !rootSearchText.includes("編輯關聯") && rootMatrixRequests.length === 0, JSON.stringify({ rootMatrixRequests, rootSearchText }));
  const rootSearchApi = await rootSearch.evaluate(async () => { const response = await fetch("/api/numbering/search?query=A0999", { cache: "no-store" }); return { status: response.status, body: await response.json() }; });
  await completeMatrixCase(rootSearch, "I10", {
    assertionIds: ["I10:ROOT_ONLY_MINIMAL_SEARCH_NO_MATRIX_GET"],
    actions: ["search A0999 from rendered 編號搜尋"],
    apiReadback: { status: rootSearchApi.status, rootMatrixRequests },
    dbReadback: relationDbSnapshot("A0999")
  });
  await rootSearch.close();

  const blankPage = await openExactDrawer(context, { route: "/numbering/drawings?query=A0003-M01", heading: "圖號工作台", code: "A0003-M01" });
  const blankBefore = relationDbSnapshot("A0003");
  const blankSideEffectsBefore = relationSideEffectSnapshot();
  check("I11 blank matrix has two axes and zero links", blankBefore.drawings.length > 0 && blankBefore.parts.length > 0 && blankBefore.links.length === 0);
  await blankPage.getByRole("button", { name: "編輯關聯", exact: true }).click();
  const blankCell = blankPage.locator(".pdm-relation-matrix-cell-button").first();
  check("I11 blank cell begins empty", (await blankCell.innerText()).trim() === "—");
  await blankCell.click();
  const blankResponsePromise = blankPage.waitForResponse((response) => response.request().method() === "PATCH" && response.url().endsWith("/matrix"));
  await blankPage.getByRole("button", { name: "儲存關聯", exact: true }).click();
  const blankResponse = await blankResponsePromise;
  const blankAfter = relationDbSnapshot("A0003");
  const blankSideEffectsAfter = relationSideEffectSnapshot();
  check("I11 first formal link saves directly", blankResponse.status() === 200 && blankAfter.links.length === 1);
  check("I11 direct save creates no Relation task/review", JSON.stringify(blankSideEffectsAfter) === JSON.stringify(blankSideEffectsBefore));
  await completeMatrixCase(blankPage, "I11", {
    assertionIds: ["I11:BLANK_MATRIX_FIRST_LINK_DIRECT_FORMAL", "I11:NO_TASK_REVIEW"],
    actions: ["open blank matrix", "click empty cell", "click 儲存關聯"],
    apiReadback: { patchStatus: blankResponse.status(), detail: await detailReadback(blankPage, drawingEndpoint) },
    dbReadback: { before: blankBefore, after: blankAfter, sideEffectsBefore: blankSideEffectsBefore, sideEffectsAfter: blankSideEffectsAfter },
    mutationLedger: matrixMutationRequests.filter((entry) => entry.label.includes("A0003") || entry.postData?.includes(blankBefore.root?.id ?? ""))
  });
  await blankPage.close();

  const singleAxis = relationDbSnapshot("A0010");
  const singlePartCode = singleAxis.parts[0]?.number;
  check("I12 single-axis Part identity exists", Boolean(singlePartCode), JSON.stringify(singleAxis));
  const singleAxisPage = await openExactDrawer(context, { route: `/parts?query=${encodeURIComponent(singlePartCode)}`, heading: "料號工作台", code: singlePartCode });
  check("I12 single-axis matrix has no invalid mutation controls", await singleAxisPage.getByText("目前沒有可顯示的關係矩陣。", { exact: true }).count() === 1
    && await singleAxisPage.getByRole("button", { name: "編輯關聯", exact: true }).count() === 0
    && await singleAxisPage.getByRole("button", { name: "儲存關聯", exact: true }).count() === 0);
  await completeMatrixCase(singleAxisPage, "I12", {
    assertionIds: ["I12:SINGLE_AXIS_NO_INVALID_RELATION_MUTATION"],
    actions: [`open single-axis Part ${singlePartCode}`],
    apiReadback: { detail: await detailReadback(singleAxisPage, partEndpoint) },
    dbReadback: singleAxis
  });
  await singleAxisPage.close();

  const identityPage = await openExactDrawer(context, { route: partRoute, heading: "料號工作台", code: "A0002-P01" });
  await identityPage.locator(".canonical-drawer-matrix .pdm-relation-matrix-identity").filter({ hasText: "A0002-M01" }).click();
  await identityPage.waitForURL((url) => url.pathname === "/numbering/drawings" && url.searchParams.has("detail"), { timeout: 30_000 });
  await identityPage.getByRole("complementary", { name: /A0002-M01/u }).waitFor({ state: "visible", timeout: 30_000 });
  await identityPage.locator(".canonical-drawer-matrix .pdm-relation-matrix-identity").filter({ hasText: "A0002-P01" }).click();
  await identityPage.waitForURL((url) => url.pathname === "/parts" && url.searchParams.has("detail"), { timeout: 30_000 });
  await identityPage.getByRole("complementary", { name: /A0002-P01/u }).waitFor({ state: "visible", timeout: 30_000 });
  await identityPage.goBack({ waitUntil: "domcontentloaded" });
  await identityPage.waitForURL((url) => url.pathname === "/numbering/drawings" && url.searchParams.has("detail"), { timeout: 30_000 });
  await identityPage.getByRole("complementary", { name: /A0002-M01/u }).waitFor({ state: "visible", timeout: 30_000 });
  await identityPage.goBack({ waitUntil: "domcontentloaded" });
  await identityPage.waitForURL((url) => url.pathname === "/parts" && url.searchParams.has("detail"), { timeout: 30_000 });
  await identityPage.getByRole("complementary", { name: /A0002-P01/u }).waitFor({ state: "visible", timeout: 30_000 });
  const finalPartDrawerCount = await identityPage.getByRole("complementary", { name: /A0002-P01/u }).count();
  check("I13 identity navigation never enters Relation workbench", !identityPage.url().includes("relation") && finalPartDrawerCount === 1,
    JSON.stringify({ finalUrl: identityPage.url(), finalPartDrawerCount }));
  await completeMatrixCase(identityPage, "I13", {
    assertionIds: ["I13:DRAWING_PART_CANONICAL_IDENTITY_NAV_AND_BACK"],
    actions: ["Part matrix→Drawing workbench", "Drawing matrix→Part workbench", "Back→Drawing", "Back→Part"],
    apiReadback: { finalUrl: identityPage.url(), detail: await detailReadback(identityPage, partEndpoint) },
    dbReadback: relationDbSnapshot("A0002")
  });
  await completeFunctionalCase(identityPage, "QA-087-212", {
    assertionIds: ["QA-087-212:PART_MATRIX_DRAWING_IDENTITY_NAV_AND_BACK"],
    actions: ["click A0002-M01 identity from Part matrix", "open exact Drawing drawer", "click A0002-P01 identity", "Back to Drawing", "Back to Part"],
    apiReadback: { finalUrl: identityPage.url(), finalPartDrawerCount },
    dbReadback: relationDbSnapshot("A0002")
  });
  await identityPage.close();

  const retirementPage = await context.newPage(); monitor(retirementPage, "I14-retirement");
  const retirementBefore = relationSideEffectSnapshot();
  await retirementPage.goto(`${baseUrl}/numbering/drawings?query=A0002-M01`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await retirementPage.getByRole("heading", { name: "圖號工作台", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  const sidebarText = await retirementPage.locator("aside, nav").allTextContents();
  check("I14 sidebar has no retired Relation workbench copy", !sidebarText.join("\n").includes("圖料工作台"));
  await retirementPage.goto(`${baseUrl}/numbering/search?root=A0002`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await retirementPage.getByRole("heading", { name: "編號搜尋", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  const legacySearchText = await retirementPage.locator("main").innerText();
  check("I14 legacy Relation query does not become a current workbench", !legacySearchText.includes("圖料工作台") && !legacySearchText.includes("關聯矩陣") && !legacySearchText.includes("建立調整") && !legacySearchText.includes("送出審核"));
  const retirementAfter = relationSideEffectSnapshot();
  check("I14 retirement navigation creates no Relation work/task/review", JSON.stringify(retirementAfter) === JSON.stringify(retirementBefore));
  await completeMatrixCase(retirementPage, "I14", {
    assertionIds: ["I14:RELATION_WORKBENCH_RETIRED", "I14:NO_RELATION_TASK_REVIEW", "I14:LEGACY_INTENT_FAILS_CLOSED"],
    actions: ["inspect rendered sidebar", "navigate legacy root query in fresh session"],
    apiReadback: { finalUrl: retirementPage.url(), renderedTextHasRetiredWorkbench: legacySearchText.includes("圖料工作台") },
    dbReadback: { before: retirementBefore, after: retirementAfter }
  });
  await retirementPage.close();
}

try {
  primaryBefore = readInvariantSnapshot();
  check("primary source invariant before fixture", invariantSnapshotIsSafe(primaryBefore), safeJson(primaryBefore));
  fs.mkdirSync(fixtureDataDir, { recursive: true }); fs.mkdirSync(screenshotDir, { recursive: true });
  const source = new Database(sourceDb, { readonly: true, fileMustExist: true });
  await source.backup(fixtureDb);
  source.close();
  const sourceSnapshot = new Database(fixtureDb, { readonly: true, fileMustExist: true });
  try {
    check("source snapshot root and part masters exist before fixture mutation", sourceSnapshot.prepare("SELECT COUNT(*) AS count FROM part_roots").get().count > 0 && sourceSnapshot.prepare("SELECT COUNT(*) AS count FROM part_numbers").get().count > 0);
    check("source snapshot foreign keys clean before fixture mutation", sourceSnapshot.pragma("foreign_key_check").length === 0, JSON.stringify(sourceSnapshot.pragma("foreign_key_check")));
    check("source snapshot has no company-scope migration residue before fixture mutation", sourceSnapshot.prepare(`SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table'
      AND name IN ('part_roots_company_scope_migration','part_numbers_company_scope_migration','drawing_numbers_company_scope_migration')`).get().count === 0);
    check("source snapshot root references resolve before fixture mutation", sourceSnapshot.prepare(`SELECT COUNT(*) AS count FROM drawings drawing
      WHERE drawing.part_root_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM part_roots root WHERE root.id=drawing.part_root_id AND root.company_id=drawing.company_id)`).get().count === 0);
    sourceInvariantCheckedBeforeMutation = true;
    check("SQLite backup is an exact protected source snapshot before mutation", safeJson(readInvariantSnapshot(fixtureDb)) === safeJson(primaryBefore), safeJson({ primaryBefore, fixtureSnapshot: readInvariantSnapshot(fixtureDb) }));
  } finally {
    sourceSnapshot.close();
  }
  if (fs.existsSync(sourceRepository)) fs.cpSync(sourceRepository, fixtureRepository, { recursive: true, force: true });
  const fixturePreparation = new Database(fixtureDb);
  prepareBrowserFixture(fixturePreparation);
  check("browser fixture remains FK-clean after target residue preparation", fixturePreparation.pragma("foreign_key_check").length === 0, JSON.stringify(fixturePreparation.pragma("foreign_key_check")));
  fixturePreparation.close();
  const migration = spawnSync(process.execPath, [
    path.join(root, "scripts", "migrate-dev-087-canonical-workbench.mjs"),
    `--db=${fixtureDb}`, "--apply", "--confirm-disposable-dev-087", "--retain-unmapped-legacy", "--switch-canonical-only", "--expected-commit=local-dev", `--output-dir=${path.join(tempRoot, "migration")}`
  ], { cwd: root, encoding: "utf8" });
  fixtureMutationLedger.push({ action: "migrate-dev-087-canonical-workbench", status: migration.status, scope: "disposable fixture only" });
  check("isolated migration applied or safely quarantined", migration.status === 0 || migration.status === 2, `${migration.stdout}\n${migration.stderr}`);
  const fixture = new Database(fixtureDb);
  fixture.prepare("UPDATE pdm_workbench_state_authority_control SET mode='canonical_only', expected_commit='local-dev', schema_hash='dev090-v1', row_version=row_version+1").run();
  fixtureMutationLedger.push({ action: "set-disposable-authority-control", scope: "disposable fixture only" });
  prepareFunctionalBrowserFixture(fixture);
  check("fixture remains FK-clean after declared mutations", fixture.pragma("foreign_key_check").length === 0, JSON.stringify(fixture.pragma("foreign_key_check")));
  check("isolated fixture has A0002 production and RD rows", fixture.prepare("SELECT COUNT(*) AS count FROM canonical_workbench_states state JOIN drawings drawing ON drawing.id = state.canonical_entity_id WHERE drawing.drawing_number='A0002-M01' AND state.data_layer IN ('drawing_production', 'drawing_rd')").get().count >= 2);
  fixture.close();

  port = await getFreePort(); baseUrl = `http://127.0.0.1:${port}`;
  runtimeDistDir = path.join(root, ".tmp", `qc-dev087-browser-${port}`);
  const nextEnvTypesDir = path.join(runtimeDistDir, "dev", "types");
  fs.mkdirSync(nextEnvTypesDir, { recursive: true });
  await writeNextEnvWithRetry(`/// <reference types="next" />\n/// <reference types="next/image-types/global" />\nimport "./.tmp/qc-dev087-browser-${port}/dev/types/routes.d.ts";\nimport "./.tmp/qc-dev087-browser-${port}/dev/types/root-params.d.ts";\n\n// NOTE: This file should not be edited\n// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.\n`);
  Object.assign(process.env, {
    NODE_ENV: "development", QC_NEXT_USE_WEBPACK: "1", PDM_AUTH_MODE: "local", PDM_DB_PROVIDER: "sqlite", PDM_DATA_DIR: fixtureDataDir,
    PDM_REPOSITORY_DIR: fixtureRepository, PDM_BUILD_COMMIT: "local-dev", PDM_RELEASE_MODE: "local_stub",
    PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true", PDM_ENABLE_LOCAL_QUICK_LOGIN: "true", PDM_PRODUCTION_SLICE_MODE: "", PDM_REVIEW_PACKAGE_V2_WRITE: "true",
    PDM_POSTGRES_URL: "", DATABASE_URL: "", PDM_NEXT_DIST_DIR: path.relative(root, runtimeDistDir), PDM_PUBLIC_BASE_URL: baseUrl
  });
  console.log(`QC DEV-087 runtime: project=${root}; purpose=canonical workbench browser QA; port=${port}; owner=current QC process tree; cleanup=after browser assertions`);
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput);
  browser = await chromium.launch({ headless: true });

  const fffFocus = process.env.QC_DEV087_FFF_FOCUS === "1";
  const smokeViewports = process.env.QC_DEV087_MATRIX_FOCUS === "1" || formalFocus ? [] : fffFocus ? [
    { name: "desktop", width: 1440, height: 900 }
  ] : [
    { name: "desktop", width: 1440, height: 900 },
    { name: "tablet", width: 1024, height: 768 },
    { name: "portrait-tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 },
    { name: "small-mobile", width: 320, height: 800 },
    { name: "zoom-200", width: 1440, height: 900, zoom: 2 }
  ];
  for (const viewport of smokeViewports) {
    const context = await browser.newContext({ viewport }); await login(context);
    if (viewport.name === "desktop") {
      const preferencePage = await context.newPage();
      await preferencePage.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await preferencePage.evaluate(() => {
        window.localStorage.setItem("pdm-drawing-detail-drawer-width", "510");
        window.localStorage.setItem("pdm-part-detail-drawer-width", "560");
        window.localStorage.setItem("pdm-search-detail-drawer-width", "610");
      });
      await preferencePage.close();
    }
    const drawing = await openWorkbench(context, "/numbering/drawings?query=A0002-M01", "圖號工作台");
    if (viewport.zoom) {
      await drawing.evaluate((zoom) => { document.documentElement.style.zoom = String(zoom); }, viewport.zoom);
    }
    await verifyWorkbench(drawing, `drawing/${viewport.name}`);
    const drawingRows = await drawing.locator(".canonical-table-wrap tbody tr").allTextContents();
    check(`drawing/${viewport.name} production and RD visible together`, drawingRows.some((row) => row.includes("量產版 1")) && drawingRows.some((row) => row.includes("研發版 1.1")), JSON.stringify(drawingRows));
    await drawing.screenshot({ path: path.join(screenshotDir, `drawing-${viewport.name}.png`), fullPage: true, caret: "initial" });
    if (viewport.name === "small-mobile") {
      const smallViewportMetrics = await drawing.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, activeElement: document.activeElement?.tagName ?? null }));
      const smallViewportApi = await drawing.evaluate(async () => {
        const response = await fetch("/api/numbering/drawings/workbench?limit=100&query=A0002-M01", { cache: "no-store" });
        return { status: response.status, body: await response.json() };
      });
      const smallViewportProductAlertCount = await drawing.locator("[role='alert']:visible").evaluateAll((nodes) => nodes
        .filter((node) => node.id !== "__next-route-announcer__" && !node.closest("next-route-announcer")).length);
      check("QA-087-217 320x800 rendered workbench has no overflow or visible error", smallViewportMetrics.width === 320 && smallViewportMetrics.height === 800 && smallViewportMetrics.scrollWidth <= smallViewportMetrics.clientWidth + 1 && smallViewportProductAlertCount === 0, JSON.stringify({ ...smallViewportMetrics, productAlertCount: smallViewportProductAlertCount }));
      await completeFunctionalCase(drawing, "QA-087-217", {
        assertionIds: ["QA-087-217:FOUR_VIEWPORT_KEYBOARD_A11Y_VISIBLE_ERROR_GATE"],
        actions: ["render Drawing at 1440x900", "render at 1024x768", "render at 768x1024", "render at 390x844", "render at 320x800", "render at 200% zoom", "inspect keyboard/a11y list contract"],
        apiReadback: { smallViewportApi, viewportArtifacts: smokeViewports.map((item) => ({ ...item, screenshot: path.relative(root, path.join(screenshotDir, `drawing-${item.name}.png`)).replaceAll("\\", "/") })) },
        dbReadback: { drawingRows: (() => { const database = new Database(fixtureDb, { readonly: true, fileMustExist: true }); try { return database.prepare("SELECT drawing_number, lifecycle_state FROM drawings WHERE drawing_number='A0002-M01'").all(); } finally { database.close(); } })() }
      });
    }
    if (viewport.name === "desktop") {
      await verifyWorkbenchInteractions(drawing, { name: "drawing/desktop", storageKey: "pdm-drawing-detail-drawer-width", detailEndpoint: "/api/numbering/drawings/workbench", screenshot: "drawing-interactions-desktop" });
      await drawing.locator(".canonical-row-open").first().click();
      await drawing.getByRole("complementary", { name: /A0002-M01/u }).waitFor({ state: "visible" });
      check("drawing drawer has history", await drawing.getByRole("heading", { name: "歷史版次清單" }).count() === 1);
      const historyButton = drawing.locator(".canonical-history-open").first();
      const historyButtonText = await historyButton.innerText();
      await historyButton.click();
      await drawing.getByRole("heading", { name: "歷史版次明細", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
      const historyRevisionId = new URL(drawing.url()).searchParams.get("historyRevision");
      const historyDb = (() => {
        const database = new Database(fixtureDb, { readonly: true, fileMustExist: true });
        try { return database.prepare("SELECT id, drawing_id, revision, lifecycle_state FROM drawing_revisions WHERE id=?").get(historyRevisionId); }
        finally { database.close(); }
      })();
      const historyDrawingId = historyDb?.drawing_id ?? null;
      const historyApi = await drawing.evaluate(async ({ drawingId, revisionId }) => {
        const response = await fetch(`/api/numbering/drawings/${encodeURIComponent(drawingId)}/history/${encodeURIComponent(revisionId)}`, { cache: "no-store" });
        return { status: response.status, body: await response.json() };
      }, { drawingId: historyDrawingId, revisionId: historyRevisionId });
      check("QA-087-207 exact selected history identity is rendered", Boolean(historyRevisionId && historyDrawingId && historyApi.status === 200 && historyApi.body?.data?.revisionId === historyRevisionId && historyApi.body?.data?.drawingId === historyDrawingId && historyDb?.id === historyRevisionId), JSON.stringify({ historyButtonText, historyRevisionId, historyDrawingId, historyApi, historyDb }));
      await completeFunctionalCase(drawing, "QA-087-207", {
        assertionIds: ["QA-087-207:CLICKED_HISTORY_IDENTITY_EQUALS_API_DB_REVISION"],
        actions: [`click rendered history row ${historyButtonText.trim()}`, "open exact history revision detail"],
        apiReadback: historyApi,
        dbReadback: historyDb
      });
      await drawing.getByRole("button", { name: "返回版次清單", exact: true }).click();
      await drawing.getByRole("heading", { name: "歷史版次清單", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
      const invalidHistoryUrl = new URL(drawing.url());
      invalidHistoryUrl.searchParams.set("historyRevision", "qa-dev087-missing-history");
      expectedHistoryFailureResponses += 1;
      expectedHistoryFailureConsoleErrors += 1;
      await drawing.goto(invalidHistoryUrl.toString(), { waitUntil: "domcontentloaded", timeout: 45_000 });
      const historyError = drawing.locator(".canonical-history-detail [role='alert']");
      await historyError.waitFor({ state: "visible", timeout: 30_000 });
      const historyErrorText = await historyError.innerText();
      check("QA-087-208 missing history revision fails closed without file fallback", historyErrorText.length > 0 && await drawing.locator(".canonical-history-detail .canonical-record-list").count() === 0, historyErrorText);
      await completeFunctionalCase(drawing, "QA-087-208", {
        assertionIds: ["QA-087-208:MISSING_HISTORY_VISIBLE_FAIL_CLOSED_NO_FALLBACK"],
        actions: ["navigate same rendered drawer to a missing exact history revision", "observe visible error and zero fallback file rows"],
        apiReadback: { status: 404, revisionId: "qa-dev087-missing-history", message: historyErrorText },
        dbReadback: { missingRevisionCount: 0 },
        expectedVisibleError: historyErrorText
      });
      await drawing.getByRole("button", { name: "返回版次清單", exact: true }).click();
      await drawing.getByRole("button", { name: "關閉明細" }).click();
      await drawing.goto(`${baseUrl}/numbering/drawings?query=A0002-R99`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await drawing.getByRole("heading", { name: "圖號工作台", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
      await drawing.waitForFunction(() => document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false", null, { timeout: 30_000 });
      const initialRow = drawing.locator("[data-canonical-workbench-row='true']").filter({ hasText: "研發版 0.1" }).first();
      await initialRow.locator(".canonical-row-open").click();
      await drawing.getByRole("button", { name: "進行編輯", exact: true }).click();
      await drawing.locator('[data-workspace-kind="drawing-revision-work"]').waitFor({ state: "visible", timeout: 30_000 });
      const initialWorkId = new URL(drawing.url()).searchParams.get("workId");
      const initialWorkApi = await drawing.evaluate(async (workId) => {
        const response = await fetch(`/api/pdm/drawing-revision-works/${encodeURIComponent(workId)}`, { cache: "no-store" });
        return { status: response.status, body: await response.json() };
      }, initialWorkId);
      const initialDbBefore = (() => {
        const database = new Database(fixtureDb, { readonly: true, fileMustExist: true });
        try { return database.prepare("SELECT work.proposed_payload, work.row_version, claim.predecessor_revision_id FROM drawing_revision_works work JOIN drawing_revision_claims claim ON claim.id=work.target_claim_id WHERE work.id=?").get(initialWorkId); }
        finally { database.close(); }
      })();
      expectedFffNotApplicableResponses += 1;
      expectedFffNotApplicableConsoleErrors += 1;
      const initialForbidden = await drawing.evaluate(async ({ workId, rowVersion, contractToken, impact }) => {
        const response = await fetch(`/api/pdm/drawing-revision-works/${encodeURIComponent(workId)}`, { method: "PATCH", headers: { "content-type": "application/json", "if-match": `"${rowVersion}"`, "idempotency-key": crypto.randomUUID(), "x-pdm-workbench-contract": contractToken }, body: JSON.stringify({ recognitionNotes: "", changeImpact: impact }) });
        return { status: response.status, body: await response.json() };
      }, { workId: initialWorkId, rowVersion: initialWorkApi.body?.data?.rowVersion, contractToken: initialWorkApi.body?.meta?.contractToken, impact: { schemaVersion: 2, affectedPartNumberIds: [], affectedPartFingerprint: "forbidden", formState: "no_impact", fitState: "no_impact", functionState: "no_impact", reasonCategory: null, note: null, replacement: null } });
      const initialDbAfter = (() => {
        const database = new Database(fixtureDb, { readonly: true, fileMustExist: true });
        try { return database.prepare("SELECT work.proposed_payload, work.row_version, claim.predecessor_revision_id FROM drawing_revision_works work JOIN drawing_revision_claims claim ON claim.id=work.target_claim_id WHERE work.id=?").get(initialWorkId); }
        finally { database.close(); }
      })();
      const initialRelatedUi = (await drawing.locator("[aria-label='關聯料號'] li strong").allTextContents()).map((value) => value.trim()).sort();
      check("QA-087-187 first revision renders neutral related Parts and no FFF controls", initialWorkApi.status === 200 && initialWorkApi.body?.data?.changeImpactRequired === false && initialWorkApi.body?.data?.affectedParts?.length === 0 && !("changeImpact" in (initialWorkApi.body?.data?.payload ?? {})) && await drawing.getByRole("heading", { name: "關聯料號", exact: true }).count() === 1 && await drawing.getByRole("heading", { name: "FFF／變更影響", exact: true }).count() === 0 && await drawing.locator(".canonical-fff-grid").count() === 0 && initialRelatedUi.length === 1, JSON.stringify({ initialWorkId, initialWorkApi, initialRelatedUi }));
      check("QA-087-187 direct first-revision FFF PATCH is rejected with zero write", initialForbidden.status === 422 && initialForbidden.body?.error?.code === "DRAWING_FFF_NOT_APPLICABLE" && initialDbBefore.proposed_payload === initialDbAfter.proposed_payload && Number(initialDbBefore.row_version) === Number(initialDbAfter.row_version) && initialDbBefore.predecessor_revision_id === null, JSON.stringify({ initialForbidden, initialDbBefore, initialDbAfter }));
      await drawing.goto(`${baseUrl}/numbering/drawings?query=A0002-M01`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await drawing.getByRole("heading", { name: "圖號工作台", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
      await drawing.waitForFunction(() => document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false", null, { timeout: 30_000 });
      const productionRow = drawing.locator(".canonical-table-wrap tbody tr").filter({ hasText: "量產版 1" }).first();
      await productionRow.getByRole("button").click();
      await drawing.getByRole("complementary", { name: /A0002-M01/u }).waitFor({ state: "visible" });
      await drawing.getByRole("button", { name: "進版", exact: true }).click();
      await drawing.getByRole("dialog", { name: "建立進版工作" }).waitFor({ state: "visible" });
      await drawing.getByRole("radio", { name: /研發版 1\.2/u }).check();
      await drawing.getByRole("button", { name: "建立進版工作", exact: true }).click();
      await drawing.locator('[data-workspace-kind="drawing-revision-work"]').waitFor({ state: "visible", timeout: 60_000 });
      const functionalWorkId = new URL(drawing.url()).searchParams.get("workId");
      const workApiBefore = await drawing.evaluate(async (workId) => {
        const response = await fetch(`/api/pdm/drawing-revision-works/${encodeURIComponent(workId)}`, { cache: "no-store" });
        return { status: response.status, body: await response.json() };
      }, functionalWorkId);
      const workDbBefore = (() => {
        const database = new Database(fixtureDb, { readonly: true, fileMustExist: true });
        try {
          return {
            currentWork: database.prepare("SELECT id, drawing_id, branch_id, target_claim_id, proposed_payload, row_version FROM drawing_revision_works WHERE id=?").get(functionalWorkId),
            currentWorkCount: database.prepare("SELECT COUNT(*) AS count FROM drawing_revision_works WHERE drawing_id=(SELECT drawing_id FROM drawing_revision_works WHERE id=?)").get(functionalWorkId).count
          };
        } finally { database.close(); }
      })();
      check("QA-087-187 canonical 進版 creates one exact current Drawing work", Boolean(functionalWorkId && workApiBefore.status === 200 && workApiBefore.body?.data?.workId === functionalWorkId && workApiBefore.body?.data?.changeImpactRequired === true && Number(workDbBefore.currentWorkCount) === 1), JSON.stringify({ functionalWorkId, workApiBefore, workDbBefore }));
      await completeFunctionalCase(drawing, "QA-087-187", {
        assertionIds: ["QA-087-187:FIRST_REVISION_NO_FFF_ZERO_WRITE", "QA-087-187:CANONICAL_ADVANCE_SINGLE_CURRENT_WORK"],
        actions: ["open normal first-revision 0.1 work", "verify neutral 關聯料號 and no FFF controls", "directly PATCH forbidden FFF and verify 422/zero-write", "open production Drawing row", "click 進版", "select rendered 研發版 1.2", "click 建立進版工作"],
        apiReadback: { initial: initialWorkApi, initialForbidden, advance: workApiBefore },
        dbReadback: { initialBefore: initialDbBefore, initialAfter: initialDbAfter, advance: workDbBefore },
        mutationLedger: [{ route: `/drawing-revision-works/${initialWorkId}`, status: initialForbidden.status, expectedDelta: 0 }]
      });
      check("drawing editor keeps dedicated file and recognition sections", await drawing.getByRole("heading", { name: "版次與檔案" }).count() === 1 && await drawing.getByRole("heading", { name: "智慧辨識" }).count() === 1);
      await drawing.waitForTimeout(500);
      check("drawing recognition uses the work revision context", await drawing.getByText("這筆工作資料尚無可辨識的版次來源。", { exact: true }).count() === 0);
      check("drawing owner editor remains mutable before submit", await drawing.getByRole("button", { name: "取消本次工作" }).isEnabled() && await drawing.locator(".canonical-fff-grid select[data-fff-axis]").first().isEnabled());
      const affectedUi = (await drawing.locator("[aria-label='判定範圍'] li strong").allTextContents()).map((value) => value.trim()).sort();
      const affectedApi = (workApiBefore.body?.data?.affectedParts ?? []).map((item) => item.code).sort();
      const affectedDb = (() => {
        const database = new Database(fixtureDb, { readonly: true, fileMustExist: true });
        try { return database.prepare(`SELECT part.part_number AS code FROM drawings drawing JOIN drawing_part_links link ON link.drawing_number_id=drawing.formal_drawing_number_id JOIN part_numbers part ON part.id=link.part_number_id WHERE drawing.id=? ORDER BY part.part_number`).all(workDbBefore.currentWork.drawing_id).map((row) => row.code); }
        finally { database.close(); }
      })();
      check("QA-087-188 affected Part identities match rendered UI API and DB", affectedUi.length > 0 && JSON.stringify(affectedUi) === JSON.stringify(affectedApi) && JSON.stringify(affectedApi) === JSON.stringify(affectedDb), JSON.stringify({ affectedUi, affectedApi, affectedDb }));
      await completeFunctionalCase(drawing, "QA-087-188", {
        assertionIds: ["QA-087-188:AFFECTED_PART_UI_API_DB_EXACT"],
        actions: ["inspect rendered 受影響料號 list in current Drawing work"],
        apiReadback: { affectedParts: workApiBefore.body?.data?.affectedParts ?? [] },
        dbReadback: { affectedParts: affectedDb }
      });
      const fffSelects = drawing.locator(".canonical-fff-grid select[data-fff-axis]");
      check("QA-087-189 later revision starts with all three FFF axes unassessed", JSON.stringify(await fffSelects.evaluateAll((nodes) => nodes.map((node) => node.value))) === JSON.stringify(["", "", ""]));
      await drawing.locator('[data-fff-axis="formState"]').selectOption("no_impact");
      await drawing.waitForFunction(() => document.querySelector(".canonical-fff-grid")?.getAttribute("data-fff-form-state") === "no_impact");
      await drawing.locator('[data-fff-axis="fitState"]').selectOption("suspected_impact");
      await drawing.waitForFunction(() => document.querySelector(".canonical-fff-grid")?.getAttribute("data-fff-fit-state") === "suspected_impact");
      await drawing.getByLabel("原因分類", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
      await drawing.locator('[data-fff-axis="functionState"]').selectOption("confirmed_impact");
      await drawing.waitForFunction(() => document.querySelector(".canonical-fff-grid")?.getAttribute("data-fff-function-state") === "confirmed_impact");
      await drawing.getByLabel("原因分類", { exact: true }).selectOption("function_change");
      await drawing.getByLabel("判定備註", { exact: true }).fill("DEV087 browser exact FFF snapshot");
      const replacementKind = drawing.locator(".canonical-fff-replacement select");
      await replacementKind.waitFor({ state: "visible", timeout: 30_000 });
      await replacementKind.selectOption("self_made");
      await drawing.getByLabel("替代料號", { exact: true }).fill("A0002-P02");
      check("QA-087-189 all three rendered FFF outcomes are independently selected", JSON.stringify(await fffSelects.evaluateAll((nodes) => nodes.map((node) => node.value))) === JSON.stringify(["no_impact", "suspected_impact", "confirmed_impact"]));
      check("QA-087-190 confirmed impact renders replacement identity controls", await drawing.getByLabel("替代料號", { exact: true }).inputValue() === "A0002-P02" && await replacementKind.inputValue() === "self_made");
      await completeFunctionalCase(drawing, "QA-087-190", {
        assertionIds: ["QA-087-190:REPLACEMENT_IDENTITY_RENDERED_FOR_CONFIRMED_IMPACT"],
        actions: ["enter replacement Part A0002-P02", "select self-made item type"],
        apiReadback: { sourcePartCodes: affectedApi, replacementPartCode: "A0002-P02" },
        dbReadback: { replacementPart: (() => { const database = new Database(fixtureDb, { readonly: true, fileMustExist: true }); try { return database.prepare("SELECT id, part_number, part_root_id, company_id FROM part_numbers WHERE part_number='A0002-P02'").get(); } finally { database.close(); } })() }
      });
      fs.writeFileSync(drawingUpload2d, "DEV087 functional browser 2D\n", "utf8");
      fs.writeFileSync(drawingUpload3d, "DEV087 functional browser 3D\n", "utf8");
      await drawing.locator(".dev079-workspace-file-upload input[type='file']").setInputFiles([drawingUpload2d, drawingUpload3d]);
      await drawing.getByRole("button", { name: "上傳所選檔案", exact: true }).click();
      await drawing.waitForFunction(() => [...document.querySelectorAll(".dev079-upload-progress-list li")].filter((node) => node.classList.contains("is-success")).length >= 2, null, { timeout: 45_000 });
      await drawing.getByText("本版次 2D 與 3D 主檔已齊備。", { exact: true }).waitFor({ state: "visible", timeout: 45_000 });
      const ownerDownloadHrefs = await drawing.locator(".dev079-workspace-file-actions a[download]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
      check("QA-087-209 owner sees exact protected work-file downloads", ownerDownloadHrefs.length >= 2 && ownerDownloadHrefs.every((href) => href?.includes("context=drawing_revision_work") && href.includes(`contextId=${encodeURIComponent(functionalWorkId)}`)), JSON.stringify(ownerDownloadHrefs));
      await completeFunctionalCase(drawing, "QA-087-209", {
        assertionIds: ["QA-087-209:OWNER_WORK_FILE_HREF_EXACT_BINDING"],
        actions: ["upload rendered 2D and 3D files", "inspect each rendered protected download href"],
        apiReadback: { downloadHrefs: ownerDownloadHrefs },
        dbReadback: (() => { const database = new Database(fixtureDb, { readonly: true, fileMustExist: true }); try { return database.prepare("SELECT work_id, file_binding_id, ordinal, content_hash FROM drawing_revision_work_files WHERE work_id=? ORDER BY ordinal, file_binding_id").all(functionalWorkId); } finally { database.close(); } })()
      });
      const currentPrimaryActions = [];
      for (const displayName of ["DEV087-FUNCTIONAL.SLDDRW", "DEV087-FUNCTIONAL.SLDPRT"]) {
        const row = drawing.locator(".dev079-workspace-file-list li").filter({ hasText: displayName });
        currentPrimaryActions.push({ displayName, rowCount: await row.count(), removeActionCount: await row.getByRole("button", { name: "移除", exact: true }).count() });
      }
      const removableCurrentPrimaries = currentPrimaryActions.filter((item) => item.rowCount === 1 && item.removeActionCount === 1).length;
      check("QA-087-210 current revision primary files expose removal", removableCurrentPrimaries === 2, JSON.stringify({ removableCurrentPrimaries, currentPrimaryActions }));
      await completeFunctionalCase(drawing, "QA-087-210", {
        assertionIds: ["QA-087-210:CURRENT_REVISION_PRIMARY_REMOVE_ACTION_PRESENT"],
        actions: ["upload current revision 2D and 3D primary files", "verify each current revision row exposes 移除"],
        apiReadback: { removableCurrentPrimaries, currentPrimaryActions },
        dbReadback: (() => { const database = new Database(fixtureDb, { readonly: true, fileMustExist: true }); try { return database.prepare("SELECT work_id, file_binding_id, ordinal, content_hash FROM drawing_revision_work_files WHERE work_id=? ORDER BY ordinal, file_binding_id").all(functionalWorkId); } finally { database.close(); } })()
      });
      const successfulUploadRows = await drawing.locator(".dev079-upload-progress-list li.is-success").allTextContents();
      check("QA-087-211 multi-file upload exposes per-file terminal progress", successfulUploadRows.length >= 2, JSON.stringify(successfulUploadRows));
      await drawing.screenshot({ path: path.join(screenshotDir, "drawing-editor-recognition-desktop.png"), fullPage: true, caret: "initial" });
      const submitResponsePromise = drawing.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith(`/api/pdm/drawing-revision-works/${functionalWorkId}/submit`), { timeout: 30_000 });
      await drawing.getByRole("button", { name: "送出審核", exact: true }).click();
      const submitResponse = await submitResponsePromise;
      check("QA-087-189 rendered submit persists exact FFF snapshot", submitResponse.status() === 200);
      await drawing.getByRole("heading", { name: "圖號工作台", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
      await drawing.waitForFunction(() => document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false", null, { timeout: 30_000 });
      const reviewerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await login(reviewerContext, "研發主管");
      const reviewer = await openWorkbench(reviewerContext, "/numbering/drawings?query=A0002-M01", "圖號工作台");
      const reviewerProjection = await reviewer.evaluate(async () => {
        const response = await fetch("/api/numbering/drawings/workbench?query=A0002-M01", { cache: "no-store" });
        return { status: response.status, body: await response.json() };
      });
      const reviewerRows = (reviewerProjection.body?.data?.groups ?? []).flatMap((group) => group.rows ?? []);
      const reviewerRow = reviewerRows.find((row) => row.actions?.some((action) => action.key === "review"));
      const reviewHref = reviewerRow?.actions?.find((action) => action.key === "review")?.href;
      check("QA-087-191 canonical workbench exposes one current review authority", reviewerProjection.status === 200 && reviewerRows.filter((row) => row.actions?.some((action) => action.key === "review")).length === 1 && Boolean(reviewHref), JSON.stringify(reviewerRows));
      await reviewer.goto(`${baseUrl}${reviewHref}?returnTo=${encodeURIComponent("/numbering/drawings?query=A0002-M01")}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      const reviewerWorkspace = reviewer.locator('[data-workspace-kind="reviewer"]');
      await reviewerWorkspace.waitFor({ state: "attached", timeout: 30_000 });
      const reviewerWorkspaceLayout = await reviewerWorkspace.evaluate((node) => {
        const element = node;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const parents = [];
        let current = element.parentElement;
        while (current && parents.length < 5) {
          const currentRect = current.getBoundingClientRect();
          const currentStyle = getComputedStyle(current);
          parents.push({ tag: current.tagName, className: current.className, display: currentStyle.display, visibility: currentStyle.visibility, width: currentRect.width, height: currentRect.height });
          current = current.parentElement;
        }
        return { display: style.display, visibility: style.visibility, opacity: style.opacity, width: rect.width, height: rect.height, parents };
      });
      check("reviewer shared Drawing workspace is visibly laid out", reviewerWorkspaceLayout.display !== "none" && reviewerWorkspaceLayout.visibility !== "hidden" && reviewerWorkspaceLayout.width > 0 && reviewerWorkspaceLayout.height > 0, JSON.stringify(reviewerWorkspaceLayout));
      const reviewerFff = await reviewer.locator(".canonical-fff-grid select[data-fff-axis]").evaluateAll((nodes) => nodes.map((node) => ({ value: node.value, disabled: node.disabled })));
      const reviewerReplacement = await reviewer.getByLabel("替代料號", { exact: true }).inputValue();
      check("QA-087-189 reviewer sees exact submitted FFF snapshot", JSON.stringify(reviewerFff.map((item) => item.value)) === JSON.stringify(["no_impact", "suspected_impact", "confirmed_impact"]) && reviewerFff.every((item) => item.disabled) && reviewerReplacement === "A0002-P02", JSON.stringify({ reviewerFff, reviewerReplacement }));
      await completeFunctionalCase(reviewer, "QA-087-189", {
        assertionIds: ["QA-087-189:THREE_FFF_VALUES_PERSIST_TO_EXACT_REVIEW_SNAPSHOT"],
        actions: ["select three distinct FFF values", "enter reason and note", "submit through rendered UI", "open exact reviewer snapshot"],
        apiReadback: { reviewerFff, reviewerReplacement },
        dbReadback: (() => { const database = new Database(fixtureDb, { readonly: true, fileMustExist: true }); try { return { work: database.prepare("SELECT id, proposed_payload, row_version FROM drawing_revision_works WHERE id=?").get(functionalWorkId), request: database.prepare("SELECT id, request_status, snapshot_hash FROM pdm_work_review_requests WHERE work_id=?").get(functionalWorkId) }; } finally { database.close(); } })(),
        mutationLedger: [{ route: `/drawing-revision-works/${functionalWorkId}/submit`, status: submitResponse.status() }]
      });
      check("QA-087-211 reviewer work-file set is readonly", await reviewer.locator(".dev079-workspace-file-upload").count() === 0 && await reviewer.locator(".dev079-workspace-file-list a[download]").count() >= 2);
      await completeFunctionalCase(reviewer, "QA-087-211", {
        assertionIds: ["QA-087-211:MULTI_FILE_TERMINALS_AND_REVIEWER_READONLY"],
        actions: ["select two files in one rendered input", "upload and observe two per-file success terminals", "submit", "open same file set as reviewer"],
        apiReadback: { successfulUploadRows, reviewerDownloadCount: await reviewer.locator(".dev079-workspace-file-list a[download]").count() },
        dbReadback: (() => { const database = new Database(fixtureDb, { readonly: true, fileMustExist: true }); try { return database.prepare("SELECT work_id, COUNT(*) AS count, MIN(ordinal) AS first_ordinal, MAX(ordinal) AS last_ordinal FROM drawing_revision_work_files WHERE work_id=? GROUP BY work_id").all(functionalWorkId); } finally { database.close(); } })()
      });
      await completeFunctionalCase(reviewer, "QA-087-191", {
        assertionIds: ["QA-087-191:SINGLE_CANONICAL_WRITER_AND_REVIEW_AUTHORITY"],
        actions: ["submit canonical Drawing work", "open the sole canonical reviewer action"],
        apiReadback: reviewerProjection,
        dbReadback: (() => { const database = new Database(fixtureDb, { readonly: true, fileMustExist: true }); try { return { works: database.prepare("SELECT id, row_version FROM drawing_revision_works WHERE id=?").all(functionalWorkId), requests: database.prepare("SELECT id, work_id, request_status FROM pdm_work_review_requests WHERE work_id=?").all(functionalWorkId) }; } finally { database.close(); } })()
      });
      const returnResponsePromise = reviewer.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/decisions"), { timeout: 30_000 });
      await reviewer.getByRole("button", { name: "退回修改", exact: true }).click();
      const returnResponse = await returnResponsePromise;
      check("QA-087-192 reviewer return succeeds through rendered UI", returnResponse.status() === 200);
      await reviewer.close();
      await reviewerContext.close();
      await drawing.reload({ waitUntil: "domcontentloaded" });
      await drawing.getByRole("heading", { name: "圖號工作台", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
      await drawing.waitForFunction(() => document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false", null, { timeout: 30_000 });
      const correctionRow = drawing.locator("[data-canonical-workbench-row='true']").filter({ hasText: "研發版 1.2" }).first();
      await correctionRow.locator(".canonical-row-open").click();
      await drawing.getByRole("button", { name: "進行編輯", exact: true }).click();
      await drawing.locator('[data-workspace-kind="drawing-revision-work"]').waitFor({ state: "visible", timeout: 30_000 });
      const correctionFff = await drawing.locator(".canonical-fff-grid select[data-fff-axis]").evaluateAll((nodes) => nodes.map((node) => node.value));
      check("QA-087-192 returned owner work preserves exact FFF snapshot", JSON.stringify(correctionFff) === JSON.stringify(["no_impact", "suspected_impact", "confirmed_impact"]) && await drawing.getByLabel("替代料號", { exact: true }).inputValue() === "A0002-P02", JSON.stringify(correctionFff));
      await completeFunctionalCase(drawing, "QA-087-192", {
        assertionIds: ["QA-087-192:RETURN_PRESERVES_EXACT_SUBMIT_SNAPSHOT"],
        actions: ["reviewer clicks 退回修改", "owner reopens returned work", "compare exact FFF and replacement snapshot"],
        apiReadback: { submitStatus: submitResponse.status(), returnStatus: returnResponse.status() },
        dbReadback: (() => { const database = new Database(fixtureDb, { readonly: true, fileMustExist: true }); try { return database.prepare("SELECT id, proposed_payload, row_version FROM drawing_revision_works WHERE id=?").get(functionalWorkId); } finally { database.close(); } })(),
        mutationLedger: [{ route: `/drawing-revision-works/${functionalWorkId}/submit`, status: submitResponse.status() }, { route: "/review-requests/:id/decisions", status: returnResponse.status() }]
      });
      drawing.once("dialog", (dialog) => dialog.accept());
      await drawing.getByRole("button", { name: "取消本次工作", exact: true }).click();
      await drawing.getByRole("heading", { name: "圖號工作台", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
      await drawing.waitForFunction(() => document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false", null, { timeout: 30_000 });
      const layerFilter = drawing.locator(".pdm-workbench-multi-select-filter").first();
      await layerFilter.getByRole("button").click();
      const layerDialog = drawing.getByRole("dialog", { name: "版本篩選" });
      await layerDialog.locator("label").filter({ hasText: "全部" }).click();
      await layerDialog.locator("label").filter({ hasText: "研發版" }).click();
      await layerDialog.getByRole("button", { name: "確定", exact: true }).click();
      await drawing.waitForFunction(() => {
        const layers = [...document.querySelectorAll(".canonical-layer")].map((element) => element.textContent?.trim() ?? "");
        return new URL(window.location.href).searchParams.get("layer") === "rd"
          && document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false"
          && layers.length > 0
          && layers.every((label) => label.includes("研發版"));
      }, null, { timeout: 30_000 });
      const filtered = await drawing.locator(".canonical-layer").allTextContents();
      check("drawing layer filter applies directly", filtered.length > 0 && filtered.every((label) => label.includes("研發版")), JSON.stringify(filtered));
      await drawing.getByRole("button", { name: /編號/u }).click();
      await drawing.waitForFunction(() => new URL(window.location.href).searchParams.get("sort") === "desc" && document.querySelector(".canonical-table-wrap th")?.getAttribute("aria-sort") === "descending", null, { timeout: 30_000 });
      const drawingDiscoveryApi = await drawing.evaluate(async () => {
        const params = new URLSearchParams(window.location.search);
        params.set("limit", "100");
        const response = await fetch(`/api/numbering/drawings/workbench?${params.toString()}`, { cache: "no-store" });
        return { status: response.status, body: await response.json(), url: window.location.href };
      });
      check("QA-087-214 Drawing search filter and sort are reflected in URL and API", drawingDiscoveryApi.status === 200 && new URL(drawing.url()).searchParams.get("layer") === "rd" && new URL(drawing.url()).searchParams.get("sortBy") === null && new URL(drawing.url()).searchParams.get("sort") === "desc", JSON.stringify(drawingDiscoveryApi));
      await completeFunctionalCase(drawing, "QA-087-214", {
        assertionIds: ["QA-087-214:DRAWING_SEARCH_FILTER_SORT_PRECEDE_PAGE"],
        actions: ["search exact Drawing identity", "apply rendered RD layer filter", "toggle 編號 sort"],
        apiReadback: drawingDiscoveryApi,
        dbReadback: (() => { const database = new Database(fixtureDb, { readonly: true, fileMustExist: true }); try { return database.prepare("SELECT drawing_number, purpose_code FROM drawings WHERE drawing_number='A0002-M01' ORDER BY drawing_number").all(); } finally { database.close(); } })()
      });
    }
    await drawing.close();
    if (viewport.name === "desktop") {
      const part = await openWorkbench(context, "/parts?query=A000", "料號工作台"); await verifyWorkbench(part, "part/desktop");
      check("part formal row has no revision", (await part.locator(".canonical-layer").allTextContents()).some((label) => label.trim() === "正式資料"));
      await verifyWorkbenchInteractions(part, { name: "part/desktop", storageKey: "pdm-part-detail-drawer-width", detailEndpoint: "/api/parts/workbench", screenshot: "part-interactions-desktop" });
      await part.getByLabel("搜尋", { exact: true }).fill("A0002-P02");
      await part.getByLabel("材質", { exact: true }).fill("SUS 304");
      await part.getByLabel("顏色", { exact: true }).fill("Black");
      await part.waitForFunction(() => {
        const params = new URL(window.location.href).searchParams;
        const rows = [...document.querySelectorAll(".canonical-table-wrap tbody tr")];
        return params.get("query") === "A0002-P02"
          && params.get("material") === "SUS 304"
          && params.get("color") === "Black"
          && document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false"
          && rows.length === 1
          && rows[0]?.textContent?.includes("A0002-P02");
      }, null, { timeout: 30_000 });
      await part.getByRole("button", { name: /編號/u }).click();
      await part.waitForFunction(() => new URL(window.location.href).searchParams.get("sort") === "desc" && document.querySelector(".canonical-table-wrap th")?.getAttribute("aria-sort") === "descending", null, { timeout: 30_000 });
      const partDiscoveryRows = await part.locator(".canonical-table-wrap tbody tr").allTextContents();
      const partDiscoveryApi = await part.evaluate(async () => {
        const params = new URLSearchParams(window.location.search);
        params.set("limit", "100");
        const response = await fetch(`/api/parts/workbench?${params.toString()}`, { cache: "no-store" });
        return { status: response.status, body: await response.json(), url: window.location.href };
      });
      check("QA-087-215 Part search material color and sort match exact fixture", partDiscoveryApi.status === 200 && new URL(part.url()).searchParams.get("sortBy") === null && new URL(part.url()).searchParams.get("sort") === "desc" && partDiscoveryRows.length === 1 && partDiscoveryRows[0].includes("A0002-P02"), JSON.stringify({ partDiscoveryRows, partDiscoveryApi }));
      await completeFunctionalCase(part, "QA-087-215", {
        assertionIds: ["QA-087-215:PART_SEARCH_MATERIAL_COLOR_SORT_MATCH_DB"],
        actions: ["search A0002-P02", "filter 材質 SUS 304", "filter 顏色 Black", "toggle 編號 sort"],
        apiReadback: partDiscoveryApi,
        dbReadback: (() => { const database = new Database(fixtureDb, { readonly: true, fileMustExist: true }); try { return database.prepare(`SELECT part.part_number, part.item_kind, part.series_code, variant.material_label, variant.color_label FROM part_numbers part LEFT JOIN part_variant_attributes variant ON variant.part_number_id=part.id WHERE part.part_number='A0002-P02'`).get(); } finally { database.close(); } })()
      });
      await part.screenshot({ path: path.join(screenshotDir, "part-desktop.png"), fullPage: true, caret: "initial" }); await part.close();
      const pagination = await openWorkbench(context, "/parts", "料號工作台");
      const firstPageIds = await pagination.locator(".canonical-row-open").allTextContents();
      const nextButton = pagination.getByRole("button", { name: "下一頁", exact: true });
      check("QA-087-216 seeded browser fixture exposes real next cursor", await nextButton.count() === 1 && await nextButton.isEnabled(), String(firstPageIds.length));
      await nextButton.click();
      await pagination.getByText("第 2 頁", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
      await pagination.waitForFunction(() => document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false", null, { timeout: 30_000 });
      const secondPageIds = await pagination.locator(".canonical-row-open").allTextContents();
      const previousButton = pagination.getByRole("button", { name: "上一頁", exact: true });
      await previousButton.click();
      await pagination.getByText("第 1 頁", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
      await pagination.waitForFunction(() => document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false", null, { timeout: 30_000 });
      const returnedFirstPageIds = await pagination.locator(".canonical-row-open").allTextContents();
      check("QA-087-216 forward and backward cursor have no gap duplicate or identity drift", secondPageIds.length > 0 && firstPageIds.every((id) => !secondPageIds.includes(id)) && JSON.stringify(firstPageIds) === JSON.stringify(returnedFirstPageIds), JSON.stringify({ firstPageIds, secondPageIds, returnedFirstPageIds }));
      const paginationApi = await pagination.evaluate(async () => {
        const response = await fetch("/api/parts/workbench?limit=100", { cache: "no-store" });
        return { status: response.status, body: await response.json(), url: window.location.href };
      });
      await completeFunctionalCase(pagination, "QA-087-216", {
        assertionIds: ["QA-087-216:FORWARD_BACK_CURSOR_NO_GAP_DUPLICATE"],
        actions: ["open first 100-group page", "click 下一頁", "capture identities", "click 上一頁", "compare exact first page identities"],
        apiReadback: paginationApi,
        dbReadback: (() => { const database = new Database(fixtureDb, { readonly: true, fileMustExist: true }); try { return { formalPartCount: database.prepare("SELECT COUNT(*) AS count FROM canonical_workbench_states WHERE entity_type='part' AND data_layer='part_formal'").get().count, firstPageIds, secondPageIds }; } finally { database.close(); } })()
      });
      await pagination.close();
      const relation = await context.newPage(); monitor(relation, "編號搜尋");
      await relation.goto(`${baseUrl}/numbering/search?query=A000`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await relation.getByRole("heading", { name: "編號搜尋", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
      await relation.locator(".canonical-list").waitFor({ state: "visible", timeout: 30_000 });
      await relation.waitForFunction(() => document.querySelector(".canonical-list tbody")?.textContent?.includes("A0002"), null, { timeout: 30_000 });
      const relationHeaders = await relation.locator(".canonical-list thead th").allTextContents();
      check("編號搜尋 four-column identity list", JSON.stringify(relationHeaders.map((item) => item.trim())) === JSON.stringify(["編號", "品名", "圖料根號", "資料狀態"]), JSON.stringify(relationHeaders));
      await relation.locator(".canonical-toolbar input").fill("A0002");
      await relation.waitForFunction(() => !document.querySelector(".numbering-identity-search p[role='status']")
        && document.querySelector(".canonical-list tbody")?.textContent?.includes("A0002-M01")
        && document.querySelector(".canonical-list tbody")?.textContent?.includes("A0002-P01")
        && !document.querySelector(".canonical-list tbody")?.textContent?.includes("A0003"), null, { timeout: 30_000 });
      const narrowedIdentityText = await relation.locator(".canonical-list tbody").innerText();
      check("編號搜尋 exposes A0002 drawing and part identities", narrowedIdentityText.includes("A0002-M01") && narrowedIdentityText.includes("A0002-P01"), narrowedIdentityText);
      check("編號搜尋 query narrows to A0002", !narrowedIdentityText.includes("A0003"));
      await relation.screenshot({ path: path.join(screenshotDir, "numbering-search-desktop.png"), fullPage: true, caret: "initial" }); await relation.close();
      const retired = await openWorkbench(context, "/numbering/drawings?query=A0002-M01&view=all", "圖號工作台", true);
      check("retired query is explicit", await retired.getByRole("alert").getByText("此篩選網址已失效", { exact: true }).count() === 1);
      await retired.close();
      await verifyRetiredTaskCenter(context);
    }
    await context.close();
  }
  const matrixContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(matrixContext);
  if (!formalFocus) await verifyInlineMatrixCases(matrixContext);
  await verifyFormalObsoleteDecision(matrixContext, { caseId: "QA-087-198", entityType: "drawing", code: "A0002-M01", route: "/numbering/drawings?query=A0002-M01", heading: "圖號工作台", decision: "rejected" });
  await verifyFormalObsoleteDecision(matrixContext, { caseId: "QA-087-200", entityType: "part", code: "A0002-P01", route: "/parts?query=A0002-P01", heading: "料號工作台", decision: "rejected" });
  await verifyFormalObsoleteDecision(matrixContext, { caseId: "QA-087-201", entityType: "part", code: "A0002-P01", route: "/parts?query=A0002-P01", heading: "料號工作台", decision: "approved" });
  await verifyFormalObsoleteDecision(matrixContext, { caseId: "QA-087-199", entityType: "drawing", code: "A0002-M01", route: "/numbering/drawings?query=A0002-M01", heading: "圖號工作台", decision: "approved" });
  await matrixContext.close();
  const expectedFunctionalCaseIds = [
    ...Array.from({ length: 7 }, (_, index) => `QA-087-${187 + index}`),
    ...Array.from({ length: 4 }, (_, index) => `QA-087-${198 + index}`),
    ...Array.from({ length: 3 }, (_, index) => `QA-087-${203 + index}`),
    ...Array.from({ length: 11 }, (_, index) => `QA-087-${207 + index}`)
  ];
  const actualFunctionalCaseIds = functionalCaseReceipts.map((item) => item.caseId).sort();
  check("functional browser emits exact 25-case roster once", JSON.stringify(actualFunctionalCaseIds) === JSON.stringify([...expectedFunctionalCaseIds].sort()), JSON.stringify({ expectedFunctionalCaseIds, actualFunctionalCaseIds }));
  const cleanupEvidence = new Database(fixtureDb, { readonly: true });
  check("cancelled editor leaves no orphan recognition session", cleanupEvidence.prepare(`SELECT COUNT(*) AS count FROM drawing_recognition_sessions session WHERE session.source_context_type = 'drawing_revision' AND NOT EXISTS (SELECT 1 FROM drawing_revisions revision WHERE revision.id = session.source_context_id)`).get().count === 0);
  check("cancelled editor releases target revision claim", cleanupEvidence.prepare(`SELECT COUNT(*) AS count FROM drawing_revision_claims claim JOIN drawings drawing ON drawing.id = claim.drawing_id WHERE drawing.drawing_number = 'A0002-M01' AND claim.target_label = '1.2'`).get().count === 0);
  cleanupEvidence.close();
  check("browser has no console errors", consoleErrors.length === 0, JSON.stringify(consoleErrors));
  check("browser has no page/network failures", failures.length === 0, JSON.stringify(failures));
} catch (error) {
  checks.push({ name: "browser execution", pass: false, detail: error instanceof Error ? (error.stack ?? error.message) : String(error) });
} finally {
  try { await browser?.close(); } catch {}
  try { await stopNextApp(app?.child); } catch {}
  if (port) {
    const probe = await fetch(`http://127.0.0.1:${port}`).then(() => false).catch(() => true);
    checks.push({ name: "temporary runtime port released", pass: probe, detail: `port=${port}` });
  }
  const runtimeCleanup = runtimeDistDir
    ? removeTaskOwnedWorkspaceTempDir(root, runtimeDistDir)
    : { removed: true, path: null, notCreated: true, error: null };
  checks.push({ name: "temporary runtime dist removed", pass: runtimeCleanup.removed, detail: JSON.stringify(runtimeCleanup) });
  if (originalNextEnvContent !== null) {
    try {
      await writeNextEnvWithRetry(originalNextEnvContent);
      checks.push({ name: "next-env restored after task runtime", pass: fs.readFileSync(nextEnvPath, "utf8") === originalNextEnvContent, detail: nextEnvPath });
    } catch (error) {
      checks.push({ name: "next-env restored after task runtime", pass: false, detail: error instanceof Error ? error.message : String(error) });
    }
  }
  try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch {}
  try {
    primaryAfter = readInvariantSnapshot();
    checks.push({ name: "primary source invariant unchanged after runtime", pass: invariantSnapshotIsSafe(primaryAfter) && safeJson(primaryAfter) === safeJson(primaryBefore), detail: safeJson({ primaryBefore, primaryAfter }) });
  } catch (error) {
    checks.push({ name: "primary source invariant unchanged after runtime", pass: false, detail: error instanceof Error ? error.message : String(error) });
  }
}

const failed = checks.filter((item) => !item.pass);
const manifest = { devId: "DEV-087", runId, parentRunId, status: failed.length ? "FAIL" : "PASS", port, outputDir, sourceInvariantCheckedBeforeMutation, primaryInvariant: { before: primaryBefore, after: primaryAfter, unchanged: safeJson(primaryBefore) === safeJson(primaryAfter) }, fixtureMutationLedger, caseReceipts, functionalCaseReceipts, matrixMutationRequests, total: checks.length, passed: checks.length - failed.length, failed: failed.length, checks, consoleErrors, failures };
fs.mkdirSync(outputDir, { recursive: true }); fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest, null, 2));
console.log(`DEV087_BROWSER_MANIFEST=${path.join(outputDir, "manifest.json")}`);
if (failed.length) process.exitCode = 1;
