import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";
import { getFreePort, startNextApp, stopNextApp, waitForNextAppReady } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dsw-mutation-"));
const dataDir = path.join(tempRoot, "data");
const repositoryDir = path.join(dataDir, "repository");
const bootstrapPassword = "Drawing-Submission-QC-2026";
const bootstrapUsers = [
  {
    id: "user-dsw-owner",
    displayName: "DSW Owner Engineer",
    email: "dsw.owner@example.com",
    password: bootstrapPassword,
    role: "Engineer"
  },
  {
    id: "user-dsw-peer",
    displayName: "DSW Peer Engineer",
    email: "dsw.peer@example.com",
    password: bootstrapPassword,
    role: "Engineer"
  },
  {
    id: "user-dsw-manager",
    displayName: "DSW Manager",
    email: "dsw.manager@example.com",
    password: bootstrapPassword,
    role: "R&D Manager"
  },
  {
    id: "user-dsw-admin",
    displayName: "DSW Admin",
    email: "dsw.admin@example.com",
    password: bootstrapPassword,
    role: "Admin"
  }
];

const results = [];
let app;
let db;

function record(id, ok, message, details = undefined) {
  results.push({ id, ok, message, details });
}

function expect(id, condition, message, details = undefined) {
  record(id, Boolean(condition), message, details);
}

function must(id, condition, message, details = undefined) {
  expect(id, condition, message, details);
  if (!condition) throw new Error(`${id}: ${message}${details ? ` ${JSON.stringify(details)}` : ""}`);
}

function now(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function fixtureId(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 10)}`;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function makeFile(filename, content) {
  const relativePath = path.join("qc-fixtures", filename);
  const absolutePath = path.join(repositoryDir, relativePath);
  const bytes = Buffer.from(content, "utf8");
  ensureDir(path.dirname(absolutePath));
  fs.writeFileSync(absolutePath, bytes);
  return {
    localPath: absolutePath,
    sha256: sha256(bytes),
    size: bytes.byteLength
  };
}

function json(response) {
  return response.json().catch(() => ({}));
}

async function login(baseUrl, email) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: bootstrapPassword })
  });
  const body = await json(response);
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  return { response, body, cookie };
}

async function api(baseUrl, method, route, cookie, body = undefined) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      cookie,
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { response, body: await json(response) };
}

function openDb() {
  return new Database(path.join(dataDir, "ai-pdm.sqlite"));
}

function seedNumberingContext(input) {
  const time = now();
  db.prepare(
    `
    INSERT INTO part_roots (
      id, company_id, root_code, core_name, item_kind, record_status, rule_version_id, created_by, created_at, updated_at
    ) VALUES (?, 'company-jenfu', ?, ?, 'manufactured', 'Draft', 'numbering-rule-v1', ?, ?, ?)
    `
  ).run(input.rootId, input.rootCode, input.coreName, "user-dsw-owner", time, time);
  db.prepare(
    `
    INSERT INTO part_numbers (
      id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind,
      is_universal, bom_usage_policy, record_status, rule_version_id, created_by, created_at, updated_at
    ) VALUES (?, 'company-jenfu', ?, ?, 1, '001', ?, 'manufactured', 0, 'available', 'Draft', 'numbering-rule-v1', ?, ?, ?)
    `
  ).run(input.partId, input.rootId, input.partNumber, input.partName, "user-dsw-owner", time, time);
  db.prepare(
    `
    INSERT INTO part_variant_attributes (
      id, part_number_id, material_code, material_label, surface_treatment, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `
  ).run(input.variantId, input.partId, input.material, input.material, input.surfaceFinish, time, time);
  db.prepare(
    `
    INSERT INTO drawing_numbers (
      id, company_id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no,
      is_primary_manufacturing, record_status, rule_version_id, created_by, created_at, updated_at
    ) VALUES (?, 'company-jenfu', ?, ?, 'MA', 'MA 製造圖', 1, 1, 'Draft', 'numbering-rule-v1', ?, ?, ?)
    `
  ).run(input.drawingId, input.rootId, input.drawingNumber, "user-dsw-owner", time, time);
  db.prepare(
    `
    INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by, created_at)
    VALUES (?, ?, ?, 'primary_manufacturing', ?, ?)
    `
  ).run(input.linkId, input.drawingId, input.partId, "user-dsw-owner", time);
}

function seedDrawingAttachment(input) {
  const file = makeFile(`${input.drawingNumber}.SLDDRW`, `drawing attachment ${input.drawingNumber}`);
  const time = now();
  db.prepare(
    `
    INSERT INTO file_assets (
      id, storage_provider, original_path, storage_key, file_name, file_ext, mime_type, file_size, content_hash,
      linked_entity_type, linked_entity_id, document_category, display_name, revision, uploaded_by, created_at, updated_at
    ) VALUES (?, 'j_drive', ?, ?, ?, 'SLDDRW', 'application/octet-stream', ?, ?, 'drawing_number', ?, 'drawing', ?, ?, ?, ?, ?)
    `
  ).run(
    input.assetId,
    file.localPath,
    path.relative(repositoryDir, file.localPath).split(path.sep).join("/"),
    `${input.drawingNumber}.SLDDRW`,
    file.size,
    file.sha256,
    input.drawingId,
    `${input.drawingNumber}.SLDDRW`,
    input.revision,
    "user-dsw-owner",
    time,
    time
  );
}

function seedSubmission(input) {
  const time = input.createdAt ?? now();
  const itemId = input.itemId ?? fixtureId("item");
  const partNumber = input.partNumber ?? `P-${input.rootCode}-001`;
  const partName = input.partName ?? `${input.drawingNumber}_part`;
  db.prepare(
    `
    INSERT OR IGNORE INTO items (id, company_id, part_number, part_name, current_revision, created_at, updated_at)
    VALUES (?, 'company-jenfu', ?, ?, NULL, ?, ?)
    `
  ).run(itemId, partNumber, partName, time, time);
  db.prepare(
    `
    INSERT INTO submissions (
      id, company_id, item_id, drawing_number, revision, product_line, customer, project_code, process_name, machine,
      material, surface_finish, document_type, change_description, status, submitted_by, approval_required,
      release_error, corrects_submission_id, resolved_by_submission_id, resolved_at, source_entity_type, source_entity_id, created_at, updated_at
    ) VALUES (?, 'company-jenfu', ?, ?, ?, '', '', '', 'QC', '', ?, ?, 'MA 製造圖', ?, ?, ?, 1, ?, ?, ?, ?, 'drawing_number', ?, ?, ?)
    `
  ).run(
    input.submissionId,
    itemId,
    input.drawingNumber,
    input.revision,
    input.material ?? "SUS304",
    input.surfaceFinish ?? "無",
    input.changeDescription ?? "QC lifecycle fixture",
    input.status,
    input.submittedBy ?? "user-dsw-owner",
    input.releaseError ?? null,
    input.correctsSubmissionId ?? null,
    input.resolvedBySubmissionId ?? null,
    input.resolvedAt ?? null,
    input.drawingId ?? null,
    time,
    time
  );
  const file = makeFile(`${input.submissionId}.SLDDRW`, `submission file ${input.submissionId}`);
  db.prepare(
    `
    INSERT INTO submission_files (
      id, submission_id, file_role, original_filename, local_path, gdrive_file_id, gdrive_status, sha256, file_size, created_at
    ) VALUES (?, ?, 'slddrw', ?, ?, NULL, 'none', ?, ?, ?)
    `
  ).run(fixtureId("sfile"), input.submissionId, `${input.drawingNumber}.SLDDRW`, file.localPath, file.sha256, file.size, time);
  db.prepare(
    `
    INSERT INTO submission_snapshots (
      id, submission_id, company_id, source_root_id, source_root_code, source_drawing_number_id, source_drawing_number,
      source_part_number_id, source_part_number, snapshot_version, rules_version, snapshot_hash, snapshot_json, captured_by, captured_at, created_at
    ) VALUES (?, ?, 'company-jenfu', ?, ?, ?, ?, ?, ?, 'drawing_part_submission_v1', 'numbering-rule-v1', ?, ?, ?, ?, ?)
    `
  ).run(
    fixtureId("snap"),
    input.submissionId,
    input.rootId ?? `root-${input.rootCode}`,
    input.rootCode,
    input.drawingId ?? `drawing-${input.drawingNumber}`,
    input.drawingNumber,
    input.partId ?? `part-${input.rootCode}`,
    partNumber,
    sha256(Buffer.from(`${input.submissionId}:${input.drawingNumber}:${input.revision}`)),
    JSON.stringify({
      source: "qc-pdm-drawing-submission-workbench-mutation",
      submission: { id: input.submissionId, drawingNumber: input.drawingNumber, revision: input.revision }
    }),
    input.submittedBy ?? "user-dsw-owner",
    time,
    time
  );
}

function seedDrawingFixture(input) {
  const rootCode = input.rootCode;
  const context = {
    rootId: `root-${rootCode}`,
    rootCode,
    coreName: input.coreName ?? `QC ${rootCode}`,
    partId: `part-${rootCode}`,
    variantId: `variant-${rootCode}`,
    drawingId: `drawing-${rootCode}`,
    linkId: `link-${rootCode}`,
    partNumber: `P-${rootCode}-001`,
    partName: input.partName ?? `QC part ${rootCode}`,
    drawingNumber: input.drawingNumber,
    material: input.material ?? "SUS304",
    surfaceFinish: input.surfaceFinish ?? "無"
  };
  seedNumberingContext(context);
  seedDrawingAttachment({ ...context, assetId: `asset-${rootCode}`, revision: input.revision });
  return context;
}

function getSubmission(id) {
  return db.prepare("SELECT * FROM submissions WHERE id = ?").get(id);
}

function getWorkbenchFacts(drawingNumber, revision) {
  const rows = db
    .prepare(
      `
      SELECT id, status, corrects_submission_id, resolved_by_submission_id, resolved_at, cancelled_by, cancel_reason
      FROM submissions
      WHERE company_id = 'company-jenfu'
        AND drawing_number = ?
        AND revision = ?
      ORDER BY created_at ASC, id ASC
      `
    )
    .all(drawingNumber, revision);
  return rows;
}

async function run() {
  fs.mkdirSync(repositoryDir, { recursive: true });
  process.env.PDM_DB_PROVIDER = "sqlite";
  process.env.PDM_PRODUCTION_SLICE_MODE = "";
  process.env.PDM_AUTH_MODE = "managed";
  process.env.PDM_BOOTSTRAP_USERS = JSON.stringify(bootstrapUsers);
  process.env.PDM_DATA_DIR = dataDir;
  process.env.PDM_REPOSITORY_DIR = repositoryDir;
  process.env.PDM_RELEASE_MODE = "local_stub";
  process.env.RELEASE_FUNCTION_URL = "";
  process.env.GOOGLE_DRIVE_RELEASED_FOLDER_ID = "";
  process.env.PDM_DEMO_USERS = "0";

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  app = startNextApp(root, "start", port);
  await waitForNextAppReady(baseUrl, app.getOutput);

  const ownerLogin = await login(baseUrl, "dsw.owner@example.com");
  const peerLogin = await login(baseUrl, "dsw.peer@example.com");
  const managerLogin = await login(baseUrl, "dsw.manager@example.com");
  const adminLogin = await login(baseUrl, "dsw.admin@example.com");
  must("DSW-MUT-001", ownerLogin.response.status === 200, "owner engineer can login", ownerLogin.body);
  must("DSW-MUT-002", peerLogin.response.status === 200, "peer engineer can login", peerLogin.body);
  must("DSW-MUT-003", managerLogin.response.status === 200, "manager can login", managerLogin.body);
  must("DSW-MUT-004", adminLogin.response.status === 200, "admin can login", adminLogin.body);

  db = openDb();

  const cancelContext = seedDrawingFixture({ rootCode: "QC9201", drawingNumber: "D-QC9201-MA1", revision: "0.1" });
  const cancelSubmissionId = "SUB-QC-CANCEL-OK";
  seedSubmission({ ...cancelContext, submissionId: cancelSubmissionId, revision: "0.1", status: "Pending", createdAt: now(-50_000) });
  const cancelResult = await api(baseUrl, "POST", `/api/submissions/${cancelSubmissionId}/cancel`, ownerLogin.cookie, {
    reason: "QC 取消測試"
  });
  expect("DSW-MUT-005", cancelResult.response.status === 200, "submitter can cancel own Pending submission", cancelResult.body);
  const cancelled = getSubmission(cancelSubmissionId);
  expect("DSW-MUT-006", cancelled?.status === "Cancelled", "cancelled submission status is persisted", cancelled);
  expect("DSW-MUT-007", cancelled?.cancelled_by === "user-dsw-owner", "cancelled_by records actor", cancelled);
  const cancelWorkbench = await api(baseUrl, "GET", `/api/numbering/drawings/${encodeURIComponent(cancelContext.drawingNumber)}/submission-workbench`, managerLogin.cookie);
  expect("DSW-MUT-008", cancelWorkbench.response.status === 200, "workbench loads cancelled-history fixture", cancelWorkbench.body);
  expect(
    "DSW-MUT-009",
    Array.isArray(cancelWorkbench.body.blockers) && !cancelWorkbench.body.blockers.some((item) => item.code === "same_revision_in_progress"),
    "Cancelled no longer blocks same drawing revision",
    cancelWorkbench.body.blockers
  );
  expect(
    "DSW-MUT-010",
    Array.isArray(cancelWorkbench.body.nonBlockingHistory) &&
      cancelWorkbench.body.nonBlockingHistory.some((item) => String(item.message ?? "").includes("不影響本次送審")),
    "Cancelled appears as non-blocking history",
    cancelWorkbench.body.nonBlockingHistory
  );

  const deniedContext = seedDrawingFixture({ rootCode: "QC9202", drawingNumber: "D-QC9202-MA1", revision: "0.1" });
  const deniedSubmissionId = "SUB-QC-CANCEL-DENY";
  seedSubmission({ ...deniedContext, submissionId: deniedSubmissionId, revision: "0.1", status: "Pending", createdAt: now(-40_000) });
  const deniedResult = await api(baseUrl, "POST", `/api/submissions/${deniedSubmissionId}/cancel`, peerLogin.cookie, {
    reason: "QC 權限測試"
  });
  expect("DSW-MUT-011", deniedResult.response.status === 403, "non-owner Engineer cannot cancel another engineer's Pending submission", deniedResult.body);
  expect(
    "DSW-MUT-012",
    String(deniedResult.body?.message ?? "").includes("請由送審建立者、主管或 Admin 處理"),
    "cancel permission-denied message is human Chinese",
    deniedResult.body
  );
  expect("DSW-MUT-013", getSubmission(deniedSubmissionId)?.status === "Pending", "denied cancel leaves submission Pending", getSubmission(deniedSubmissionId));

  const retryContext = seedDrawingFixture({ rootCode: "QC9203", drawingNumber: "D-QC9203-MA1", revision: "0.1" });
  const retrySubmissionId = "SUB-QC-RETRY";
  seedSubmission({
    ...retryContext,
    submissionId: retrySubmissionId,
    revision: "0.1",
    status: "ReleaseFailed",
    releaseError: "QC old release error",
    createdAt: now(-30_000)
  });
  const retryResult = await api(baseUrl, "POST", `/api/submissions/${retrySubmissionId}/retry-release`, managerLogin.cookie);
  expect("DSW-MUT-014", retryResult.response.status === 200, "manager can retry unresolved ReleaseFailed", retryResult.body);
  const retried = getSubmission(retrySubmissionId);
  expect("DSW-MUT-015", retried?.status === "Released", "retry success keeps same submission and marks Released", retried);
  expect(
    "DSW-MUT-016",
    Number(db.prepare("SELECT COUNT(*) count FROM release_packages WHERE submission_id = ?").get(retrySubmissionId)?.count ?? 0) === 1,
    "retry success creates release package from real repository file"
  );

  const returnContext = seedDrawingFixture({ rootCode: "QC9204", drawingNumber: "D-QC9204-MA1", revision: "0.1" });
  const failedSubmissionId = "SUB-QC-RETURN-OLD";
  seedSubmission({
    ...returnContext,
    submissionId: failedSubmissionId,
    revision: "0.1",
    status: "ReleaseFailed",
    releaseError: "QC release incomplete",
    createdAt: now(-20_000)
  });
  const returnResult = await api(baseUrl, "POST", `/api/submissions/${failedSubmissionId}/return-for-correction`, managerLogin.cookie, {
    reason: "QC 退回修正"
  });
  expect("DSW-MUT-017", returnResult.response.status === 200, "manager can return ReleaseFailed for correction", returnResult.body);
  const newCorrectionId = returnResult.body?.submissionId;
  const oldAfterReturn = getSubmission(failedSubmissionId);
  const newCorrection = newCorrectionId ? getSubmission(newCorrectionId) : null;
  expect("DSW-MUT-018", oldAfterReturn?.status === "ReleaseFailed", "old ReleaseFailed remains historically failed after return-for-correction", oldAfterReturn);
  expect("DSW-MUT-019", Boolean(oldAfterReturn?.returned_for_correction_at), "old ReleaseFailed records returned-for-correction metadata", oldAfterReturn);
  expect("DSW-MUT-020", newCorrection?.status === "Pending", "return-for-correction creates linked Pending submission", newCorrection);
  expect("DSW-MUT-021", newCorrection?.corrects_submission_id === failedSubmissionId, "new Pending points to old failed submission", newCorrection);
  const duplicateReturn = await api(baseUrl, "POST", `/api/submissions/${failedSubmissionId}/return-for-correction`, managerLogin.cookie, {
    reason: "QC duplicate return"
  });
  expect("DSW-MUT-022", duplicateReturn.response.status === 409, "duplicate return-for-correction is blocked while linked Pending exists", duplicateReturn.body);

  db.prepare("UPDATE submissions SET status = 'ReleaseFailed', release_error = 'QC correction release retry', updated_at = ? WHERE id = ?").run(
    now(),
    newCorrectionId
  );
  const correctionRetry = await api(baseUrl, "POST", `/api/submissions/${newCorrectionId}/retry-release`, managerLogin.cookie);
  expect("DSW-MUT-023", correctionRetry.response.status === 200, "linked correction can release successfully", correctionRetry.body);
  const oldResolved = getSubmission(failedSubmissionId);
  const correctionReleased = getSubmission(newCorrectionId);
  expect("DSW-MUT-024", correctionReleased?.status === "Released", "linked correction is Released", correctionReleased);
  expect("DSW-MUT-025", oldResolved?.resolved_by_submission_id === newCorrectionId, "old ReleaseFailed is resolved by linked Released submission", oldResolved);
  expect("DSW-MUT-026", Boolean(oldResolved?.resolved_at), "old ReleaseFailed has resolved_at timestamp", oldResolved);

  const resolvedWorkbench = await api(
    baseUrl,
    "GET",
    `/api/numbering/drawings/${encodeURIComponent(returnContext.drawingNumber)}/submission-workbench`,
    managerLogin.cookie
  );
  expect("DSW-MUT-027", resolvedWorkbench.response.status === 200, "workbench loads resolved ReleaseFailed fixture", resolvedWorkbench.body);
  expect(
    "DSW-MUT-028",
    !resolvedWorkbench.body.blockers?.some?.((item) => item.code === "release_incomplete_conflict"),
    "resolved ReleaseFailed is no longer a release-incomplete blocker",
    resolvedWorkbench.body.blockers
  );
  expect(
    "DSW-MUT-029",
    resolvedWorkbench.body.nonBlockingHistory?.some?.((item) => String(item.message ?? "").includes("已由新版送審處理完成")),
    "resolved ReleaseFailed appears as low-weight non-blocking history",
    resolvedWorkbench.body.nonBlockingHistory
  );

  const dashboardResponse = await api(baseUrl, "GET", "/api/submissions?limit=200", managerLogin.cookie);
  const dashboardSubmissions = Array.isArray(dashboardResponse.body.submissions) ? dashboardResponse.body.submissions : [];
  const dashboardSubmissionIds = new Set(dashboardSubmissions.map((submission) => submission.id));
  expect("DSW-MUT-030", dashboardResponse.response.status === 200, "manager submissions dashboard source loads after resolved ReleaseFailed", dashboardResponse.body);
  expect(
    "DSW-MUT-031",
    !dashboardSubmissionIds.has(failedSubmissionId) && dashboardSubmissionIds.has(newCorrectionId),
    "resolved ReleaseFailed is excluded from actionable submissions while the released correction remains visible",
    dashboardSubmissions
  );

  const facts = getWorkbenchFacts(returnContext.drawingNumber, "0.1");
  expect("DSW-MUT-032", facts.some((row) => row.id === failedSubmissionId && row.status === "ReleaseFailed"), "old failed submission remains traceable", facts);
  expect("DSW-MUT-033", facts.some((row) => row.id === newCorrectionId && row.status === "Released"), "new released correction remains traceable", facts);
}

try {
  await run();
} catch (error) {
  record("DSW-MUT-999", false, error instanceof Error ? error.message : String(error));
} finally {
  if (db) db.close();
  if (app) await stopNextApp(app.child);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await delay(attempt === 0 ? 0 : 300);
      fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      break;
    } catch (error) {
      if (attempt === 5) {
        console.warn(`QC temp cleanup skipped: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.id}: ${result.message}`);
  if (!result.ok && result.details !== undefined) {
    console.log(JSON.stringify(result.details, null, 2));
  }
}

const failed = results.filter((result) => !result.ok);
if (failed.length > 0) {
  console.error(`PDM drawing submission workbench mutation QC failed: ${failed.length}/${results.length}`);
  process.exit(1);
}

console.log(`PDM drawing submission workbench mutation QC passed: ${results.length}/${results.length}`);
