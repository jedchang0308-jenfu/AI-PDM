#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { chromium } from "playwright";
import { getFreePort, removeTaskOwnedWorkspaceTempDir, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = `DEV087-file-read-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-087-file-read-retirement", runId);
const screenshotDir = path.join(outputDir, "screenshots");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev087-file-read-"));
const fixtureDataDir = path.join(tempRoot, "data");
const fixtureDb = path.join(fixtureDataDir, "ai-pdm.sqlite");
const fixtureRepository = path.join(fixtureDataDir, "repository");
const checks = [];
const consoleErrors = [];
const requestFailures = [];
const oldRouteRequests = [];
const canonicalFileRequests = [];
const roundEvidence = [];
let app = null;
let browser = null;
let port = null;
let baseUrl = "";
let runtimeDistDir = null;

function check(name, condition, detail = "") {
  const pass = Boolean(condition);
  checks.push({ name, pass, detail });
  if (!pass) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function canonicalHref(fact) {
  const params = new URLSearchParams({
    context: fact.context,
    contextId: fact.contextId,
    bindingId: fact.bindingId
  });
  if (fact.reviewRequestId) params.set("reviewRequestId", fact.reviewRequestId);
  return `/api/pdm/file-assets/${encodeURIComponent(fact.fileAssetId)}?${params}`;
}

function requiredFact(db, name, sql, parameters = {}) {
  const fact = db.prepare(sql).get(parameters);
  check(`${name} fixture exists`, Boolean(fact), JSON.stringify(fact ?? null));
  return fact;
}

function seedCanonicalContextFixtures(db) {
  const sourceAsset = requiredFact(db, "part attachment source", `
    SELECT asset.*
      FROM file_assets asset
     WHERE asset.deleted_at IS NULL
       AND asset.content_hash IS NOT NULL
     ORDER BY asset.created_at
     LIMIT 1`);
  const fixtureRootId = "qa-dev087-file-read-root";
  const fixtureOwner = db.prepare("SELECT id FROM users WHERE company_id = 'company-jenfu' ORDER BY id LIMIT 1").get()?.id ?? "user-admin-local-quick";
  db.prepare(`
    INSERT OR IGNORE INTO part_roots
      (id, company_id, root_code, core_name, item_kind, record_status, rule_version_id, created_by)
    VALUES (?, 'company-jenfu', 'QA-FILE-READ', 'QA file-read fixture', 'manufactured', 'Released', 'numbering-rule-v3-alpha-root', ?)`).run(fixtureRootId, fixtureOwner);
  let part = db.prepare(`
    SELECT id, part_root_id AS partRootId FROM part_numbers WHERE company_id = 'company-jenfu' ORDER BY id LIMIT 1`).get();
  if (!part) {
    const partId = "qa-dev087-file-read-part";
    db.prepare(`
      INSERT OR IGNORE INTO part_numbers
        (id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, record_status, rule_version_id, created_by)
      VALUES (?, 'company-jenfu', ?, 'QA-FILE-READ-P01', 1, 'P01', 'QA file-read fixture', 'manufactured', 'Released', 'numbering-rule-v3-alpha-root', ?)`).run(partId, fixtureRootId, fixtureOwner);
    part = db.prepare("SELECT id, part_root_id AS partRootId FROM part_numbers WHERE id = ?").get(partId);
  }
  check("part attachment target fixture exists", Boolean(part), JSON.stringify(part ?? null));
  const orphanPartAssets = db.prepare(`
    SELECT asset.linked_entity_id AS partId
      FROM file_assets asset
      LEFT JOIN part_numbers target ON target.id = asset.linked_entity_id
     WHERE asset.deleted_at IS NULL AND asset.linked_entity_type = 'part_number' AND target.id IS NULL
     GROUP BY asset.linked_entity_id`).all();
  orphanPartAssets.forEach((row, index) => {
    db.prepare(`
      INSERT OR IGNORE INTO part_numbers
        (id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, record_status, rule_version_id, created_by)
      VALUES (?, 'company-jenfu', ?, ?, ?, ?, 'QA orphan attachment fixture', 'manufactured', 'Released', 'numbering-rule-v3-alpha-root', ?)`).run(row.partId, fixtureRootId, `QA-FILE-READ-P${index + 2}`, index + 2, `P${String(index + 2).padStart(2, "0")}`, fixtureOwner);
  });
  const owner = db.prepare("SELECT id FROM users WHERE company_id = 'company-jenfu' ORDER BY id LIMIT 1").get()?.id ?? "user-admin-local-quick";
  const fixtureDrawingId = "qa-dev087-file-read-drawing";
  const fixtureDrawingSequence = Number(db.prepare("SELECT COALESCE(MAX(sequence_no), 0) + 1 AS next FROM drawing_numbers WHERE part_root_id = ? AND purpose_code = 'M'").get(part.partRootId ?? fixtureRootId).next);
  db.prepare(`
    INSERT OR IGNORE INTO drawing_numbers
      (id, company_id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no, is_primary_manufacturing, record_status, rule_version_id, created_by)
    VALUES (?, 'company-jenfu', ?, 'QA-FILE-READ-DRAWING', 'M', 'QA file-read fixture', ?, 1, 'Released', 'numbering-rule-v3-alpha-root', ?)`).run(fixtureDrawingId, part.partRootId ?? fixtureRootId, fixtureDrawingSequence, owner);
  const actualFixtureDrawing = db.prepare("SELECT id FROM drawing_numbers WHERE drawing_number = 'QA-FILE-READ-DRAWING' LIMIT 1").get();
  check("drawing attachment target fixture exists", Boolean(actualFixtureDrawing), JSON.stringify(actualFixtureDrawing ?? null));
  const actualFixtureDrawingId = actualFixtureDrawing.id;
  db.prepare(`
    INSERT INTO file_assets (
      id, storage_provider, original_path, storage_bucket, storage_key,
      storage_generation, storage_metageneration, file_name, file_ext, mime_type,
      file_size, content_hash, hash_algorithm, linked_entity_type, linked_entity_id,
      document_category, display_name, description, revision, uploaded_by,
      deleted_at, deleted_by, deleted_reason, gdrive_file_id, gdrive_status,
      gdrive_error, gdrive_synced_at, sync_status, created_at, updated_at
    )
    SELECT 'qa-dev087-part-asset', storage_provider, original_path, storage_bucket, storage_key,
           storage_generation, storage_metageneration, file_name, file_ext, mime_type,
           file_size, content_hash, hash_algorithm, 'part_number', :partId,
           document_category, display_name, description, revision, uploaded_by,
           NULL, NULL, NULL, gdrive_file_id, gdrive_status,
           gdrive_error, gdrive_synced_at, sync_status, datetime('now'), datetime('now')
      FROM file_assets WHERE id = :sourceAssetId`).run({ partId: part.id, sourceAssetId: sourceAsset.id });
  db.prepare(`
    INSERT OR IGNORE INTO file_assets (
      id, storage_provider, original_path, storage_bucket, storage_key,
      storage_generation, storage_metageneration, file_name, file_ext, mime_type,
      file_size, content_hash, hash_algorithm, linked_entity_type, linked_entity_id,
      document_category, display_name, description, revision, uploaded_by,
      deleted_at, deleted_by, deleted_reason, gdrive_file_id, gdrive_status,
      gdrive_error, gdrive_synced_at, sync_status, created_at, updated_at
    )
    SELECT 'qa-dev087-drawing-asset', storage_provider, original_path, storage_bucket, storage_key,
           storage_generation, storage_metageneration, file_name, file_ext, mime_type,
           file_size, content_hash, hash_algorithm, 'drawing_number', :drawingId,
           document_category, display_name, description, revision, uploaded_by,
           NULL, NULL, NULL, gdrive_file_id, gdrive_status,
           gdrive_error, gdrive_synced_at, sync_status, datetime('now'), datetime('now')
      FROM file_assets WHERE id = :sourceAssetId`).run({ drawingId: actualFixtureDrawingId, sourceAssetId: sourceAsset.id });

  const workBinding = requiredFact(db, "drawing work binding", `
    SELECT state.work_id AS workId, file.id AS fileBindingId, file.source_file_asset_id AS fileAssetId,
           file.sort_order AS ordinal, asset.content_hash AS contentHash,
           state.branch_id AS branchId, state.canonical_entity_id AS drawingId
      FROM canonical_workbench_states state
      JOIN drawing_revision_files file ON file.drawing_revision_id = state.revision_id AND file.removed_at IS NULL
      JOIN file_assets asset ON asset.id = file.source_file_asset_id AND asset.deleted_at IS NULL
     WHERE state.entity_type = 'drawing' AND state.work_id IS NOT NULL
     ORDER BY CASE WHEN asset.file_ext IN ('sldprt','sldasm') THEN 0 ELSE 1 END, file.sort_order
     LIMIT 1`);
  db.prepare(`
    INSERT OR IGNORE INTO drawing_revision_work_files (work_id, file_binding_id, ordinal, content_hash)
    VALUES (:workId, :fileBindingId, :ordinal, :contentHash)`).run(workBinding);
  const packageId = "qa-dev087-file-read-package";
  db.prepare(`
    INSERT INTO drawing_revision_packages
      (id, company_id, drawing_number_id, drawing_number, revision, status, lifecycle_state, created_by, snapshot_json)
    VALUES (?, 'company-jenfu', ?, 'QA-FILE-READ-DRAWING', '1', 'Released', 'released', ?, '{}')`).run(packageId, actualFixtureDrawingId, owner);
  db.prepare(`
    INSERT OR IGNORE INTO drawing_revision_package_files
      (id, package_id, source_file_asset_id, role, role_source, display_name, sort_order, is_primary, created_by)
      VALUES ('qa-dev087-file-read-package-file', ?, ?, 'pdf', 'migration', 'QA file-read fixture', 0, 1, ?)`).run(packageId, sourceAsset.id, owner);
  db.prepare("DELETE FROM pdm_work_review_requests WHERE company_id = 'company-jenfu' AND work_id = ?").run(workBinding.workId);
  db.prepare(`
    INSERT INTO pdm_work_review_requests (
      id, company_id, request_kind, entity_type, canonical_entity_id, work_id,
      branch_id, reviewer_user_id, review_cycle_id, snapshot_payload, snapshot_hash,
      request_status, row_version, created_at, updated_at
    ) VALUES (
      'qa-dev087-review-request', 'company-jenfu', 'drawing_revision', 'drawing', :drawingId, :workId,
      :branchId, 'user-admin-local-quick', 'qa-dev087-cycle', '{}', :contentHash,
      'pending', 1, datetime('now'), datetime('now')
    )`).run(workBinding);
  db.prepare(`
    INSERT OR IGNORE INTO approval_platform_requests (
      id, company_id, package_id, action_code, domain_code, request_status,
      title, reason, requested_by, requested_at, apply_status, apply_attempts,
      payload_json, created_at, updated_at
    ) VALUES (
      'qa-dev087-cross-company-approval', 'company-maxima', NULL,
      'numbering.candidate_bundle_review', 'numbering', 'pending',
      'QA cross-company fixture', '隔離驗證', 'user-admin-local-quick', datetime('now'),
      'not_ready', 0, '{}', datetime('now'), datetime('now')
    )`).run();
  db.prepare(`
    INSERT OR IGNORE INTO approval_platform_requests (
      id, company_id, package_id, action_code, domain_code, request_status,
      title, reason, requested_by, requested_at, apply_status, apply_attempts,
      payload_json, created_at, updated_at
    ) VALUES (
      'qa-dev087-approval-evidence', 'company-jenfu', NULL,
      'numbering.candidate_bundle_review', 'numbering', 'pending',
      'QA approval evidence fixture', '隔離驗證', 'user-admin-local-quick', datetime('now'),
      'not_ready', 0, '{}', datetime('now'), datetime('now')
    )`).run();
  db.prepare(`
    INSERT OR IGNORE INTO approval_platform_targets
      (id, request_id, target_role, target_type, target_id, target_code, target_label, snapshot_json, sort_order)
    VALUES ('qa-dev087-cross-company-target', 'qa-dev087-cross-company-approval', 'primary', 'drawing_revision', ?, 'QA-FILE-READ', 'QA file-read fixture', ?, 0)
  `).run(sourceAsset.linked_entity_id, JSON.stringify({ files: [{ assetId: sourceAsset.id }] }));
  db.prepare(`
    INSERT OR IGNORE INTO approval_platform_impact_snapshots
      (id, request_id, package_id, snapshot_hash, snapshot_json, captured_by)
    VALUES ('qa-dev087-approval-evidence-impact', 'qa-dev087-approval-evidence', NULL, 'qa-dev087-file-read-snapshot', ?, ?)
  `).run(JSON.stringify({ candidateRevisions: [{ files: [{ assetId: sourceAsset.id }] }] }), owner);
  db.prepare(`
    INSERT OR IGNORE INTO approval_platform_targets
      (id, request_id, target_role, target_type, target_id, target_code, target_label, snapshot_json, sort_order)
    VALUES ('qa-dev087-approval-evidence-target', 'qa-dev087-approval-evidence', 'primary', 'drawing_revision', ?, 'QA-FILE-READ', 'QA file-read fixture', ?, 0)
  `).run(sourceAsset.linked_entity_id, JSON.stringify({ files: [{ assetId: sourceAsset.id }] }));
}

function loadFacts(db) {
  const derivativeJoin = `
    LEFT JOIN file_derivatives derivative
      ON derivative.source_file_asset_id = asset.id
     AND derivative.status = 'ready'
     AND derivative.source_content_hash = asset.content_hash`;
  const candidate = requiredFact(db, "candidate", `
    SELECT 'candidate_revision' AS context, revision.id AS contextId, file.id AS bindingId,
           asset.id AS fileAssetId, asset.file_name AS fileName, asset.mime_type AS mimeType,
           asset.content_hash AS contentHash,
           derivative.id AS derivativeId, derivative.mime_type AS derivativeMimeType,
           derivative.content_hash AS derivativeContentHash
      FROM drawings drawing
      JOIN drawing_revisions revision ON revision.drawing_id = drawing.id
      JOIN canonical_workbench_states state
        ON state.entity_type = 'drawing' AND state.revision_id = revision.id AND state.data_layer = 'drawing_rd'
      JOIN drawing_revision_files file ON file.drawing_revision_id = revision.id AND file.removed_at IS NULL
      JOIN file_assets asset ON asset.id = file.source_file_asset_id AND asset.deleted_at IS NULL
      ${derivativeJoin}
     WHERE drawing.drawing_number = 'A0002-M01'
     ORDER BY CASE WHEN derivative.id IS NULL THEN 1 ELSE 0 END, file.sort_order, file.id
     LIMIT 1`);
  const released = requiredFact(db, "released revision", `
    SELECT 'drawing_revision' AS context, revision.id AS contextId, file.id AS bindingId,
           asset.id AS fileAssetId, asset.file_name AS fileName, asset.mime_type AS mimeType,
           asset.content_hash AS contentHash, revision.revision, revision.lifecycle_state AS status,
           derivative.id AS derivativeId, derivative.mime_type AS derivativeMimeType,
           derivative.content_hash AS derivativeContentHash
      FROM drawing_revisions revision
      JOIN drawings drawing ON drawing.id = revision.drawing_id
      JOIN drawing_revision_files file ON file.drawing_revision_id = revision.id AND file.removed_at IS NULL
      JOIN file_assets asset ON asset.id = file.source_file_asset_id AND asset.deleted_at IS NULL
      ${derivativeJoin}
     WHERE drawing.drawing_number = 'A0002-M01'
     ORDER BY CASE WHEN derivative.id IS NULL THEN 1 ELSE 0 END, file.sort_order
     LIMIT 1`);
  const history = requiredFact(db, "history", `
    SELECT 'drawing_revision' AS context, revision.id AS contextId, file.id AS bindingId,
           asset.id AS fileAssetId, asset.file_name AS fileName, asset.mime_type AS mimeType,
           asset.content_hash AS contentHash, revision.revision, revision.lifecycle_state AS status,
           derivative.id AS derivativeId, derivative.mime_type AS derivativeMimeType,
           derivative.content_hash AS derivativeContentHash
      FROM drawing_revisions revision
      JOIN drawings drawing ON drawing.id = revision.drawing_id
      JOIN drawing_revision_files file ON file.drawing_revision_id = revision.id AND file.removed_at IS NULL
      JOIN file_assets asset ON asset.id = file.source_file_asset_id AND asset.deleted_at IS NULL
      ${derivativeJoin}
     WHERE drawing.drawing_number = 'A0002-M01'
     ORDER BY CASE WHEN derivative.id IS NULL THEN 1 ELSE 0 END, file.sort_order
     LIMIT 1`);
  const work = requiredFact(db, "work", `
    SELECT 'drawing_revision_work' AS context, work.id AS contextId, file.id AS bindingId,
           asset.id AS fileAssetId, asset.file_name AS fileName, asset.mime_type AS mimeType,
           asset.content_hash AS contentHash,
           derivative.id AS derivativeId, derivative.mime_type AS derivativeMimeType,
           derivative.content_hash AS derivativeContentHash
      FROM drawing_revision_work_files work_file
      JOIN drawing_revision_works work ON work.id = work_file.work_id
      JOIN drawing_revision_files file ON file.id = work_file.file_binding_id AND file.removed_at IS NULL
      JOIN file_assets asset ON asset.id = file.source_file_asset_id AND asset.deleted_at IS NULL
      ${derivativeJoin}
     WHERE work_file.work_id IS NOT NULL
     ORDER BY CASE WHEN derivative.id IS NULL THEN 1 ELSE 0 END, work_file.ordinal
     LIMIT 1`);
  const review = { ...work, reviewRequestId: "qa-dev087-review-request" };
  const revisionPackage = requiredFact(db, "revision package", `
    SELECT 'drawing_revision_package' AS context, package.id AS contextId, file.id AS bindingId,
           asset.id AS fileAssetId, asset.file_name AS fileName, asset.mime_type AS mimeType,
           asset.content_hash AS contentHash,
           derivative.id AS derivativeId, derivative.mime_type AS derivativeMimeType,
           derivative.content_hash AS derivativeContentHash
      FROM drawing_revision_packages package
      JOIN drawing_revision_package_files file ON file.package_id = package.id
      JOIN file_assets asset ON asset.id = file.source_file_asset_id AND asset.deleted_at IS NULL
      ${derivativeJoin}
     ORDER BY CASE WHEN package.status = 'Released' THEN 0 ELSE 1 END,
              CASE WHEN derivative.id IS NULL THEN 1 ELSE 0 END, package.created_at DESC, file.sort_order
     LIMIT 1`);
  const drawingAttachment = requiredFact(db, "drawing attachment", `
    SELECT 'drawing_attachment' AS context, asset.linked_entity_id AS contextId, asset.id AS bindingId,
           asset.id AS fileAssetId, asset.file_name AS fileName, asset.mime_type AS mimeType,
           asset.content_hash AS contentHash, NULL AS derivativeId,
           NULL AS derivativeMimeType, NULL AS derivativeContentHash
      FROM file_assets asset
      JOIN drawing_numbers drawing ON drawing.id = asset.linked_entity_id
     WHERE asset.linked_entity_type = 'drawing_number' AND asset.deleted_at IS NULL
     ORDER BY asset.created_at LIMIT 1`);
  const partAttachment = requiredFact(db, "part attachment", `
    SELECT 'part_attachment' AS context, asset.linked_entity_id AS contextId, asset.id AS bindingId,
           asset.id AS fileAssetId, asset.file_name AS fileName, asset.mime_type AS mimeType,
           asset.content_hash AS contentHash, NULL AS derivativeId,
           NULL AS derivativeMimeType, NULL AS derivativeContentHash
      FROM file_assets asset
      JOIN part_numbers part ON part.id = asset.linked_entity_id
     WHERE asset.id = 'qa-dev087-part-asset'`);
  const approvalEvidence = requiredFact(db, "approval evidence", `
    SELECT 'approval_evidence' AS context, request.id AS contextId, asset.id AS bindingId,
           asset.id AS fileAssetId, asset.file_name AS fileName, asset.mime_type AS mimeType,
           asset.content_hash AS contentHash, NULL AS derivativeId,
           NULL AS derivativeMimeType, NULL AS derivativeContentHash
      FROM approval_platform_requests request
      JOIN approval_platform_targets target ON target.request_id = request.id
      JOIN file_assets asset
        ON instr(target.snapshot_json, asset.id) > 0 AND asset.deleted_at IS NULL
     WHERE request.company_id = 'company-jenfu'
       AND request.action_code IN (
       'numbering.candidate_bundle_review',
       'numbering.drawing_revision_impact_review',
       'numbering.drawing_revision_lifecycle_review'
     )
     ORDER BY request.requested_at DESC LIMIT 1`);
  approvalEvidence.crossCompanyContextId = "qa-dev087-cross-company-approval";
  return { candidate, candidateReview: review, released, history, work, revisionPackage, drawingAttachment, partAttachment, approvalEvidence };
}

function relationReconciliation(db) {
  const revisionOrphans = db.prepare(`
    SELECT COUNT(*) AS count
      FROM drawing_revision_files binding
      LEFT JOIN drawing_revisions revision ON revision.id = binding.drawing_revision_id
      LEFT JOIN drawings drawing ON drawing.id = revision.drawing_id
      LEFT JOIN file_assets asset ON asset.id = binding.source_file_asset_id
     WHERE binding.removed_at IS NULL AND (
       revision.id IS NULL OR drawing.id IS NULL OR asset.id IS NULL OR asset.deleted_at IS NOT NULL)
  `).get().count;
  const packageOrphans = db.prepare(`
    SELECT COUNT(*) AS count
      FROM drawing_revision_package_files binding
      LEFT JOIN drawing_revision_packages package ON package.id = binding.package_id
      LEFT JOIN drawing_numbers drawing ON drawing.id = package.drawing_number_id
      LEFT JOIN file_assets asset ON asset.id = binding.source_file_asset_id
     WHERE package.id IS NULL OR drawing.id IS NULL OR asset.id IS NULL OR asset.deleted_at IS NOT NULL
  `).get().count;
  const workOrphans = db.prepare(`
    SELECT COUNT(*) AS count
      FROM drawing_revision_work_files work_file
      LEFT JOIN drawing_revision_works work ON work.id = work_file.work_id
      LEFT JOIN drawing_revision_files binding ON binding.id = work_file.file_binding_id
      LEFT JOIN file_assets asset ON asset.id = binding.source_file_asset_id
     WHERE work.id IS NULL OR binding.id IS NULL OR asset.id IS NULL OR asset.deleted_at IS NOT NULL
  `).get().count;
  const attachmentOrphanRows = db.prepare(`
    SELECT asset.id, asset.linked_entity_type AS linkedEntityType, asset.linked_entity_id AS linkedEntityId
      FROM file_assets asset
      LEFT JOIN drawing_numbers drawing
        ON asset.linked_entity_type = 'drawing_number' AND drawing.id = asset.linked_entity_id
      LEFT JOIN part_numbers part
        ON asset.linked_entity_type = 'part_number' AND part.id = asset.linked_entity_id
     WHERE asset.deleted_at IS NULL
       AND asset.linked_entity_type IN ('drawing_number','part_number')
       AND drawing.id IS NULL AND part.id IS NULL
  `).all();
  const attachmentOrphans = attachmentOrphanRows.length;
  return {
    revisionOrphans,
    packageOrphans,
    workOrphans,
    attachmentOrphans,
    attachmentOrphanRows,
    total: Number(revisionOrphans) + Number(packageOrphans) + Number(workOrphans) + Number(attachmentOrphans)
  };
}

function sourceCallerReconciliation() {
  const oldRouteFragment = "/api/numbering/draft-workspaces/";
  const candidateReadFragment = "/candidate-revisions/";
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (/\.(?:ts|tsx|js|jsx|mjs)$/u.test(entry.name)) files.push(target);
    }
  };
  visit(path.join(root, "src"));
  const callers = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/u);
    lines.forEach((line, index) => {
      if (line.includes(oldRouteFragment) && line.includes(candidateReadFragment) && line.includes("/files/") && !line.includes("/remove")) {
        callers.push({ file: path.relative(root, file).replaceAll("\\", "/"), line: index + 1, text: line.trim() });
      }
    });
  }
  const oldRouteFile = path.join(root, "src", "app", "api", "numbering", "draft-workspaces", "[id]", "candidate-revisions", "[revisionId]", "files", "[fileId]", "route.ts");
  return { callers, callerCount: callers.length, oldRouteExists: fs.existsSync(oldRouteFile) };
}

function monitor(page, round) {
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push({ round, text: message.text() });
  });
  page.on("pageerror", (error) => requestFailures.push({ round, kind: "pageerror", text: error.message }));
  page.on("request", (request) => {
    if (request.url().includes("/api/pdm/file-assets/")) canonicalFileRequests.push({ round, url: request.url() });
    if (request.url().includes("/api/numbering/draft-workspaces/") && request.url().includes("/candidate-revisions/") && /\/files\/[^/]+(?:\?|$)/u.test(request.url())) {
      oldRouteRequests.push({ round, url: request.url() });
    }
  });
  page.on("requestfailed", (request) => {
    if (request.failure()?.errorText !== "net::ERR_ABORTED") {
      requestFailures.push({ round, kind: "requestfailed", url: request.url(), text: request.failure()?.errorText });
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) requestFailures.push({ round, kind: "http", status: response.status(), url: response.url() });
  });
}

async function login(context, round) {
  const page = await context.newPage();
  monitor(page, round);
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("button", { name: "以系統管理員角色快速登入", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 30_000 });
  await page.close();
}

function cookieHeader(cookies) {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

async function requestBytes(href, cookies, headers = {}) {
  const response = await fetch(`${baseUrl}${href}`, {
    headers: { cookie: cookieHeader(cookies), ...headers }
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    length: bytes.length,
    hash: sha256(bytes)
  };
}

async function verifyContextMatrix(facts, cookies, round) {
  const evidence = {};
  for (const [label, fact] of Object.entries(facts)) {
    const href = canonicalHref(fact);
    const original = await requestBytes(href, cookies);
    check(`${round}/${label} original 200`, original.status === 200, JSON.stringify(original));
    check(`${round}/${label} original hash`, original.hash === fact.contentHash, `${original.hash} != ${fact.contentHash}`);
    const unauth = await fetch(`${baseUrl}${href}`);
    check(`${round}/${label} unauthenticated denied`, [401, 403].includes(unauth.status), String(unauth.status));
    const crossCompanyUrl = new URL(href, baseUrl);
    if (fact.crossCompanyContextId) crossCompanyUrl.searchParams.set("contextId", fact.crossCompanyContextId);
    const crossCompany = await requestBytes(
      `${crossCompanyUrl.pathname}${crossCompanyUrl.search}`,
      cookies,
      fact.crossCompanyContextId ? {} : { "x-pdm-company-code": "MAXIMA" }
    );
    check(`${round}/${label} cross-company denied`, crossCompany.status === 404, String(crossCompany.status));
    const wrongContext = new URL(href, baseUrl);
    wrongContext.searchParams.set("contextId", `wrong-${fact.contextId}`);
    const wrongContextResult = await requestBytes(`${wrongContext.pathname}${wrongContext.search}`, cookies);
    check(`${round}/${label} wrong context denied`, wrongContextResult.status === 404, String(wrongContextResult.status));
    const wrongBinding = new URL(href, baseUrl);
    wrongBinding.searchParams.set("bindingId", `wrong-${fact.bindingId}`);
    const wrongBindingResult = await requestBytes(`${wrongBinding.pathname}${wrongBinding.search}`, cookies);
    check(`${round}/${label} wrong binding denied`, wrongBindingResult.status === 404, String(wrongBindingResult.status));
    const wrongAssetHref = href.replace(encodeURIComponent(fact.fileAssetId), encodeURIComponent(`wrong-${fact.fileAssetId}`));
    const wrongAsset = await requestBytes(wrongAssetHref, cookies);
    check(`${round}/${label} wrong asset denied`, wrongAsset.status === 404, String(wrongAsset.status));
    if (fact.reviewRequestId) {
      const wrongReview = new URL(href, baseUrl);
      wrongReview.searchParams.set("reviewRequestId", "wrong-review-request");
      const wrongReviewResult = await requestBytes(`${wrongReview.pathname}${wrongReview.search}`, cookies);
      check(`${round}/${label} wrong review scope denied`, wrongReviewResult.status === 404, String(wrongReviewResult.status));
    }
    let derivative = null;
    if (fact.derivativeId) {
      derivative = await requestBytes(`${href}&previewDerivative=${encodeURIComponent(fact.derivativeId)}`, cookies);
      check(`${round}/${label} derivative 200`, derivative.status === 200, JSON.stringify(derivative));
      check(`${round}/${label} derivative hash`, derivative.hash === fact.derivativeContentHash, `${derivative.hash} != ${fact.derivativeContentHash}`);
      const wrongDerivative = await requestBytes(`${href}&previewDerivative=wrong-derivative`, cookies);
      check(`${round}/${label} wrong derivative never exposes bytes`, wrongDerivative.status !== 200, String(wrongDerivative.status));
    }
    evidence[label] = { href, original, derivative };
  }
  return evidence;
}

async function verifyUiSession(context, round) {
  const page = await context.newPage();
  monitor(page, round);
  await page.goto(`${baseUrl}/numbering/drawings?query=A0002-M01`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: "圖號工作台", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await page.locator(".canonical-list[aria-busy='false']").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator(".canonical-row-open").first().click();
  await page.getByRole("complementary", { name: /A0002-M01/u }).waitFor({ state: "visible", timeout: 30_000 });
  check(`${round}/UI renders two canonical preview cards`, await page.locator("[data-canonical-preview-section] .drawing-preview-card").count() === 2, String(await page.locator("[data-canonical-preview-section] .drawing-preview-card").count()));
  const detailKey = new URL(page.url()).searchParams.get("detail");
  const detailResponse = await page.evaluate(async (rowKey) => {
    const response = await fetch(`/api/numbering/drawings/workbench/${encodeURIComponent(rowKey ?? "")}`, { cache: "no-store" });
    return { status: response.status, body: await response.json() };
  }, detailKey);
  check(`${round}/UI detail API 200`, detailResponse.status === 200, String(detailResponse.status));
  const previews = detailResponse.body?.data?.presentation?.previews ?? [];
  const mediaUrls = previews.map((preview) => preview.mediaHref).filter(Boolean);
  check(`${round}/UI exposes two canonical preview slots`, previews.length === 2, JSON.stringify(previews));
  check(`${round}/UI media uses canonical route`, mediaUrls.every((url) => url.includes("/api/pdm/file-assets/")), JSON.stringify(mediaUrls));
  check(`${round}/UI has no retired candidate route`, mediaUrls.every((url) => !url.includes("/api/numbering/draft-workspaces/")), JSON.stringify(mediaUrls));
  const visibleErrors = (await page.locator("[role='alert']:visible").allTextContents()).map((text) => text.trim()).filter(Boolean);
  check(`${round}/UI has no visible error`, visibleErrors.length === 0, JSON.stringify(visibleErrors));
  await page.screenshot({ path: path.join(screenshotDir, `${round}-A0002-canonical-preview.png`), fullPage: true });
  await page.close();
  return mediaUrls;
}

try {
  fs.mkdirSync(fixtureDataDir, { recursive: true });
  fs.mkdirSync(screenshotDir, { recursive: true });
  fs.copyFileSync(path.join(root, "data", "ai-pdm.sqlite"), fixtureDb);
  fs.cpSync(path.join(root, "data", "repository"), fixtureRepository, { recursive: true, force: true });

  const fixture = new Database(fixtureDb);
  seedCanonicalContextFixtures(fixture);
  const facts = loadFacts(fixture);
  const reconciliation = relationReconciliation(fixture);
  fixture.close();
  const callers = sourceCallerReconciliation();
  check("retired candidate read route caller=0", callers.callerCount === 0, JSON.stringify(callers.callers));
  check("retired candidate read route file removed", callers.oldRouteExists === false, String(callers.oldRouteExists));
  check("candidate/released orphan relation=0", reconciliation.total === 0, JSON.stringify(reconciliation));

  port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  runtimeDistDir = path.join(root, ".tmp", `qc-dev087-file-read-${port}`);
  Object.assign(process.env, {
    NODE_ENV: "development",
    PDM_AUTH_MODE: "local",
    PDM_DB_PROVIDER: "sqlite",
    PDM_DATA_DIR: fixtureDataDir,
    PDM_REPOSITORY_DIR: fixtureRepository,
    PDM_BUILD_COMMIT: "local-dev",
    PDM_RELEASE_MODE: "local_stub",
    PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
    PDM_ENABLE_LOCAL_QUICK_LOGIN: "true",
    PDM_PRODUCTION_SLICE_MODE: "",
    PDM_POSTGRES_URL: "",
    DATABASE_URL: "",
    PDM_NEXT_DIST_DIR: path.relative(root, runtimeDistDir),
    PDM_PUBLIC_BASE_URL: baseUrl
  });
  console.log(`QC DEV-087 runtime: project=${root}; purpose=canonical file-read retirement gate; port=${port}; owner=current QC process tree; cleanup=after two fresh-session rounds`);
  app = startNextApp(root, "dev", port);
  await waitForNextAppReady(baseUrl, app.getOutput);
  browser = await chromium.launch({ headless: true });

  for (const round of ["fresh-session-1", "fresh-session-2"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await login(context, round);
    const cookies = await context.cookies(baseUrl);
    const api = await verifyContextMatrix(facts, cookies, round);
    const mediaUrls = await verifyUiSession(context, round);
    roundEvidence.push({ round, api, mediaUrls });
    await context.close();
  }

  check("two independent fresh-session rounds complete", roundEvidence.length === 2, String(roundEvidence.length));
  check("runtime old-route caller=0", oldRouteRequests.length === 0, JSON.stringify(oldRouteRequests));
  check("browser console errors=0", consoleErrors.length === 0, JSON.stringify(consoleErrors));
  check("browser request failures=0", requestFailures.length === 0, JSON.stringify(requestFailures));

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "reconciliation.json"), `${JSON.stringify({ callers, reconciliation, facts }, null, 2)}\n`, "utf8");
} catch (error) {
  checks.push({ name: "file-read retirement execution", pass: false, detail: error instanceof Error ? (error.stack ?? error.message) : String(error) });
} finally {
  try { await browser?.close(); } catch {}
  try { await stopNextApp(app?.child); } catch {}
  if (port) {
    const released = await fetch(`http://127.0.0.1:${port}`).then(() => false).catch(() => true);
    checks.push({ name: "temporary runtime port released", pass: released, detail: `port=${port}` });
  }
  const runtimeCleanup = runtimeDistDir
    ? removeTaskOwnedWorkspaceTempDir(root, runtimeDistDir)
    : { removed: false, path: null, error: "runtime-not-started" };
  checks.push({ name: "temporary runtime dist removed", pass: runtimeCleanup.removed, detail: JSON.stringify(runtimeCleanup) });
  try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch {}
}

const failed = checks.filter((item) => !item.pass);
const manifest = {
  devId: "DEV-087",
  qaCases: ["QA-087-169", "QA-087-170"],
  runId,
  status: failed.length === 0 ? "PASS" : "FAIL",
  outputDir,
  total: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks,
  consoleErrors,
  requestFailures,
  oldRouteRequests,
  canonicalFileRequests,
  roundEvidence
};
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest, null, 2));
if (failed.length) process.exitCode = 1;
