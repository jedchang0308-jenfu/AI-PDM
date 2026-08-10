#!/usr/bin/env node

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
const runId = `DEV053-${startedAt.replace(/[-:]/gu, "").replace(/\..+$/u, "").replace("T", "-")}-local-isolated`;
const outputDir = path.join(root, "output", "playwright", "dev053-real-operation", runId);
const screenshotDir = path.join(outputDir, "screenshots");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev053-real-operation-"));
const dataDir = path.join(tempRoot, "data");
const repositoryDir = path.join(dataDir, "repository");
const databasePath = path.join(dataDir, "ai-pdm.sqlite");
const distDirRelative = `.tmp/q53-${crypto.randomUUID().slice(0, 8)}`;
const distDir = path.join(root, ...distDirRelative.split("/"));
const fixturePdf = path.join(tempRoot, "dev053-primary-drawing.pdf");
const existingFileFixtures = {
  trusted: {
    fileId: "dev053-real-existing-file",
    assetId: "dev053-real-existing-asset",
    fileName: "dev053-existing-primary.sldprt",
    bytes: Buffer.from("DEV053 trusted legacy CAD payload\n", "utf8"),
    contentHashOverride: null
  },
  mismatched: {
    fileId: "dev053-real-mismatched-file",
    assetId: "dev053-real-mismatched-asset",
    fileName: "dev053-mismatched-primary.sldprt",
    bytes: Buffer.from("DEV053 tampered legacy CAD payload\n", "utf8"),
    contentHashOverride: "0".repeat(64)
  }
};
const password = "DEV053-Real-Operation-2026";
const fixture = {
  workspaceId: "dev053-real-candidate",
  rootId: "dev053-real-draft-root",
  partId: "dev053-real-draft-part",
  drawingId: "dev053-real-draft-drawing",
  relationId: "dev053-real-draft-relation",
  rootCode: "Z3053",
  partCode: "Z3053-P01",
  drawingCode: "Z3053-M01",
  title: "DEV053 既有保留號",
  fileName: "dev053-primary-drawing.pdf"
};
const users = {
  operator: {
    id: "dev053-real-operator", displayName: "DEV-053 測試工程師", email: "dev053.operator@example.invalid",
    password, role: "Engineer", companyCodes: ["JENFU"]
  },
  approver: {
    id: "dev053-real-approver", displayName: "DEV-053 測試審核者", email: "dev053.approver@example.invalid",
    password, role: "R&D Manager", companyCodes: ["JENFU"]
  }
};
const user = users.operator;
const trackedFiles = new Map(["next-env.d.ts", "tsconfig.json"].map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
const sourceFiles = [
  "src/app/numbering/drawings/page.tsx",
  "src/app/api/numbering/drawings/workbench/route.ts",
  "src/app/api/numbering/drawings/workbench/[rowKey]/route.ts",
  "src/app/api/numbering/draft-workspaces/[id]/candidate-revisions/[revisionId]/files/route.ts",
  "src/components/drawing-workbench.tsx",
  "src/components/master-attachment-panel.tsx",
  "src/components/numbering-candidate-revision-editor.tsx",
  "src/components/numbering-contextual-entrypoints.tsx",
  "src/app/numbering/revisions/page.tsx",
  "src/lib/drawing-workbench.ts",
  "src/lib/number-lifecycle-simplification.ts",
  "src/lib/publication-evidence.ts",
  "src/lib/repositories/drawing-workbench-async-repository.ts",
  "src/lib/repositories/number-lifecycle-simplification-async-repository.ts",
  "src/lib/repositories/master-attachment-async-repository.ts",
  "src/lib/repositories/master-attachment-repository.ts",
  "db/postgres/022_unified_drawing_workbench.sql",
  "supabase/migrations/20260804020000_unified_drawing_workbench.sql",
  "scripts/qc-dev-053-drawing-workbench-real-operation.mjs"
];
const results = [];
const screenshots = [];
const browserErrors = [];
const expectedBrowserErrors = [];
const failedResponses = [];
const observedRequests = [];
const visibleErrors = [];
let app;
let browser;
let database;
let baseUrl = "";
let cleanupStatus = "not_started";

fs.mkdirSync(screenshotDir, { recursive: true });
fs.writeFileSync(
  fixturePdf,
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  "utf8"
);
const record = (id, passed, detail = {}) => results.push({ id, passed: Boolean(passed), detail });
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");

function businessHash() {
  const tables = [
    "numbering_draft_workspaces", "numbering_draft_roots", "numbering_draft_parts", "numbering_draft_drawings",
    "numbering_draft_relations", "number_candidate_reservations", "number_candidate_events",
    "numbering_candidate_revision_drafts", "numbering_candidate_revision_files", "numbering_publication_evidence",
    "approval_platform_requests", "approval_platform_targets", "approval_platform_impact_snapshots",
    "approval_platform_decisions", "approval_platform_events", "part_roots", "part_numbers", "drawing_numbers",
    "drawing_part_links", "drawing_revision_packages", "drawing_revision_package_files",
    "drawing_revision_package_review_approvals", "audit_logs", "platform_command_receipts", "platform_outbox_events"
  ];
  return Object.fromEntries(tables.map((table) => {
    const rows = database.prepare(`SELECT * FROM ${table}`).all()
      .map((row) => JSON.stringify(Object.fromEntries(Object.entries(row).sort(([left], [right]) => left.localeCompare(right)))))
      .sort();
    return [table, { count: rows.length, hash: sha(rows.join("\n")) }];
  }));
}

function seedFixture() {
  const now = "2026-08-04T09:00:00.000Z";
  database.transaction(() => {
    database.prepare(`INSERT INTO numbering_draft_workspaces (
        id, company_id, draft_mode, lifecycle_status, owner_id, created_by, row_version, created_at, updated_at
      ) VALUES (?, 'company-jenfu', 'new_bundle', 'active', ?, ?, 1, ?, ?)`)
      .run(fixture.workspaceId, user.id, user.id, now, now);
    database.prepare(`INSERT INTO numbering_draft_roots (
        id, company_id, workspace_id, core_name, item_kind, rule_version_id, created_at, updated_at
      ) VALUES (?, 'company-jenfu', ?, ?,
        'manufactured', 'numbering-rule-v3-alpha-root', ?, ?)`)
      .run(fixture.rootId, fixture.workspaceId, fixture.title, now, now);

    database.prepare(`INSERT INTO numbering_draft_parts (
        id, company_id, workspace_id, root_draft_id, part_name, item_kind, is_universal, series_code,
        created_at, updated_at
      ) VALUES (?, 'company-jenfu', ?, ?, ?, 'manufactured', 0, 'JF', ?, ?)`)
      .run(fixture.partId, fixture.workspaceId, fixture.rootId, fixture.title, now, now);
    database.prepare(`INSERT INTO numbering_draft_drawings (
        id, company_id, workspace_id, root_draft_id, purpose_code, purpose_description, is_primary_manufacturing,
        created_at, updated_at
      ) VALUES (?, 'company-jenfu', ?, ?,
        'M', '', 1, ?, ?)`)
      .run(fixture.drawingId, fixture.workspaceId, fixture.rootId, now, now);
    database.prepare(`INSERT INTO numbering_draft_relations (
        id, company_id, workspace_id, drawing_draft_id, part_draft_id, link_type, is_primary, created_at, updated_at
      ) VALUES (?, 'company-jenfu', ?, ?, ?, 'primary_manufacturing', 1, ?, ?)`)
      .run(fixture.relationId, fixture.workspaceId, fixture.drawingId, fixture.partId, now, now);
    for (const [id, itemType, itemId, code] of [
      ["dev053-real-res-root", "root", fixture.rootId, fixture.rootCode],
      ["dev053-real-res-part", "part", fixture.partId, fixture.partCode],
      ["dev053-real-res-drawing", "drawing", fixture.drawingId, fixture.drawingCode]
    ]) {
      database.prepare(`INSERT INTO number_candidate_reservations (
          id, company_id, workspace_id, draft_item_type, draft_item_id, candidate_code, sequence_scope_key,
          sequence_no, reservation_state, row_version, created_by, created_at, updated_at
        ) VALUES (?, 'company-jenfu', ?, ?, ?, ?, ?, 1, 'active', 1, ?, ?, ?)`)
        .run(id, fixture.workspaceId, itemType, itemId, code, `dev053-real:${itemType}`, user.id, now, now);
      const table = itemType === "root" ? "numbering_draft_roots" : itemType === "part" ? "numbering_draft_parts" : "numbering_draft_drawings";
      database.prepare(`UPDATE ${table} SET candidate_reservation_id = ? WHERE id = ?`).run(id, itemId);
    }

    database.prepare(`INSERT INTO part_roots (
        id, company_id, root_code, core_name, item_kind, record_status, created_by, created_at, updated_at
      ) VALUES ('dev053-real-master-root', 'company-jenfu', 'Z4053', 'DEV053 正式圖號', 'manufactured',
        'Active', ?, ?, ?)` ).run(user.id, now, now);
    database.prepare(`INSERT INTO part_numbers (
        id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, series_code,
        record_status, created_by, created_at, updated_at
      ) VALUES ('dev053-real-master-part', 'company-jenfu', 'dev053-real-master-root', 'Z4053-P01', 1, '01',
        'DEV053 正式圖號', 'manufactured', 'JF', 'Active', ?, ?, ?)` ).run(user.id, now, now);
    database.prepare(`INSERT INTO drawing_numbers (
        id, company_id, part_root_id, drawing_number, purpose_code, sequence_no, is_primary_manufacturing,
        record_status, created_by, created_at, updated_at
      ) VALUES ('dev053-real-master-drawing', 'company-jenfu', 'dev053-real-master-root', 'Z4053-M01', 'M', 1, 1,
        'Active', ?, ?, ?)` ).run(user.id, now, now);
    database.prepare(`INSERT INTO drawing_part_links (
        id, drawing_number_id, part_number_id, link_type, created_by, created_at
      ) VALUES ('dev053-real-master-link', 'dev053-real-master-drawing', 'dev053-real-master-part',
        'primary_manufacturing', ?, ?)` ).run(user.id, now);
  })();
}

function seedExistingCandidateFile(candidateId, fileFixture) {
  const current = database.prepare(`SELECT row_version FROM numbering_candidate_revision_drafts
    WHERE id = ? AND workspace_id = ?`).get(candidateId, fixture.workspaceId);
  if (!current) throw new Error(`DEV053_EXISTING_FILE_CANDIDATE_NOT_FOUND:${candidateId}`);
  const storageKey = ["candidate-revisions", "company-jenfu", candidateId, `${fileFixture.fileId}-${fileFixture.fileName}`].join("/");
  const originalPath = path.join(repositoryDir, ...storageKey.split("/"));
  fs.mkdirSync(path.dirname(originalPath), { recursive: true });
  fs.writeFileSync(originalPath, fileFixture.bytes);
  const actualHash = sha(fileFixture.bytes);
  const contentHash = fileFixture.contentHashOverride ?? actualHash;
  const now = new Date().toISOString();
  database.transaction(() => {
    database.prepare(`INSERT INTO file_assets (
        id, storage_provider, original_path, storage_key, file_name, file_ext, mime_type, file_size,
        content_hash, hash_algorithm, linked_entity_type, linked_entity_id, document_category,
        display_name, description, revision, uploaded_by, gdrive_status, sync_status, created_at, updated_at
      ) VALUES (?, 'local_repository', ?, ?, ?, '.sldprt', 'application/octet-stream', ?, ?, 'SHA-256',
        'numbering_candidate_revision', ?, 'cad_3d', ?, '', '0.1', ?, 'none', 'migrated', ?, ?)`)
      .run(fileFixture.assetId, originalPath, storageKey, fileFixture.fileName, fileFixture.bytes.byteLength,
        contentHash, candidateId, fileFixture.fileName, user.id, now, now);
    database.prepare(`INSERT INTO numbering_candidate_revision_files (
        id, company_id, candidate_revision_id, source_file_asset_id, publication_evidence_id,
        role, role_source, display_name, description, sort_order, is_primary, created_by, created_at, updated_at
      ) VALUES (?, 'company-jenfu', ?, ?, NULL, 'cad_3d', 'migration', ?, '', 0, 1, ?, ?, ?)`)
      .run(fileFixture.fileId, candidateId, fileFixture.assetId, fileFixture.fileName, user.id, now, now);
    database.prepare(`UPDATE numbering_candidate_revision_drafts
      SET row_version = row_version + 1, updated_at = ? WHERE id = ? AND row_version = ?`)
      .run(now, candidateId, Number(current.row_version));
  })();
  return {
    ...fileFixture,
    originalPath,
    storageKey,
    actualHash,
    contentHash,
    expectedRowVersion: Number(current.row_version) + 1
  };
}

async function capture(page, name) {
  const target = path.join(screenshotDir, name);
  await page.screenshot({ path: target, fullPage: false });
  screenshots.push(path.relative(outputDir, target).split(path.sep).join("/"));
}

async function viewportEvidence(page, width, height) {
  await page.setViewportSize({ width, height });
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    mainClientWidth: document.querySelector("main")?.clientWidth ?? 0,
    mainScrollWidth: document.querySelector("main")?.scrollWidth ?? 0,
    tableDisplay: getComputedStyle(document.querySelector(".drawing-workbench-table")).display,
    rowDisplay: getComputedStyle(document.querySelector(".drawing-workbench-table tbody tr")).display,
    headDisplay: getComputedStyle(document.querySelector(".drawing-workbench-table thead")).display
  }));
  await capture(page, `workbench-${width}x${height}.png`);
  record(`DEV053-REAL viewport ${width}x${height}`,
    metrics.documentScrollWidth <= metrics.innerWidth + 2 && metrics.mainScrollWidth <= metrics.mainClientWidth + 2 &&
    (width > 760 || (metrics.rowDisplay === "block" && metrics.headDisplay === "none")), metrics);
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

async function searchWorkbench(page, input, value) {
  const response = page.waitForResponse((candidate) => {
    const url = new URL(candidate.url());
    return candidate.request().method() === "GET"
      && url.pathname === "/api/numbering/drawings/workbench"
      && (url.searchParams.get("query") ?? "") === value;
  }, { timeout: 20000 });
  await Promise.all([response, input.fill(value)]);
}

function requestForWorkspace() {
  return database.prepare(`SELECT request.id, request.request_status, request.apply_status
    FROM approval_platform_requests request
    WHERE request.action_code = 'numbering.candidate_bundle_review'
      AND json_extract(request.payload_json, '$.workspaceId') = ?
    ORDER BY request.requested_at DESC LIMIT 1`).get(fixture.workspaceId);
}

function workspaceCounts() {
  return {
    workspaces: Number(database.prepare("SELECT count(*) AS count FROM numbering_draft_workspaces").get().count),
    roots: Number(database.prepare("SELECT count(*) AS count FROM part_roots").get().count),
    parts: Number(database.prepare("SELECT count(*) AS count FROM part_numbers").get().count),
    drawings: Number(database.prepare("SELECT count(*) AS count FROM drawing_numbers").get().count),
    links: Number(database.prepare("SELECT count(*) AS count FROM drawing_part_links").get().count)
  };
}

async function collectVisibleErrors(page, actor) {
  const texts = await page.locator('[role="alert"], .number-state-form-error, .drawing-workbench-error').evaluateAll((nodes) =>
    nodes.filter((node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    }).map((node) => node.textContent?.trim() ?? "").filter(Boolean)
  ).catch(() => []);
  for (const value of texts) visibleErrors.push({ actor, url: page.url(), text: value.slice(0, 1000) });
}

function formalFacts() {
  const request = requestForWorkspace();
  const candidate = database.prepare(`SELECT revision, lifecycle_status, formal_drawing_number_id, formal_revision_package_id
    FROM numbering_candidate_revision_drafts WHERE workspace_id = ?`).get(fixture.workspaceId);
  return {
    request,
    candidate,
    promotedReservations: Number(database.prepare("SELECT count(*) AS count FROM number_candidate_reservations WHERE workspace_id = ? AND reservation_state = 'promoted'").get(fixture.workspaceId).count),
    roots: Number(database.prepare("SELECT count(*) AS count FROM part_roots WHERE root_code = ?").get(fixture.rootCode).count),
    parts: Number(database.prepare("SELECT count(*) AS count FROM part_numbers WHERE part_number = ?").get(fixture.partCode).count),
    drawings: Number(database.prepare("SELECT count(*) AS count FROM drawing_numbers WHERE drawing_number = ?").get(fixture.drawingCode).count),
    links: Number(database.prepare(`SELECT count(*) AS count FROM drawing_part_links link
      JOIN drawing_numbers drawing ON drawing.id = link.drawing_number_id
      JOIN part_numbers part ON part.id = link.part_number_id
      WHERE drawing.drawing_number = ? AND part.part_number = ?`).get(fixture.drawingCode, fixture.partCode).count),
    packages: Number(database.prepare("SELECT count(*) AS count FROM drawing_revision_packages WHERE drawing_number = ?").get(fixture.drawingCode).count),
    packageFiles: candidate?.formal_revision_package_id
      ? Number(database.prepare("SELECT count(*) AS count FROM drawing_revision_package_files WHERE package_id = ?").get(candidate.formal_revision_package_id).count)
      : 0,
    formalAttachmentAssets: candidate?.formal_drawing_number_id
      ? Number(database.prepare(`SELECT count(*) AS count FROM file_assets
          WHERE linked_entity_type = 'drawing_number' AND linked_entity_id = ? AND deleted_at IS NULL`).get(candidate.formal_drawing_number_id).count)
      : 0,
    reviewCompanions: candidate?.formal_revision_package_id
      ? Number(database.prepare("SELECT count(*) AS count FROM drawing_revision_package_review_approvals WHERE package_id = ?").get(candidate.formal_revision_package_id).count)
      : 0
  };
}

async function run() {
  const resolvedData = path.resolve(dataDir);
  if (!resolvedData.startsWith(path.resolve(tempRoot) + path.sep) || resolvedData.startsWith(path.resolve(root, "data") + path.sep)) {
    throw new Error("DEV053_REAL_OPERATION_DATA_DIR_NOT_ISOLATED");
  }
  Object.assign(process.env, {
    NODE_ENV: "development",
    PDM_AUTH_MODE: "managed",
    PDM_BOOTSTRAP_USERS: JSON.stringify(Object.values(users)),
    PDM_DEMO_USERS: "0",
    PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir,
    PDM_DB_PROVIDER: "sqlite",
    PDM_POSTGRES_URL: "",
    DATABASE_URL: "",
    PDM_STORAGE_PROVIDER: "local_repository",
    PDM_SUPABASE_STORAGE_LIVE_ENABLED: "0",
    PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
    PDM_PUBLICATION_EVIDENCE_MODE: "",
    PDM_RELEASE_MODE: "local_stub",
    PDM_NUMBER_STATE_FLOW_V1: "true",
    PDM_NUMBER_LIFECYCLE_V2: "true",
    PDM_UNIFIED_DRAWING_WORKBENCH_V1: "true",
    PDM_PRODUCTION_SLICE_MODE: "",
    PDM_NEXT_DIST_DIR: distDirRelative,
    PDM_QC_ISOLATED_TARGET: "1"
  });

  const port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput);
  for (const route of [
    "/numbering/drawings?view=work",
    "/approvals",
    "/api/numbering/drawings/workbench?view=work&limit=50",
    "/api/numbering/draft-workspaces/prewarm/candidate-revisions",
    "/api/numbering/draft-workspaces/prewarm/candidate-revisions/prewarm/files",
    "/api/numbering/draft-workspaces/prewarm/submit-bundle-review",
    "/api/approvals/requests/prewarm/decisions",
    "/api/numbering/drawings/prewarm/attachments"
  ]) {
    await fetch(`${baseUrl}${route}`, { redirect: "manual" }).catch(() => null);
  }
  const existingFileVerificationWarmPath =
    "/api/numbering/draft-workspaces/prewarm/candidate-revisions/prewarm/files";
  let existingFileVerificationWarmStatus = 404;
  for (let attempt = 0; attempt < 20 && existingFileVerificationWarmStatus === 404; attempt += 1) {
    const response = await fetch(`${baseUrl}${existingFileVerificationWarmPath}`, { redirect: "manual" }).catch(() => null);
    existingFileVerificationWarmStatus = response?.status ?? 0;
    if (existingFileVerificationWarmStatus === 404) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (existingFileVerificationWarmStatus === 404 || existingFileVerificationWarmStatus === 0) {
    throw new Error(`DEV053_EXISTING_FILE_VERIFICATION_ROUTE_NOT_READY:${existingFileVerificationWarmStatus}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const approverContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const approverPage = await approverContext.newPage();
  const monitor = (target, actor) => {
    target.on("console", (message) => {
      if (message.type() !== "error") return;
      const location = message.location();
      browserErrors.push({
        type: "console",
        actor,
        text: message.text().slice(0, 500),
        url: location.url || null,
        lineNumber: location.lineNumber ?? null
      });
    });
    target.on("pageerror", (error) => browserErrors.push({ type: "pageerror", actor, text: error.message.slice(0, 500) }));
    target.on("request", (request) => {
      const url = new URL(request.url());
      const method = request.method();
      if (!["POST", "PATCH", "PUT", "DELETE"].includes(method) ||
          (!url.pathname.startsWith("/api/numbering") && !url.pathname.startsWith("/api/approvals"))) return;
      const postData = request.postData() ?? "";
      observedRequests.push({
        event: "request",
        at: new Date().toISOString(),
        actor,
        method,
        path: url.pathname,
        idempotencyKeyPresent: Boolean(request.headers()["idempotency-key"]),
        bodySha256: postData ? sha(postData) : null
      });
    });
    target.on("response", (response) => {
      const url = new URL(response.url());
      const method = response.request().method();
      if (["POST", "PATCH", "PUT", "DELETE"].includes(method) &&
          (url.pathname.startsWith("/api/numbering") || url.pathname.startsWith("/api/approvals"))) {
        observedRequests.push({ event: "response", at: new Date().toISOString(), actor, method, path: url.pathname, status: response.status() });
      }
      if (response.status() >= 500) failedResponses.push({ actor, method, url: response.url(), status: response.status() });
    });
  };
  monitor(page, "operator");
  monitor(approverPage, "approver");
  await Promise.all([login(page, users.operator), login(approverPage, users.approver)]);
  database = new Database(databasePath);
  seedFixture();
  const beforeRead = businessHash();

  await page.goto(`${baseUrl}/numbering/drawings?tab=reserved`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "圖號工作台", exact: true }).waitFor({ state: "visible" });
  record("DEV053-REAL-001 old reserved URL enters one unified workbench",
    new URL(page.url()).searchParams.get("tab") === null && new URL(page.url()).searchParams.get("view") === "work" &&
    await page.locator('[role="tab"]').count() === 0 && await page.locator(".number-state-tabs").count() === 0,
    { url: page.url() });
  const headers = await page.locator(".drawing-workbench-table thead th").allTextContents();
  record("DEV053-REAL-002 rendered list has four scan columns with part number after name",
    JSON.stringify(headers.map((value) => value.trim()).filter(Boolean)) === JSON.stringify(["圖號", "品名", "料號", "工作狀態"]), { headers });

  const search = page.getByPlaceholder("圖號、品名、料號");
  await searchWorkbench(page, search, "Z3053-M01");
  await page.getByRole("button", { name: "Z3053-M01", exact: true }).waitFor({ state: "visible" });
  const candidateRow = page.locator(".drawing-workbench-table tbody tr").filter({ has: page.getByRole("button", { name: "Z3053-M01", exact: true }) });
  record("DEV053-REAL-003 list row removes the repeated next-step action",
    await candidateRow.getByRole("button", { name: "完成首版", exact: true }).count() === 0 &&
    (await candidateRow.innerText()).includes("尚不可正式使用"));
  await candidateRow.getByRole("button", { name: "Z3053-M01", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "visible" });
  record("DEV053-REAL-004 candidate drawer exposes state risk and one next step",
    (await page.getByRole("dialog").innerText()).includes("尚不可正式使用") &&
    await page.getByRole("button", { name: "完成首版圖面", exact: true }).count() === 1);
  await capture(page, "candidate-drawer-1440x900.png");
  await page.getByRole("button", { name: "關閉保留號明細", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });

  await searchWorkbench(page, search, "Z4053-M01");
  await page.getByRole("button", { name: "Z4053-M01", exact: true }).waitFor({ state: "visible" });
  await page.locator('[data-attachment-authority="controlled_summary"]').waitFor({ state: "visible" });
  await page.getByText("參考附件", { exact: true }).waitFor({ state: "visible" });
  const formalMasterRowText = await page.locator(".drawing-workbench-table tbody tr").innerText();
  const formalMasterDrawer = page.getByRole("dialog", { name: "圖號明細" });
  const formalMasterDrawerText = await formalMasterDrawer.innerText();
  const initialControlledPanel = page.locator('[data-attachment-authority="controlled_summary"]');
  const disabledRevisionButtons = formalMasterDrawer.getByRole("button", { name: /圖面進版|上傳與送審/u });
  record("DEV053-REAL-005 formal master preserves management capabilities, authority split and permission guidance",
    await initialControlledPanel.getByRole("button", { name: /上傳|刪除/u }).count() === 0 &&
    formalMasterRowText.includes("Z4053-P01") &&
    formalMasterDrawerText.includes("同主根號料號") && formalMasterDrawerText.includes("主要製造圖") &&
    formalMasterDrawerText.includes("post_release_change") && formalMasterDrawerText.includes("研發主管或 PDM Admin") &&
    await disabledRevisionButtons.count() >= 2 && await disabledRevisionButtons.evaluateAll((buttons) => buttons.every((button) => button.hasAttribute("disabled"))) &&
    await formalMasterDrawer.getByRole("link", { name: "完整圖料關係", exact: true }).count() === 1 &&
    await formalMasterDrawer.getByRole("link", { name: "製造影響", exact: true }).count() === 1 &&
    await formalMasterDrawer.getByRole("link", { name: "補成本", exact: true }).count() === 1 &&
    formalMasterDrawerText.includes("標準成本未設定（選填）") &&
    await formalMasterDrawer.getByRole("button", { name: "補主資料", exact: true }).count() === 1,
    { formalMasterRowText, formalMasterDrawerText });
  await capture(page, "master-read-only-drawer-1440x900.png");
  await page.getByRole("button", { name: "關閉圖號明細", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await searchWorkbench(page, search, "");

  for (const [width, height] of [[1440, 900], [1280, 720], [1024, 768], [390, 844]]) {
    await viewportEvidence(page, width, height);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "重新整理", exact: true }).click();
  await page.waitForLoadState("networkidle");
  await page.reload({ waitUntil: "networkidle" });
  const afterRead = businessHash();
  record("DEV053-REAL-006 search, drawers, responsive checks, refresh and reload are zero-write",
    JSON.stringify(beforeRead) === JSON.stringify(afterRead), { beforeRead, afterRead });

  const createOpener = page.locator("button.primary-button").filter({ hasText: "建立圖號" }).first();
  await createOpener.focus();
  await createOpener.click();
  const createDialog = page.getByRole("dialog", { name: "建立保留號" });
  await createDialog.waitFor({ state: "visible" });
  const initialFocusIsHeading = await page.evaluate(() => document.activeElement?.id === "number-state-create-title");
  await page.keyboard.press("Escape");
  await createDialog.waitFor({ state: "hidden" });
  const focusReturnedToCreate = await createOpener.evaluate((node) => document.activeElement === node);
  record("DEV053-REAL-007 create dialog supports keyboard close and restores focus",
    initialFocusIsHeading && focusReturnedToCreate, { initialFocusIsHeading, focusReturnedToCreate });

  const beforeCreateCancel = businessHash();
  await createOpener.click();
  await createDialog.getByLabel("確定品名").fill("DEV053 取消不寫入");
  await createDialog.getByRole("button", { name: "取消", exact: true }).click();
  await createDialog.waitFor({ state: "hidden" });
  const afterCreateCancel = businessHash();
  record("DEV053-REAL-008 cancelling global create performs no business write",
    JSON.stringify(beforeCreateCancel) === JSON.stringify(afterCreateCancel), { beforeCreateCancel, afterCreateCancel });

  const globalCreateBefore = workspaceCounts();
  await createOpener.click();
  await createDialog.getByLabel("確定品名").fill("DEV053 全域建立測試");
  const globalCreateButton = createDialog.getByRole("button", { name: "建立並保留號碼", exact: true });
  await globalCreateButton.waitFor({ state: "visible" });
  await globalCreateButton.waitFor({ state: "attached" });
  await page.waitForTimeout(700);
  const globalCreateResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname === "/api/numbering/draft-workspaces",
  { timeout: 30000 });
  const [globalCreateResponse] = await Promise.all([
    globalCreateResponsePromise,
    globalCreateButton.click()
  ]);
  if (!globalCreateResponse.ok()) throw new Error(`DEV053_GLOBAL_CREATE_FAILED:${globalCreateResponse.status()}`);
  await page.waitForURL((url) => url.searchParams.get("detail")?.startsWith("candidate:") === true, { timeout: 30000 });
  const globalWorkspaceId = new URL(page.url()).searchParams.get("detail")?.slice("candidate:".length) ?? "";
  if (!globalWorkspaceId) throw new Error("DEV053_GLOBAL_CREATE_MISSING_CANONICAL_ID");
  const globalCreateAfter = workspaceCounts();
  const globalWorkspace = database.prepare(`SELECT id, draft_mode, source_root_id, source_drawing_number_id,
      source_part_number_id, source_link_type, lifecycle_status
    FROM numbering_draft_workspaces WHERE id = ?`).get(globalWorkspaceId);
  record("DEV053-REAL-009 global create writes only a candidate workspace and opens it in the unified workbench",
    globalCreateAfter.workspaces === globalCreateBefore.workspaces + 1 &&
    globalCreateAfter.roots === globalCreateBefore.roots && globalCreateAfter.parts === globalCreateBefore.parts &&
    globalCreateAfter.drawings === globalCreateBefore.drawings && globalCreateAfter.links === globalCreateBefore.links &&
    globalWorkspace?.draft_mode === "new_bundle" && globalWorkspace?.lifecycle_status === "active" &&
    !globalWorkspace?.source_root_id && !globalWorkspace?.source_drawing_number_id && !globalWorkspace?.source_part_number_id,
    { request: globalCreateResponse.request().postDataJSON(), globalWorkspace, globalCreateBefore, globalCreateAfter, url: page.url() });
  await capture(page, "global-create-result-1440x900.png");

  await page.goto(`${baseUrl}/numbering/drawings?view=all`, { waitUntil: "networkidle" });
  const contextualSearch = page.getByPlaceholder("圖號、品名、料號");
  await searchWorkbench(page, contextualSearch, "Z4053-M01");
  await page.getByRole("button", { name: "Z4053-M01", exact: true }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "新增同圖料號", exact: true }).click();
  const appendDialog = page.locator('.pdm-contextual-dialog[role="dialog"][aria-label="新增同根料號"]');
  await appendDialog.waitFor({ state: "visible" });
  const nextPartNumber = appendDialog.locator(".pdm-contextual-preview", { hasText: "預計產生" }).locator("strong");
  for (let attempt = 0; attempt < 100 && (await nextPartNumber.textContent())?.trim() === "讀取中"; attempt += 1) {
    await page.waitForTimeout(100);
  }
  if ((await nextPartNumber.textContent())?.trim() === "讀取中") throw new Error("DEV053_CONTEXTUAL_POLICY_TIMEOUT");
  const appendReason = appendDialog.getByLabel("追加原因");
  if (await appendReason.count()) await appendReason.fill("DEV-053 真實操作驗證：同圖新增料號");
  const contextualBefore = workspaceCounts();
  const createPartWorkButton = appendDialog.getByRole("button", { name: "建立料號工作", exact: true });
  if (await createPartWorkButton.isDisabled()) throw new Error(`DEV053_CONTEXTUAL_APPEND_DISABLED:${await appendDialog.innerText()}`);
  const appendResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname === "/api/numbering/draft-workspaces",
  { timeout: 30000 });
  const [appendResponse] = await Promise.all([
    appendResponsePromise,
    createPartWorkButton.click()
  ]);
  if (!appendResponse.ok()) {
    const errorBody = await appendResponse.json().catch(() => ({}));
    throw new Error(`DEV053_CONTEXTUAL_APPEND_FAILED:${appendResponse.status()}:${JSON.stringify({ errorBody, request: appendResponse.request().postDataJSON() })}`);
  }
  await page.waitForURL((url) => url.searchParams.get("detail")?.startsWith("candidate:") === true, { timeout: 30000 });
  const appendWorkspaceId = new URL(page.url()).searchParams.get("detail")?.slice("candidate:".length) ?? "";
  if (!appendWorkspaceId) throw new Error("DEV053_CONTEXTUAL_APPEND_MISSING_CANONICAL_ID");
  const appendRequestBody = appendResponse.request().postDataJSON();
  const appendHeaders = appendResponse.request().headers();
  const contextualAfter = workspaceCounts();
  const contextualWorkspace = database.prepare(`SELECT id, draft_mode, source_root_id, source_drawing_number_id,
      source_part_number_id, source_link_type, lifecycle_status
    FROM numbering_draft_workspaces WHERE id = ?`).get(appendWorkspaceId);
  record("DEV053-REAL-010 same-drawing add creates a relationship-only candidate with source context",
    Boolean(appendHeaders["idempotency-key"]) && appendRequestBody?.draftMode === "append_part" &&
    appendRequestBody?.sourceDrawingNumberId === "dev053-real-master-drawing" &&
    appendRequestBody?.sourceLinkType === "primary_manufacturing" && appendRequestBody?.drawings?.length === 0 &&
    appendRequestBody?.parts?.length === 1 && contextualWorkspace?.draft_mode === "append_part" &&
    contextualWorkspace?.source_root_id === "dev053-real-master-root" &&
    contextualWorkspace?.source_drawing_number_id === "dev053-real-master-drawing" &&
    contextualWorkspace?.source_link_type === "primary_manufacturing" &&
    contextualAfter.workspaces === contextualBefore.workspaces + 1 &&
    contextualAfter.roots === contextualBefore.roots && contextualAfter.parts === contextualBefore.parts &&
    contextualAfter.drawings === contextualBefore.drawings && contextualAfter.links === contextualBefore.links,
    { appendHeaders: { idempotencyKey: appendHeaders["idempotency-key"] ?? null }, appendRequestBody,
      contextualWorkspace, contextualBefore, contextualAfter, url: page.url() });
  await capture(page, "same-drawing-add-result-1440x900.png");

  await page.goto(`${baseUrl}/numbering/drawings?view=work`, { waitUntil: "networkidle" });
  const fixtureSearch = page.getByPlaceholder("圖號、品名、料號");

  await searchWorkbench(page, fixtureSearch, fixture.drawingCode);
  await page.getByRole("button", { name: fixture.drawingCode, exact: true }).waitFor({ state: "visible" });
  await page.getByRole("dialog").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "完成首版圖面", exact: true }).click();
  await page.locator('[data-candidate-editor="true"] input[type="file"]').waitFor({ state: "attached" });
  const candidate = database.prepare("SELECT id, revision, lifecycle_status FROM numbering_candidate_revision_drafts WHERE workspace_id = ?").get(fixture.workspaceId);
  record("DEV053-REAL-011 clicking the unified CTA creates one candidate revision and no formal master",
    candidate?.revision === "0.1" && candidate?.lifecycle_status === "draft" && formalFacts().drawings === 0,
    { candidate });

  const trustedExisting = seedExistingCandidateFile(candidate.id, existingFileFixtures.trusted);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator('[data-candidate-editor="true"]').waitFor({ state: "visible" });
  const verifyExistingButton = page.getByRole("button", { name: "驗證既有檔案（1）", exact: true });
  await verifyExistingButton.waitFor({ state: "visible" });
  const trustedBefore = database.prepare(`SELECT asset.id AS asset_id, asset.original_path, asset.storage_key,
      asset.file_name, asset.file_size, asset.content_hash, file.publication_evidence_id
    FROM numbering_candidate_revision_files file
    JOIN file_assets asset ON asset.id = file.source_file_asset_id
    WHERE file.id = ?`).get(trustedExisting.fileId);
  record("DEV053-REAL-011A legacy files show one no-reupload recovery action before submit",
    await page.getByText("先驗證已保存的檔案，不用重新上傳。", { exact: true }).count() === 1 &&
    await page.getByText("系統會逐檔核對內容完整性；原檔與編號都不會改變。", { exact: true }).count() === 1 &&
    await page.getByRole("dialog").getByRole("button", { name: "送交審核", exact: true }).count() === 0,
    { trustedBefore });

  const verificationPath = `/api/numbering/draft-workspaces/${encodeURIComponent(fixture.workspaceId)}` +
    `/candidate-revisions/${encodeURIComponent(candidate.id)}/files`;
  const verificationIdempotencyKey = `dev053:verify-existing:${trustedExisting.fileId}:${trustedExisting.expectedRowVersion}`;
  const verificationResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "PATCH" && new URL(response.url()).pathname === verificationPath,
  { timeout: 30000 });
  const [verificationResponse] = await Promise.all([verificationResponsePromise, verifyExistingButton.click()]);
  const verificationBody = await verificationResponse.json().catch(() => ({}));
  if (!verificationResponse.ok() || !verificationBody.workspace) {
    throw new Error(`DEV053_EXISTING_VERIFICATION_FAILED:${verificationResponse.status()}:${JSON.stringify(verificationBody)}`);
  }
  await page.getByText("主要受控檔已完成，可送審。", { exact: true }).waitFor({ state: "visible", timeout: 20000 });
  const trustedAfter = database.prepare(`SELECT asset.id AS asset_id, asset.original_path, asset.storage_key,
      asset.file_name, asset.file_size, asset.content_hash, file.publication_evidence_id,
      evidence.bucket, evidence.object_key, evidence.generation, evidence.finalized_at
    FROM numbering_candidate_revision_files file
    JOIN file_assets asset ON asset.id = file.source_file_asset_id
    LEFT JOIN numbering_publication_evidence evidence ON evidence.id = file.publication_evidence_id
    WHERE file.id = ?`).get(trustedExisting.fileId);
  const trustedCandidateAfter = database.prepare("SELECT row_version FROM numbering_candidate_revision_drafts WHERE id = ?").get(candidate.id);
  const verificationAudit = database.prepare(`SELECT action, detail_json FROM audit_logs
    WHERE action = 'pdm.numbering.verify_existing_candidate_revision_file'
      AND json_extract(detail_json, '$.candidateFileId') = ?`).get(trustedExisting.fileId);
  record("DEV053-REAL-011B target-only verification preserves the existing asset and unlocks submit",
    verificationBody.localDevelopmentEvidence === true &&
    trustedBefore.asset_id === trustedAfter.asset_id && trustedBefore.original_path === trustedAfter.original_path &&
    trustedBefore.storage_key === trustedAfter.storage_key && trustedBefore.file_name === trustedAfter.file_name &&
    trustedBefore.file_size === trustedAfter.file_size && trustedBefore.content_hash === trustedAfter.content_hash &&
    trustedAfter.content_hash === trustedExisting.actualHash && Boolean(trustedAfter.publication_evidence_id) &&
    trustedAfter.bucket === "local-development-validation" && trustedAfter.object_key === trustedExisting.storageKey &&
    String(trustedAfter.generation ?? "").startsWith("local-") && Boolean(trustedAfter.finalized_at) &&
    trustedCandidateAfter.row_version === trustedExisting.expectedRowVersion + 1 && Boolean(verificationAudit) &&
    await page.getByRole("dialog").getByRole("button", { name: "送交審核", exact: true }).count() === 1,
    { verificationBody, trustedBefore, trustedAfter, trustedCandidateAfter, verificationAudit });
  await capture(page, "candidate-ready-after-existing-file-verification-1440x900.png");

  const beforeReplay = {
    candidateVersion: database.prepare("SELECT row_version FROM numbering_candidate_revision_drafts WHERE id = ?").get(candidate.id).row_version,
    evidenceCount: database.prepare("SELECT count(*) AS count FROM numbering_publication_evidence WHERE object_key = ?").get(trustedExisting.storageKey).count,
    auditCount: database.prepare("SELECT count(*) AS count FROM audit_logs WHERE action = 'pdm.numbering.verify_existing_candidate_revision_file'").get().count,
    outboxCount: database.prepare("SELECT count(*) AS count FROM platform_outbox_events WHERE event_type = 'pdm.numbering.candidate_revision.existing_file_verified.v1'").get().count
  };
  const replayResponse = await page.request.patch(`${baseUrl}${verificationPath}`, {
    headers: { "content-type": "application/json", "Idempotency-Key": verificationIdempotencyKey },
    data: { fileId: trustedExisting.fileId, expectedRowVersion: trustedExisting.expectedRowVersion }
  });
  const replayBody = await replayResponse.json().catch(() => ({}));
  const afterReplay = {
    candidateVersion: database.prepare("SELECT row_version FROM numbering_candidate_revision_drafts WHERE id = ?").get(candidate.id).row_version,
    evidenceCount: database.prepare("SELECT count(*) AS count FROM numbering_publication_evidence WHERE object_key = ?").get(trustedExisting.storageKey).count,
    auditCount: database.prepare("SELECT count(*) AS count FROM audit_logs WHERE action = 'pdm.numbering.verify_existing_candidate_revision_file'").get().count,
    outboxCount: database.prepare("SELECT count(*) AS count FROM platform_outbox_events WHERE event_type = 'pdm.numbering.candidate_revision.existing_file_verified.v1'").get().count
  };
  record("DEV053-REAL-011C identical verification replay is receipt-backed and produces no duplicate write",
    replayResponse.ok() && replayBody.receipt?.idempotentReplay === true &&
    JSON.stringify(beforeReplay) === JSON.stringify(afterReplay),
    { status: replayResponse.status(), replayBody, beforeReplay, afterReplay });

  const trustedRemoveResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname.endsWith(`/${trustedExisting.fileId}/remove`),
  { timeout: 30000 });
  await Promise.all([
    trustedRemoveResponsePromise,
    page.getByRole("button", { name: `移除 ${trustedExisting.fileName}`, exact: true }).click()
  ]);
  await page.getByRole("button", { name: `移除 ${trustedExisting.fileName}`, exact: true }).waitFor({ state: "hidden" });

  const mismatchedExisting = seedExistingCandidateFile(candidate.id, existingFileFixtures.mismatched);
  await page.reload({ waitUntil: "networkidle" });
  const mismatchedVerifyButton = page.getByRole("button", { name: "驗證既有檔案（1）", exact: true });
  await mismatchedVerifyButton.waitFor({ state: "visible" });
  const mismatchVerificationPath = `/api/numbering/draft-workspaces/${encodeURIComponent(fixture.workspaceId)}` +
    `/candidate-revisions/${encodeURIComponent(candidate.id)}/files`;
  const mismatchBrowserErrorStart = browserErrors.length;
  const mismatchResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "PATCH" && new URL(response.url()).pathname === mismatchVerificationPath,
  { timeout: 30000 });
  const [mismatchResponse] = await Promise.all([mismatchResponsePromise, mismatchedVerifyButton.click()]);
  const mismatchBody = await mismatchResponse.json().catch(() => ({}));
  const mismatchAlert = page.getByRole("alert").filter({ hasText: "雜湊不一致" });
  await mismatchAlert.waitFor({ state: "visible", timeout: 20000 });
  await page.waitForTimeout(100);
  const mismatchConsoleCandidates = browserErrors.splice(mismatchBrowserErrorStart);
  const mismatchUnexpectedConsoleErrors = [];
  for (const error of mismatchConsoleCandidates) {
    let pathname = "";
    try { pathname = error.url ? new URL(error.url).pathname : ""; } catch {}
    const isExpected409 = error.actor === "operator" && error.type === "console" &&
      error.text.includes("status of 409") && (!pathname || pathname === mismatchVerificationPath);
    if (isExpected409) expectedBrowserErrors.push({ ...error, caseId: "DEV053-REAL-011D", expectedStatus: 409 });
    else mismatchUnexpectedConsoleErrors.push(error);
  }
  browserErrors.push(...mismatchUnexpectedConsoleErrors);
  const mismatchFile = database.prepare(`SELECT publication_evidence_id FROM numbering_candidate_revision_files WHERE id = ?`).get(mismatchedExisting.fileId);
  const mismatchCandidate = database.prepare("SELECT row_version FROM numbering_candidate_revision_drafts WHERE id = ?").get(candidate.id);
  record("DEV053-REAL-011D hash mismatch fails closed, leaves the file unchanged and explains recovery",
    mismatchResponse.status() === 409 && mismatchBody.error?.code === "candidate_file_verification_failed" &&
    mismatchFile.publication_evidence_id === null && mismatchCandidate.row_version === mismatchedExisting.expectedRowVersion &&
    (await mismatchAlert.innerText()).includes("請重新上傳正確原檔") &&
    mismatchUnexpectedConsoleErrors.length === 0 &&
    await page.getByRole("dialog").getByRole("button", { name: "送交審核", exact: true }).count() === 0,
    { status: mismatchResponse.status(), mismatchBody, mismatchFile, mismatchCandidate,
      expectedBrowserErrors: expectedBrowserErrors.filter((error) => error.caseId === "DEV053-REAL-011D"), mismatchUnexpectedConsoleErrors });
  await capture(page, "candidate-existing-file-hash-mismatch-1440x900.png");
  const mismatchRemoveResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname.endsWith(`/${mismatchedExisting.fileId}/remove`),
  { timeout: 30000 });
  await Promise.all([
    mismatchRemoveResponsePromise,
    page.getByRole("button", { name: `移除 ${mismatchedExisting.fileName}`, exact: true }).click()
  ]);
  await page.getByRole("button", { name: `移除 ${mismatchedExisting.fileName}`, exact: true }).waitFor({ state: "hidden" });

  await page.locator('[data-candidate-editor="true"] input[type="file"]').setInputFiles(fixturePdf);
  const uploadResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" &&
    response.url().endsWith(`/candidate-revisions/${encodeURIComponent(candidate.id)}/files`),
  { timeout: 30000 });
  const [uploadResponse] = await Promise.all([
    uploadResponsePromise,
    page.getByRole("button", { name: "上傳並完成驗證", exact: true }).click()
  ]);
  const uploadBody = await uploadResponse.json().catch(() => ({}));
  if (!uploadResponse.ok() || !uploadBody.workspace) {
    throw new Error(`DEV053_REAL_UPLOAD_FAILED:${uploadResponse.status()}:${JSON.stringify(uploadBody)}`);
  }
  await page.getByText("主要受控檔已完成，可送審。", { exact: true }).waitFor({ state: "visible", timeout: 20000 });
  const uploaded = database.prepare(`SELECT asset.file_name, asset.original_path, asset.content_hash, file.is_primary,
      file.publication_evidence_id, evidence.bucket, evidence.generation, evidence.finalized_at
    FROM numbering_candidate_revision_files file
    JOIN file_assets asset ON asset.id = file.source_file_asset_id
    LEFT JOIN numbering_publication_evidence evidence ON evidence.id = file.publication_evidence_id
    JOIN numbering_candidate_revision_drafts candidate ON candidate.id = file.candidate_revision_id
    WHERE candidate.workspace_id = ? AND file.removed_at IS NULL`).all(fixture.workspaceId);
  const uploadedPath = uploaded[0]?.original_path;
  const storedHash = uploadedPath && fs.existsSync(uploadedPath) ? sha(fs.readFileSync(uploadedPath)) : "";
  record("DEV053-REAL-012 normal local validation reads back storage and creates finalized primary evidence",
    uploadBody.localDevelopmentEvidence === true && uploaded.length === 1 && uploaded[0].file_name === fixture.fileName &&
    uploaded[0].is_primary === 1 && Boolean(uploaded[0].publication_evidence_id) && uploaded[0].bucket === "local-development-validation" &&
    String(uploaded[0].generation ?? "").startsWith("local-") && Boolean(uploaded[0].finalized_at) && storedHash === uploaded[0].content_hash,
    { localDevelopmentEvidence: uploadBody.localDevelopmentEvidence, uploaded, storedHash });
  await capture(page, "candidate-ready-after-real-upload-1440x900.png");

  await page.getByRole("dialog").getByRole("button", { name: "送交審核", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  await confirmation.waitFor({ state: "visible" });
  record("DEV053-REAL-013 submit confirmation explains automatic atomic formalization",
    (await confirmation.innerText()).includes("核准後由系統原子建立正式圖料號與受控研發首版"));
  await confirmation.getByRole("button", { name: "確認整包送審", exact: true }).click();
  await page.getByRole("dialog").getByRole("link", { name: "查看審核", exact: true }).waitFor({ state: "visible", timeout: 20000 });
  let request = requestForWorkspace();
  record("DEV053-REAL-014 real submit locks one review request",
    request?.request_status === "pending" && request?.apply_status === "pending", { request });
  await capture(page, "candidate-in-review-1440x900.png");

  const firstRequestId = request.id;
  await page.getByRole("dialog").getByRole("button", { name: "撤回審核", exact: true }).click();
  const withdrawConfirmation = page.getByRole("alertdialog", { name: "撤回整包審核" });
  await withdrawConfirmation.waitFor({ state: "visible" });
  await withdrawConfirmation.getByRole("button", { name: "確認撤回審核", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "送交審核", exact: true }).waitFor({ state: "visible", timeout: 20000 });
  const withdrawnRequest = database.prepare("SELECT id, request_status, apply_status FROM approval_platform_requests WHERE id = ?").get(firstRequestId);
  const unlockedReservations = database.prepare(`SELECT reservation_state, approval_request_id
    FROM number_candidate_reservations WHERE workspace_id = ? ORDER BY id`).all(fixture.workspaceId);
  const withdrawnCandidate = database.prepare(`SELECT lifecycle_status, approval_request_id, review_snapshot_hash
    FROM numbering_candidate_revision_drafts WHERE workspace_id = ?`).get(fixture.workspaceId);
  record("DEV053-REAL-015 owner can withdraw and unlock the same bundle for correction",
    withdrawnRequest?.request_status === "cancelled" && withdrawnRequest?.apply_status === "not_required" &&
    unlockedReservations.length === 3 && unlockedReservations.every((row) => row.reservation_state === "active" && row.approval_request_id === null) &&
    withdrawnCandidate?.lifecycle_status === "draft" && withdrawnCandidate?.approval_request_id === null && withdrawnCandidate?.review_snapshot_hash === null,
    { withdrawnRequest, unlockedReservations, withdrawnCandidate });
  await capture(page, "candidate-after-withdraw-1440x900.png");

  await page.getByRole("dialog").getByRole("button", { name: "送交審核", exact: true }).click();
  await confirmation.waitFor({ state: "visible" });
  await confirmation.getByRole("button", { name: "確認整包送審", exact: true }).click();
  await page.getByRole("dialog").getByRole("link", { name: "查看審核", exact: true }).waitFor({ state: "visible", timeout: 20000 });
  request = requestForWorkspace();
  record("DEV053-REAL-016 withdrawn bundle can be resubmitted as a new pending request",
    request?.id !== firstRequestId && request?.request_status === "pending" && request?.apply_status === "pending",
    { firstRequestId, request });

  await approverPage.goto(`${baseUrl}/approvals?requestId=${encodeURIComponent(request.id)}`, { waitUntil: "networkidle" });
  await approverPage.getByRole("region", { name: "審核決策" }).waitFor({ state: "visible" });
  await approverPage.getByPlaceholder("決策備註").fill("DEV-053 真實操作：圖料關係、首版與檔案證據均已確認");
  await capture(approverPage, "reviewer-before-approval-1440x900.png");
  await approverPage.getByRole("button", { name: "核准", exact: true }).click();
  await approverPage.locator(".approval-message.success").getByText("已核准", { exact: true }).waitFor({ state: "visible", timeout: 30000 });
  const finalized = formalFacts();
  record("DEV053-REAL-017 reviewer approval atomically formalizes one complete bundle",
    finalized.request?.request_status === "approved" && finalized.request?.apply_status === "applied" &&
    finalized.candidate?.lifecycle_status === "promoted" && finalized.promotedReservations === 3 &&
    finalized.roots === 1 && finalized.parts === 1 && finalized.drawings === 1 && finalized.links === 1 &&
    finalized.packages === 1 && finalized.packageFiles === 1 && finalized.formalAttachmentAssets === 1 && finalized.reviewCompanions === 1,
    finalized);
  await capture(approverPage, "approval-and-formalization-complete-1440x900.png");

  await page.goto(`${baseUrl}/numbering/drawings?view=all`, { waitUntil: "networkidle" });
  const finalSearch = page.getByPlaceholder("圖號、品名、料號");
  await searchWorkbench(page, finalSearch, fixture.drawingCode);
  await page.getByRole("button", { name: fixture.drawingCode, exact: true }).waitFor({ state: "visible" });
  record("DEV053-REAL-018 candidate row becomes one formal canonical row after approval",
    await page.locator(".drawing-workbench-table tbody tr").count() === 1 &&
    (await page.locator(".drawing-workbench-table tbody tr").innerText()).includes("研發受控") &&
    await page.getByRole("button", { name: "完成首版", exact: true }).count() === 0);
  await page.locator('[data-attachment-authority="controlled_summary"]').waitFor({ state: "visible" });
  await page.getByText("參考附件", { exact: true }).waitFor({ state: "visible" });
  const formalAttachmentResponse = await page.request.get(
    `${baseUrl}/api/numbering/drawings/${encodeURIComponent(fixture.drawingCode)}/attachments`
  );
  const formalAttachmentBody = await formalAttachmentResponse.json().catch(() => ({}));
  const finalizedFile = page.getByText(fixture.fileName, { exact: true }).first();
  const finalizedFileVisible = await finalizedFile.waitFor({ state: "visible", timeout: 20000 }).then(() => true).catch(() => false);
  const controlledPanel = page.locator('[data-attachment-authority="controlled_summary"]');
  const controlledUploadButtonCount = await controlledPanel.getByRole("button", { name: /上傳/u }).count();
  const controlledDeleteButtonCount = await controlledPanel.getByRole("button", { name: /刪除/u }).count();
  const effectiveStatuses = (formalAttachmentBody.attachments ?? []).map((attachment) => attachment.revisionPackageEffectiveStatus);
  const controlledLabelVisible = await page.getByText("研發受控", { exact: true }).count() > 0;
  const misleadingPendingTextVisible = await page.getByText("待處理附件", { exact: true }).count() > 0 ||
    await page.getByText("尚未納入送審", { exact: false }).count() > 0;
  record("DEV053-REAL-019 controlled revision files stay read-only and separate from reference attachments",
    formalAttachmentResponse.ok() && formalAttachmentBody.attachments?.length === 1 && finalizedFileVisible &&
    controlledUploadButtonCount === 0 && controlledDeleteButtonCount === 0 && effectiveStatuses.every((status) => status === "ReviewApproved") &&
    controlledLabelVisible && !misleadingPendingTextVisible,
    {
      apiStatus: formalAttachmentResponse.status(),
      apiFiles: (formalAttachmentBody.attachments ?? []).map((attachment) => attachment.fileName),
      effectiveStatuses,
      finalizedFileVisible,
      controlledUploadButtonCount,
      controlledDeleteButtonCount,
      controlledLabelVisible,
      misleadingPendingTextVisible
    });
  await capture(page, "formal-canonical-row-and-read-only-drawer-1440x900.png");
  await page.getByRole("button", { name: "關閉圖號明細", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });

  const aliasResults = [];
  for (const [kind, value] of [
    ["drawing", fixture.drawingCode],
    ["part", fixture.partCode],
    ["workspace", fixture.workspaceId],
    ["title", fixture.title]
  ]) {
    await page.goto(`${baseUrl}/numbering/drawings?view=all&query=${encodeURIComponent(value)}`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "圖號工作台", exact: true }).waitFor({ state: "visible" });
    const rows = page.locator(".drawing-workbench-table tbody tr");
    const rowCount = await rows.count();
    const canonicalVisible = rowCount === 1 && (await rows.first().innerText()).includes(fixture.drawingCode);
    aliasResults.push({ kind, value, rowCount, canonicalVisible });
  }
  record("DEV053-REAL-020 drawing, part, source workspace and title aliases resolve to one canonical row",
    aliasResults.every((result) => result.rowCount === 1 && result.canonicalVisible), { aliasResults });

  const deepLink = `drawing:${finalized.candidate.formal_drawing_number_id}`;
  await page.goto(`${baseUrl}/numbering/drawings?view=all&detail=${encodeURIComponent(deepLink)}`, { waitUntil: "networkidle" });
  const deepLinkDrawer = page.getByRole("dialog", { name: "圖號明細" });
  await deepLinkDrawer.waitFor({ state: "visible", timeout: 20000 });
  record("DEV053-REAL-021 canonical deep link reopens the formal detail safely",
    new URL(page.url()).searchParams.get("detail") === deepLink &&
    await deepLinkDrawer.getByRole("heading", { name: fixture.drawingCode, exact: true }).count() === 1,
    { url: page.url(), deepLink });
  await deepLinkDrawer.getByRole("button", { name: "關閉圖號明細", exact: true }).click();
  await deepLinkDrawer.waitFor({ state: "hidden" });

  const beforeReloads = businessHash();
  for (let attempt = 0; attempt < 3; attempt += 1) await page.reload({ waitUntil: "networkidle" });
  const afterReloads = businessHash();
  record("DEV053-REAL-022 repeated reload is idempotent after formalization",
    JSON.stringify(beforeReloads) === JSON.stringify(afterReloads), { beforeReloads, afterReloads });
  await collectVisibleErrors(page, "operator");
  await collectVisibleErrors(approverPage, "approver");
  record("DEV053-REAL-023 no console error, visible error or 5xx response",
    browserErrors.length === 0 && failedResponses.length === 0 && visibleErrors.length === 0,
    { browserErrors, expectedBrowserErrors, failedResponses, visibleErrors });
  await Promise.all([context.close(), approverContext.close()]);
}

try {
  await run();
} catch (error) {
  record("DEV053-REAL-RUNNER", false, {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    serverTail: app?.getOutput().slice(-8000) ?? ""
  });
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
  } else {
    cleanupStatus = "refused-unsafe-target";
  }
}

const failed = results.filter((result) => !result.passed);
const sourceManifest = sourceFiles.map((file) => {
  const content = fs.readFileSync(path.join(root, file));
  return { file, bytes: content.byteLength, sha256: sha(content) };
});
const sourceHash = sha(JSON.stringify(sourceManifest));
const summary = {
  runId,
  startedAt,
  finishedAt: new Date().toISOString(),
  result: failed.length === 0 && cleanupStatus === "removed" ? "passed" : "failed",
  scope: "isolated local SQLite + isolated Next.js + real Chromium UI",
  productionConnected: false,
  productionWrites: false,
  cleanupStatus,
  gitSha: (() => { try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); } catch { return "unavailable"; } })(),
  sourceHash,
  sourceManifest,
  passed: results.length - failed.length,
  failed: failed.length,
  results,
  screenshots,
  browserErrors,
  expectedBrowserErrors,
  failedResponses,
  visibleErrors,
  observedRequests
};
fs.writeFileSync(path.join(outputDir, "run-report.json"), JSON.stringify(summary, null, 2), "utf8");
fs.writeFileSync(path.join(outputDir, "run-manifest.json"), JSON.stringify({
  runId,
  startedAt,
  finishedAt: summary.finishedAt,
  scope: summary.scope,
  baseUrl,
  environment: {
    databaseProvider: "sqlite",
    storageProvider: "local_repository",
    authMode: "managed",
    isolatedDataDirectory: true,
    isolatedNextDistDirectory: true,
    productionConnected: false,
    productionWrites: false
  },
  featureFlags: {
    PDM_NUMBER_STATE_FLOW_V1: true,
    PDM_NUMBER_LIFECYCLE_V2: true,
    PDM_UNIFIED_DRAWING_WORKBENCH_V1: true
  },
  viewportEvidence: [[1440, 900], [1280, 720], [1024, 768], [390, 844]],
  gitSha: summary.gitSha,
  sourceHash,
  sourceManifest
}, null, 2), "utf8");
fs.writeFileSync(path.join(outputDir, "operation-events.json"), JSON.stringify({
  runId,
  cases: results.map(({ id, passed }) => ({ id, passed })),
  mutatingHttpEvents: observedRequests
}, null, 2), "utf8");
fs.writeFileSync(path.join(outputDir, "network-summary.json"), JSON.stringify({
  runId,
  mutatingHttpEvents: observedRequests,
  failedResponses
}, null, 2), "utf8");
fs.writeFileSync(path.join(outputDir, "console-summary.json"), JSON.stringify({ runId, errors: browserErrors, expectedErrors: expectedBrowserErrors }, null, 2), "utf8");
fs.writeFileSync(path.join(outputDir, "visible-error-summary.json"), JSON.stringify({ runId, errors: visibleErrors }, null, 2), "utf8");
fs.writeFileSync(path.join(outputDir, "cleanup.json"), JSON.stringify({
  runId,
  cleanupStatus,
  isolatedTargetsOnly: cleanupStatus === "removed",
  productionConnected: false,
  productionWrites: false
}, null, 2), "utf8");
fs.writeFileSync(path.join(outputDir, "case-results.md"), [
  "# DEV-053 AI real-operation case results",
  "",
  `Source hash: \`${sourceHash}\``,
  "",
  "| Case | Result |",
  "|---|---|",
  ...results.map((result) => `| ${result.id} | ${result.passed ? "PASS" : "FAIL"} |`),
  ""
].join("\n"), "utf8");
fs.writeFileSync(path.join(outputDir, "qc-verdict.md"), [
  "# DEV-053 AI real-operation verdict", "", `Result: **${summary.result.toUpperCase()}**`, "",
  `Checks: ${summary.passed} passed / ${summary.failed} failed`, `Cleanup: ${cleanupStatus}`,
  `Source hash: \`${sourceHash}\``, "Production connected: false", "Production writes: false", ""
].join("\n"), "utf8");
console.log(JSON.stringify({ ...summary, outputDir }, null, 2));
if (summary.result !== "passed") process.exit(1);
