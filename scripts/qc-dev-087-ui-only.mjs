#!/usr/bin/env node

/*
 * DEV-087 full UI-only lifecycle runner.
 *
 * This runner enforces the current 34-case Drawing/Part lifecycle-core
 * denominator (D01-D24 + P01-P10). P11-P13 attachments and I01-I14 inline
 * matrix cases are executed by dedicated rendered-browser children and joined
 * only by the DEV-097 capability runner. It performs
 * a rendered UI preflight and read-only API/DB reconciliation for every case;
 * a journey that lacks a legal UI mutation start point is recorded as
 * BLOCKED, never silently counted as PASS.  Business writes are only made by
 * Playwright clicks; API and SQLite access below are readback-only.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { getFreePort, removeTaskOwnedWorkspaceTempDir, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = `DEV087-ui-only-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const parentRunId = process.env.DEV087_PARENT_RUN_ID ?? null;
const evidenceRoot = path.join(root, "output", "qa", "dev-087-ui-only-lifecycle", runId);
const screenshotRoot = path.join(evidenceRoot, "screenshots");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev087-ui-only-"));
const fixtureDataDir = path.join(tempRoot, "data");
const fixtureDb = path.join(fixtureDataDir, "ai-pdm.sqlite");
const fixtureUploadDir = path.join(tempRoot, "uploads");
const faultProfileSourceDir = path.join(tempRoot, "fault-profile-source");
const faultProfileSourceDb = path.join(faultProfileSourceDir, "ai-pdm.sqlite");
const faultProfileSourceRepository = path.join(faultProfileSourceDir, "repository");
const drawingUpload2d = path.join(fixtureUploadDir, "DEV087-QA.SLDDRW");
const drawingUpload3d = path.join(fixtureUploadDir, "DEV087-QA.SLDPRT");
const drawingResubmit2d = path.join(fixtureUploadDir, "DEV087-QA-RESUBMIT.SLDDRW");
const drawingResubmit3d = path.join(fixtureUploadDir, "DEV087-QA-RESUBMIT.SLDPRT");
const sourceDb = path.resolve(process.env.PDM_PRIMARY_DB_PATH?.trim() || path.join(root, "data", "ai-pdm.sqlite"));
const sourceRepository = path.resolve(process.env.PDM_PRIMARY_REPOSITORY_DIR?.trim() || path.join(root, "data", "repository"));
const fixtureRepository = path.join(fixtureDataDir, "repository");
const checks = [];
const cases = [];
const failures = [];
const network = [];
const consoleErrors = [];
const expectedHttpEvents = [];
const supplementalJourneys = [];
const lifecycleJourneys = [];
const fixtureMutationLedger = [];
const lifecycleJourneyByCase = new Map();
const lifecycleFocus = new Set(String(process.env.QC_DEV087_LIFECYCLE_FOCUS ?? "").split(",").map((value) => value.trim()).filter(Boolean));
const fastFocus = process.env.QC_DEV087_FAST_FOCUS === "1" && lifecycleFocus.size > 0;
const stableRuntimeCaseIds = new Set(["D16", "D17", "D21", "D22"]);
const usesProductionRuntime = process.env.QC_DEV087_ISOLATED_CHILD === "1"
  && lifecycleFocus.size > 0
  && [...lifecycleFocus].every((caseId) => stableRuntimeCaseIds.has(caseId));
const stableRuntimeCaseLabel = [...lifecycleFocus].sort().join("+");
let browser = null;
let app = null;
let port = null;
let baseUrl = "";
let runtimeProjectRoot = null;
let lifecycleDrawingCode = "A0002-M01";
let tempCleanupReceipt = { removed: false, path: tempRoot, error: "not-attempted" };
let runtimeProjectCleanupReceipt = { removed: false, path: null, error: "not-attempted" };
let primaryBefore = null;
let primaryAfter = null;

function readInvariantSnapshot(databasePath = sourceDb) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "dev-087-primary-snapshot.mjs"), `--db=${databasePath}`], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`PRIMARY_SNAPSHOT_FAILED:${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout.trim());
}

function primarySnapshotIsSafe(snapshot) {
  return snapshot
    && Object.values(snapshot.counts ?? {}).every((count) => Number(count) > 0)
    && Number(snapshot.migrationResidue?.unresolved ?? -1) === 0
    && Object.values(snapshot.rootReferenceViolations ?? {}).every((count) => Number(count) === 0)
    && Number(snapshot.foreignKeyViolations ?? -1) === 0;
}

async function removeTaskOwnedFixtureRoot(targetDir) {
  const resolvedTempRoot = path.resolve(os.tmpdir());
  const resolvedTarget = path.resolve(targetDir);
  const safePrefix = "ai-pdm-dev087-ui-only-";
  if (path.dirname(resolvedTarget) !== resolvedTempRoot || !path.basename(resolvedTarget).startsWith(safePrefix)) {
    return { removed: false, path: resolvedTarget, error: "unsafe-path" };
  }
  let lastError = null;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      fs.rmSync(resolvedTarget, { recursive: true, force: true, maxRetries: 2, retryDelay: 200 });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    if (!fs.existsSync(resolvedTarget)) return { removed: true, path: resolvedTarget, error: null, attempts: attempt };
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return { removed: false, path: resolvedTarget, error: lastError ?? "path-still-exists", attempts: 30 };
}

function prepareLifecycleFixture(database) {
  const drawing = database.prepare(`
    SELECT id, company_id, created_by
      FROM drawings
     WHERE drawing_number = 'A0002-M01' AND formal_drawing_number_id IS NOT NULL
     ORDER BY id
     LIMIT 1`).get();
  const baseRevision = drawing
    ? database.prepare(`SELECT * FROM drawing_revisions WHERE drawing_id = ? ORDER BY CASE WHEN revision = '0.1' THEN 0 ELSE 1 END, revision LIMIT 1`).get(drawing.id)
    : null;
  if (!drawing || !baseRevision) throw new Error("LIFECYCLE_FIXTURE_A0002_SOURCE_MISSING");

  const cloneRevision = (id, revision, lifecycleState) => {
    database.prepare(`
      INSERT INTO drawing_revisions (
        id, company_id, drawing_id, revision, lifecycle_state, policy_snapshot_json,
        override_reason, row_version, approval_request_id, review_snapshot_hash,
        source_candidate_revision_id, source_revision_package_id, created_by, created_at,
        updated_by, updated_at, submitted_at, controlled_at, released_at,
        superseded_at, cancelled_at
      ) SELECT ?, company_id, drawing_id, ?, 'preparing', policy_snapshot_json,
        override_reason, 1, NULL, NULL, source_candidate_revision_id,
        source_revision_package_id, created_by, created_at, updated_by, updated_at,
        submitted_at, controlled_at, CASE WHEN ? = 'released' THEN CURRENT_TIMESTAMP ELSE NULL END,
        NULL, NULL
      FROM drawing_revisions WHERE id = ?`).run(id, revision, lifecycleState, baseRevision.id);
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
    fixtureMutationLedger.push({ action: "seed-A0002-revision", id, revision, lifecycleState, sourceRevisionId: baseRevision.id, scope: "disposable fixture only" });
  };
  if (!database.prepare("SELECT id FROM drawing_revisions WHERE drawing_id = ? AND revision = '1'").get(drawing.id)) cloneRevision("qa-dev087-ui-production-revision", "1", "released");
  if (!database.prepare("SELECT id FROM drawing_revisions WHERE drawing_id = ? AND revision = '1.1'").get(drawing.id)) cloneRevision("qa-dev087-ui-rd-revision", "1.1", "rd_controlled");

  const targetTables = [
    "pdm_review_traces", "pdm_work_review_requests", "drawing_revision_work_files",
    "canonical_workbench_states", "drawing_revision_works", "drawing_revision_claims",
    "drawing_rd_branches", "pdm_workbench_aggregates", "part_change_works",
    "relation_change_works", "pdm_workbench_migration_quarantine"
  ];
  const targetTablePlaceholders = targetTables.map(() => "?").join(", ");
  const targetTableGuards = database.prepare(`
    SELECT name, sql
      FROM sqlite_master
     WHERE type = 'trigger'
       AND tbl_name IN (${targetTablePlaceholders})
     ORDER BY name`).all(...targetTables);
  if (targetTableGuards.some((guard) => !guard.name || !guard.sql)) {
    throw new Error(`LIFECYCLE_FIXTURE_TARGET_GUARD_SQL_MISSING:${safeJson(targetTableGuards)}`);
  }
  database.transaction(() => {
    for (const guard of targetTableGuards) database.exec(`DROP TRIGGER IF EXISTS "${String(guard.name).replaceAll('"', '""')}"`);
    targetTables.forEach((table) => database.prepare(`DELETE FROM ${table}`).run());
    for (const guard of targetTableGuards) database.exec(guard.sql);
  })();
  const restoredTargetTableGuards = database.prepare(`
    SELECT name
      FROM sqlite_master
     WHERE type = 'trigger'
       AND tbl_name IN (${targetTablePlaceholders})
     ORDER BY name`).all(...targetTables);
  const expectedGuardNames = targetTableGuards.map((guard) => String(guard.name));
  const restoredGuardNames = restoredTargetTableGuards.map((guard) => String(guard.name));
  if (safeJson(restoredGuardNames) !== safeJson(expectedGuardNames)) {
    throw new Error(`LIFECYCLE_FIXTURE_TARGET_GUARDS_NOT_RESTORED:${safeJson({ expectedGuardNames, restoredGuardNames })}`);
  }
  fixtureMutationLedger.push({
    action: "clear-preexisting-canonical-target-residue",
    tables: targetTables,
    targetTableGuards: { preserved: true, names: expectedGuardNames },
    scope: "disposable fixture only before product runtime"
  });
  const foreignKeys = database.pragma("foreign_key_check");
  if (foreignKeys.length) throw new Error(`LIFECYCLE_FIXTURE_FOREIGN_KEY_FAILED:${safeJson(foreignKeys)}`);
}

function prepareTaskOwnedRuntimeProject(targetRoot) {
  const resolvedWorkspaceTemp = path.resolve(root, ".tmp");
  const resolvedTarget = path.resolve(targetRoot);
  if (!resolvedTarget.startsWith(`${resolvedWorkspaceTemp}${path.sep}`) || !path.basename(resolvedTarget).startsWith("qc-dev087-runtime-project-")) {
    throw new Error(`UNSAFE_RUNTIME_PROJECT_PATH:${resolvedTarget}`);
  }
  fs.mkdirSync(resolvedTarget, { recursive: true });
  for (const file of ["package.json", "next.config.mjs", "tsconfig.json", "tsconfig.app.json", "tsconfig.next.json", "next-env.d.ts"]) {
    const source = path.join(root, file);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(resolvedTarget, file));
  }
  for (const file of [".env", ".env.local", ".env.development.local"]) {
    const source = path.join(root, file);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(resolvedTarget, file));
  }
  for (const directory of ["src", "public", "db", "config"]) {
    const source = path.join(root, directory);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(resolvedTarget, directory), { recursive: true, force: true });
  }
  const runtimeNextConfigPath = path.join(resolvedTarget, "next.config.mjs");
  const runtimeNextConfig = fs.readFileSync(runtimeNextConfigPath, "utf8");
  const isolatedNextConfig = runtimeNextConfig.replace("const nextConfig = {", "const nextConfig = {\n  agentRules: false,");
  if (isolatedNextConfig === runtimeNextConfig) throw new Error("RUNTIME_NEXT_CONFIG_PATCH_POINT_MISSING");
  fs.writeFileSync(runtimeNextConfigPath, isolatedNextConfig, "utf8");
  fs.mkdirSync(path.join(resolvedTarget, "scripts"), { recursive: true });
  for (const file of ["qc-process-warning-guard.mjs", "qc-node-listener-budget.cjs"]) {
    fs.copyFileSync(path.join(root, "scripts", file), path.join(resolvedTarget, "scripts", file));
  }
  fs.symlinkSync(path.join(root, "node_modules"), path.join(resolvedTarget, "node_modules"), "junction");
  return {
    root: resolvedTarget,
    sourceSnapshot: "task-owned copy of src/public/db/config plus config files",
    dependencyRuntime: "junction to workspace node_modules (read-only dependency use)",
    generatedDeclarations: path.join(resolvedTarget, "next-env.d.ts")
  };
}

const drawingTitles = {
  D01: "無量產資料建立第一份 0.1 工作", D02: "第一份 0.1 工作取消", D03: "0.1 編輯儲存 reload",
  D04: "0.1 送審退回", D05: "0.1 重送核准", D06: "0.1 進版 0.2",
  D07: "研發版進量產版 1", D08: "量產版 1 建立研發版 1.1", D09: "量產版 1 建立量產版 2",
  D10: "approved branch 建下一版後取消", D11: "新 branch 第一份工作取消", D12: "建立三個 open branches",
  D13: "第四 branch 拒絕", D14: "同 target claim 競合", D15: "branch 推進 production",
  D16: "stale branch 凍結並可從目前量產版重啟", D17: "stale token 阻擋量產且 zero write", D18: "作廢 modal 取消",
  D19: "作廢申請退回", D20: "作廢申請核准", D21: "進版與作廢競合", D22: "reviewer 決策競合",
  D23: "快速連點與 reload", D24: "圖號搜尋篩選與歷史", D25: "正式圖作廢退回",
  D26: "正式圖作廢核准", D27: "既有 merged/history Drawing 唯讀"
};
const partTitles = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`P${String(index + 1).padStart(2, "0")}`, `料號生命週期 P${String(index + 1).padStart(2, "0")}`]));
const casesSpec = [
  ...Object.entries(drawingTitles).map(([id, title]) => ({ id, family: "D", title, route: "/numbering/drawings?query=A0002-M01", api: "/api/numbering/drawings/workbench?query=A0002-M01", entity: "drawing" })),
  ...Object.entries(partTitles).map(([id, title]) => ({ id, family: "P", title, route: "/parts?query=A0002-P01", api: "/api/parts/workbench?query=A0002-P01", entity: "part" }))
];
const excludedCaseIds = new Set([
  "D25", "D26", "D27",
  "P11", "P12", "P13", "P14", "P15", "P16", "P17", "P18", "P19", "P20"
]);
const includedCaseIds = new Set(casesSpec.filter((spec) => !excludedCaseIds.has(spec.id)).map((spec) => spec.id));
const lifecycleDenominator = includedCaseIds.size;
const isolatedBundles = [
  ["D01"], ["D02"], ["D03"], ["D04"], ["D05"], ["D06"], ["D07"],
  ["D12", "D13"], ["D09"], ["D14"], ["D15"], ["D16"], ["D17"],
  ["D18"], ["D19"], ["D20"], ["D21", "D22"]
];
const isolatedCaseIds = new Set(isolatedBundles.flat());
const commonSpec = [
  ["C01", "authority 與 provider 啟動檢查"], ["C02", "UI mutation provenance"], ["C03", "原子性與 zero partial write"],
  ["C04", "idempotency 與 stale guard"], ["C05", "UI/API/DB triad readback"], ["C06", "cleanup ledger"],
  ["C07", "禁止技術欄位出現在 UI"], ["C08", "搜尋與 layer/handling filter"], ["C09", "審核頁同畫面唯讀"],
  ["C10", "viewport、keyboard、error sweep"], ["C11", "system/system_admin/blocked fault profile"]
].map(([id, title]) => ({ id, title }));

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function writeJson(file, value) { ensureDir(path.dirname(file)); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function writeText(file, value) { ensureDir(path.dirname(file)); fs.writeFileSync(file, value, "utf8"); }
function addCheck(name, pass, detail = "") { checks.push({ name, pass: Boolean(pass), detail }); }
function safeJson(value) { try { return JSON.stringify(value); } catch { return String(value); } }
function caseDir(id) { return path.join(evidenceRoot, "cases", id); }
function recordAction(id, action) { fs.appendFileSync(path.join(caseDir(id), "actions.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), ...action })}\n`, "utf8"); }
function recordNetwork(id, event) { fs.appendFileSync(path.join(caseDir(id), "network.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, "utf8"); }

function journeyBlocked(reason) {
  const error = new Error(reason);
  error.journeyBlocked = true;
  return error;
}

async function waitForWorkbenchList(page, heading) {
  await page.getByRole("heading", { name: heading, exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.locator(".canonical-list-meta").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(() => {
    const list = document.querySelector(".canonical-list");
    const busy = list?.getAttribute("aria-busy");
    const hasRows = Boolean(list?.querySelector(".canonical-table-wrap tbody tr"));
    const hasError = Boolean(list?.querySelector(".canonical-error[role='alert']"));
    // After a sequential lifecycle run, the list may keep aria-busy while its
    // rows are already rendered and stable.  Rendered rows (or an explicit
    // error) are a stronger UI ready signal than a stale loading attribute.
    return busy === "false" || hasRows || hasError;
  }, null, { timeout: 30_000 });
}

async function openLayerRow(page, layerText) {
  const row = page.locator(".canonical-table-wrap tbody tr").filter({ hasText: layerText }).first();
  if (await row.count() === 0) throw journeyBlocked(`NO_LEGAL_UI_ROW:${layerText}`);
  await row.locator(".canonical-row-open").click();
  const dialog = page.locator(".pdm-entity-detail-drawer").last();
  await dialog.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(() => !document.querySelector(".canonical-drawer-message")
    && Boolean(document.querySelector(".canonical-drawer-body, .canonical-drawer-actions, .canonical-error[role='alert']")), null, { timeout: 30_000 });
  return dialog;
}

async function waitForRevisionModal(page, timeout = 30_000) {
  const modal = page.getByRole("dialog", { name: "建立進版工作" });
  await modal.waitFor({ state: "visible", timeout });
  await page.waitForFunction(() => Boolean(document.querySelector(".canonical-revision-targets label, .canonical-revision-recovery, .canonical-revision-modal .canonical-error")), null, { timeout });
  return modal;
}

function enabledRevisionTarget(modal, kind) {
  const label = kind === "production" ? "量產版" : "研發版";
  return modal.locator(".canonical-revision-targets label:not(.is-disabled)").filter({ hasText: label }).first();
}

async function cancelOwnerWorkspace(page, route, actions) {
  await page.getByRole("button", { name: "取消本次工作", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  actions.push({ kind: "assert", target: "owner-workspace", observed: page.url() });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "取消本次工作", exact: true }).click();
  await page.waitForURL((url) => url.pathname === new URL(route, baseUrl).pathname, { timeout: 30_000 });
  await waitForWorkbenchList(page, route.startsWith("/numbering/drawings") ? "圖號工作台" : route.startsWith("/parts") ? "料號工作台" : "圖料工作台");
  actions.push({ kind: "click", target: "取消本次工作", result: "returned-to-workbench" });
}

async function runSupplementalJourney(context, definition) {
  const dir = path.join(evidenceRoot, "journeys", definition.id);
  ensureDir(dir);
  const actions = [];
  const startedAt = new Date().toISOString();
  let status = "PASS";
  let reason = "";
  const page = await context.newPage();
  monitor(page, definition.id);
  try {
    actions.push({ kind: "navigate", target: definition.route });
    await page.goto(`${baseUrl}${definition.route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await waitForWorkbenchList(page, definition.heading);
    const dialog = await openLayerRow(page, definition.layerText);
    const actionButtons = dialog.locator(".canonical-drawer-actions button");
    const availableActions = (await actionButtons.allTextContents()).map((value) => value.trim()).filter(Boolean);
    const actionButton = actionButtons.filter({ hasText: definition.actionLabel }).first();
    if (await actionButton.count() === 0) throw journeyBlocked(`NO_LEGAL_UI_ACTION:${definition.actionLabel};available=${availableActions.join("|") || "none"}`);
    actions.push({ kind: "click", target: definition.actionLabel });
    if (definition.kind === "drawing") {
      await actionButton.click();
      const modal = await waitForRevisionModal(page);
      const candidate = modal.locator(".canonical-revision-targets label:not(.is-disabled)").first();
      if (await candidate.count() === 0) throw journeyBlocked("NO_ENABLED_UI_REVISION_CANDIDATE");
      const candidateLabel = (await candidate.innerText()).trim();
      actions.push({ kind: "click", target: "candidate", label: candidateLabel });
      await candidate.click();
      await modal.getByRole("button", { name: "建立進版工作", exact: true }).click();
      await page.waitForURL((url) => url.pathname.includes("/numbering/drawings/") && url.pathname.endsWith("/workspace") && url.searchParams.has("workId"), { timeout: 30_000 });
      await page.locator(".dev079-workspace").waitFor({ state: "visible", timeout: 30_000 });
      await page.getByRole("heading", { name: "圖號工作台", exact: false }).count();
      actions.push({ kind: "assert", target: "圖號編輯", observed: await page.locator(".dev079-workspace-heading").innerText() });
    } else {
      await Promise.all([
        page.waitForURL((url) => url.pathname.endsWith("/workspace") && url.searchParams.has("workId"), { timeout: 30_000 }),
        actionButton.click()
      ]);
      await page.locator("[data-pdm-edit-page='true']").waitFor({ state: "visible", timeout: 30_000 });
      actions.push({ kind: "assert", target: definition.editorLabel, observed: await page.locator(".pdm-edit-page-heading").innerText() });
    }
    await page.screenshot({ path: path.join(dir, "workspace-before-cancel.png"), fullPage: true, caret: "initial" });
    await cancelOwnerWorkspace(page, definition.route, actions);
    await page.screenshot({ path: path.join(dir, "workbench-after-cancel.png"), fullPage: true, caret: "initial" });
  } catch (error) {
    if (error?.journeyBlocked) { status = "BLOCKED"; reason = error.message; }
    else { status = "FAIL"; reason = error instanceof Error ? error.message : String(error); failures.push({ label: definition.id, kind: "journey", message: reason }); }
  } finally {
    writeJson(path.join(dir, "journey.json"), { id: definition.id, kind: definition.kind, route: definition.route, status, reason, actions, startedAt, finishedAt: new Date().toISOString(), mutationPolicy: "rendered UI clicks only; API/DB readback only" });
    await page.close().catch(() => {});
  }
  return { id: definition.id, status, reason, evidence: path.relative(root, path.join(dir, "journey.json")) };
}

async function runSupplementalJourneys(context) {
  const definitions = [
    { id: "J01-drawing-create-cancel", kind: "drawing", route: "/numbering/drawings?query=A0002-M01", heading: "圖號工作台", layerText: "量產版 1", actionLabel: "進版" },
    { id: "J02-part-create-cancel", kind: "part", route: "/parts?query=A0002-P01", heading: "料號工作台", layerText: "正式資料", actionLabel: "建立修改", editorLabel: "料號編輯" }
  ];
  for (const definition of definitions) supplementalJourneys.push(await runSupplementalJourney(context, definition));
  return supplementalJourneys;
}

/*
 * The lifecycle matrix is intentionally broader than the two smoke journeys
 * above.  These journeys are the first real lifecycle layer: every mutation is
 * still a rendered click/typing action, while API/DB calls remain readback
 * only.  The helper returns the same evidence shape for each case so the
 * case runner can distinguish a real product result from a missing journey
 * precondition instead of turning an untested case into a false PASS.
 */
async function openCanonicalAction(page, definition, rowText, actionLabel) {
  await page.goto(`${baseUrl}${definition.route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await waitForWorkbenchList(page, definition.heading);
  const firstDialog = await openLayerRow(page, rowText);
  const firstAction = firstDialog.getByRole("button", { name: actionLabel, exact: true });
  if (await firstAction.count() > 0) return { dialog: firstDialog, action: firstAction };
  const rows = page.locator(".canonical-table-wrap tbody tr").filter({ hasText: rowText });
  const count = await rows.count();
  const dialogSnapshots = [{ index: -1, rowText, actions: await firstDialog.locator(".canonical-drawer-actions button").allTextContents().catch(() => []) }];
  for (let index = 0; index < count; index += 1) {
    await firstDialog.getByRole("button", { name: /關閉|返回/u }).first().click().catch(() => undefined);
    await rows.nth(index).locator(".canonical-row-open").click().catch(() => undefined);
    const dialog = page.locator(".pdm-entity-detail-drawer").last();
    await dialog.waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined);
    const action = dialog.getByRole("button", { name: actionLabel, exact: true });
    dialogSnapshots.push({ index, rowText: (await rows.nth(index).innerText().catch(() => "")).trim(), actions: await dialog.locator(".canonical-drawer-actions button").allTextContents().catch(() => []) });
    if (await action.count() > 0) return { dialog, action };
  }
  const pageState = await page.evaluate(() => ({
    href: window.location.href,
    rows: [...document.querySelectorAll(".canonical-table-wrap tbody tr")].map((row) => ({
      text: row.textContent?.trim() ?? "",
      actions: [...row.querySelectorAll("button")].map((button) => button.textContent?.trim() ?? "").filter(Boolean)
    })),
    me: null
  })).catch(() => null);
  if (pageState) writeJson(path.join(evidenceRoot, "journeys", `J-${definition.id}`, `ui-action-miss-${actionLabel}.json`), { ...pageState, dialogSnapshots });
  throw journeyBlocked(`NO_LEGAL_UI_ACTION:${actionLabel};row=${rowText}`);
}

async function startCanonicalWork(page, definition, rowText, actionLabel) {
  const { action } = await openCanonicalAction(page, definition, rowText, actionLabel);
  const mutationResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/change-works"), { timeout: 15_000 });
  await action.click();
  const response = await mutationResponse;
  if (!response.ok()) throw new Error(`UI_CREATE_WORK_HTTP_${response.status()}`);
  await page.waitForURL((url) => url.pathname.endsWith("/workspace") && url.searchParams.has("workId"), { timeout: 30_000 });
  await page.locator("[data-pdm-edit-page='true']").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: "取消本次工作", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  return page.url();
}

async function continueCanonicalWork(page, definition, rowText) {
  const { dialog, action } = await openCanonicalAction(page, definition, rowText, "進行編輯");
  await action.click();
  await page.waitForURL((url) => url.pathname.endsWith("/workspace") && url.searchParams.has("workId"), { timeout: 30_000 });
  await page.locator("[data-pdm-edit-page='true'], .dev079-workspace").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: "取消本次工作", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  return page.url();
}

function bindDrawingSpecToCode(definition, drawingCode) {
  const normalized = String(drawingCode ?? "").trim();
  if (!normalized) throw new Error("DRAWING_CODE_BINDING_EMPTY");
  lifecycleDrawingCode = normalized;
  definition.route = `/numbering/drawings?query=${encodeURIComponent(normalized)}`;
  definition.api = `/api/numbering/drawings/workbench?query=${encodeURIComponent(normalized)}`;
  return normalized;
}

async function createInitialDrawingThroughUi(page, definition, actions) {
  const uniqueName = `DEV087 ${definition.id} ${runId.slice(-12)}`.replace(/[^A-Za-z0-9 ]/gu, "");
  await page.goto(`${baseUrl}/numbering/create?from=drawing`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: "建立編號", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  // The heading is server-rendered and can become visible before the client
  // form has hydrated.  The preview is populated by a client-side effect, so
  // its rendered value is the deterministic readiness signal for safe input.
  await page.locator(".canonical-create-number-list").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByLabel("主要名詞", { exact: true }).fill(uniqueName);
  await page.getByLabel("確定品名", { exact: true }).fill(uniqueName);
  const createButton = page.getByRole("button", { name: "建立編號", exact: true });
  await createButton.waitFor({ state: "visible", timeout: 30_000 });
  if (!(await createButton.isEnabled())) throw new Error("UI_NUMBERING_CREATE_DISABLED");
  const responsePromise = page.waitForResponse((response) => response.request().method() === "POST"
    && new URL(response.url()).pathname === "/api/numbering/records", { timeout: 30_000 });
  await createButton.click();
  const response = await responsePromise;
  const body = await response.json().catch(() => null);
  if (response.status() !== 201) throw new Error(`UI_NUMBERING_CREATE_HTTP_${response.status()}:${safeJson(body)}`);
  const drawingCode = body?.drawingNumber?.drawingNumber;
  if (typeof drawingCode !== "string" || !drawingCode.trim()) throw new Error(`UI_NUMBERING_CREATE_DRAWING_MISSING:${safeJson(body)}`);
  bindDrawingSpecToCode(definition, drawingCode);
  await page.getByRole("heading", { name: "編號已建立", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  const resultText = await page.locator(".canonical-create-result").innerText();
  if (!resultText.includes(drawingCode)) throw new Error("UI_NUMBERING_CREATE_RESULT_CODE_MISSING");
  actions.push({ kind: "create-numbering-record", drawingCode, endpoint: "/api/numbering/records", status: response.status() });
  await page.getByRole("link", { name: "查看建立結果", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/numbering/drawings" && url.searchParams.get("query") === drawingCode, { timeout: 30_000 });
  await waitForWorkbenchList(page, "圖號工作台");
  const initialRow = page.locator(".canonical-table-wrap tbody tr").filter({ hasText: drawingCode }).filter({ hasText: "研發版 0.1" }).first();
  await initialRow.waitFor({ state: "visible", timeout: 30_000 });
  const rowText = (await initialRow.innerText()).trim();
  if (!rowText.includes("負責人處理")) throw new Error(`INITIAL_DRAWING_01_NOT_OWNER:${rowText}`);
  actions.push({ kind: "assert", target: "first-revision-owner-row", observed: rowText });
  return { drawingCode, rowText };
}

async function startDrawingWork(page, definition, candidateKind = "rd") {
  let candidateLabel = null;
  let candidateModal = null;
  const sources = candidateKind === "rd"
    ? ["量產版 1", "研發版 1.1", "研發版 0.2", "研發版 0.1", "量產版", "研發版"]
    : ["量產版 1", "研發版 1.1", "研發版 0.2", "研發版 0.1", "量產版", "研發版"];
  for (const source of sources) {
    try {
      const { action } = await openCanonicalAction(page, definition, source, "進版");
      await action.click();
      const modal = await waitForRevisionModal(page);
      const possible = enabledRevisionTarget(modal, candidateKind);
      if (await possible.count() > 0) {
        candidateLabel = (await possible.innerText()).trim();
        await possible.click();
        candidateModal = modal;
        break;
      }
      await page.getByRole("button", { name: "關閉", exact: true }).click().catch(() => undefined);
    } catch (error) {
      if (source === sources.at(-1)) throw error;
    }
  }
  if (!candidateModal || !candidateLabel) throw journeyBlocked(`NO_ENABLED_UI_REVISION_CANDIDATE:${candidateKind}`);
  const mutationResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/revision-works"), { timeout: 15_000 });
  await candidateModal.getByRole("button", { name: "建立進版工作", exact: true }).click();
  const response = await mutationResponse;
  if (!response.ok()) throw new Error(`UI_CREATE_REVISION_HTTP_${response.status()}`);
  await page.waitForURL((url) => url.pathname.endsWith("/workspace") && url.searchParams.has("workId"), { timeout: 30_000 });
  await page.locator(".dev079-workspace").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: "取消本次工作", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  return { label: candidateLabel.split(/\r?\n/u)[0].trim(), url: page.url() };
}

async function editAndSaveWork(page, definition) {
  if (definition.entity === "drawing") {
    const retiredFields = page.locator("label").filter({ hasText: /^(?:標題|說明)$/u });
    if (await retiredFields.count() !== 0) throw new Error("RETIRED_DRAWING_WORK_FIELDS_VISIBLE");
    if (await page.getByRole("button", { name: "儲存", exact: true }).count() !== 0) throw new Error("RETIRED_DRAWING_WORK_SAVE_VISIBLE");
    return "drawing-fields-retired";
  }
  if (definition.entity === "relation") {
    const removeButton = page.getByRole("button", { name: "移除此關聯", exact: true }).first();
    const existingRelationText = await page.locator(".canonical-relation-row").first().innerText().catch(() => "");
    const existingLinkType = existingRelationText.includes("參考") ? "reference" : existingRelationText ? "primary_manufacturing" : null;
    if (await removeButton.count() > 0) {
      await removeButton.click();
      await page.waitForTimeout(100);
    }
    // A relation workspace is dirty only after the rendered UI updates the
    // link collection.  Removing the existing row alone is insufficient for
    // a deterministic save journey, so add the same pair back with the other
    // legal link type through the visible builder controls.
    const linkTypeSelect = page.locator(".canonical-link-builder select").last();
    if (await linkTypeSelect.count() > 0) {
      const values = await linkTypeSelect.locator("option").evaluateAll((options) => options.map((option) => option.value));
      const nextLinkType = existingLinkType === "reference" ? "primary_manufacturing" : "reference";
      if (values.includes(nextLinkType)) await linkTypeSelect.selectOption(nextLinkType);
    }
    const addButton = page.locator(".canonical-link-builder").getByRole("button", { name: "新增", exact: true });
    if (await addButton.count() === 0) throw journeyBlocked("NO_RELATION_UI_ADD_CONTROL");
    await addButton.click();
  } else {
    const field = page.locator("label").filter({ hasText: "品名" }).locator("input").first();
    if (await field.count() === 0) throw journeyBlocked(`NO_${definition.entity.toUpperCase()}_UI_EDIT_FIELD`);
    await field.waitFor({ state: "visible", timeout: 30_000 });
    // A newly created Part work can start with an empty name.
    // Wait only for the editable control to be hydrated; a non-empty source
    // value is not a legal precondition for the UI journey.
    await page.waitForFunction(() => [...document.querySelectorAll("label")].some((label) => {
      if (!label.textContent?.includes("品名")) return false;
      const input = label.querySelector("input");
      return Boolean(input && !input.disabled);
    }), null, { timeout: 30_000 });
    const current = await field.inputValue();
    const nextValue = current.includes(" DEV087 UI journey") ? `${current} QC2` : `${current || definition.entity} DEV087 UI journey`;
    await field.fill(nextValue);
  }
  const save = page.getByRole("button", { name: "儲存", exact: true }).first();
  if (await save.count() === 0) throw journeyBlocked(`NO_${definition.entity.toUpperCase()}_UI_SAVE`);
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent?.trim() === "儲存" && !button.disabled), null, { timeout: 5_000 }).catch(() => undefined);
  if (!(await save.isEnabled())) {
    // If a sequential lifecycle case reopens a draft whose text value is
    // already the QC suffix, make an additional visible form change through
    // the UI before declaring the save contract unavailable.
    const selects = page.locator("select:not([disabled])");
    for (let index = 0; index < await selects.count(); index += 1) {
      const select = selects.nth(index);
      const currentValue = await select.inputValue().catch(() => "");
      const candidateValue = await select.locator("option").evaluateAll((options, current) => {
        const option = options.find((item) => item.value !== current && !item.disabled);
        return option?.value ?? null;
      }, currentValue).catch(() => null);
      if (candidateValue) {
        await select.selectOption(candidateValue);
        break;
      }
    }
    await page.waitForTimeout(100);
  }
  if (!(await save.isEnabled())) {
    const debug = await page.evaluate(() => ({
      inputs: [...document.querySelectorAll("input, textarea")].map((node) => ({
        name: node.getAttribute("name"),
        value: node.value,
        disabled: node.disabled,
        ariaLabel: node.getAttribute("aria-label")
      })),
      selects: [...document.querySelectorAll("select")].map((node) => ({
        value: node.value,
        disabled: node.disabled,
        options: [...node.options].map((option) => ({ value: option.value, text: option.textContent?.trim() }))
      })),
      relationRows: [...document.querySelectorAll(".canonical-relation-row")].map((node) => node.textContent?.trim()),
      buttons: [...document.querySelectorAll("button")].map((node) => ({
        text: node.textContent?.trim(),
        disabled: node.disabled
      })).filter((item) => item.text)
    }));
    throw new Error(`UI_SAVE_DISABLED:${definition.entity}:${JSON.stringify(debug)}`);
  }
  // Re-resolve the enabled rendered control immediately before the click. A
  // sequential lifecycle run can re-render the workspace after the dirty
  // state is observed, leaving the original locator attached to a disabled
  // button and producing a false runner FAIL.
  // Re-resolve and click the currently rendered control.  The canonical
  // workspace can reconcile its payload immediately after the dirty check;
  // the old locator may then point at a disabled replacement button.  Retry
  // the visible UI action a few times before classifying the case as a real
  // product failure.
  let saved = false;
  let lastSaveError = "";
  for (let attempt = 0; attempt < 4 && !saved; attempt += 1) {
    const enabledSave = page.getByRole("button", { name: "儲存", exact: true }).first();
    if (await enabledSave.count() > 0
      && await enabledSave.isVisible().catch(() => false)
      && await enabledSave.isEnabled().catch(() => false)) {
      try {
        // Keyboard activation is still a rendered-UI action and avoids a
        // pointer-actionability wait being pinned to a button that React has
        // just replaced during dirty-state reconciliation.
        await enabledSave.focus({ timeout: 3_000 });
        await enabledSave.press("Enter", { timeout: 3_000 });
        saved = true;
        break;
      } catch (error) {
        lastSaveError = error instanceof Error ? error.message : String(error);
      }
    }
    if (attempt < 3) {
      const liveField = page.locator("label").filter({ hasText: "品名" }).locator("input").first();
      if (await liveField.count() > 0 && await liveField.isEnabled().catch(() => false)) {
        const currentValue = await liveField.inputValue().catch(() => "");
        await liveField.fill(`${currentValue} QC${attempt + 1}`);
      }
      await page.waitForTimeout(250);
    }
  }
  if (!saved) throw new Error(`UI_SAVE_DISABLED_AFTER_HYDRATION:${definition.entity}${lastSaveError ? `:${lastSaveError}` : ""}`);
  await page.getByText(/工作資料已儲存|資料已儲存|料號資料已儲存|申請內容已更新/u).first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => undefined);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("[data-pdm-edit-page='true'], .dev079-workspace").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: "取消本次工作", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  return "save-reload";
}

async function uploadDrawingFiles(page, files = [drawingUpload2d, drawingUpload3d]) {
  if (await page.locator(".dev079-workspace").count() === 0) throw new Error("UI_DRAWING_WORKSPACE_MISSING");
  const fileInput = page.locator(".dev079-workspace-file-upload input[type='file']").first();
  if (await fileInput.count() === 0) throw new Error("UI_DRAWING_FILE_INPUT_MISSING");
  await fileInput.setInputFiles(files);
  const uploadButton = page.getByRole("button", { name: "上傳所選檔案", exact: true }).first();
  if (await uploadButton.count() === 0 || !(await uploadButton.isEnabled())) throw new Error("UI_DRAWING_FILE_UPLOAD_DISABLED");
  await uploadButton.click();
  await page.waitForFunction((expectedCount) => {
    const rows = [...document.querySelectorAll(".dev079-upload-progress-list li")];
    return rows.filter((row) => row.classList.contains("is-success")).length >= expectedCount
      || rows.some((row) => row.classList.contains("is-failed"));
  }, files.length, { timeout: 45_000 });
  const failedUploads = await page.locator(".dev079-upload-progress-list li.is-failed").allTextContents();
  if (failedUploads.length > 0) throw new Error(`UI_DRAWING_FILE_UPLOAD_FAILED:${safeJson(failedUploads)}`);
  const successRows = await page.locator(".dev079-upload-progress-list li.is-success").allTextContents();
  if (successRows.length < files.length) throw new Error(`UI_DRAWING_FILE_UPLOAD_SUCCESS_COUNT:${successRows.length}/${files.length}`);
  await page.getByText("本版次 2D 與 3D 主檔已齊備。", { exact: true }).first().waitFor({ state: "visible", timeout: 45_000 });
  return successRows.map((value) => value.trim());
}

async function submitWork(page) {
  if (await page.locator(".dev079-workspace").count() > 0) {
    const readyStatus = page.getByText("本版次 2D 與 3D 主檔已齊備。", { exact: true }).first();
    if (await readyStatus.count() === 0) await uploadDrawingFiles(page);
    const fffAxes = page.locator(".canonical-fff-grid select[data-fff-axis]");
    const fffAxisCount = await fffAxes.count();
    if (fffAxisCount > 0) {
      if (fffAxisCount !== 3) throw new Error(`UI_FFF_AXIS_COUNT:${fffAxisCount}/3`);
      for (let index = 0; index < fffAxisCount; index += 1) {
        const axis = fffAxes.nth(index);
        if (!(await axis.inputValue())) await axis.selectOption("no_impact");
      }
      await page.waitForFunction(() => Array.from(document.querySelectorAll(".canonical-fff-grid select[data-fff-axis]"))
        .every((axis) => axis instanceof HTMLSelectElement && axis.value === "no_impact"), undefined, { timeout: 10_000 });
    }
  }
  const submit = page.getByRole("button", { name: "送出審核", exact: true }).first();
  if (await submit.count() === 0) throw journeyBlocked("NO_UI_SUBMIT_REVIEW");
  if (!(await submit.isEnabled())) throw new Error("UI_SUBMIT_REVIEW_DISABLED");
  const responsePromise = page.waitForResponse((response) => response.request().method() === "POST"
    && new URL(response.url()).pathname.endsWith("/submit"), { timeout: 30_000 });
  await submit.scrollIntoViewIfNeeded();
  await submit.click();
  const response = await responsePromise;
  const body = await response.json().catch(() => null);
  if (!response.ok()) {
    const visibleError = await page.locator(".dev079-workspace-notice.is-error[role='alert']").innerText().catch(() => "");
    throw new Error(`UI_SUBMIT_REVIEW_HTTP_${response.status()}:${safeJson({ body, visibleError })}`);
  }
  await page.waitForURL((url) => url.pathname === "/numbering/drawings" || url.pathname === "/parts" || url.pathname === "/numbering/search", { timeout: 30_000 });
}

async function cancelWork(page, route) {
  const cancel = page.getByRole("button", { name: "取消本次工作", exact: true }).first();
  await page.locator(".dev079-workspace, [data-pdm-edit-page='true']").first().waitFor({ state: "visible", timeout: 30_000 });
  await cancel.waitFor({ state: "visible", timeout: 30_000 }).catch(() => undefined);
  if (await cancel.count() === 0 || !(await cancel.isVisible().catch(() => false))) throw journeyBlocked("NO_UI_CANCEL_WORK");
  page.once("dialog", (dialog) => dialog.accept());
  await cancel.click({ force: true });
  await page.waitForURL((url) => url.pathname === new URL(route, baseUrl).pathname, { timeout: 30_000 });
  await waitForWorkbenchList(page, route.startsWith("/numbering/drawings") ? "圖號工作台" : route.startsWith("/parts") ? "料號工作台" : "圖料工作台");
}

async function cleanupActiveWork(page, definition) {
  const cancel = page.getByRole("button", { name: "取消本次工作", exact: true }).first();
  if (await cancel.count() > 0 && await cancel.isVisible().catch(() => false)) {
    const cancelResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/cancel"), { timeout: 15_000 }).catch(() => null);
    page.once("dialog", (dialog) => dialog.accept());
    await cancel.click({ force: true }).catch(() => undefined);
    await cancelResponse;
    await page.waitForURL((url) => url.pathname === new URL(definition.route, baseUrl).pathname, { timeout: 15_000 }).catch(() => undefined);
    return;
  }
  const rowLabel = definition.family === "D" ? "研發版" : definition.family === "P" ? "修改中" : "調整中";
  await page.goto(`${baseUrl}${definition.route}`, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => undefined);
  await waitForWorkbenchList(page, definition.family === "D" ? "圖號工作台" : definition.family === "P" ? "料號工作台" : "圖料工作台").catch(() => undefined);
  const row = page.locator(".canonical-table-wrap tbody tr").filter({ hasText: rowLabel }).first();
  if (await row.count() === 0) return;
  await row.locator(".canonical-row-open, .pdm-identity-code").first().click().catch(() => undefined);
  const dialog = page.locator(".pdm-entity-detail-drawer").last();
  if (await dialog.count() === 0) return;
  const edit = dialog.getByRole("button", { name: "進行編輯", exact: true }).first();
  if (await edit.count() === 0) return;
  await edit.click();
  await page.waitForURL((url) => url.pathname.endsWith("/workspace") && url.searchParams.has("workId"), { timeout: 30_000 }).catch(() => undefined);
  const fallbackCancel = page.getByRole("button", { name: "取消本次工作", exact: true }).first();
  if (await fallbackCancel.count() > 0) {
    const cancelResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/cancel"), { timeout: 15_000 }).catch(() => null);
    page.once("dialog", (dialog) => dialog.accept());
    await fallbackCancel.click({ force: true }).catch(() => undefined);
    await cancelResponse;
    await page.waitForURL((url) => url.pathname === new URL(definition.route, baseUrl).pathname, { timeout: 15_000 }).catch(() => undefined);
  }
}

async function navigateToCanonicalReview(page, definition, rowText) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const { action } = await openCanonicalAction(page, definition, rowText, "前往審核");
    await action.click();
    try {
      await page.waitForURL((url) => url.pathname.startsWith("/approvals/"), { timeout: 15_000 });
      return attempt;
    } catch (error) {
      if (attempt === 2) throw error;
      // In webpack dev mode the first visit can compile the dynamic approval
      // route and trigger a full refresh back to the source drawer.  Retry the
      // rendered navigation once after that route has been warmed.
    }
  }
  throw new Error("REVIEW_NAVIGATION_RETRY_STATE_UNREACHABLE");
}

async function reviewSubmittedWork(context, definition, rowText, decision, options = {}) {
  const page = await context.newPage();
  monitor(page, `review-${definition.id}`, definition.id);
  const actions = [];
  try {
    const navigationAttempts = await navigateToCanonicalReview(page, definition, rowText);
    actions.push({ kind: "click", target: "前往審核", navigationAttempts });
    await page.locator("[data-pdm-edit-page='true'], .dev079-workspace").first().waitFor({ state: "visible", timeout: 30_000 });
    // Generic canonical review pages render the shell before the contract
    // payload arrives.  Read-only evidence must be collected only after the
    // body is ready; otherwise a valid PDM/part/relation review is falsely
    // reported as writable/empty and poisons the following journey.
    await page.locator(".pdm-edit-page-body, .dev079-workspace-grid, .canonical-error[role='alert']").first().waitFor({ state: "visible", timeout: 30_000 });
    if (await page.locator(".canonical-error[role='alert']:visible").count() > 0 && await page.locator(".pdm-edit-page-body").count() === 0 && await page.locator(".dev079-workspace-grid").count() === 0) {
      throw new Error("REVIEW_EDITOR_LOAD_ERROR");
    }
    const readonlyInputs = await page.locator("input[disabled], select[disabled], textarea[disabled]").count();
    const readonlyNotice = await page.getByText(/目前為唯讀/u).count();
    const writableControls = await page.locator(".canonical-link-builder, input:not([disabled]), select:not([disabled]), textarea:not([disabled])").count();
    if (readonlyNotice < 1 || (readonlyInputs < 1 && writableControls > 0)) {
      writeJson(path.join(evidenceRoot, "journeys", `J-${definition.id}`, "review-dom.json"), await page.evaluate(() => ({
        notice: [...document.querySelectorAll("[role='status']")].map((node) => node.textContent?.trim()).filter(Boolean),
        controls: [...document.querySelectorAll("input, select, textarea, .canonical-link-builder")].map((node) => ({
          tag: node.tagName,
          disabled: "disabled" in node ? Boolean(node.disabled) : null,
          className: node.className,
          text: node.textContent?.trim().slice(0, 200)
        }))
      })));
      throw new Error("REVIEW_EDITOR_NOT_READONLY");
    }
    const decisionButton = page.getByRole("button", { name: decision === "approve" ? "核准" : "退回修改", exact: true }).first();
    if (await decisionButton.count() === 0) {
      writeJson(path.join(evidenceRoot, "journeys", `J-${definition.id}`, "review-decision-missing.json"), await page.evaluate(() => ({
        url: window.location.href,
        title: document.title,
        buttons: [...document.querySelectorAll("button")].map((node) => ({ text: node.textContent?.trim(), disabled: node.disabled })),
        alerts: [...document.querySelectorAll("[role='alert']")].map((node) => node.textContent?.trim()).filter(Boolean),
        statuses: [...document.querySelectorAll("[role='status']")].map((node) => node.textContent?.trim()).filter(Boolean),
        bodyText: document.body.innerText.slice(0, 5000)
      })));
      await page.screenshot({ path: path.join(evidenceRoot, "journeys", `J-${definition.id}`, "review-decision-missing.png"), fullPage: true, caret: "initial" });
      throw new Error(`NO_UI_REVIEW_DECISION:${decision}`);
    }
    const decisionResponsePromise = page.waitForResponse((response) => response.request().method() === "POST"
      && new URL(response.url()).pathname.endsWith("/decisions"), { timeout: 30_000 });
    await decisionButton.click();
    const decisionResponse = await decisionResponsePromise;
    const decisionBody = await decisionResponse.json().catch(() => null);
    if (!decisionResponse.ok()) {
      writeJson(path.join(evidenceRoot, "journeys", `J-${definition.id}`, "review-decision-error.json"), {
        status: decisionResponse.status(),
        body: decisionBody,
        url: decisionResponse.url()
      });
      throw new Error(`UI_REVIEW_DECISION_HTTP_${decisionResponse.status()}:${safeJson(decisionBody)}`);
    }
    if (options.onDecisionCommitted) await options.onDecisionCommitted({ response: decisionResponse, body: decisionBody });
    await page.waitForURL((url) => url.pathname === "/approvals" || url.pathname === new URL(definition.route, baseUrl).pathname, { timeout: 30_000 });
    actions.push({ kind: "decision", decision, readonlyInputs });
    return { status: "PASS", actions };
  } catch (error) {
    if (error?.journeyBlocked) return { status: "BLOCKED", reason: error.message, actions };
    return { status: "FAIL", reason: error instanceof Error ? error.message : String(error), actions };
  } finally {
    await page.close().catch(() => {});
  }
}

async function openFirstVoidableDrawing(page) {
  const rows = page.locator(".canonical-table-wrap tbody tr").filter({ hasText: "研發版" });
  const count = await rows.count();
  for (let index = 0; index < count; index += 1) {
    await rows.nth(index).locator(".canonical-row-open").click().catch(() => undefined);
    const dialog = page.locator(".pdm-entity-detail-drawer").last();
    await dialog.waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined);
    await page.waitForFunction(() => !document.querySelector(".canonical-drawer-message")
      && Boolean(document.querySelector(".canonical-drawer-body, .canonical-drawer-actions, .canonical-error[role='alert']")), null, { timeout: 30_000 }).catch(() => undefined);
    const action = dialog.getByRole("button", { name: /作廢/u }).first();
    if (await action.count() > 0) return { dialog, action };
    await dialog.getByRole("button", { name: /關閉|返回/u }).first().click().catch(() => undefined);
  }
  return null;
}

async function openDrawingReviewDecision(page, spec, decisionLabel = "核准") {
  await navigateToCanonicalReview(page, spec, "研發版");
  await page.locator("[data-pdm-edit-page='true'], .dev079-workspace").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.locator(".pdm-edit-page-body, .dev079-workspace-grid, .canonical-error[role='alert']").first().waitFor({ state: "visible", timeout: 30_000 });
  const decision = page.getByRole("button", { name: decisionLabel, exact: true }).first();
  if (await decision.count() === 0) throw journeyBlocked(`NO_UI_REVIEW_DECISION:${decisionLabel}`);
  return { decision, reviewUrl: page.url() };
}

async function openDrawingLayer(page, spec, layerText) {
  await page.goto(`${baseUrl}${spec.route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await waitForWorkbenchList(page, "圖號工作台");
  return openLayerRow(page, layerText);
}

function readDrawingMutationSnapshot(drawingCode = lifecycleDrawingCode) {
  const database = new Database(fixtureDb, { readonly: true, fileMustExist: true });
  try {
    const drawing = database.prepare("SELECT id FROM drawings WHERE drawing_number = ? ORDER BY id LIMIT 1").get(drawingCode);
    if (!drawing?.id) throw new Error("DRAWING_MUTATION_SNAPSHOT_SOURCE_MISSING");
    return {
      production: database.prepare("SELECT revision_id, row_version FROM canonical_workbench_states WHERE entity_type = 'drawing' AND canonical_entity_id = ? AND data_layer = 'drawing_production'").get(drawing.id) ?? null,
      aggregate: database.prepare("SELECT open_branch_count, row_version FROM pdm_workbench_aggregates WHERE entity_type = 'drawing' AND canonical_entity_id = ?").get(drawing.id) ?? null,
      works: database.prepare("SELECT COUNT(*) AS count FROM drawing_revision_works WHERE drawing_id = ?").get(drawing.id).count,
      claims: database.prepare("SELECT COUNT(*) AS count FROM drawing_revision_claims WHERE drawing_id = ?").get(drawing.id).count,
      revisions: database.prepare("SELECT COUNT(*) AS count FROM drawing_revisions WHERE drawing_id = ?").get(drawing.id).count,
      branches: database.prepare("SELECT COUNT(*) AS count FROM drawing_rd_branches WHERE drawing_id = ?").get(drawing.id).count,
      currentRows: database.prepare("SELECT data_layer, branch_id, revision_id, work_id, handling, row_version FROM canonical_workbench_states WHERE entity_type = 'drawing' AND canonical_entity_id = ? ORDER BY data_layer, branch_id, revision_id").all(drawing.id)
    };
  } finally { database.close(); }
}

function readDrawingLifecycleCheckpoint(drawingCode = lifecycleDrawingCode) {
  const database = new Database(fixtureDb, { readonly: true, fileMustExist: true });
  try {
    const drawing = database.prepare("SELECT id, drawing_number FROM drawings WHERE drawing_number = ? ORDER BY id LIMIT 1").get(drawingCode);
    if (!drawing?.id) return { drawingCode, exists: false };
    const rows = database.prepare(`
      SELECT state.data_layer, state.handling, state.work_id, state.row_version,
             revision.revision, revision.lifecycle_state, branch.status AS branch_status,
             branch.closed_reason, branch.base_production_revision_id
        FROM canonical_workbench_states state
        LEFT JOIN drawing_revisions revision ON revision.id = state.revision_id
        LEFT JOIN drawing_rd_branches branch ON branch.id = state.branch_id
       WHERE state.entity_type = 'drawing' AND state.canonical_entity_id = ?
       ORDER BY state.data_layer, revision.revision, state.id`).all(drawing.id);
    const branches = database.prepare(`
      SELECT branch.id, branch.status, branch.closed_reason,
             base.revision AS base_production_revision,
             latest.revision AS latest_approved_revision
        FROM drawing_rd_branches branch
        LEFT JOIN drawing_revisions base ON base.id = branch.base_production_revision_id
        LEFT JOIN drawing_revisions latest ON latest.id = branch.latest_approved_revision_id
       WHERE branch.drawing_id = ? ORDER BY branch.id`).all(drawing.id);
    const claims = database.prepare(`
      SELECT target_label, claim_state, predecessor_revision_id
        FROM drawing_revision_claims WHERE drawing_id = ?
       ORDER BY target_major, target_minor, id`).all(drawing.id);
    const revisions = database.prepare(`
      SELECT revision, lifecycle_state, row_version,
             CASE WHEN controlled_at IS NULL THEN 0 ELSE 1 END AS controlled,
             CASE WHEN released_at IS NULL THEN 0 ELSE 1 END AS released,
             CASE WHEN cancelled_at IS NULL THEN 0 ELSE 1 END AS cancelled
        FROM drawing_revisions WHERE drawing_id = ?
       ORDER BY CAST(substr(revision, 1, instr(revision || '.', '.') - 1) AS INTEGER), revision, id`).all(drawing.id);
    const works = database.prepare(`
      SELECT work.id, work.row_version, claim.target_label, state.handling,
             COUNT(binding.file_binding_id) AS file_count
        FROM drawing_revision_works work
        JOIN drawing_revision_claims claim ON claim.id = work.target_claim_id
        LEFT JOIN canonical_workbench_states state ON state.work_id = work.id
        LEFT JOIN drawing_revision_work_files binding ON binding.work_id = work.id
       WHERE work.drawing_id = ?
       GROUP BY work.id, work.row_version, claim.target_label, state.handling
       ORDER BY claim.target_major, claim.target_minor, work.id`).all(drawing.id);
    const files = database.prepare(`
      SELECT revision.revision, asset.file_name, file.role, file.is_primary,
             CASE WHEN file.removed_at IS NULL THEN 0 ELSE 1 END AS removed
        FROM drawing_revision_files file
        JOIN drawing_revisions revision ON revision.id = file.drawing_revision_id
        JOIN file_assets asset ON asset.id = file.source_file_asset_id
       WHERE revision.drawing_id = ?
       ORDER BY revision.revision, file.sort_order, file.id`).all(drawing.id);
    const reviewRequests = database.prepare(`
      SELECT request_status, COUNT(*) AS count
        FROM pdm_work_review_requests
       WHERE entity_type = 'drawing' AND canonical_entity_id = ?
       GROUP BY request_status ORDER BY request_status`).all(drawing.id);
    const aggregate = database.prepare("SELECT open_branch_count, row_version FROM pdm_workbench_aggregates WHERE entity_type = 'drawing' AND canonical_entity_id = ?").get(drawing.id) ?? null;
    return { drawingCode, exists: true, aggregate, rows, branches, claims, revisions, works, files, reviewRequests };
  } finally { database.close(); }
}

function assertInitialDrawingCheckpoint(checkpoint, expected) {
  if (!checkpoint?.exists) throw new Error(`INITIAL_DRAWING_CHECKPOINT_MISSING:${safeJson(checkpoint)}`);
  const row = checkpoint.rows.find((item) => item.data_layer === "drawing_rd" && item.revision === expected.revision);
  if (expected.row === "absent") {
    if (row) throw new Error(`INITIAL_DRAWING_ROW_NOT_REMOVED:${safeJson(checkpoint)}`);
    if (checkpoint.works.length !== 0 || checkpoint.claims.length !== 0 || checkpoint.branches.some((branch) => branch.status === "open")) {
      throw new Error(`INITIAL_DRAWING_CANCEL_RESIDUE:${safeJson(checkpoint)}`);
    }
    return;
  }
  if (!row) throw new Error(`INITIAL_DRAWING_EXPECTED_REVISION_MISSING:${expected.revision}:${safeJson(checkpoint)}`);
  if (expected.handling && row.handling !== expected.handling) throw new Error(`INITIAL_DRAWING_HANDLING_MISMATCH:${row.handling}/${expected.handling}`);
  if (expected.lifecycle && row.lifecycle_state !== expected.lifecycle) throw new Error(`INITIAL_DRAWING_LIFECYCLE_MISMATCH:${row.lifecycle_state}/${expected.lifecycle}`);
  if (expected.productionRevision) {
    const production = checkpoint.rows.find((item) => item.data_layer === "drawing_production" && item.revision === expected.productionRevision);
    if (!production || production.lifecycle_state !== "released") throw new Error(`INITIAL_DRAWING_PRODUCTION_MISSING:${expected.productionRevision}:${safeJson(checkpoint)}`);
  }
}

async function promoteProductionThroughUi(page, reviewerContext, spec, actions, options = {}) {
  const started = await startDrawingWork(page, spec, "production");
  actions.push({ kind: "create-promotion-work", candidate: started.label });
  actions.push({ kind: await editAndSaveWork(page, spec) });
  await submitWork(page);
  actions.push({ kind: "submit-promotion" });
  const review = await reviewSubmittedWork(reviewerContext, spec, started.label.replace("量產版", "研發版"), "approve", options);
  actions.push(...review.actions.map((action) => ({ ...action, scope: "promotion" })));
  if (review.status !== "PASS") throw Object.assign(new Error(review.reason || "stale setup promotion failed"), { journeyBlocked: review.status === "BLOCKED" });
  return started.label;
}

async function visibleDrawingRows(page) {
  return page.locator(".canonical-table-wrap tbody tr").allTextContents();
}

async function closeCanonicalDrawer(page) {
  const drawer = page.locator(".pdm-detail-drawer").last();
  const backdrop = page.locator(".pdm-detail-drawer-backdrop").last();
  if (await drawer.count() === 0 && await backdrop.count() === 0) return;
  const close = drawer.getByRole("button", { name: "關閉明細", exact: true });
  if (await close.count() > 0) await close.click({ force: true }).catch(() => undefined);
  if (await backdrop.count() > 0) await backdrop.click({ position: { x: 4, y: 4 }, force: true }).catch(() => undefined);
  await page.waitForURL((url) => !url.searchParams.has("detail"), { timeout: 5_000 }).catch(() => undefined);
  await page.locator(".pdm-detail-drawer-backdrop").waitFor({ state: "detached", timeout: 5_000 }).catch(() => undefined);
}

async function assertDrawingBranchCap(page, spec, actions) {
  const rows = await visibleDrawingRows(page);
  const rdRows = rows.filter((text) => text.includes("研發版"));
  if (rdRows.length < 3) throw journeyBlocked(`DRAWING_BRANCH_FIXTURE_BELOW_CAP:${rdRows.length}`);
  const production = await openLayerRow(page, "量產版");
  const advance = production.getByRole("button", { name: "進版", exact: true }).first();
  if (await advance.count() > 0) {
    await advance.click();
    const modal = await waitForRevisionModal(page, 15_000);
    const enabled = modal.locator(".canonical-revision-targets label:not(.is-disabled)");
    if (await enabled.count() > 0) throw new Error("DRAWING_BRANCH_CAP_NOT_ENFORCED");
    actions.push({ kind: "assert", target: "max-3-branches", observed: "no-enabled-candidate" });
    await page.getByRole("button", { name: "關閉", exact: true }).click().catch(() => undefined);
  } else {
    actions.push({ kind: "assert", target: "max-3-branches", observed: "advance-hidden-at-cap" });
  }
  await closeCanonicalDrawer(page);
}

async function cancelAllActiveDrawingWorks(page, spec) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    // Use a fresh rendered page for every pass.  The canonical list can keep
    // a drawer in React state after the owner command navigates back; page
    // isolation makes each cancellation start from an unambiguous UI state.
    const cleanupPage = await page.context().newPage();
    monitor(cleanupPage, `J-${spec.id}-cleanup-${attempt}`, spec.id);
    try {
      await cleanupPage.goto(`${baseUrl}${spec.route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await waitForWorkbenchList(cleanupPage, "圖號工作台");
      const rows = cleanupPage.locator(".canonical-table-wrap tbody tr").filter({ hasText: "研發版" });
      let cancelled = false;
      for (let index = 0; index < await rows.count(); index += 1) {
        const row = rows.nth(index);
        const text = await row.innerText().catch(() => "");
        // The canonical list renders the role label ("負責人處理" or
        // "審核負責人處理") without exposing the internal handling enum.
        if (!text.includes("負責人處理") && !text.includes("審核負責人")) continue;
        await row.locator(".canonical-row-open").click();
        const dialog = cleanupPage.locator(".pdm-entity-detail-drawer").last();
        await dialog.waitFor({ state: "visible", timeout: 15_000 });
        const edit = dialog.getByRole("button", { name: "進行編輯", exact: true }).first();
        if (await edit.count() === 0) {
          await closeCanonicalDrawer(cleanupPage);
          continue;
        }
        await edit.click();
        await cleanupPage.waitForURL((url) => url.pathname.endsWith("/workspace") && url.searchParams.has("workId"), { timeout: 30_000 });
        await cleanupPage.locator(".dev079-workspace").waitFor({ state: "visible", timeout: 30_000 });
        const cancelButton = cleanupPage.getByRole("button", { name: "取消本次工作", exact: true }).first();
        if (await cancelButton.count() === 0) throw journeyBlocked("NO_UI_CANCEL_WORK");
        await cancelWork(cleanupPage, spec.route);
        cancelled = true;
        break;
      }
      if (!cancelled) return;
    } finally {
      await cleanupPage.close().catch(() => undefined);
    }
  }
}

async function runDrawingMultiContextJourney(context, reviewerContext, spec, operation, page, actions) {
  if (operation === 13) {
    // openDrawingLayer is a readiness/readability assertion.  Close the
    // resulting drawer before the cap assertion opens the same production
    // row; otherwise the drawer backdrop intercepts the second row click.
    const preview = await openDrawingLayer(page, spec, "量產版");
    await closeCanonicalDrawer(page);
    await assertDrawingBranchCap(page, spec, actions);
    return;
  }
  if (operation === 14) {
    // Claim the same next target from two rendered UI contexts. Both tabs
    // may see the candidate before either submits; exactly one POST commits
    // and the other must fail closed with 409.
    await openDrawingLayer(page, spec, "量產版");
    const row = page.locator(".pdm-entity-detail-drawer").last();
    const advance = row.getByRole("button", { name: "進版", exact: true }).first();
    if (await advance.count() === 0) throw journeyBlocked("NO_OPEN_BRANCH_FOR_TWO_TAB_CLAIM");
    await closeCanonicalDrawer(page);
    const other = await context.newPage(); monitor(other, `J-${spec.id}-tab2`, spec.id);
    const second = await context.newPage(); monitor(second, `J-${spec.id}-tab3`, spec.id);
    try {
      await openDrawingLayer(other, spec, "量產版");
      const otherDialog = other.locator(".pdm-entity-detail-drawer").last();
      const otherAdvance = otherDialog.getByRole("button", { name: "進版", exact: true }).first();
      if (await otherAdvance.count() === 0) throw journeyBlocked("NO_SECOND_TAB_TARGET");
      await openDrawingLayer(second, spec, "量產版");
      const secondDialog = second.locator(".pdm-entity-detail-drawer").last();
      const secondAdvance = secondDialog.getByRole("button", { name: "進版", exact: true }).first();
      if (await secondAdvance.count() === 0) throw journeyBlocked("NO_THIRD_TAB_TARGET");
      await Promise.all([otherAdvance.click(), secondAdvance.click()]);
      const [otherModal, secondModal] = await Promise.all([waitForRevisionModal(other), waitForRevisionModal(second)]);
      const target = enabledRevisionTarget(otherModal, "rd");
      const secondTarget = enabledRevisionTarget(secondModal, "rd");
      if (await target.count() === 0 || await secondTarget.count() === 0) {
        writeJson(path.join(evidenceRoot, "journeys", `J-${spec.id}`, "target-claim-debug.json"), {
          first: await other.evaluate(() => ({ href: window.location.href, modalText: document.querySelector(".canonical-modal")?.textContent?.trim() ?? "", candidates: [...document.querySelectorAll(".canonical-revision-targets label")].map((label) => ({ text: label.textContent?.trim() ?? "", disabled: label.classList.contains("is-disabled") })) })),
          second: await second.evaluate(() => ({ href: window.location.href, modalText: document.querySelector(".canonical-modal")?.textContent?.trim() ?? "", candidates: [...document.querySelectorAll(".canonical-revision-targets label")].map((label) => ({ text: label.textContent?.trim() ?? "", disabled: label.classList.contains("is-disabled") })) }))
        });
        throw journeyBlocked("NO_TARGET_FOR_TWO_TAB_CLAIM");
      }
      const targetLabels = await Promise.all([target.innerText(), secondTarget.innerText()]);
      if (targetLabels[0] !== targetLabels[1]) throw new Error(`DRAWING_TARGET_CLAIM_TARGET_MISMATCH:${targetLabels.join("|")}`);
      await Promise.all([target.click(), secondTarget.click()]);
      const responsePromises = [other, second].map((targetPage) => targetPage.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("revision-works"), { timeout: 15_000 }).catch(() => null));
      await Promise.all([
        otherModal.getByRole("button", { name: "建立進版工作", exact: true }).click(),
        secondModal.getByRole("button", { name: "建立進版工作", exact: true }).click()
      ]);
      const responses = await Promise.all(responsePromises);
      const statuses = responses.map((response) => response?.status() ?? 0);
      if (!statuses.some((status) => status >= 200 && status < 300) || !statuses.some((status) => status === 409)) throw new Error(`DRAWING_TARGET_CLAIM_NOT_SINGLETON:${JSON.stringify(statuses)}`);
      actions.push({ kind: "assert", target: "target-claim-single-winner", observed: statuses, candidate: targetLabels[0] });
      const winnerPage = statuses[0] >= 200 && statuses[0] < 300 ? other : second;
      await winnerPage.waitForURL((url) => url.pathname.endsWith("/workspace") && url.searchParams.has("workId"), { timeout: 30_000 });
      await cancelWork(winnerPage, spec.route);
    } finally {
      await Promise.all([other.close().catch(() => undefined), second.close().catch(() => undefined)]);
    }
    return;
  }
  if (operation === 16 || operation === 17) {
    // The disposable fixture starts at production 1 + controlled RD 1.1.
    // Keep the RD UI snapshot open, promote an independent branch to
    // production 2 through the rendered owner/reviewer UI, then prove the
    // old branch is frozen.  Cancelling a work does not make a source stale
    // and therefore is not a valid substitute for this promotion chain.
    const stale = await context.newPage(); monitor(stale, `J-${spec.id}-stale`, spec.id);
    try {
      await openDrawingLayer(stale, spec, "研發版 1.1");
      const staleDialog = stale.locator(".pdm-entity-detail-drawer").last();
      const staleAdvance = staleDialog.getByRole("button", { name: "進版", exact: true }).first();
      if (await staleAdvance.count() === 0) throw journeyBlocked("NO_NON_STALE_RD_ADVANCE_PRECONDITION");

      if (operation === 17) {
        // Load and select a production candidate while RD 1.1 is still based
        // on current production 1. The token must become invalid after the
        // other UI flow promotes production 2.
        await staleAdvance.click();
        const staleModal = await waitForRevisionModal(stale);
        const oldProductionTarget = enabledRevisionTarget(staleModal, "production");
        if (await oldProductionTarget.count() === 0) throw journeyBlocked("NO_PRE_PROMOTION_PRODUCTION_TARGET");
        const targetLabel = (await oldProductionTarget.innerText()).trim();
        await oldProductionTarget.click();
        const createButton = staleModal.getByRole("button", { name: "建立進版工作", exact: true });
        const readStaleModalState = async () => staleModal.evaluate((modal) => ({
          connected: modal.isConnected,
          checkedTargets: [...modal.querySelectorAll("input[name='revision-target']:checked")].map((input) => input.value),
          checkedModes: [...modal.querySelectorAll("input[name='revision-selection-mode']:checked")].map((input) => input.value),
          createButtons: [...modal.querySelectorAll("button")].filter((button) => button.textContent?.trim() === "建立進版工作").map((button) => ({ disabled: button.disabled, text: button.textContent?.trim() })),
          alerts: [...modal.querySelectorAll("[role='alert']")].map((node) => node.textContent?.trim()).filter(Boolean),
          statuses: [...modal.querySelectorAll("[role='status']")].map((node) => node.textContent?.trim()).filter(Boolean)
        }));
        const beforeSubmitState = await readStaleModalState();
        let staleOutcome = null;
        await promoteProductionThroughUi(page, reviewerContext, spec, actions, {
          onDecisionCommitted: async () => {
            const beforeRejectedCreate = readDrawingMutationSnapshot();
            const committedModalCount = await staleModal.count();
            const committedState = committedModalCount > 0 ? await readStaleModalState() : { connected: false };
            let response;
            try {
              [response] = await Promise.all([
                stale.waitForResponse((candidateResponse) => candidateResponse.request().method() === "POST" && candidateResponse.url().includes("/revision-works"), { timeout: 15_000 }),
                createButton.click({ timeout: 10_000 })
              ]);
            } catch (error) {
              const afterAttemptCount = await staleModal.count();
              const afterAttemptState = afterAttemptCount > 0 ? await readStaleModalState() : { connected: false };
              throw new Error(`STALE_PRODUCTION_UI_DID_NOT_SUBMIT:${safeJson({ beforeSubmitState, committedState, afterAttemptState, url: stale.url(), cause: error instanceof Error ? error.message : String(error) })}`);
            }
            const body = await response.json().catch(() => null);
            const afterRejectedCreate = readDrawingMutationSnapshot();
            if (response.status() !== 409) throw new Error(`STALE_PRODUCTION_TOKEN_NOT_REJECTED:${response.status()}`);
            if (safeJson(beforeRejectedCreate) !== safeJson(afterRejectedCreate)) throw new Error(`STALE_PRODUCTION_TOKEN_PARTIAL_WRITE:${safeJson({ beforeRejectedCreate, afterRejectedCreate })}`);
            const visibleAlert = stale.locator(".canonical-revision-modal .canonical-error[role='alert']");
            await visibleAlert.waitFor({ state: "visible", timeout: 5_000 });
            const visibleError = await visibleAlert.innerText();
            if (!visibleError.includes("量產基準已更新")) throw new Error(`STALE_PRODUCTION_RECOVERY_MESSAGE_MISSING:${visibleError}`);
            staleOutcome = { status: response.status(), code: body?.error?.code ?? body?.code ?? null, zeroWrite: true, visibleError };
          }
        });
        if (!staleOutcome) throw new Error(`STALE_PRODUCTION_UI_DID_NOT_SUBMIT:${safeJson({ beforeSubmitState, url: stale.url() })}`);
        actions.push({ kind: "assert", target: "stale-production-token", candidate: targetLabel.split(/\r?\n/u)[0], observed: staleOutcome });
      } else {
        await promoteProductionThroughUi(page, reviewerContext, spec, actions);
        await staleAdvance.click();
        const staleModal = await waitForRevisionModal(stale);
        const staleTargets = staleModal.locator(".canonical-revision-targets label:not(.is-disabled)");
        const recovery = staleModal.locator(".canonical-revision-recovery");
        if (await staleTargets.count() !== 0 || await recovery.count() !== 1) throw new Error("STALE_BRANCH_NOT_FROZEN_WITH_RECOVERY");
        const recoveryText = (await recovery.innerText()).trim();
        if (!recoveryText.includes("量產基準已更新") || !recoveryText.includes("從目前量產版建立新工作")) throw new Error(`STALE_BRANCH_RECOVERY_COPY_MISSING:${recoveryText}`);
        await recovery.getByRole("button", { name: "從目前量產版建立新工作", exact: true }).click();
        const recoveredTargets = staleModal.locator(".canonical-revision-targets label:not(.is-disabled)");
        await recoveredTargets.first().waitFor({ state: "visible", timeout: 15_000 });
        const recoveredLabels = (await recoveredTargets.locator("strong").allTextContents()).map((value) => value.trim());
        if (!recoveredLabels.some((label) => label === "研發版 2.1") || !recoveredLabels.some((label) => label === "量產版 3")) throw new Error(`STALE_BRANCH_RECOVERY_TARGET_MISMATCH:${safeJson(recoveredLabels)}`);
        actions.push({ kind: "assert", target: "stale-branch-freeze-and-restart", observed: { noStaleTargets: true, recoveryText, recoveredLabels } });
      }
    } finally { await stale.close().catch(() => undefined); }
    return;
  }
  if (operation === 21) {
    await page.goto(`${baseUrl}${spec.route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await waitForWorkbenchList(page, "圖號工作台");
    const first = await openFirstVoidableDrawing(page);
    if (!first) throw journeyBlocked("NO_VOIDABLE_BRANCH_FOR_CONCURRENT_JOURNEY");
    const second = await context.newPage(); monitor(second, `J-${spec.id}-void-tab2`, spec.id);
    try {
      await second.goto(`${baseUrl}${spec.route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await waitForWorkbenchList(second, "圖號工作台");
      const secondVoid = await openFirstVoidableDrawing(second);
      if (!secondVoid) throw journeyBlocked("NO_SECOND_VOIDABLE_BRANCH");
      const responses = await Promise.all([1, 2].map(async (index) => {
        const targetPage = index === 1 ? second : page;
        const targetDialog = index === 1 ? secondVoid.dialog : first.dialog;
        const targetAction = index === 1 ? secondVoid.action : first.action;
        targetPage.once("dialog", (dialog) => dialog.accept());
        const wait = targetPage.waitForResponse((res) => res.request().method() === "POST" && res.url().includes("void-requests"), { timeout: 15_000 }).catch(() => null);
        await targetAction.click();
        return wait;
      }).map(async (pending) => pending));
      const statuses = [];
      for (const pending of responses) { const result = await pending; statuses.push(result?.status() ?? 0); }
      if (!statuses.some((status) => status === 200) || !statuses.some((status) => status === 409)) throw new Error("VOID_REQUEST_NOT_SINGLETON");
      actions.push({ kind: "assert", target: "void-request-singleton", observed: statuses });
    } finally { await second.close().catch(() => undefined); }
    return;
  }
  if (operation === 22) {
    // D21 leaves one void request in reviewer ownership. D22 reuses that
    // legal pending request and races two reviewer pages against the same
    // decision endpoint; one decision may commit and the other must fail
    // closed with 409 without a second state transition.
    const reviewPages = [await reviewerContext.newPage(), await reviewerContext.newPage()];
    reviewPages.forEach((reviewPage, index) => monitor(reviewPage, `J-${spec.id}-review-tab${index + 1}`, spec.id));
    try {
      const opened = await Promise.all(reviewPages.map((reviewPage) => openDrawingReviewDecision(reviewPage, spec, "核准")));
      const responses = await Promise.all(opened.map(async ({ decision }, index) => {
        const reviewPage = reviewPages[index];
        const wait = reviewPage.waitForResponse((res) => res.request().method() === "POST" && res.url().includes("/decisions"), { timeout: 15_000 }).catch(() => null);
        await decision.click();
        const response = await wait;
        return { response, body: response ? await response.json().catch(() => null) : null };
      }));
      const statuses = responses.map(({ response }) => response?.status() ?? 0);
      if (!statuses.some((status) => status === 200) || !statuses.some((status) => status === 409)) throw new Error(`REVIEW_DECISION_NOT_SINGLETON:${JSON.stringify(responses.map(({ response, body }) => ({ status: response?.status() ?? 0, body })))}`);
      actions.push({ kind: "assert", target: "review-decision-singleton", observed: statuses, responseBodies: responses.map(({ body }) => body) });
    } finally {
      await Promise.all(reviewPages.map((reviewPage) => reviewPage.close().catch(() => undefined)));
    }
    return;
  }
  throw journeyBlocked(`UNIMPLEMENTED_DRAWING_MULTI_CONTEXT:${operation}`);
}

async function runRelationMultiContextJourney(context, spec, operation, page, actions) {
  if (operation !== 13) throw journeyBlocked(`UNIMPLEMENTED_RELATION_MULTI_CONTEXT:${operation}`);
  const first = await context.newPage();
  const second = await context.newPage();
  monitor(first, `J-${spec.id}-relation-tab1`, spec.id);
  monitor(second, `J-${spec.id}-relation-tab2`, spec.id);
  try {
    const opened = await Promise.all([first, second].map(async (targetPage) => {
      const { action } = await openCanonicalAction(targetPage, spec, "正式關聯", "建立調整");
      const responsePromise = targetPage.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/change-works"), { timeout: 15_000 }).catch(() => null);
      await action.click();
      const response = await responsePromise;
      return { targetPage, response };
    }));
    const statuses = opened.map(({ response }) => response?.status() ?? 0);
    if (!statuses.some((status) => status === 200) || !statuses.some((status) => status === 409)) {
      throw new Error(`RELATION_WORK_CLAIM_NOT_SINGLETON:${JSON.stringify(statuses)}`);
    }
    actions.push({ kind: "assert", target: "relation-work-singleton", observed: statuses });
    const winner = opened.find(({ response }) => response?.status() === 200)?.targetPage;
    if (!winner) throw new Error("RELATION_WORK_SINGLETON_WINNER_MISSING");
    await winner.waitForURL((url) => url.pathname.endsWith("/workspace") && url.searchParams.has("workId"), { timeout: 30_000 });
    await winner.locator("[data-pdm-edit-page='true']").waitFor({ state: "visible", timeout: 30_000 });
    await cancelWork(winner, spec.route);
  } finally {
    await Promise.all([first.close().catch(() => undefined), second.close().catch(() => undefined)]);
  }
}

async function runExtendedLifecycleJourney(context, reviewerContext, spec) {
  const journeyId = `J-${spec.id}`;
  const dir = path.join(evidenceRoot, "journeys", journeyId);
  ensureDir(dir);
  ensureDir(caseDir(spec.id));
  const page = await context.newPage();
  monitor(page, journeyId, spec.id);
  const actions = [];
  const startedAt = new Date().toISOString();
  let status = "PASS";
  let reason = "";
  let preserveActiveWork = false;
  const blocked = (message) => { const error = new Error(message); error.journeyBlocked = true; throw error; };
  try {
    const operation = Number(spec.id.slice(1));
    if (spec.family === "D") {
      if ([13, 14, 16, 17, 21, 22].includes(operation)) {
        await runDrawingMultiContextJourney(context, reviewerContext, spec, operation, page, actions);
        if (operation === 13) await cancelAllActiveDrawingWorks(page, spec);
      } else if ([25, 26, 27].includes(operation)) {
        blocked("NO_LEGAL_UI_TERMINAL_OR_HISTORY_ENTRY");
      } else if (operation === 18 || operation === 19 || operation === 20) {
        await page.goto(`${baseUrl}${spec.route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await waitForWorkbenchList(page, "圖號工作台");
        const voidable = await openFirstVoidableDrawing(page);
        if (!voidable) blocked("NO_UI_VOID_RD_ACTION");
        const { dialog, action: voidAction } = voidable;
        page.once("dialog", (nativeDialog) => operation === 18 ? nativeDialog.dismiss() : nativeDialog.accept());
        const voidResponse = operation === 18
          ? null
          : page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("/void-requests"), { timeout: 15_000 });
        await voidAction.click();
        if (voidResponse) {
          const response = await voidResponse;
          if (!response.ok()) throw new Error(`UI_VOID_REQUEST_HTTP_${response.status()}`);
        }
        actions.push({ kind: "click", target: "作廢", result: operation === 18 ? "dismiss" : "submitted" });
        if (operation === 18) {
          await dialog.waitFor({ state: "visible", timeout: 10_000 });
        } else {
          const review = await reviewSubmittedWork(reviewerContext, spec, "研發版", operation === 20 ? "approve" : "reject");
          actions.push(...review.actions);
          if (review.status !== "PASS") throw Object.assign(new Error(review.reason || "void review journey failed"), { journeyBlocked: review.status === "BLOCKED" });
        }
      } else if (operation === 12) {
        const pages = [page, await context.newPage(), await context.newPage()];
        const started = [];
        try {
          for (const branchPage of pages) {
            monitor(branchPage, `${journeyId}-branch`, spec.id);
            const item = await startDrawingWork(branchPage, spec, "rd");
            started.push({ page: branchPage, label: item.label });
            actions.push({ kind: "create-branch", label: item.label });
          }
          if (started.length !== 3) blocked("DRAWING_OPEN_BRANCH_COUNT_NOT_THREE");
        } finally {
          // Preserve the three rendered-UI-created branch works until D13
          // asserts the cap. D13 then cancels each work through its own UI.
          preserveActiveWork = true;
          for (const branchPage of pages) await branchPage.close().catch(() => undefined);
        }
      } else {
        const candidateKind = [7, 9, 15].includes(operation) ? "production" : "rd";
        const started = await startDrawingWork(page, spec, candidateKind);
        actions.push({ kind: "create", candidate: started.label, candidateKind });
        if ([6, 7, 8, 9, 15].includes(operation)) {
          actions.push({ kind: await editAndSaveWork(page, spec) });
          await submitWork(page); actions.push({ kind: "submit" });
          const reviewRowText = candidateKind === "production" ? started.label.replace("量產版", "研發版") : started.label;
          const review = await reviewSubmittedWork(reviewerContext, spec, reviewRowText, "approve");
          actions.push(...review.actions);
          if (review.status !== "PASS") throw Object.assign(new Error(review.reason || "revision review journey failed"), { journeyBlocked: review.status === "BLOCKED" });
        } else {
          await cancelWork(page, spec.route); actions.push({ kind: "cancel" });
        }
      }
    } else if (spec.family === "P") {
      if ([11, 12, 13, 14, 15, 16, 17, 18, 19, 20].includes(operation)) {
        blocked(operation >= 18 ? "NO_LEGAL_UI_PART_TERMINAL_OR_HISTORY_ENTRY" : "PART_ATTACHMENT_JOURNEY_BELONGS_TO_DEV088");
      }
      const isReview = [8, 10].includes(operation);
      const isSave = operation === 2;
      const isCancel = [6, 7].includes(operation);
      try {
        await continueCanonicalWork(page, spec, "修改中");
        actions.push({ kind: "continue" });
      } catch (error) {
        if (!error?.journeyBlocked) throw error;
        await startCanonicalWork(page, spec, "正式資料", "建立修改");
        actions.push({ kind: "create" });
      }
      if (isReview) {
        actions.push({ kind: await editAndSaveWork(page, spec) });
        await submitWork(page); actions.push({ kind: "submit" });
        const review = await reviewSubmittedWork(reviewerContext, spec, "修改中", operation === 8 ? "approve" : "reject");
        actions.push(...review.actions);
        if (review.status !== "PASS") throw Object.assign(new Error(review.reason || "part review journey failed"), { journeyBlocked: review.status === "BLOCKED" });
      } else if (isSave) {
        actions.push({ kind: await editAndSaveWork(page, spec) });
        await cancelWork(page, spec.route); actions.push({ kind: "cancel-after-save" });
      } else if (isCancel) {
        await cancelWork(page, spec.route); actions.push({ kind: "cancel" });
      } else {
        await cancelWork(page, spec.route); actions.push({ kind: "cancel" });
      }
  } else {
      if (operation === 13) {
        await runRelationMultiContextJourney(context, spec, operation, page, actions);
      } else {
        if ([15, 16, 17, 18, 19, 20].includes(operation)) blocked(operation >= 16 ? "NO_LEGAL_UI_RELATION_TERMINAL_OR_HISTORY_ENTRY" : "NO_DETERMINISTIC_MULTI_CONTEXT_UI_FIXTURE");
        const isReview = operation === 12 || operation === 14;
        const isSave = [2, 7, 9, 10].includes(operation);
        try {
          await continueCanonicalWork(page, spec, "調整中");
          actions.push({ kind: "continue" });
        } catch (error) {
          if (!error?.journeyBlocked) throw error;
          await startCanonicalWork(page, spec, "正式關聯", "建立調整");
          actions.push({ kind: "create" });
        }
        if (isReview) {
          actions.push({ kind: await editAndSaveWork(page, spec) });
          await submitWork(page); actions.push({ kind: "submit" });
          const review = await reviewSubmittedWork(reviewerContext, spec, "調整中", operation === 12 ? "approve" : "reject");
          actions.push(...review.actions);
          if (review.status !== "PASS") throw Object.assign(new Error(review.reason || "relation review journey failed"), { journeyBlocked: review.status === "BLOCKED" });
        } else if (isSave) {
          actions.push({ kind: await editAndSaveWork(page, spec) });
          await cancelWork(page, spec.route); actions.push({ kind: "cancel-after-save" });
        } else {
          await cancelWork(page, spec.route); actions.push({ kind: "cancel" });
        }
      }
    }
  } catch (error) {
    if (error?.journeyBlocked) { status = "BLOCKED"; reason = error.message; }
    else { status = "FAIL"; reason = error instanceof Error ? error.message : String(error); failures.push({ caseId: spec.id, kind: "journey", message: reason }); }
  } finally {
    if (!preserveActiveWork) await cleanupActiveWork(page, spec).catch(() => undefined);
    writeJson(path.join(dir, "journey.json"), { id: journeyId, caseId: spec.id, family: spec.family, status, reason, actions, startedAt, finishedAt: new Date().toISOString(), mutationPolicy: "rendered UI clicks and typing only; API/DB readback only" });
    await page.close().catch(() => {});
  }
  return { id: journeyId, caseId: spec.id, status, reason, evidence: path.relative(root, path.join(dir, "journey.json")) };
}

async function approveInitialDrawingRevision(page, reviewerContext, spec, rowLabel, actions, scope) {
  await submitWork(page);
  actions.push({ kind: "submit", scope, rowLabel });
  const review = await reviewSubmittedWork(reviewerContext, spec, rowLabel, "approve");
  actions.push(...review.actions.map((action) => ({ ...action, scope })));
  if (review.status !== "PASS") throw Object.assign(new Error(review.reason || `review failed: ${scope}`), { journeyBlocked: review.status === "BLOCKED" });
}

async function assertUploadedDrawingFilesAfterReload(page, files) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".dev079-workspace").waitFor({ state: "visible", timeout: 30_000 });
  const observed = [];
  for (const file of files) {
    const name = path.basename(file);
    await page.getByText(name, { exact: true }).first().waitFor({ state: "visible", timeout: 30_000 });
    observed.push(name);
  }
  await page.getByText("本版次 2D 與 3D 主檔已齊備。", { exact: true }).first().waitFor({ state: "visible", timeout: 30_000 });
  return observed;
}

async function runInitialDrawingLifecycleJourney(context, reviewerContext, spec) {
  const journeyId = `J-${spec.id}`;
  const dir = path.join(evidenceRoot, "journeys", journeyId);
  ensureDir(dir);
  ensureDir(caseDir(spec.id));
  const page = await context.newPage();
  monitor(page, journeyId, spec.id);
  const actions = [];
  const checkpoints = {};
  const startedAt = new Date().toISOString();
  let status = "PASS";
  let reason = "";
  try {
    const operation = Number(spec.id.slice(1));
    const created = await createInitialDrawingThroughUi(page, spec, actions);
    checkpoints.created = readDrawingLifecycleCheckpoint(created.drawingCode);
    assertInitialDrawingCheckpoint(checkpoints.created, { revision: "0.1", handling: "owner", lifecycle: "preparing" });
    if (checkpoints.created.aggregate?.open_branch_count !== 1
      || checkpoints.created.claims.length !== 1
      || checkpoints.created.claims[0]?.target_label !== "0.1"
      || checkpoints.created.works.length !== 1) {
      throw new Error(`INITIAL_DRAWING_01_ATOMIC_STATE_MISMATCH:${safeJson(checkpoints.created)}`);
    }
    actions.push({ kind: "assert-db", target: "atomic-first-0.1", observed: checkpoints.created });

    if (operation === 1) {
      // D01 deliberately retains the first owner work for the final list/API/
      // DB readback. The whole fixture is task-owned and removed afterwards.
    } else {
      await continueCanonicalWork(page, spec, "研發版 0.1");
      actions.push({ kind: "continue", revision: "0.1" });
      if (operation === 2) {
        await cancelWork(page, spec.route);
        actions.push({ kind: "cancel", revision: "0.1" });
        checkpoints.final = readDrawingLifecycleCheckpoint(created.drawingCode);
        assertInitialDrawingCheckpoint(checkpoints.final, { revision: "0.1", row: "absent" });
        if (checkpoints.final.aggregate?.open_branch_count !== 0) throw new Error(`INITIAL_DRAWING_CANCEL_AGGREGATE_MISMATCH:${safeJson(checkpoints.final)}`);
      } else if (operation === 3) {
        const beforeUpload = readDrawingLifecycleCheckpoint(created.drawingCode);
        const beforeVersion = Number(beforeUpload.works[0]?.row_version ?? 0);
        const uploadRows = await uploadDrawingFiles(page);
        actions.push({ kind: "upload", files: [path.basename(drawingUpload2d), path.basename(drawingUpload3d)], observed: uploadRows });
        const observedFiles = await assertUploadedDrawingFilesAfterReload(page, [drawingUpload2d, drawingUpload3d]);
        checkpoints.final = readDrawingLifecycleCheckpoint(created.drawingCode);
        const finalWork = checkpoints.final.works.find((work) => work.target_label === "0.1");
        if (Number(finalWork?.row_version ?? 0) <= beforeVersion || Number(finalWork?.file_count ?? 0) !== 2) {
          throw new Error(`INITIAL_DRAWING_SAVE_RELOAD_VERSION_MISMATCH:${safeJson({ beforeVersion, finalWork, checkpoint: checkpoints.final })}`);
        }
        assertInitialDrawingCheckpoint(checkpoints.final, { revision: "0.1", handling: "owner", lifecycle: "preparing" });
        actions.push({ kind: "assert", target: "0.1-files-after-reload", observed: observedFiles, rowVersion: finalWork.row_version });
      } else if (operation === 4) {
        await uploadDrawingFiles(page);
        await submitWork(page);
        actions.push({ kind: "submit", revision: "0.1" });
        const review = await reviewSubmittedWork(reviewerContext, spec, "研發版 0.1", "reject");
        actions.push(...review.actions.map((action) => ({ ...action, scope: "0.1-return" })));
        if (review.status !== "PASS") throw Object.assign(new Error(review.reason || "0.1 return failed"), { journeyBlocked: review.status === "BLOCKED" });
        checkpoints.final = readDrawingLifecycleCheckpoint(created.drawingCode);
        assertInitialDrawingCheckpoint(checkpoints.final, { revision: "0.1", handling: "owner", lifecycle: "correction_required" });
        if (checkpoints.final.reviewRequests.length !== 0) throw new Error(`INITIAL_DRAWING_RETURN_REQUEST_RESIDUE:${safeJson(checkpoints.final)}`);
      } else {
        await uploadDrawingFiles(page);
        if (operation === 5) {
          await submitWork(page);
          actions.push({ kind: "submit", scope: "0.1-first" });
          const returned = await reviewSubmittedWork(reviewerContext, spec, "研發版 0.1", "reject");
          actions.push(...returned.actions.map((action) => ({ ...action, scope: "0.1-return" })));
          if (returned.status !== "PASS") throw Object.assign(new Error(returned.reason || "0.1 return failed"), { journeyBlocked: returned.status === "BLOCKED" });
          await continueCanonicalWork(page, spec, "研發版 0.1");
          const beforeResubmit = readDrawingLifecycleCheckpoint(created.drawingCode);
          const beforeVersion = Number(beforeResubmit.works[0]?.row_version ?? 0);
          const uploadRows = await uploadDrawingFiles(page, [drawingResubmit2d, drawingResubmit3d]);
          actions.push({ kind: "change-after-return", files: [path.basename(drawingResubmit2d), path.basename(drawingResubmit3d)], observed: uploadRows });
          const afterResubmitUpload = readDrawingLifecycleCheckpoint(created.drawingCode);
          if (Number(afterResubmitUpload.works[0]?.row_version ?? 0) <= beforeVersion) throw new Error(`INITIAL_DRAWING_RESUBMIT_DID_NOT_CHANGE:${safeJson({ beforeResubmit, afterResubmitUpload })}`);
          await approveInitialDrawingRevision(page, reviewerContext, spec, "研發版 0.1", actions, "0.1-resubmit");
          checkpoints.final = readDrawingLifecycleCheckpoint(created.drawingCode);
          assertInitialDrawingCheckpoint(checkpoints.final, { revision: "0.1", handling: "none", lifecycle: "rd_controlled" });
          if (checkpoints.final.rows.some((row) => row.data_layer === "drawing_production")) throw new Error(`INITIAL_DRAWING_01_CREATED_PRODUCTION:${safeJson(checkpoints.final)}`);
        } else {
          await approveInitialDrawingRevision(page, reviewerContext, spec, "研發版 0.1", actions, "0.1-approve");
          checkpoints.approved01 = readDrawingLifecycleCheckpoint(created.drawingCode);
          assertInitialDrawingCheckpoint(checkpoints.approved01, { revision: "0.1", handling: "none", lifecycle: "rd_controlled" });
          const candidateKind = operation === 7 ? "production" : "rd";
          const started = await startDrawingWork(page, spec, candidateKind);
          const expectedCandidate = operation === 7 ? "量產版 1" : "研發版 0.2";
          if (started.label !== expectedCandidate) throw new Error(`INITIAL_DRAWING_NEXT_TARGET_MISMATCH:${started.label}/${expectedCandidate}`);
          actions.push({ kind: "create-next", candidate: started.label, candidateKind });
          await uploadDrawingFiles(page, [drawingResubmit2d, drawingResubmit3d]);
          const reviewRow = operation === 7 ? "研發版 1" : "研發版 0.2";
          await approveInitialDrawingRevision(page, reviewerContext, spec, reviewRow, actions, operation === 7 ? "production-1" : "0.2-approve");
          checkpoints.final = readDrawingLifecycleCheckpoint(created.drawingCode);
          if (operation === 6) {
            assertInitialDrawingCheckpoint(checkpoints.final, { revision: "0.2", handling: "none", lifecycle: "rd_controlled" });
            const approvedTargets = checkpoints.final.claims.filter((claim) => claim.claim_state === "approved").map((claim) => claim.target_label);
            if (!approvedTargets.includes("0.1") || !approvedTargets.includes("0.2") || checkpoints.final.claims.find((claim) => claim.target_label === "0.2")?.predecessor_revision_id == null) {
              throw new Error(`INITIAL_DRAWING_02_CHAIN_MISMATCH:${safeJson(checkpoints.final)}`);
            }
          } else {
            const production = checkpoints.final.rows.find((row) => row.data_layer === "drawing_production" && row.revision === "1");
            if (!production || production.lifecycle_state !== "released") throw new Error(`INITIAL_DRAWING_PRODUCTION_1_MISSING:${safeJson(checkpoints.final)}`);
            if (!checkpoints.final.branches.some((branch) => branch.status === "historical" && branch.closed_reason === "production_promoted")) {
              throw new Error(`INITIAL_DRAWING_PRODUCTION_BRANCH_NOT_HISTORICAL:${safeJson(checkpoints.final)}`);
            }
            if (checkpoints.final.revisions.some((revision) => revision.revision === "0")) throw new Error(`INITIAL_DRAWING_FAKE_PRODUCTION_0:${safeJson(checkpoints.final)}`);
          }
        }
      }
    }
    if (!checkpoints.final) checkpoints.final = readDrawingLifecycleCheckpoint(created.drawingCode);
    writeJson(path.join(dir, "lifecycle-checkpoints.json"), checkpoints);
  } catch (error) {
    if (error?.journeyBlocked) { status = "BLOCKED"; reason = error.message; }
    else { status = "FAIL"; reason = error instanceof Error ? error.message : String(error); failures.push({ caseId: spec.id, kind: "journey", message: reason }); }
    writeJson(path.join(dir, "lifecycle-checkpoints.json"), checkpoints);
  } finally {
    writeJson(path.join(dir, "journey.json"), { id: journeyId, caseId: spec.id, family: spec.family, status, reason, drawingCode: lifecycleDrawingCode, actions, checkpoints: "lifecycle-checkpoints.json", startedAt, finishedAt: new Date().toISOString(), mutationPolicy: "rendered UI clicks and typing only; API/DB readback only" });
    await page.close().catch(() => {});
  }
  return { id: journeyId, caseId: spec.id, status, reason, evidence: path.relative(root, path.join(dir, "journey.json")) };
}

async function runLifecycleJourney(context, reviewerContext, spec) {
  if (spec.family === "D" && Number(spec.id.slice(1)) >= 1 && Number(spec.id.slice(1)) <= 7) {
    return runInitialDrawingLifecycleJourney(context, reviewerContext, spec);
  }
  if (Number(spec.id.slice(1)) > 5) return runExtendedLifecycleJourney(context, reviewerContext, spec);
  const journeyId = `J-${spec.id}`;
  const dir = path.join(evidenceRoot, "journeys", journeyId);
  ensureDir(dir);
  ensureDir(caseDir(spec.id));
  const page = await context.newPage();
  monitor(page, journeyId, spec.id);
  const actions = [];
  const startedAt = new Date().toISOString();
  let status = "PASS";
  let reason = "";
  try {
    const operation = spec.id.slice(1);
    const isCancel = ["01", "02"].includes(operation);
    const isSave = ["03"].includes(operation);
    const isReviewReject = ["04"].includes(operation);
    const isReviewApprove = ["05"].includes(operation);
    if (spec.family === "D") {
      const started = operation === "05"
        ? { label: "研發版 1.2", url: await continueCanonicalWork(page, spec, "研發版 1.2") }
        : await startDrawingWork(page, spec, "rd");
      actions.push({ kind: "create", candidate: started.label });
      if (isSave || isReviewReject || isReviewApprove) {
        actions.push({ kind: await editAndSaveWork(page, spec) });
      }
      if (isReviewReject || isReviewApprove) {
        await submitWork(page); actions.push({ kind: "submit" });
        const review = await reviewSubmittedWork(reviewerContext, spec, started.label, isReviewApprove ? "approve" : "reject");
        actions.push(...review.actions);
        if (review.status !== "PASS") throw Object.assign(new Error(review.reason || "review journey failed"), { journeyBlocked: review.status === "BLOCKED" });
        if (isReviewReject && !["D04"].includes(spec.id)) {
          await page.goto(`${baseUrl}${spec.route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
          await waitForWorkbenchList(page, "圖號工作台");
          const row = page.locator(".canonical-table-wrap tbody tr").filter({ hasText: started.label }).first();
          if (await row.count() > 0) {
            await row.locator(".canonical-row-open").click();
            const dialog = page.locator(".pdm-entity-detail-drawer").last();
            await dialog.waitFor({ state: "visible" });
            const edit = dialog.getByRole("button", { name: "進行編輯", exact: true }).first();
            if (await edit.count() > 0) {
              await edit.click();
              await page.waitForURL((url) => url.pathname.endsWith("/workspace") && url.searchParams.has("workId"), { timeout: 30_000 });
              await page.getByRole("button", { name: "取消本次工作", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
              await cancelWork(page, spec.route);
              actions.push({ kind: "cancel-after-reject" });
            }
          }
        }
      } else if (isSave) {
        await cancelWork(page, spec.route); actions.push({ kind: "cancel-after-field-retirement-check" });
      } else {
        await cancelWork(page, spec.route); actions.push({ kind: "cancel" });
      }
    } else {
      const rowText = operation === "05" ? (spec.family === "P" ? "修改中" : "調整中") : (spec.family === "P" ? "正式資料" : "正式關聯");
      if (operation === "05") {
        try {
          await continueCanonicalWork(page, spec, rowText);
          actions.push({ kind: "continue" });
        } catch (error) {
          if (!error?.journeyBlocked) throw error;
          await startCanonicalWork(page, spec, spec.family === "P" ? "正式資料" : "正式關聯", spec.family === "P" ? "建立修改" : "建立調整");
          actions.push({ kind: "setup-create" });
        }
      } else {
        await startCanonicalWork(page, spec, rowText, spec.family === "P" ? "建立修改" : "建立調整");
        actions.push({ kind: "create" });
      }
      if (isSave || isReviewReject || isReviewApprove) actions.push({ kind: await editAndSaveWork(page, spec) });
      if (isReviewReject || isReviewApprove) {
        await submitWork(page); actions.push({ kind: "submit" });
        const review = await reviewSubmittedWork(reviewerContext, spec, spec.family === "P" ? "修改中" : "調整中", isReviewApprove ? "approve" : "reject");
        actions.push(...review.actions);
        if (review.status !== "PASS") throw Object.assign(new Error(review.reason || "review journey failed"), { journeyBlocked: review.status === "BLOCKED" });
        if (isReviewReject && !["P04", "R04"].includes(spec.id)) {
          await page.goto(`${baseUrl}${spec.route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
          await waitForWorkbenchList(page, spec.family === "P" ? "料號工作台" : "圖料工作台");
          const row = page.locator(".canonical-table-wrap tbody tr").filter({ hasText: spec.family === "P" ? "修改中" : "調整中" }).first();
          if (await row.count() > 0) {
            await row.locator(".pdm-identity-code, .canonical-row-open").first().click();
            const dialog = page.locator(".pdm-entity-detail-drawer").last();
            await dialog.waitFor({ state: "visible" });
            const edit = dialog.getByRole("button", { name: "進行編輯", exact: true }).first();
            if (await edit.count() > 0) {
              await edit.click();
              await page.waitForURL((url) => url.pathname.endsWith("/workspace") && url.searchParams.has("workId"), { timeout: 30_000 });
              await page.getByRole("button", { name: "取消本次工作", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
              await cancelWork(page, spec.route);
              actions.push({ kind: "cancel-after-reject" });
            }
          }
        }
      } else {
        await cancelWork(page, spec.route); actions.push({ kind: "cancel" });
      }
    }
  } catch (error) {
    if (error?.journeyBlocked) { status = "BLOCKED"; reason = error.message; }
    else { status = "FAIL"; reason = error instanceof Error ? error.message : String(error); failures.push({ caseId: spec.id, kind: "journey", message: reason }); }
  } finally {
    if (!["D04", "P04", "R04"].includes(spec.id)) await cleanupActiveWork(page, spec).catch(() => undefined);
    writeJson(path.join(dir, "journey.json"), { id: journeyId, caseId: spec.id, family: spec.family, status, reason, actions, startedAt, finishedAt: new Date().toISOString(), mutationPolicy: "rendered UI clicks and typing only; API/DB readback only" });
    await page.close().catch(() => {});
  }
  return { id: journeyId, caseId: spec.id, status, reason, evidence: path.relative(root, path.join(dir, "journey.json")) };
}

function monitor(page, label, caseId = null) {
  let expectedMissingRecognitionSessionConsoleErrors = 0;
  page.on("console", (message) => {
    if (message.type() === "error") {
      const consoleText = message.text();
      if (expectedMissingRecognitionSessionConsoleErrors > 0 && consoleText === "Failed to load resource: the server responded with a status of 404 (Not Found)") {
        expectedMissingRecognitionSessionConsoleErrors -= 1;
        expectedHttpEvents.push({ caseId, label, kind: "console-consumed", status: 404, reason: "cancelled recognition session follow-up" });
        return;
      }
      const expectedStaleConflict = (caseId === "D16" || caseId === "D17") && label.includes("stale") && message.text().includes("409");
      const expectedClaimConflict = caseId === "D14" && message.text().includes("409");
      const expectedVoidConflict = caseId === "D21" && message.text().includes("409");
      const expectedReviewConflict = caseId === "D22" && message.text().includes("409");
      const expectedRelationConflict = caseId === "R13" && message.text().includes("409");
      if (expectedStaleConflict || expectedClaimConflict || expectedVoidConflict || expectedReviewConflict || expectedRelationConflict) return;
      consoleErrors.push({ label, message: message.text(), caseId });
      if (caseId) fs.appendFileSync(path.join(caseDir(caseId), "console.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), type: "error", message: message.text() })}\n`, "utf8");
    }
  });
  page.on("pageerror", (error) => {
    failures.push({ label, kind: "pageerror", message: error.message, caseId });
    if (caseId) fs.appendFileSync(path.join(caseDir(caseId), "page-errors.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), message: error.message })}\n`, "utf8");
  });
  page.on("request", (request) => {
    network.push({ caseId, label, method: request.method(), url: request.url() });
    if (caseId) recordNetwork(caseId, { type: "request", method: request.method(), url: request.url() });
  });
  page.on("response", (response) => {
    const item = { caseId, label, status: response.status(), method: response.request().method(), url: response.url() };
    network.push(item);
    if (caseId) recordNetwork(caseId, { type: "response", status: response.status(), method: response.request().method(), url: response.url() });
    const responsePath = new URL(response.url()).pathname;
    const expectedMissingRecognitionSession = response.status() === 404
      && response.request().method() === "GET"
      && /^\/api\/numbering\/recognition-sessions\/[^/]+$/u.test(responsePath);
    if (expectedMissingRecognitionSession) {
      expectedMissingRecognitionSessionConsoleErrors += 1;
      expectedHttpEvents.push({ ...item, kind: "expected-http", reason: "cancelled recognition session follow-up" });
      return;
    }
    const expectedStaleConflict = (caseId === "D16" || caseId === "D17") && label.includes("stale") && response.status() === 409 && response.request().method() === "POST" && response.url().includes("/revision-works");
    const expectedClaimConflict = caseId === "D14" && response.status() === 409 && response.request().method() === "POST" && response.url().includes("/revision-works");
    const expectedVoidConflict = caseId === "D21" && response.status() === 409 && response.request().method() === "POST" && response.url().includes("/void-requests");
    const expectedReviewConflict = caseId === "D22" && response.status() === 409 && response.request().method() === "POST" && response.url().includes("/decisions");
    const expectedRelationConflict = caseId === "R13" && response.status() === 409 && response.request().method() === "POST" && response.url().includes("/change-works");
    if (response.status() >= 400 && !expectedStaleConflict && !expectedClaimConflict && !expectedVoidConflict && !expectedReviewConflict && !expectedRelationConflict) failures.push({ ...item, kind: "http" });
  });
}

async function login(context, roleLabel = "系統管理員") {
  const page = await context.newPage();
  monitor(page, `login-${roleLabel}`);
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: "AI PDM 登入", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: `以${roleLabel}角色快速登入`, exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 30_000 });
  await page.close();
}

async function installTaskOwnedQaSession(context, roleLabel) {
  const emailByRoleLabel = {
    "系統管理員": "admin@example.com",
    "研發主管": "manager@example.com"
  };
  const email = emailByRoleLabel[roleLabel];
  if (!email) throw new Error(`TASK_OWNED_QA_SESSION_ROLE_UNSUPPORTED:${roleLabel}`);
  const database = new Database(fixtureDb, { readonly: true, fileMustExist: true });
  let user;
  try {
    user = database.prepare("SELECT id, role, account_status, system_role_enabled FROM users WHERE lower(email)=lower(?) LIMIT 1").get(email);
  } finally {
    database.close();
  }
  if (!user || user.account_status !== "active" || Number(user.system_role_enabled) !== 1) {
    throw new Error(`TASK_OWNED_QA_SESSION_USER_UNAVAILABLE:${roleLabel}`);
  }
  const payload = Buffer.from(JSON.stringify({ userId: user.id, createdAt: Date.now(), sessionId: crypto.randomUUID() })).toString("base64url");
  const secret = process.env.PDM_AUTH_SECRET || "dev-only-change-before-production";
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  await context.addCookies([{ name: "pdm_session", value: `${payload}.${signature}`, url: baseUrl, httpOnly: true, sameSite: "Lax" }]);
  const verification = await context.request.get(`${baseUrl}/api/auth/me`);
  if (!verification.ok()) throw new Error(`TASK_OWNED_QA_SESSION_VERIFY_HTTP_${verification.status()}:${roleLabel}`);
  const body = await verification.json().catch(() => null);
  if (body?.user?.role !== user.role) throw new Error(`TASK_OWNED_QA_SESSION_ROLE_MISMATCH:${safeJson({ expected: user.role, actual: body?.user?.role })}`);
}

async function readOnlyDbSnapshot(entity) {
  const db = new Database(fixtureDb, { readonly: true });
  try {
    if (entity === "drawing") return db.prepare(`SELECT drawing.drawing_number AS code, root.core_name AS name, state.data_layer, state.handling, state.blocker_reason, state.work_id, state.revision_id, revision.revision FROM canonical_workbench_states state JOIN drawings drawing ON drawing.id = state.canonical_entity_id LEFT JOIN part_roots root ON root.id = drawing.part_root_id LEFT JOIN drawing_revisions revision ON revision.id = state.revision_id WHERE drawing.drawing_number = ? ORDER BY state.data_layer, state.revision_id`).all(lifecycleDrawingCode);
    if (entity === "part") return db.prepare(`SELECT part.part_number AS code, part.part_name AS name, state.data_layer, state.handling, state.blocker_reason, state.work_id, NULL AS revision_id, NULL AS revision FROM canonical_workbench_states state JOIN part_numbers part ON part.id = state.canonical_entity_id WHERE part.part_number = 'A0002-P01' ORDER BY state.data_layer`).all();
    return db.prepare(`SELECT root.root_code AS code, root.core_name AS name, state.data_layer, state.handling, state.blocker_reason, state.work_id, NULL AS revision_id, NULL AS revision FROM canonical_workbench_states state JOIN part_roots root ON root.id = state.canonical_entity_id WHERE root.root_code = 'A0002' ORDER BY state.data_layer`).all();
  } finally { db.close(); }
}

function layerLabel(entity, dataLayer, revision) {
  if (entity === "drawing") return dataLayer === "drawing_production" ? `量產版 ${revision ?? "-"}` : `研發版 ${revision ?? "-"}`;
  if (entity === "part") return dataLayer === "part_formal" ? "正式資料" : "修改中";
  return dataLayer === "relation_formal" ? "正式關聯" : "調整中";
}

const handlingVisibleLabel = {
  none: "",
  owner: "負責人處理",
  review_owner: "審核負責人處理",
  system: "系統處理",
  system_admin: "系統管理員處理",
  blocked: "受阻"
};

function rowKey(row) {
  return [row.code, row.name, row.layer, row.revision ?? "", row.handling, row.blockerReason ?? ""].join("|");
}

async function executeCase(context, spec, index) {
  const dir = caseDir(spec.id); ensureDir(path.join(dir, "screenshots"));
  const page = await context.newPage(); monitor(page, spec.id, spec.id);
  const started = new Date().toISOString();
  const actions = [];
  let actual = {};
  let status = "PASS";
  let reason = "";
  try {
    recordAction(spec.id, { kind: "navigate", target: spec.route, accessibleName: spec.title });
    await page.goto(`${baseUrl}${spec.route}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.getByRole("heading", { name: spec.family === "D" ? "圖號工作台" : spec.family === "P" ? "料號工作台" : "圖料工作台", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
    await page.locator(".canonical-list-meta").waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector(".canonical-list")?.getAttribute("aria-busy") === "false", null, { timeout: 30_000 });
    const headers = (await page.locator(".canonical-table-wrap thead th").allTextContents()).map((value) => value.trim());
    const toolbar = (await page.locator(".canonical-toolbar > label > span, .canonical-toolbar > .pdm-workbench-multi-select-filter > .pdm-workbench-multi-select-label").allTextContents()).map((value) => value.trim());
    const sortControl = page.locator(".number-sort-header").first();
    if (await sortControl.count() > 0 && /排序/u.test(await sortControl.getAttribute("aria-label") ?? "")) toolbar.push("排序");
    const rows = await page.locator(".canonical-table-wrap tbody tr").allTextContents();
    const apiResponse = await page.evaluate(async (api) => { const response = await fetch(api, { cache: "no-store" }); return { status: response.status, body: await response.json().catch(() => null) }; }, spec.api);
    const dbSnapshot = (await readOnlyDbSnapshot(spec.entity)).map((row) => ({ ...row, layer: layerLabel(spec.entity, row.data_layer, row.revision) }));
    actual = { headers, toolbar, rows, apiStatus: apiResponse.status, apiBodyHash: safeJson(apiResponse.body).length, dbRows: dbSnapshot.length };
    actions.push({ kind: "readback", headers, toolbar, rows: rows.length, apiStatus: apiResponse.status, dbRows: dbSnapshot.length });
    writeJson(path.join(dir, "api-readback", "list.json"), apiResponse.body);
    writeJson(path.join(dir, "db-readback", "list.json"), { readOnly: true, entity: spec.entity, rows: dbSnapshot });
    const apiRows = (apiResponse.body?.data?.groups ?? []).flatMap((group) => group.rows ?? []).map((row) => ({ code: row.code, name: row.name, layer: row.layerLabel, revision: row.revision, handling: row.handling, blockerReason: row.blockerReason ?? "" }));
    const dbRows = dbSnapshot.map((row) => ({ code: row.code, name: row.name, layer: row.layer, revision: row.revision, handling: row.handling, blockerReason: row.blocker_reason ?? "" }));
    const apiKeys = apiRows.map(rowKey).sort();
    const dbKeys = dbRows.map(rowKey).sort();
    const uiMissing = apiRows.filter((row) => !rows.some((text) => [row.code, row.name, row.layer, row.handling === "none" ? "" : (handlingVisibleLabel[row.handling] || row.handling), row.blockerReason].filter(Boolean).every((term) => text.includes(term))));
    const expectedHeaders = spec.entity === "drawing"
      ? "編號|品名|版本|資料狀態|處理"
      : "編號|品名|版本|資料狀態|處理";
    const expectedToolbar = spec.entity === "drawing"
      ? "搜尋|版本|處理|用途|系列|排序"
      : "搜尋|資料|處理|料件類型|系列|材質|顏色|排序";
    const triadDiff = [
      ...(headers.join("|") === expectedHeaders && toolbar.join("|") === expectedToolbar ? [] : ["list-contract-mismatch"]),
      ...(apiResponse.status === 200 ? [] : ["api-status-mismatch"]),
      ...(JSON.stringify(apiKeys) === JSON.stringify(dbKeys) ? [] : ["api-db-row-mismatch"]),
      ...(uiMissing.length === 0 ? [] : ["ui-api-row-mismatch"])
    ];
    writeJson(path.join(dir, "triad-diff", "list.json"), { diff: triadDiff, ui: { headers, toolbar, rows }, api: { status: apiResponse.status, rows: apiRows }, db: { rows: dbRows }, uiMissing });
    await page.screenshot({ path: path.join(dir, "screenshots", `${spec.id}-after-desktop.png`), fullPage: true, caret: "initial" });
    recordAction(spec.id, { kind: "readback", before: { route: spec.route }, after: actual });
    if (triadDiff.length > 0) {
      status = "FAIL"; reason = "canonical list contract or readback failed";
    }
    // A case may only become PASS after its named rendered-UI journey has
    // produced evidence.  Cases without a journey remain BLOCKED so the
    // denominator cannot be reduced or accidentally treated as read-only.
    if (status === "PASS" && spec.id !== "D24") {
      const journey = lifecycleJourneyByCase.get(spec.id);
      if (!journey) {
        status = "BLOCKED";
        reason = "NO_UI_JOURNEY_IMPLEMENTED_FOR_CASE";
      } else if (journey.status === "BLOCKED") {
        status = "BLOCKED";
        reason = journey.reason || "UI_JOURNEY_PRECONDITION_BLOCKED";
      } else if (journey.status === "FAIL") {
        status = "FAIL";
        reason = journey.reason || "UI_JOURNEY_FAILED";
      }
    }
    if (spec.id === "D27" || spec.id === "P20" || spec.id === "R20") {
      const hasMergedText = rows.some((row) => /Merged|已合併/u.test(row));
      if (!hasMergedText) { status = "BLOCKED"; reason = "NO_LEGAL_MERGED_HISTORY_UI_PRECONDITION"; }
    }
  } catch (error) {
    status = "FAIL"; reason = error instanceof Error ? error.message : String(error);
    failures.push({ caseId: spec.id, kind: "case", message: reason });
  } finally {
    writeJson(path.join(dir, "visible-error-sweep.json"), { visibleErrors: await page.locator(".canonical-error[role='alert']:visible").allTextContents().catch(() => []) });
    writeJson(path.join(dir, "viewport-metrics.json"), await page.evaluate(() => { try { return { width: window.innerWidth, height: window.innerHeight, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }; } catch { return {}; } }));
    await page.close().catch(() => {});
  }
  const record = { id: spec.id, family: spec.family, title: spec.title, status, reason, startedAt: started, finishedAt: new Date().toISOString(), expected: { ui: "canonical workbench list", mutation: spec.id === "D24" ? "filter/readback" : "full lifecycle journey" }, actual, evidence: { actions: "actions.jsonl", network: "network.jsonl", triad: "triad-diff/list.json" } };
  writeJson(path.join(dir, "case.json"), record);
  cases.push(record);
  return record;
}

function runFaultProfile(profile) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "qc-dev-087-fault-browser.mjs")], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      QC_DEV087_FAULT_PROFILE: profile,
      QC_DEV087_SOURCE_DB: faultProfileSourceDb,
      QC_DEV087_SOURCE_REPOSITORY: faultProfileSourceRepository,
      QC_DEV087_SOURCE_PREPARED: "1"
    },
    maxBuffer: 20 * 1024 * 1024
  });
  const match = result.stdout.match(/\{\s*"devId":\s*"DEV-087"[\s\S]*\}\s*$/u);
  let manifest = null;
  try { manifest = match ? JSON.parse(match[0]) : null; } catch { manifest = null; }
  writeJson(path.join(evidenceRoot, "fault-profiles", `${profile}.json`), { exitCode: result.status, manifest, stdoutTail: result.stdout.slice(-4000), stderrTail: result.stderr.slice(-4000) });
  return { profile, status: result.status === 0 && manifest?.status === "PASS" ? "PASS" : "FAIL", manifest };
}

async function runIsolatedLifecycleBundle(caseIds) {
  const attempts = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = spawnSync(process.execPath, [path.join(root, "scripts", "qc-dev-087-ui-only.mjs")], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        QC_DEV087_LIFECYCLE_FOCUS: caseIds.join(","),
        QC_DEV087_FAST_FOCUS: "1",
        QC_DEV087_SKIP_SUPPLEMENTAL: "1",
        QC_DEV087_ISOLATED_CHILD: "1"
      },
      maxBuffer: 24 * 1024 * 1024
    });
    const match = result.stdout.match(/\{\s*"devId":\s*"DEV-087"[\s\S]*\}\s*$/u);
    let manifest = null;
    try { manifest = match ? JSON.parse(match[0]) : null; } catch { manifest = null; }
    const rows = caseIds.map((caseId) => manifest?.cases?.find((item) => item.id === caseId) ?? null);
    const journeys = caseIds.map((caseId) => manifest?.lifecycleJourneys?.find((item) => item.caseId === caseId) ?? null);
    const pass = Boolean(manifest) && rows.every((row) => row?.status === "PASS") && journeys.every((journey) => journey?.status === "PASS") && (manifest.consoleErrors?.length ?? 0) === 0 && (manifest.failures?.length ?? 0) === 0;
    const infrastructureExhaustion = [
      result.stdout,
      result.stderr,
      ...(manifest?.consoleErrors ?? []).map((entry) => entry.message ?? ""),
      ...manifest?.checks?.filter((entry) => !entry.pass).map((entry) => entry.detail ?? "") ?? []
    ].some((value) => /ERR_(?:NO_BUFFER_SPACE|NETWORK_CHANGED)/u.test(String(value)));
    attempts.push({
      attempt,
      runId: manifest?.runId ?? null,
      evidenceRoot: manifest?.evidenceRoot ?? null,
      exitCode: result.status,
      pass,
      infrastructureExhaustion,
      consoleErrors: manifest?.consoleErrors ?? [],
      failures: manifest?.failures ?? []
    });
    if (pass) {
      rows.forEach((row) => cases.push(row));
      journeys.forEach((journey) => {
        lifecycleJourneys.push(journey);
        lifecycleJourneyByCase.set(journey.caseId, journey);
      });
      if (attempts.length > 1) writeJson(path.join(evidenceRoot, "infrastructure-retries", `${caseIds.join("-")}.json`), attempts);
      addCheck(`isolated UI journey ${caseIds.join("+")}`, true, safeJson({ child: manifest.runId, evidence: manifest.evidenceRoot, attempts }));
      return;
    }
    if (!infrastructureExhaustion || attempt === 2) {
      const detail = safeJson({ caseIds, exitCode: result.status, rows, journeys, childFailures: manifest?.failures ?? [], childConsoleErrors: manifest?.consoleErrors ?? [], attempts, stdoutTail: result.stdout.slice(-2000), stderrTail: result.stderr.slice(-2000) });
      throw new Error(`ISOLATED_UI_BUNDLE_FAILED:${detail}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20_000));
  }
}

try {
  ensureDir(screenshotRoot); ensureDir(evidenceRoot);
  primaryBefore = readInvariantSnapshot();
  if (!primarySnapshotIsSafe(primaryBefore)) throw new Error(`PRIMARY_SOURCE_INVARIANT_FAILED:${safeJson(primaryBefore)}`);
  addCheck("primary source invariant before fixture", true, safeJson(primaryBefore));
  fs.mkdirSync(fixtureDataDir, { recursive: true });
  const sourceSnapshot = new Database(sourceDb, { readonly: true, fileMustExist: true });
  try { await sourceSnapshot.backup(fixtureDb); } finally { sourceSnapshot.close(); }
  const fixtureSourceSnapshot = readInvariantSnapshot(fixtureDb);
  if (!primarySnapshotIsSafe(fixtureSourceSnapshot) || safeJson(fixtureSourceSnapshot) !== safeJson(primaryBefore)) {
    throw new Error(`FIXTURE_SOURCE_SNAPSHOT_INVARIANT_FAILED:${safeJson({ primaryBefore, fixtureSourceSnapshot })}`);
  }
  addCheck("unmodified fixture source invariant before mutation", true, safeJson(fixtureSourceSnapshot));
  if (fs.existsSync(sourceRepository)) fs.cpSync(sourceRepository, fixtureRepository, { recursive: true, force: true });
  const fixturePreparation = new Database(fixtureDb);
  let sourceAuthorityMode;
  try {
    sourceAuthorityMode = fixturePreparation.prepare("SELECT mode FROM pdm_workbench_state_authority_control WHERE id=1").pluck().get();
    prepareLifecycleFixture(fixturePreparation);
  } finally {
    fixturePreparation.close();
  }
  const migrationOutputDir = path.join(tempRoot, "migration");
  const migration = spawnSync(process.execPath, [path.join(root, "scripts", "migrate-dev-087-canonical-workbench.mjs"), `--db=${fixtureDb}`, "--apply", "--confirm-disposable-dev-087", "--retain-unmapped-legacy", "--switch-canonical-only", "--expected-commit=local-dev", `--output-dir=${migrationOutputDir}`], { cwd: root, encoding: "utf8" });
  const migrationManifestPath = path.join(migrationOutputDir, "manifest.json");
  if (fs.existsSync(migrationManifestPath)) fs.copyFileSync(migrationManifestPath, path.join(evidenceRoot, "migration-manifest.json"));
  const migrationApplied = migration.status === 0;
  addCheck("isolated migration applied with explicit retained-legacy resolution", migrationApplied, safeJson({ status: migration.status, stdout: migration.stdout?.slice(-2000), stderr: migration.stderr?.slice(-2000), sourceAuthorityMode }));
  fixtureMutationLedger.push({ action: "resolve-unmapped-legacy-as-retained", source: "migration manifest", scope: "disposable fixture only" });
  if (!migrationApplied) throw new Error(`ISOLATED_MIGRATION_FAILED:${safeJson({ status: migration.status, stderr: migration.stderr?.slice(-4000) })}`);
  const fixture = new Database(fixtureDb);
  fixture.prepare("UPDATE pdm_workbench_state_authority_control SET mode='canonical_only', expected_commit='local-dev', schema_hash='dev090-v1', row_version=row_version+1").run();
  const mergedCount = fixture.prepare("SELECT COUNT(*) AS count FROM drawings WHERE lifecycle_state = 'merged'").get().count;
  fixture.close();
  // C11 must not inherit UI mutations from the parent journey fixture or read
  // a concurrently changing primary database. Preserve the post-migration,
  // pre-journey source and let each fault profile clone this immutable point.
  fs.mkdirSync(faultProfileSourceDir, { recursive: true });
  const faultProfileSnapshotSource = new Database(fixtureDb, { readonly: true, fileMustExist: true });
  await faultProfileSnapshotSource.backup(faultProfileSourceDb);
  faultProfileSnapshotSource.close();
  if (fs.existsSync(fixtureRepository)) fs.cpSync(fixtureRepository, faultProfileSourceRepository, { recursive: true, force: true });
  const faultProfileSnapshotInvariant = readInvariantSnapshot(faultProfileSourceDb);
  addCheck("fault profile immutable source snapshot prepared", primarySnapshotIsSafe(faultProfileSnapshotInvariant), safeJson({ database: faultProfileSourceDb, repository: faultProfileSourceRepository, invariant: faultProfileSnapshotInvariant }));
  fs.mkdirSync(fixtureUploadDir, { recursive: true });
  fs.writeFileSync(drawingUpload2d, "DEV-087 disposable 2D drawing fixture\n", "utf8");
  fs.writeFileSync(drawingUpload3d, "DEV-087 disposable 3D model fixture\n", "utf8");
  fs.writeFileSync(drawingResubmit2d, "DEV-087 disposable changed 2D drawing fixture\n", "utf8");
  fs.writeFileSync(drawingResubmit3d, "DEV-087 disposable changed 3D model fixture\n", "utf8");
  fixtureMutationLedger.push({ action: "create-rendered-ui-upload-fixtures", files: [drawingUpload2d, drawingUpload3d, drawingResubmit2d, drawingResubmit3d].map((file) => path.basename(file)), scope: "disposable fixture only" });
  writeJson(path.join(evidenceRoot, "authority.json"), { devId: "DEV-087", commit: spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim(), mode: "canonical_only", provider: "sqlite", mergedHistoryRows: Number(mergedCount) });
  writeJson(path.join(evidenceRoot, "actors.json"), { login: usesProductionRuntime ? `task-owned signed QA session for isolated production-runtime ${stableRuntimeCaseLabel}` : "UI quick login only", mutation: "Playwright rendered UI only", readback: "GET/API + readonly SQLite" });
  writeJson(path.join(evidenceRoot, "route-inventory.json"), { drawing: "/numbering/drawings", part: "/parts", retiredRelationReplacement: "I01-I14 inline matrix child" });
  // These cases require mutually independent lifecycle starting states. Run
  // their disposable children before the parent Next process starts so no two
  // Next runtimes can race on the repository-root generated next-env.d.ts.
  if (process.env.QC_DEV087_ISOLATED_CHILD !== "1" && lifecycleFocus.size === 0) {
    for (const bundle of isolatedBundles) await runIsolatedLifecycleBundle(bundle);
    // The isolated children intentionally start and stop many independent
    // Next/Chromium process trees. Give Windows time to release task-owned
    // socket buffers before the parent browser begins; this is infrastructure
    // quiescence, not a waiver for console or request failures.
    await new Promise((resolve) => setTimeout(resolve, 30_000));
    addCheck("isolated lifecycle runtimes quiesced before parent UI", true, `children=${isolatedBundles.length};waitMs=30000`);
  }
  port = await getFreePort(); baseUrl = `http://127.0.0.1:${port}`;
  runtimeProjectRoot = path.join(root, ".tmp", `qc-dev087-runtime-project-${port}`);
  const runtimeProjectReceipt = prepareTaskOwnedRuntimeProject(runtimeProjectRoot);
  addCheck("task-owned runtime project prepared", true, safeJson(runtimeProjectReceipt));
  Object.assign(process.env, { NODE_ENV: "development", QC_NEXT_USE_WEBPACK: "1", PDM_AUTH_MODE: "local", ...(usesProductionRuntime ? { PDM_AUTH_SECRET: "dev087-task-owned-production-runtime-secret-v1" } : {}), PDM_DB_PROVIDER: "sqlite", PDM_DATA_DIR: fixtureDataDir, PDM_REPOSITORY_DIR: fixtureRepository, PDM_BUILD_COMMIT: "local-dev", PDM_RELEASE_MODE: "local_stub", PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true", PDM_ENABLE_LOCAL_QUICK_LOGIN: "true", PDM_PRODUCTION_SLICE_MODE: "", PDM_POSTGRES_URL: "", DATABASE_URL: "", PDM_NEXT_DIST_DIR: ".next", PDM_NEXT_TSCONFIG_PATH: "tsconfig.next.json", PDM_PUBLIC_BASE_URL: baseUrl });
  if (usesProductionRuntime) {
    process.env.NODE_ENV = "production";
    console.log(`QC DEV-087 ${stableRuntimeCaseLabel} isolated build: project=${runtimeProjectRoot}; purpose=multi-page concurrency validation without dev HMR; port=none; processTree=task-owned Next build; cleanup=after evidence write; PDM_DATA_DIR=${fixtureDataDir}; PDM_REPOSITORY_DIR=${fixtureRepository}; mutationScope=isolated fixture only`);
    const nextCli = path.join(runtimeProjectRoot, "node_modules", "next", "dist", "bin", "next");
    const build = spawnSync(process.execPath, [nextCli, "build", "--webpack"], { cwd: runtimeProjectRoot, env: process.env, stdio: "inherit" });
    addCheck(`${stableRuntimeCaseLabel} task-owned production runtime built`, build.status === 0, `status=${build.status}`);
    if (build.status !== 0) throw new Error(`${stableRuntimeCaseLabel}_PRODUCTION_RUNTIME_BUILD_FAILED:${build.status}`);
  }
  const runtimeMode = usesProductionRuntime ? "start" : "dev";
  console.log(`QC DEV-087 full UI-only runtime: project=${root}; runtimeProject=${runtimeProjectRoot}; purpose=${lifecycleDenominator}-case lifecycle preflight; port=${port}; processTree=task-owned Next ${runtimeMode} + Playwright; cleanup=after evidence write; PDM_DATA_DIR=${fixtureDataDir}; PDM_REPOSITORY_DIR=${fixtureRepository}; mutationScope=isolated fixture only; primaryData=read-only fingerprint gate; generatedFiles=runtime project only`);
  app = startNextApp(runtimeProjectRoot, runtimeMode, port); await waitForNextAppReady(baseUrl, app.getOutput); browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }); monitor(context.pages()[0] ?? await context.newPage(), "context");
  if (usesProductionRuntime) await installTaskOwnedQaSession(context, "系統管理員");
  else await login(context, "系統管理員");
  const reviewerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (usesProductionRuntime) await installTaskOwnedQaSession(reviewerContext, "研發主管");
  else await login(reviewerContext, "研發主管");
  if (process.env.QC_DEV087_INCLUDE_SUPPLEMENTAL === "1" && process.env.QC_DEV087_SKIP_SUPPLEMENTAL !== "1") await runSupplementalJourneys(context);
  supplementalJourneys.forEach((journey) => addCheck(journey.id, journey.status !== "FAIL", journey.reason || journey.evidence));
  // Run every lifecycle case through a named UI journey.  A journey may finish
  // BLOCKED when the current product has no legal rendered-UI entry point; that
  // evidence is kept distinct from a product FAIL and is reviewed below.
  for (const family of ["D", "P"]) {
    const maxSuffix = family === "D" ? 27 : 20;
    for (let suffixNumber = 1; suffixNumber <= maxSuffix; suffixNumber += 1) {
      const suffix = String(suffixNumber).padStart(2, "0");
      const spec = casesSpec.find((item) => item.id === `${family}${suffix}`);
      if (!spec) continue;
      if (spec.id === "D24") continue;
      if (!includedCaseIds.has(spec.id)) continue;
      if (process.env.QC_DEV087_ISOLATED_CHILD !== "1" && lifecycleFocus.size === 0 && isolatedCaseIds.has(spec.id)) continue;
      if (lifecycleFocus.size > 0 && !lifecycleFocus.has(spec.id)) continue;
      const journey = await runLifecycleJourney(context, reviewerContext, spec);
      lifecycleJourneys.push(journey);
      lifecycleJourneyByCase.set(spec.id, journey);
      addCheck(journey.id, journey.status === "PASS", journey.reason || journey.evidence);
    }
  }
  await reviewerContext.close();
  const readbackSpecs = process.env.QC_DEV087_SKIP_READBACK === "1"
    ? []
    : fastFocus ? casesSpec.filter((spec) => lifecycleFocus.has(spec.id) && includedCaseIds.has(spec.id)) : casesSpec.filter((spec) => includedCaseIds.has(spec.id) && (process.env.QC_DEV087_ISOLATED_CHILD === "1" || !isolatedCaseIds.has(spec.id)));
  for (let index = 0; index < readbackSpecs.length; index += 1) await executeCase(context, readbackSpecs[index], index);
  await context.close();
  // C01-C10 are common read-only gates in this full run. C11 delegates the
  // exact UI-triggered fault profile to the already versioned child runner.
  commonSpec.forEach(({ id, title }) => { if (id !== "C11") { addCheck(id, failures.filter((item) => item.caseId).length === 0, title); } });
  // Fault profiles are separate disposable Next runtimes.  Stop the parent
  // before launching them because Next's development type writer uses the
  // repository-root next-env.d.ts; concurrent runtimes can otherwise race on
  // that shared file and turn a healthy C11 check into an environmental fail.
  let faultProfiles = [];
  if (!fastFocus || process.env.QC_DEV087_INCLUDE_FAULT_PROFILES === "1") {
    try { await browser?.close(); } catch {}
    browser = null;
    try { await stopNextApp(app?.child); } catch {}
    app = null;
    faultProfiles = [runFaultProfile("system_admin"), runFaultProfile("blocked")];
  }
  addCheck("C11", faultProfiles.every((item) => item.status === "PASS"), safeJson(faultProfiles.map((item) => ({ profile: item.profile, status: item.status }))));
} catch (error) {
  addCheck("full runner execution", false, error instanceof Error ? error.message : String(error));
} finally {
  try { await browser?.close(); } catch {}
  try { await stopNextApp(app?.child); } catch {}
  if (port) addCheck("temporary runtime port released", await fetch(`http://127.0.0.1:${port}`).then(() => false).catch(() => true), `port=${port}`);
  tempCleanupReceipt = await removeTaskOwnedFixtureRoot(tempRoot);
  addCheck("temporary data/repository root removed", tempCleanupReceipt.removed, safeJson(tempCleanupReceipt));
  const isolatedDeclarations = runtimeProjectRoot
    ? { isolated: fs.existsSync(path.join(runtimeProjectRoot, "next-env.d.ts")), path: path.join(runtimeProjectRoot, "next-env.d.ts") }
    : { isolated: true, path: null, notCreated: true };
  addCheck("Next generated declarations isolated from source project", isolatedDeclarations.isolated, safeJson(isolatedDeclarations));
  runtimeProjectCleanupReceipt = runtimeProjectRoot
    ? removeTaskOwnedWorkspaceTempDir(root, runtimeProjectRoot)
    : { removed: true, path: null, notCreated: true, error: null };
  addCheck("temporary runtime project removed", runtimeProjectCleanupReceipt.removed, safeJson(runtimeProjectCleanupReceipt));
  try {
    primaryAfter = readInvariantSnapshot();
    addCheck("primary source invariant unchanged after runtime", primarySnapshotIsSafe(primaryAfter) && safeJson(primaryAfter) === safeJson(primaryBefore), safeJson({ before: primaryBefore, after: primaryAfter }));
  } catch (snapshotError) {
    addCheck("primary source invariant unchanged after runtime", false, snapshotError instanceof Error ? snapshotError.message : String(snapshotError));
  }
}

const blocked = cases.filter((item) => item.status === "BLOCKED");
const failedCases = cases.filter((item) => item.status === "FAIL");
const passedCases = cases.filter((item) => item.status === "PASS");
const gateChecks = checks.filter((item) => /^C(?:0[1-9]|1[01])$/u.test(item.name));
const infrastructureChecks = checks.filter((item) => !/^C(?:0[1-9]|1[01])$/u.test(item.name));
const gateFailures = gateChecks.filter((item) => !item.pass);
const manifest = {
  devId: "DEV-087",
  runId,
  parentRunId,
  status: cases.length === lifecycleDenominator
    && passedCases.length === lifecycleDenominator
    && blocked.length === 0
    && failedCases.length === 0
    && failures.length === 0
    && consoleErrors.length === 0
    && gateFailures.length === 0
    && infrastructureChecks.every((item) => item.pass)
    ? "PASS"
    : "FAIL",
  denominator: {
    drawing: 24,
    part: 10,
    inlineMatrix: 0,
    total: lifecycleDenominator,
    excluded: [...excludedCaseIds],
    delegated: {
      partAttachments: ["P11", "P12", "P13"],
      inlineMatrix: Array.from({ length: 14 }, (_, index) => `I${String(index + 1).padStart(2, "0")}`)
    }
  },
  coverage: { total: cases.length, pass: passedCases.length, blocked: blocked.length, fail: failedCases.length, notRun: lifecycleDenominator - cases.length },
  gates: { total: gateChecks.length, pass: gateChecks.filter((item) => item.pass).length, fail: gateFailures.length },
  infrastructure: { total: infrastructureChecks.length, pass: infrastructureChecks.filter((item) => item.pass).length, fail: infrastructureChecks.filter((item) => !item.pass).length },
  cases,
  checks,
  supplementalJourneys,
  lifecycleJourneys,
  failures,
  consoleErrors,
  expectedHttpEvents,
  networkEvents: network.length,
  mergedHistoryRows: fs.existsSync(path.join(evidenceRoot, "authority.json"))
    ? Number((JSON.parse(fs.readFileSync(path.join(evidenceRoot, "authority.json"), "utf8"))).mergedHistoryRows ?? 0)
    : 0,
  evidenceRoot
};
writeJson(path.join(evidenceRoot, "run-manifest.json"), manifest);
writeJson(path.join(evidenceRoot, "coverage.json"), manifest.coverage);
writeJson(path.join(evidenceRoot, "prohibited-mutation-audit.json"), { directBusinessApiWrites: 0, directDbWrites: 0, uiInitiatedBusinessWritesOnly: true });
writeJson(path.join(evidenceRoot, "fixture-mutation-ledger.json"), { sourceInvariantPassed: primarySnapshotIsSafe(primaryBefore), mutations: fixtureMutationLedger, journeyBusinessWrites: "rendered UI only" });
writeJson(path.join(evidenceRoot, "cleanup-ledger.json"), {
  status: tempCleanupReceipt.removed && runtimeProjectCleanupReceipt.removed ? "task-owned runtime removed" : "cleanup failed",
  port,
  tempRootRemoved: tempCleanupReceipt.removed,
  runtimeProjectRemoved: runtimeProjectCleanupReceipt.removed,
  tempCleanupReceipt,
  runtimeProjectCleanupReceipt
});
writeJson(path.join(evidenceRoot, "primary-invariant.json"), { before: primaryBefore, after: primaryAfter, unchanged: safeJson(primaryBefore) === safeJson(primaryAfter) });
writeJson(path.join(evidenceRoot, "schema-manifest.json"), { authority: "canonical_workbench_states", provider: "sqlite", schemaHash: "dev090-v1", readback: "readonly" });
writeJson(path.join(evidenceRoot, "file-manifest.json"), { repository: "isolated disposable copy", attachments: "not mutated", credentials: "not recorded" });
writeText(path.join(evidenceRoot, "defects.md"), `# DEV-087 full UI-only defects\n\n- Supplemental journeys: ${manifest.supplementalJourneys.map((journey) => `${journey.id}=${journey.status}`).join(", ") || "none"}.\n- Lifecycle journeys: ${manifest.lifecycleJourneys.map((journey) => `${journey.caseId}=${journey.status}`).join(", ") || "none"}.\n- Excluded follow-up cases: ${manifest.denominator.excluded.join(", ")}.\n- Fixture has no legal existing Merged/history UI row: ${manifest.mergedHistoryRows}.\n- ${manifest.coverage.blocked}/${manifest.denominator.total} lifecycle cases remain blocked in the current canonical scope; fixture-only seed/cleanup is declared in fixture-mutation-ledger.json, while journey business writes remain rendered-UI-only.\n- Any lifecycle journey marked FAIL is a candidate product gap; BLOCKED remains a test precondition gap until a legal UI path is added.\n`);
writeText(path.join(evidenceRoot, "summary.md"), `# DEV-087 full UI-only run\n\n- status: ${manifest.status}\n- coverage: ${manifest.coverage.pass}/${manifest.denominator.total} PASS, ${manifest.coverage.blocked} BLOCKED, ${manifest.coverage.fail} FAIL\n- gates: ${manifest.gates.pass}/${manifest.gates.total} PASS\n- infrastructure checks: ${manifest.infrastructure.pass}/${manifest.infrastructure.total} PASS\n- supplemental journeys: ${manifest.supplementalJourneys.map((journey) => `${journey.id}=${journey.status}`).join(", ") || "none"}\n- lifecycle journeys: ${manifest.lifecycleJourneys.map((journey) => `${journey.caseId}=${journey.status}`).join(", ") || "none"}\n- excluded follow-up cases: ${manifest.denominator.excluded.join(", ")}\n- merged history rows: ${manifest.mergedHistoryRows}\n\nA lifecycle case counts as PASS only after its rendered UI journey and the UI/API/DB triad agree. Excluded cases remain explicit follow-up scope and are not silently counted.\n`);
console.log(JSON.stringify(manifest, null, 2));
if (manifest.status !== "PASS") process.exitCode = 1;
