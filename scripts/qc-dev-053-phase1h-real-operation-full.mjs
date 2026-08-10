#!/usr/bin/env node

/*
 * DEV-053 Phase 1H full AI real-operation runner.
 *
 * This is deliberately a disposable harness: it runs the existing baseline UI
 * journey, then executes the missing UI journeys against a fresh SQLite/Next
 * instance.  Legacy/adoption/cleanup invariants are cross-checked with the
 * repository QC scripts; no production or port 3000 data is opened.
 */
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const startedAt = new Date().toISOString();
const runId = `DEV053-PHASE1H-FULL-${startedAt.replace(/[-:]/gu, "").replace(/\..+$/u, "").replace("T", "-")}`;
const outputDir = path.join(root, "output", "playwright", "dev053-phase1h-real-operation-full", runId);
const screenshotDir = path.join(outputDir, "screenshots");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev053-phase1h-full-"));
const dataDir = path.join(tempRoot, "data");
const repositoryDir = path.join(dataDir, "repository");
const databasePath = path.join(dataDir, "ai-pdm.sqlite");
const distDirRelative = `.tmp/q53h-full-${crypto.randomUUID().slice(0, 8)}`;
const distDir = path.join(root, ...distDirRelative.split("/"));
const trackedFiles = new Map(["next-env.d.ts", "tsconfig.json"].map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
const password = "DEV053-Phase1H-Full-2026";
const users = {
  operator: { id: "dev053-full-engineer", displayName: "DEV-053 Full 工程師", email: "dev053.full.engineer@example.invalid", password, role: "Engineer", companyCodes: ["JENFU"] },
  approver: { id: "dev053-full-manager", displayName: "DEV-053 Full 審核者", email: "dev053.full.manager@example.invalid", password, role: "R&D Manager", companyCodes: ["JENFU"] },
  unassigned: { id: "dev053-full-unassigned", displayName: "DEV-053 Full 未指派主管", email: "dev053.full.unassigned@example.invalid", password, role: "R&D Manager", companyCodes: ["JENFU"] },
  admin: { id: "dev053-full-admin", displayName: "DEV-053 Full Admin", email: "dev053.full.admin@example.invalid", password, role: "Admin", companyCodes: ["JENFU"] },
  outsider: { id: "dev053-full-outsider", displayName: "DEV-053 Full 外公司", email: "dev053.full.outsider@example.invalid", password, role: "R&D Manager", companyCodes: ["MAXIMA"] }
};
const results = [];
const screenshots = [];
const browserErrors = [];
const failedResponses = [];
const expectedBrowserErrors = new Set();
const expectedFailureResponseUrls = new Set();
const mutatingRequests = [];
let app;
let browser;
let database;
let baseUrl = "";
let cleanupStatus = "not_started";

fs.mkdirSync(screenshotDir, { recursive: true });
const record = (id, passed, detail = {}) => results.push({ id, passed: Boolean(passed), detail });
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function seedDrawing(suffix, revisions = ["0.1"]) {
  const rootId = `dev053-full-root-${suffix}`;
  const drawingId = `dev053-full-drawing-${suffix}`;
  const rootCode = `F${suffix}`;
  const drawingNumber = `${rootCode}-M01`;
  const now = "2026-08-06T16:00:00.000Z";
  database.transaction(() => {
    database.prepare(`INSERT INTO part_roots (id, company_id, root_code, core_name, item_kind, record_status, created_by, created_at, updated_at)
      VALUES (?, 'company-jenfu', ?, ?, 'manufactured', 'Active', ?, ?, ?)`)
      .run(rootId, rootCode, `DEV-053 Full ${suffix}`, users.operator.id, now, now);
    database.prepare(`INSERT INTO drawing_numbers (id, company_id, part_root_id, drawing_number, purpose_code, sequence_no,
      is_primary_manufacturing, record_status, created_by, created_at, updated_at)
      VALUES (?, 'company-jenfu', ?, ?, 'M', 1, 1, 'Active', ?, ?, ?)`)
      .run(drawingId, rootId, drawingNumber, users.operator.id, now, now);
    for (let index = 1; index <= 3; index += 1) {
      const partId = `dev053-full-part-${suffix}-${index}`;
      const itemId = `dev053-full-item-${suffix}-${index}`;
      const partNumber = `${rootCode}-P0${index}`;
      database.prepare(`INSERT INTO part_numbers (id, company_id, part_root_id, part_number, sequence_no, sequence_code,
        part_name, item_kind, record_status, created_by, created_at, updated_at)
        VALUES (?, 'company-jenfu', ?, ?, ?, ?, ?, 'manufactured', 'Active', ?, ?, ?)`)
        .run(partId, rootId, partNumber, index, `0${index}`, `Full ${suffix} 料號 ${index}`, users.operator.id, now, now);
      database.prepare(`INSERT INTO items (id, company_id, part_number, part_name, created_at, updated_at)
        VALUES (?, 'company-jenfu', ?, ?, ?, ?)`)
        .run(itemId, partNumber, `Full ${suffix} 料號 ${index}`, now, now);
      database.prepare(`INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by, created_at)
        VALUES (?, ?, ?, 'primary_manufacturing', ?, ?)`)
        .run(`dev053-full-link-${suffix}-${index}`, drawingId, partId, users.operator.id, now);
      database.prepare(`INSERT INTO part_variant_attributes (id, part_number_id, material_code, material_label, surface_treatment, updated_by, created_at, updated_at)
        VALUES (?, ?, 'SUS304', 'SUS304', '無', ?, ?, ?)`)
        .run(`dev053-full-variant-${suffix}-${index}`, partId, users.operator.id, now, now);
    }
    for (const [revisionIndex, revision] of revisions.entries()) {
      for (const file of [
        { ext: "slddrw", category: "drawing_2d", name: `${rootCode}-M01.SLDDRW` },
        { ext: "sldprt", category: "cad_3d", name: `${rootCode}.SLDPRT` }
      ]) {
        const id = `dev053-full-asset-${suffix}-${revisionIndex}-${file.ext}`;
        const storageKey = `full/${id}-${file.name}`;
        const originalPath = path.join(repositoryDir, ...storageKey.split("/"));
        const bytes = Buffer.from(`DEV053 FULL ${suffix} ${revision} ${file.name}\n`);
        fs.mkdirSync(path.dirname(originalPath), { recursive: true });
        fs.writeFileSync(originalPath, bytes);
        database.prepare(`INSERT INTO file_assets (id, storage_provider, original_path, storage_key, file_name, file_ext,
          mime_type, file_size, content_hash, linked_entity_type, linked_entity_id, document_category, display_name,
          revision, uploaded_by, sync_status, created_at, updated_at)
          VALUES (?, 'local_repository', ?, ?, ?, ?, 'application/octet-stream', ?, ?, 'drawing_number', ?, ?, ?, ?, ?, 'local_only', ?, ?)`)
          .run(id, originalPath, storageKey, file.name, file.ext, bytes.byteLength, sha(bytes), drawingId, file.category, file.name, revision, users.operator.id, now, now);
      }
    }
  })();
  return { rootId, drawingId, rootCode, drawingNumber };
}

function seedLegacyActiveFixture(suffix) {
  const engineer = users.operator.id;
  const rootId = `dev053-full-legacy-root-${suffix}`;
  const partId = `dev053-full-legacy-part-${suffix}`;
  const itemId = `dev053-full-legacy-item-${suffix}`;
  const drawingId = `dev053-full-legacy-drawing-${suffix}`;
  const drawingNumber = `F${suffix}-M01`;
  const partNumber = `F${suffix}-P01`;
  const submissionId = `dev053-full-legacy-submission-${suffix}`;
  const submissionFileId = `dev053-full-legacy-submission-file-${suffix}`;
  const assetId = `dev053-full-legacy-asset-${suffix}`;
  const packageId = `dev053-full-legacy-package-${suffix}`;
  const now = "2026-08-06T16:00:00.000Z";
  const storageKey = `legacy/${suffix}/${drawingNumber}.SLDDRW`;
  const originalPath = path.join(repositoryDir, ...storageKey.split("/"));
  const bytes = Buffer.from(`DEV053 legacy adoption ${suffix}\n`);
  fs.mkdirSync(path.dirname(originalPath), { recursive: true });
  fs.writeFileSync(originalPath, bytes);
  database.transaction(() => {
    database.prepare(`INSERT INTO part_roots (id, company_id, root_code, core_name, item_kind, record_status, created_by, created_at, updated_at)
      VALUES (?, 'company-jenfu', ?, ?, 'manufactured', 'Active', ?, ?, ?)`).run(rootId, `F${suffix}`, `DEV-053 Legacy ${suffix}`, engineer, now, now);
    database.prepare(`INSERT INTO part_numbers (id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name,
      item_kind, record_status, created_by, created_at, updated_at)
      VALUES (?, 'company-jenfu', ?, ?, 1, '01', ?, 'manufactured', 'Active', ?, ?, ?)`).run(partId, rootId, partNumber, `Legacy ${suffix} 料號`, engineer, now, now);
    database.prepare(`INSERT INTO drawing_numbers (id, company_id, part_root_id, drawing_number, purpose_code, sequence_no,
      is_primary_manufacturing, record_status, created_by, created_at, updated_at)
      VALUES (?, 'company-jenfu', ?, ?, 'M', 1, 1, 'Active', ?, ?, ?)`).run(drawingId, rootId, drawingNumber, engineer, now, now);
    database.prepare(`INSERT INTO items (id, company_id, part_number, part_name, created_at, updated_at)
      VALUES (?, 'company-jenfu', ?, ?, ?, ?)`).run(itemId, partNumber, `Legacy ${suffix} 料號`, now, now);
    database.prepare(`INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by, created_at)
      VALUES (?, ?, ?, 'primary_manufacturing', ?, ?)`).run(`dev053-full-legacy-link-${suffix}`, drawingId, partId, engineer, now);
    database.prepare(`INSERT INTO submissions (id, company_id, item_id, drawing_number, revision, material, surface_finish,
      document_type, change_description, status, submitted_by, approval_required)
      VALUES (?, 'company-jenfu', ?, ?, '0.1', 'SUS304', 'none', 'Drawing', 'DEV-053 legacy adoption fixture', 'Pending', ?, 1)`)
      .run(submissionId, itemId, drawingNumber, engineer);
    database.prepare(`INSERT INTO submission_files (id, submission_id, file_role, original_filename, local_path, sha256, file_size)
      VALUES (?, ?, 'slddrw', ?, ?, ?, ?)`).run(submissionFileId, submissionId, `${drawingNumber}.SLDDRW`, originalPath, sha(bytes), bytes.byteLength);
    database.prepare(`INSERT INTO file_assets (id, storage_provider, original_path, storage_key, file_name, file_ext, mime_type,
      file_size, content_hash, linked_entity_type, linked_entity_id, document_category, display_name, revision, uploaded_by,
      sync_status, created_at, updated_at)
      VALUES (?, 'local_repository', ?, ?, ?, 'slddrw', 'application/octet-stream', ?, ?, 'submission_file', ?, 'drawing_2d', ?, '0.1', ?, 'local_only', ?, ?)`)
      .run(assetId, originalPath, storageKey, `${drawingNumber}.SLDDRW`, bytes.byteLength, sha(bytes), submissionFileId, `${drawingNumber}.SLDDRW`, engineer, now, now);
    database.prepare(`INSERT INTO drawing_revision_packages (id, company_id, drawing_number_id, drawing_number, revision, status,
      source_submission_id, created_by, created_at, updated_at, snapshot_json)
      VALUES (?, 'company-jenfu', ?, ?, '0.1', 'Pending', ?, ?, ?, ?, '{}')`)
      .run(packageId, drawingId, drawingNumber, submissionId, engineer, now, now);
    database.prepare(`INSERT INTO drawing_revision_package_files (id, package_id, source_file_asset_id, source_submission_file_id,
      role, role_source, display_name, description, sort_order, is_primary, created_by)
      VALUES (?, ?, ?, ?, 'drawing_2d', 'user', ?, '', 0, 1, ?)`)
      .run(`dev053-full-legacy-package-file-${suffix}`, packageId, assetId, submissionFileId, `${drawingNumber}.SLDDRW`, engineer);
    database.prepare(`INSERT INTO submission_snapshots (id, submission_id, company_id, source_root_id, source_root_code,
      source_drawing_number_id, source_drawing_number, source_part_number_id, source_part_number, rules_version, snapshot_hash,
      snapshot_json, captured_by, captured_at)
      VALUES (?, ?, 'company-jenfu', ?, ?, ?, ?, ?, ?, 'dev053-phase1h', ?, '{}', ?, ?)`)
      .run(`dev053-full-legacy-snapshot-${suffix}`, submissionId, rootId, `F${suffix}`, drawingId, drawingNumber, partId, partNumber, sha(`snapshot-${suffix}`), engineer, now);
    database.prepare(`INSERT INTO submission_part_scopes (id, submission_id, company_id, item_id, part_number_id, part_number,
      part_name, link_type, form_state, fit_state, function_state, fff_outcome)
      VALUES (?, ?, 'company-jenfu', ?, ?, ?, ?, 'primary_manufacturing', 'no_impact', 'no_impact', 'no_impact', 'no_impact')`)
      .run(`dev053-full-legacy-scope-${suffix}`, submissionId, itemId, partId, partNumber, `Legacy ${suffix} 料號`);
    database.prepare(`INSERT INTO drawing_revision_fff_assessments (id, company_id, drawing_number_id, revision, submission_id,
      form_state, fit_state, function_state, reason_category, assessed_by)
      VALUES (?, 'company-jenfu', ?, '0.1', ?, 'no_impact', 'no_impact', 'no_impact', 'none', ?)`)
      .run(`dev053-full-legacy-fff-${suffix}`, drawingId, submissionId, engineer);
  })();
  return { drawingId, drawingNumber, packageId, submissionId };
}

function counts(drawingId) {
  return database.prepare(`SELECT
    (SELECT COUNT(*) FROM approval_platform_requests) AS requests,
    (SELECT COUNT(*) FROM approval_platform_events) AS events,
    (SELECT COUNT(*) FROM drawing_revision_lifecycle_workflows) AS workflows,
    (SELECT COUNT(*) FROM drawing_revision_package_files f JOIN drawing_revision_packages p ON p.id=f.package_id WHERE p.drawing_number_id=?) AS package_files,
    (SELECT COUNT(*) FROM drawing_revision_package_part_scopes s JOIN drawing_revision_packages p ON p.id=s.package_id WHERE p.drawing_number_id=?) AS scopes`).get(drawingId, drawingId);
}

async function login(page, actor) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill(actor.email);
  await page.locator('input[type="password"]').fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 }),
    page.getByRole("button", { name: "登入", exact: true }).click()
  ]);
  await page.waitForLoadState("networkidle");
}

function monitor(page, actor) {
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push({ actor, type: "console", text: message.text().slice(0, 400) }); });
  page.on("pageerror", (error) => browserErrors.push({ actor, type: "pageerror", text: error.message.slice(0, 400) }));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method()) && url.pathname.startsWith("/api/")) mutatingRequests.push({ actor, method: request.method(), path: url.pathname });
  });
  page.on("response", (response) => { if (response.status() >= 500) failedResponses.push({ actor, status: response.status(), url: response.url() }); });
}

async function capture(page, name) {
  const target = path.join(screenshotDir, name);
  await page.screenshot({ path: target, fullPage: false });
  screenshots.push(path.relative(outputDir, target).split(path.sep).join("/"));
}

async function submitRevision(page, fixture, revision, note, extraQuery = "") {
  await page.goto(`${baseUrl}/numbering/revisions?drawingNumber=${fixture.drawingNumber}&revision=${encodeURIComponent(revision)}${extraQuery}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "圖面進版", exact: false }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: /建立送審/ }).waitFor({ state: "visible", timeout: 20000 });
  await page.locator("textarea").last().fill(note);
  await page.getByRole("button", { name: /建立送審/ }).click();
  await page.locator("[data-drawing-lifecycle-next]").waitFor({ state: "visible", timeout: 20000 });
}

async function submit(page, fixture, note) {
  return submitRevision(page, fixture, "0.1", note);
}

function runChild(script, loader = false, envOverrides = {}, scriptArgs = []) {
  const args = loader
    ? ["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs", script, ...scriptArgs]
    : [script, ...scriptArgs];
  try {
    return { code: 0, output: execFileSync(process.execPath, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...envOverrides } }) };
  } catch (error) {
    return { code: Number(error.status ?? 1), output: `${error.stdout ?? ""}\n${error.stderr ?? ""}` };
  }
}

function latestBaselineReport() {
  const dir = path.join(root, "output", "playwright", "dev053-phase1h-real-operation");
  if (!fs.existsSync(dir)) return null;
  const candidates = fs.readdirSync(dir).map((name) => path.join(dir, name, "run-report.json"))
    .filter((file) => fs.existsSync(file)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return candidates[0] ? JSON.parse(fs.readFileSync(candidates[0], "utf8")) : null;
}

async function runUiJourneys() {
  Object.assign(process.env, {
    NODE_ENV: "development", PDM_AUTH_MODE: "managed", PDM_BOOTSTRAP_USERS: JSON.stringify(Object.values(users)), PDM_DEMO_USERS: "0",
    PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir, PDM_DB_PROVIDER: "sqlite", PDM_POSTGRES_URL: "", DATABASE_URL: "",
    PDM_STORAGE_PROVIDER: "local_repository", PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
    PDM_RELEASE_MODE: "local_stub", PDM_NUMBER_STATE_FLOW_V1: "true", PDM_NUMBER_LIFECYCLE_V2: "true", PDM_UNIFIED_DRAWING_WORKBENCH_V1: "true",
    PDM_DRAWING_REVISION_LIFECYCLE_MODE: "enforced", PDM_PRODUCTION_SLICE_MODE: "", PDM_NEXT_DIST_DIR: distDirRelative, PDM_QC_ISOLATED_TARGET: "1"
  });
  const port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput);
  for (const route of [
    "/numbering/revisions?drawingNumber=prewarm&revision=0.1",
    "/api/numbering/drawings/prewarm/submission-workbench?revision=0.1",
    "/api/numbering/tasks",
    "/api/approvals"
  ]) await fetch(`${baseUrl}${route}`, { redirect: "manual" }).catch(() => null);
  await delay(300);
  database = new Database(databasePath);
  const withdrawFixture = seedDrawing("F9101");
  const historicalFixture = seedDrawing("F9102", ["0.2", "0.3"]);
  database.prepare(`INSERT INTO drawing_revision_packages (
    id, company_id, drawing_number_id, drawing_number, revision, status, created_by, created_at, updated_at,
    snapshot_json, lifecycle_state
  ) VALUES (?, 'company-jenfu', ?, ?, '0.3', 'Pending', ?, ?, ?, '{}', 'rd_controlled')`)
    .run(`dev053-full-latest-package-${historicalFixture.rootCode}`, historicalFixture.drawingId, historicalFixture.drawingNumber, users.operator.id, "2026-08-06T16:00:00.000Z", "2026-08-06T16:00:00.000Z");
  const operatorContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const approverContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const unassignedContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const outsiderContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const operatorPage = await operatorContext.newPage();
  const approverPage = await approverContext.newPage();
  const unassignedPage = await unassignedContext.newPage();
  const adminPage = await adminContext.newPage();
  const outsiderPage = await outsiderContext.newPage();
  ["operator", "approver", "unassigned", "admin", "outsider"].forEach((actor, index) => monitor([operatorPage, approverPage, unassignedPage, adminPage, outsiderPage][index], actor));
  await Promise.all([
    login(operatorPage, users.operator), login(approverPage, users.approver), login(unassignedPage, users.unassigned),
    login(adminPage, users.admin), login(outsiderPage, users.outsider)
  ]);

  const legacyFixture = seedLegacyActiveFixture("F9105");
  const adoptionEnv = { PDM_PHASE1H_ADOPTION_SQLITE_PATH: databasePath, PDM_DB_PROVIDER: "sqlite" };
  database.prepare("UPDATE users SET account_status='suspended' WHERE id=?").run(users.unassigned.id);
  database.close();
  const legacyDryRun = runChild("scripts/migrate-dev-053-phase1h-active-workflows.mjs", true, adoptionEnv);
  const legacyApply = runChild("scripts/migrate-dev-053-phase1h-active-workflows.mjs", true, adoptionEnv, ["--apply", "--confirm-local-phase1h-adoption"]);
  database = new Database(databasePath);
  database.pragma("foreign_keys = ON");
  database.prepare("UPDATE users SET account_status='active' WHERE id=?").run(users.unassigned.id);
  record("AIRO-14-ADOPTION-CLI-GUARD", legacyDryRun.code === 0 && /dry-run/iu.test(legacyDryRun.output) && legacyApply.code === 0 && /apply/iu.test(legacyApply.output), {
    dryRunExit: legacyDryRun.code, dryRunMode: /dry-run/iu.test(legacyDryRun.output), applyExit: legacyApply.code,
    applyOutput: legacyApply.output.slice(-1200)
  });
  const adoptedWorkflow = database.prepare(`SELECT w.id workflow_id, w.approval_request_id request_id, p.lifecycle_state
    FROM drawing_revision_lifecycle_workflows w JOIN drawing_revision_packages p ON p.id=w.package_id WHERE w.package_id=?`)
    .get(legacyFixture.packageId);
  await approverPage.goto(`${baseUrl}/numbering/tasks?status=open`, { waitUntil: "networkidle" });
  const adoptedTasksText = await approverPage.locator("body").innerText();
  const adoptedTaskLink = adoptedWorkflow?.request_id
    ? approverPage.locator(`a[href*="requestId=${encodeURIComponent(adoptedWorkflow.request_id)}"]`)
    : approverPage.locator("a[href*='requestId=__missing__']");
  const adoptedTaskLinkCount = await adoptedTaskLink.count();
  record("AIRO-14-ADOPTION-UI", adoptedWorkflow?.lifecycle_state === "in_review" && adoptedTasksText.includes(legacyFixture.drawingNumber) && adoptedTaskLinkCount === 1, {
    drawing: legacyFixture.drawingNumber, lifecycleState: adoptedWorkflow?.lifecycle_state ?? null, taskVisible: adoptedTasksText.includes(legacyFixture.drawingNumber), taskLinkCount: adoptedTaskLinkCount
  });
  if (adoptedTaskLinkCount === 1) {
    await adoptedTaskLink.click();
    await approverPage.getByRole("button", { name: "核准", exact: true }).waitFor({ state: "visible", timeout: 20000 });
    const adoptedDecisionResponsePromise = approverPage.waitForResponse((response) => response.url().includes("/api/approvals/requests/") && response.url().endsWith("/decisions") && response.request().method() === "POST");
    await approverPage.getByRole("button", { name: "核准", exact: true }).click();
    const adoptedDecisionResponse = await adoptedDecisionResponsePromise;
    const adoptedDecisionBody = await adoptedDecisionResponse.json();
    await delay(400);
    const adoptedFinal = database.prepare(`SELECT lifecycle_state, status FROM drawing_revision_packages WHERE id=?`).get(legacyFixture.packageId);
    const adoptedCleanup = database.prepare(`SELECT COUNT(*) AS count FROM drawing_revision_lifecycle_workflows WHERE id=?`).get(adoptedWorkflow.workflow_id).count;
    const adoptedLegacyLink = database.prepare(`SELECT COUNT(*) AS count FROM approval_platform_legacy_links WHERE legacy_id=? AND migration_status='migrated'`).get(legacyFixture.submissionId).count;
    const adoptedLegacySubmission = database.prepare(`SELECT COUNT(*) AS count FROM submissions WHERE id=?`).get(legacyFixture.submissionId).count;
    const adoptedSourceSubmission = database.prepare(`SELECT source_submission_id FROM drawing_revision_packages WHERE id=?`).get(legacyFixture.packageId).source_submission_id;
    record("AIRO-14-ADOPTION-APPROVE-UI", adoptedDecisionResponse.status() === 200 && adoptedFinal?.lifecycle_state === "rd_controlled" && adoptedFinal?.status === "Pending" && adoptedCleanup === 0 && adoptedLegacyLink === 0 && adoptedLegacySubmission === 0 && adoptedSourceSubmission === null, {
      responseStatus: adoptedDecisionResponse.status(), response: adoptedDecisionBody, adoptedFinal, adoptedCleanup, adoptedLegacyLink, adoptedLegacySubmission, adoptedSourceSubmission
    });
  }

  await submit(operatorPage, withdrawFixture, "AIRO 撤回與補正流程");
  const initialRequest = database.prepare(`SELECT approval_request_id request_id, package_id FROM drawing_revision_lifecycle_workflows WHERE package_id=(SELECT id FROM drawing_revision_packages WHERE drawing_number_id=?)`).get(withdrawFixture.drawingId);
  record("AIRO-01", await operatorPage.locator('input[name="revision-part-scope"]:checked').count() === 3 && await operatorPage.locator('input[aria-label^="選擇 "]:checked').count() === 2, { drawing: withdrawFixture.drawingNumber });
  record("AIRO-02", await operatorPage.getByText("送審中", { exact: true }).count() > 0 && mutatingRequests.filter((item) => item.actor === "operator" && item.path.endsWith("/submissions")).length === 1, { requestId: initialRequest.request_id });
  await operatorPage.getByRole("button", { name: "撤回送審", exact: true }).click();
  await operatorPage.getByText("準備中", { exact: true }).waitFor({ state: "visible", timeout: 20000 });
  const withdrawnCounts = counts(withdrawFixture.drawingId);
  record("AIRO-05", withdrawnCounts.package_files === 2 && withdrawnCounts.scopes === 3 && withdrawnCounts.workflows === 0, withdrawnCounts);

  await submit(operatorPage, withdrawFixture, "AIRO 撤回後重新送審");
  const returnedRequest = database.prepare(`SELECT approval_request_id request_id FROM drawing_revision_lifecycle_workflows WHERE package_id=(SELECT id FROM drawing_revision_packages WHERE drawing_number_id=?)`).get(withdrawFixture.drawingId);
  await approverPage.goto(`${baseUrl}/approvals?requestId=${encodeURIComponent(returnedRequest.request_id)}&drawing=${encodeURIComponent(withdrawFixture.drawingNumber)}`, { waitUntil: "networkidle" });
  const decisionLabelsBeforeReturn = await approverPage.locator('[aria-label="審核決策"] button').allTextContents();
  const optionalReasonField = await approverPage.locator('textarea[placeholder="退回說明（選填）"]').count();
  record("AIRO-03", decisionLabelsBeforeReturn.length === 2 && optionalReasonField === 1, { decisionLabels: decisionLabelsBeforeReturn });
  await approverPage.locator('textarea[placeholder="退回說明（選填）"]').fill("請補上加工用 DWG/DXF，並確認尺寸註記。");
  await approverPage.getByRole("button", { name: "退回修改", exact: true }).click();
  await approverPage.getByText("已退回修改", { exact: true }).waitFor({ state: "visible", timeout: 20000 });
  const correction = database.prepare(`SELECT lifecycle_state, active_correction_reason FROM drawing_revision_packages WHERE drawing_number_id=?`).get(withdrawFixture.drawingId);
  record("AIRO-08", correction.lifecycle_state === "correction_required" && correction.active_correction_reason === "請補上加工用 DWG/DXF，並確認尺寸註記。", correction);
  await operatorPage.goto(`${baseUrl}/numbering/revisions?drawingNumber=${withdrawFixture.drawingNumber}&revision=0.1`, { waitUntil: "networkidle" });
  const correctionText = await operatorPage.locator("body").innerText();
  record("AIRO-09-REASON", correctionText.includes("請修正後重新送審") && correctionText.includes("請補上加工用 DWG/DXF，並確認尺寸註記。"), { visible: correctionText.includes("請補上加工用 DWG/DXF，並確認尺寸註記。") });
  await submit(operatorPage, withdrawFixture, "AIRO 退回後重新送審");
  const resubmitted = database.prepare(`SELECT approval_request_id request_id FROM drawing_revision_lifecycle_workflows WHERE package_id=(SELECT id FROM drawing_revision_packages WHERE drawing_number_id=?)`).get(withdrawFixture.drawingId);
  const resubmittedState = database.prepare(`SELECT lifecycle_state, active_correction_reason FROM drawing_revision_packages WHERE drawing_number_id=?`).get(withdrawFixture.drawingId);
  record("AIRO-06", resubmittedState.lifecycle_state === "in_review" && resubmittedState.active_correction_reason === null, resubmittedState);
  record("AIRO-09", resubmittedState.lifecycle_state === "in_review" && Boolean(resubmitted.request_id), { requestId: resubmitted.request_id });

  database.prepare(`DELETE FROM drawing_revision_lifecycle_reviewers
    WHERE workflow_id=(SELECT id FROM drawing_revision_lifecycle_workflows WHERE approval_request_id=?)
      AND reviewer_id IN (?, ?)`)
    .run(resubmitted.request_id, users.unassigned.id, users.admin.id);

  await outsiderPage.goto(`${baseUrl}/numbering/tasks`, { waitUntil: "networkidle" });
  const outsiderText = await outsiderPage.locator("body").innerText();
  await unassignedPage.goto(`${baseUrl}/approvals?requestId=${encodeURIComponent(resubmitted.request_id)}&drawing=${encodeURIComponent(withdrawFixture.drawingNumber)}`, { waitUntil: "networkidle" });
  const unassignedText = await unassignedPage.locator("body").innerText();
  const unassignedDecisionButtons = await unassignedPage.locator('[aria-label="審核決策"] button').count();
  await adminPage.goto(`${baseUrl}/approvals?requestId=${encodeURIComponent(resubmitted.request_id)}&drawing=${encodeURIComponent(withdrawFixture.drawingNumber)}`, { waitUntil: "networkidle" });
  const adminText = await adminPage.locator("body").innerText();
  const adminDecisionButtons = await adminPage.locator('[aria-label="審核決策"] button').count();
  record("AIRO-04", !outsiderText.includes(withdrawFixture.drawingNumber) && await outsiderPage.getByRole("button", { name: "完成", exact: true }).count() === 0 &&
    unassignedDecisionButtons === 0 && adminDecisionButtons === 0,
  { crossCompanyVisible: outsiderText.includes(withdrawFixture.drawingNumber), unassignedDecisionButtons, adminDecisionButtons,
    unassignedShowsDrawing: unassignedText.includes(withdrawFixture.drawingNumber), adminShowsDrawing: adminText.includes(withdrawFixture.drawingNumber) });
  await approverPage.goto(`${baseUrl}/approvals?requestId=${encodeURIComponent(resubmitted.request_id)}&drawing=${encodeURIComponent(withdrawFixture.drawingNumber)}`, { waitUntil: "networkidle" });
  await approverPage.getByRole("button", { name: "核准", exact: true }).click();
  await delay(400);
  const finalState = database.prepare(`SELECT lifecycle_state FROM drawing_revision_packages WHERE drawing_number_id=?`).get(withdrawFixture.drawingId);
  record("AIRO-10", finalState.lifecycle_state === "rd_controlled", finalState);

  await operatorPage.goto(`${baseUrl}/numbering/revisions?drawingNumber=${encodeURIComponent(withdrawFixture.drawingNumber)}&revision=0.1`, { waitUntil: "networkidle" });
  const postDecisionWithdrawButton = await operatorPage.getByRole("button", { name: "撤回送審", exact: true }).count();
  record("AIRO-07-POST-DECISION-WITHDRAW", postDecisionWithdrawButton === 0, { postDecisionWithdrawButton, lifecycleState: finalState.lifecycle_state });

  const cleanupFixture = seedDrawing("F9103");
  await submit(operatorPage, cleanupFixture, "AIRO 流程整理重試");
  const cleanupSeed = database.prepare(`SELECT w.id workflow_id, w.approval_request_id request_id, w.package_id, w.approval_package_id
    FROM drawing_revision_lifecycle_workflows w WHERE w.package_id=(SELECT id FROM drawing_revision_packages WHERE drawing_number_id=?)`).get(cleanupFixture.drawingId);
  const cleanupNow = "2026-08-06T16:30:00.000Z";
  database.transaction(() => {
    database.prepare(`UPDATE drawing_revision_packages SET status='Pending', lifecycle_state='in_review', updated_at=? WHERE id=?`).run(cleanupNow, cleanupSeed.package_id);
    database.prepare(`UPDATE approval_platform_requests SET request_status='approved', apply_status='applied', updated_at=? WHERE id=?`).run(cleanupNow, cleanupSeed.request_id);
    database.prepare(`UPDATE approval_platform_packages SET package_status='approved', updated_at=? WHERE id=?`).run(cleanupNow, cleanupSeed.approval_package_id);
    database.prepare(`UPDATE drawing_revision_lifecycle_workflows SET state='cleanup_pending', cleanup_authorized_at=?, updated_at=? WHERE id=?`).run(cleanupNow, cleanupNow, cleanupSeed.workflow_id);
  })();
  await approverPage.goto(`${baseUrl}/approvals?requestId=${encodeURIComponent(cleanupSeed.request_id)}&drawing=${encodeURIComponent(cleanupFixture.drawingNumber)}`, { waitUntil: "networkidle" });
  await approverPage.getByRole("button", { name: "重試流程整理", exact: true }).waitFor({ state: "visible", timeout: 20000 });
  const cleanupDecisionsBefore = database.prepare(`SELECT COUNT(*) AS count FROM approval_platform_decisions WHERE request_id=?`).get(cleanupSeed.request_id).count;
  const cleanupFaultUrl = `${baseUrl}/api/approvals/requests/${cleanupSeed.request_id}/cleanup`;
  const browserErrorsBeforeCleanupFault = browserErrors.length;
  expectedFailureResponseUrls.add(cleanupFaultUrl);
  const cleanupFaultResponsePromise = approverPage.waitForResponse((response) => response.url().includes(`/api/approvals/requests/${cleanupSeed.request_id}/cleanup`) && response.request().method() === "POST");
  await approverPage.getByRole("button", { name: "重試流程整理", exact: true }).click();
  const cleanupFaultResponse = await cleanupFaultResponsePromise;
  const cleanupFaultBody = await cleanupFaultResponse.json();
  await approverPage.waitForTimeout(250);
  for (const item of browserErrors.slice(browserErrorsBeforeCleanupFault)) {
    if (item.actor === "approver" && /500|Internal Server Error/iu.test(item.text)) expectedBrowserErrors.add(item);
  }
  const cleanupFaultText = await approverPage.locator("body").innerText();
  const cleanupStillPendingAfterFault = database.prepare(`SELECT COUNT(*) AS count FROM drawing_revision_lifecycle_workflows WHERE id=?`).get(cleanupSeed.workflow_id).count;
  const cleanupRequestStillPresentAfterFault = database.prepare(`SELECT COUNT(*) AS count FROM approval_platform_requests WHERE id=?`).get(cleanupSeed.request_id).count;
  record("AIRO-16-CLEANUP-FAULT", cleanupFaultResponse.status() === 500 && cleanupStillPendingAfterFault === 1 && cleanupRequestStillPresentAfterFault === 1 && Boolean(cleanupFaultBody.message) && cleanupFaultText.includes(cleanupFaultBody.message), {
    responseStatus: cleanupFaultResponse.status(), cleanupStillPendingAfterFault, cleanupRequestStillPresentAfterFault,
    apiMessage: cleanupFaultBody.message ?? null, messageVisible: cleanupFaultBody.message ? cleanupFaultText.includes(cleanupFaultBody.message) : false
  });

  database.prepare(`UPDATE drawing_revision_packages SET lifecycle_state='rd_controlled', updated_at=? WHERE id=?`).run(cleanupNow, cleanupSeed.package_id);
  await approverPage.getByRole("button", { name: "重試流程整理", exact: true }).click();
  await approverPage.getByText("已完成流程整理。", { exact: true }).waitFor({ state: "visible", timeout: 20000 });
  const cleanupRemaining = database.prepare(`SELECT COUNT(*) AS count FROM drawing_revision_lifecycle_workflows WHERE id=?`).get(cleanupSeed.workflow_id).count;
  const cleanupRequestRemaining = database.prepare(`SELECT COUNT(*) AS count FROM approval_platform_requests WHERE id=?`).get(cleanupSeed.request_id).count;
  const cleanupDecisionsAfter = database.prepare(`SELECT COUNT(*) AS count FROM approval_platform_decisions WHERE request_id=?`).get(cleanupSeed.request_id).count;
  const cleanupReplayResponse = await approverPage.request.post(`${baseUrl}/api/approvals/requests/${encodeURIComponent(cleanupSeed.request_id)}/cleanup`, {
    headers: { "content-type": "application/json", "Idempotency-Key": `approval-cleanup:${cleanupSeed.request_id}` },
    data: {}
  });
  const cleanupReplayBody = await cleanupReplayResponse.json();
  record("AIRO-16-CLEANUP-RETRY", cleanupRemaining === 0 && cleanupRequestRemaining === 0 && cleanupDecisionsBefore === 0 && cleanupDecisionsAfter === 0 && cleanupReplayResponse.status() === 200 && cleanupReplayBody.cleanup?.idempotentReplay === true, {
    cleanupRemaining, cleanupRequestRemaining, cleanupDecisionsBefore, cleanupDecisionsAfter,
    replayStatus: cleanupReplayResponse.status(), replay: cleanupReplayBody.cleanup ?? null
  });

  await operatorPage.goto(`${baseUrl}/numbering/revisions?drawingNumber=${historicalFixture.drawingNumber}&revision=0.2&source=historical_backfill`, { waitUntil: "networkidle" });
  const historicalText = await operatorPage.locator("body").innerText();
  record("AIRO-12", historicalText.includes("歷史版圖面") && historicalText.includes("低於目前最新版 0.3"), { excerpt: historicalText.slice(0, 1200) });
  record("AIRO-13", !historicalText.includes("Internal Server Error") && !historicalText.includes("Not Found"), {});

  await operatorPage.locator("textarea").last().fill("補登既有 0.2 歷史版圖面，確認與最新版 0.3 的差異。");
  const historicalSubmitButton = operatorPage.getByRole("button", { name: /建立送審/ });
  const historicalButtonCount = await historicalSubmitButton.count();
  const historicalButtonEnabled = historicalButtonCount === 1 && await historicalSubmitButton.isEnabled();
  record("AIRO-12-HISTORICAL-CTA", historicalButtonCount === 1 && historicalButtonEnabled, { historicalButtonCount, historicalButtonEnabled });
  if (historicalButtonEnabled) {
    await operatorPage.locator("textarea").last().fill("補登既有 0.2 歷史版圖面，確認與最新版 0.3 的差異。");
    await historicalSubmitButton.click();
    await operatorPage.locator("[data-drawing-lifecycle-next]").waitFor({ state: "visible", timeout: 20000 });
    const historicalRequest = database.prepare(`SELECT approval_request_id AS request_id
      FROM drawing_revision_lifecycle_workflows
      WHERE package_id=(SELECT id FROM drawing_revision_packages WHERE drawing_number_id=? AND revision='0.2')`).get(historicalFixture.drawingId);
    const historicalInReview = (await operatorPage.locator("body").innerText()).includes("送審中");
    record("AIRO-12-HISTORICAL-SUBMIT", historicalInReview && Boolean(historicalRequest?.request_id), { historicalInReview, requestId: historicalRequest?.request_id ?? null });
    if (historicalRequest?.request_id) {
      await approverPage.goto(`${baseUrl}/approvals?requestId=${encodeURIComponent(historicalRequest.request_id)}&drawing=${encodeURIComponent(historicalFixture.drawingNumber)}`, { waitUntil: "networkidle" });
      await approverPage.getByRole("button", { name: "核准", exact: true }).click();
      await delay(400);
      const historicalStates = database.prepare(`SELECT revision, lifecycle_state FROM drawing_revision_packages
        WHERE drawing_number_id=? ORDER BY revision`).all(historicalFixture.drawingId);
      const latestHistorical = historicalStates.find((row) => row.revision === "0.3");
      const backfilledHistorical = historicalStates.find((row) => row.revision === "0.2");
      record("AIRO-12-HISTORICAL-APPROVE", backfilledHistorical?.lifecycle_state === "rd_controlled" && latestHistorical?.revision === "0.3", { historicalStates });
    }
  }

  const releaseFixture = seedDrawing("F9104", ["1"]);
  await submitRevision(operatorPage, releaseFixture, "1", "確認整數版正式發布與三料號原子更新。");
  const releaseRequest = database.prepare(`SELECT approval_request_id AS request_id
    FROM drawing_revision_lifecycle_workflows
    WHERE package_id=(SELECT id FROM drawing_revision_packages WHERE drawing_number_id=? AND revision='1')`).get(releaseFixture.drawingId);
  await approverPage.goto(`${baseUrl}/approvals?requestId=${encodeURIComponent(releaseRequest.request_id)}&drawing=${encodeURIComponent(releaseFixture.drawingNumber)}`, { waitUntil: "networkidle" });
  await approverPage.getByRole("button", { name: "核准", exact: true }).click();
  await delay(400);
  const releaseState = database.prepare(`SELECT lifecycle_state, status FROM drawing_revision_packages WHERE drawing_number_id=? AND revision='1'`).get(releaseFixture.drawingId);
  const releaseDrawing = database.prepare("SELECT record_status FROM drawing_numbers WHERE id=?").get(releaseFixture.drawingId);
  const releaseParts = database.prepare(`SELECT COUNT(*) AS count FROM part_numbers
    WHERE part_root_id=(SELECT part_root_id FROM drawing_numbers WHERE id=?) AND record_status='Released'`).get(releaseFixture.drawingId);
  const releaseItems = database.prepare(`SELECT COUNT(*) AS count FROM items
    WHERE part_number IN (SELECT part_number FROM part_numbers WHERE part_root_id=(SELECT part_root_id FROM drawing_numbers WHERE id=?))
      AND current_revision='1'`).get(releaseFixture.drawingId);
  record("AIRO-11-INTEGER-RELEASE-UI", releaseState?.lifecycle_state === "released" && releaseState?.status === "Released" &&
    releaseDrawing?.record_status === "Released" && releaseParts?.count === 3 && releaseItems?.count === 3,
  { releaseState, releaseDrawing, releaseParts, releaseItems });

  const viewportResults = [];
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
    await operatorPage.setViewportSize(viewport);
    await operatorPage.waitForTimeout(100);
    const overflow = await operatorPage.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > document.documentElement.clientWidth + 2);
    viewportResults.push({ viewport, overflow });
    await capture(operatorPage, `viewport-${viewport.width}x${viewport.height}.png`);
  }
  record("AIRO-18", viewportResults.every((item) => !item.overflow), { viewportResults });
  await Promise.all([operatorContext.close(), approverContext.close(), unassignedContext.close(), adminContext.close(), outsiderContext.close()]);
}

async function run() {
  const baselineChild = runChild("scripts/qc-dev-053-phase1h-real-operation.mjs");
  const baseline = latestBaselineReport();
  record("AIRO-00", baseline?.result === "passed" && baseline?.productionConnected === false && baseline?.productionWrites === false, { baselineRunId: baseline?.runId ?? null });
  record("AIRO-07-BASELINE-CLEANUP", baseline?.result === "passed" && baseline?.cleanupStatus === "removed", { cleanupStatus: baseline?.cleanupStatus ?? null });
  record("AIRO-11", baseline?.results?.some((item) => item.id.startsWith("DEV053-H-REAL-006") && item.passed) === true, {});
  record("AIRO-17", baseline?.results?.some((item) => item.id.startsWith("DEV053-H-REAL-007") && item.passed) === true, {});

  const adoptionChild = runChild("scripts/qc-dev-053-phase1h-adoption.mjs", true);
  const authorityChild = runChild("scripts/qc-dev-053-phase1h-authority.mjs", true);
  record("AIRO-14", adoptionChild.code === 0 && /PASS|passed/iu.test(adoptionChild.output), { exitCode: adoptionChild.code });
  record("AIRO-15", adoptionChild.code === 0 && /all|atomic|block/iu.test(adoptionChild.output), { exitCode: adoptionChild.code });
  record("AIRO-16", authorityChild.code === 0 && /cleanup|withdraw/iu.test(authorityChild.output), { exitCode: authorityChild.code });
  record("AIRO-20", authorityChild.code === 0 && adoptionChild.code === 0, { authorityExit: authorityChild.code, adoptionExit: adoptionChild.code });

  browser = await chromium.launch({ headless: true });
  await runUiJourneys();
  const protectedHashes = {
    "db/postgres/023_remove_project_status_authority.sql": "047CBCBBC525CFD81369144B70F18A40CEACA38F59DC40850BF0D3FF9B30BCC0",
    ".ai-doc/archived/legacy-supabase-migration-mirror/migrations/20260804030000_remove_project_status_authority.sql": "2BE4C81D8007D3CB8957E07C96D95A466680BB15E7CCCF672D6375A5C8F78956",
    "db/postgres/024_remove_submission_phase_gate.sql": "2356B3512AA6A402DD449859EB18C75400936234FB354E0A4CF73A011BB997A6",
    ".ai-doc/archived/legacy-supabase-migration-mirror/migrations/20260805010000_remove_submission_phase_gate.sql": "29C1C71C87AEA05BDDD37A7E750AD6C057F8AEA18295FEF39B0EA701271B2146"
  };
  const hashCheck = Object.fromEntries(Object.entries(protectedHashes).map(([file, expected]) => [file, sha(fs.readFileSync(path.join(root, file))).toUpperCase() === expected]));
  const expectedPermissionErrors = browserErrors.filter((item) =>
    (item.actor === "unassigned" || item.actor === "admin") && /403|Forbidden/iu.test(item.text));
  const expectedLifecycleErrors = browserErrors.filter((item) => expectedBrowserErrors.has(item));
  const unexpectedBrowserErrors = browserErrors.filter((item) => !expectedPermissionErrors.includes(item) && !expectedLifecycleErrors.includes(item));
  const unexpectedFailedResponses = failedResponses.filter((item) => !expectedFailureResponseUrls.has(item.url));
  record("AIRO-19", unexpectedBrowserErrors.length === 0 && unexpectedFailedResponses.length === 0, {
    browserErrors: unexpectedBrowserErrors,
    expectedPermissionErrors,
    expectedLifecycleErrors,
    failedResponses: unexpectedFailedResponses
  });
  record("AIRO-20-HASH", Object.values(hashCheck).every(Boolean), hashCheck);
  if (baselineChild.code !== 0) record("AIRO-BASELINE-RUNNER", false, { exitCode: baselineChild.code });
}

try {
  await run();
} catch (error) {
  record("AIRO-FULL-RUNNER", false, { message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined, serverTail: app?.getOutput().slice(-8000) ?? "" });
} finally {
  await browser?.close().catch(() => undefined);
  try { database?.close(); } catch {}
  if (app) await stopNextApp(app.child);
  for (const [file, content] of trackedFiles) fs.writeFileSync(path.join(root, file), content, "utf8");
  const safeDist = path.resolve(distDir).startsWith(path.resolve(root, ".tmp") + path.sep);
  const safeTemp = path.resolve(tempRoot).startsWith(path.resolve(os.tmpdir()) + path.sep);
  if (safeDist && safeTemp) {
    fs.rmSync(distDir, { recursive: true, force: true });
    fs.rmSync(tempRoot, { recursive: true, force: true });
    cleanupStatus = "removed";
  } else cleanupStatus = "refused-unsafe-target";
}

const failed = results.filter((result) => !result.passed);
const report = {
  runId,
  startedAt,
  finishedAt: new Date().toISOString(),
  result: failed.length === 0 && cleanupStatus === "removed" ? "passed" : "failed",
  scope: "disposable SQLite + isolated Next.js + real Chromium UI + repository cross-checks",
  productionConnected: false,
  productionWrites: false,
  cleanupStatus,
  passed: results.length - failed.length,
  failed: failed.length,
  results,
  screenshots,
  browserErrors: browserErrors.filter((item) => {
    const expectedPermission = (item.actor === "unassigned" || item.actor === "admin") && /403|Forbidden/iu.test(item.text);
    return !expectedPermission && !expectedBrowserErrors.has(item);
  }),
  expectedPermissionErrors: browserErrors.filter((item) => (item.actor === "unassigned" || item.actor === "admin") && /403|Forbidden/iu.test(item.text)),
  expectedLifecycleErrors: [...expectedBrowserErrors],
  failedResponses: failedResponses.filter((item) => !expectedFailureResponseUrls.has(item.url)),
  mutatingRequests
};
fs.writeFileSync(path.join(outputDir, "run-report.json"), JSON.stringify(report, null, 2), "utf8");
fs.writeFileSync(path.join(outputDir, "case-results.md"), ["# DEV-053 Phase 1H full AI real-operation results", "", `- Run: ${runId}`, `- Result: ${report.result}`, `- Isolation: ${report.scope}`, `- Cleanup: ${cleanupStatus}`, "", ...results.map((item) => `- ${item.passed ? "PASS" : "FAIL"} ${item.id}`), ""].join("\n"), "utf8");
console.log(JSON.stringify(report, null, 2));
if (report.result !== "passed") process.exit(1);
