#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";

const root = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev071-api-"));
const repositoryDir = path.join(tempDir, "repository");
const distDirRelative = `.tmp/next-qc-dev071-api-${crypto.randomUUID()}`;
const distDir = path.resolve(root, distDirRelative);
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const port = await getFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const unique = Date.now().toString().slice(-8);
const results = [];
const createdSubmissionIds = [];
const generatedConfigBackups = new Map(
  ["tsconfig.json", "next-env.d.ts"].map((file) => [file, fs.readFileSync(path.join(root, file))])
);
let childProcess;
const fixture = {
  parentPartId: `dev071-parent-part-${unique}`,
  parentItemId: `dev071-parent-item-${unique}`,
  parentPartNumber: `P-DEV071-PARENT-${unique}`,
  childPartId: `dev071-child-part-${unique}`,
  childItemId: `dev071-child-item-${unique}`,
  childSubmissionId: `dev071-child-submission-${unique}`,
  childPartNumber: `P-DEV071-CHILD-${unique}`
};

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function prepareFixture() {
  fs.copyFileSync(path.join(root, "data", "ai-pdm.sqlite"), path.join(tempDir, "ai-pdm.sqlite"));
  const db = new Database(path.join(tempDir, "ai-pdm.sqlite"));
  try {
    db.prepare(
      "UPDATE users SET password_hash = NULL, account_status = 'active', system_role_enabled = 1, session_invalid_before = NULL, account_lifecycle_version = 1 WHERE email IN ('engineer@example.com', 'manager@example.com', 'manufacturing@example.com')"
    ).run();
    const root = db.prepare("SELECT id FROM part_roots WHERE record_status NOT IN ('Obsolete') ORDER BY id LIMIT 1").get();
    if (!root?.id) throw new Error("DEV071_PART_ROOT_FIXTURE_MISSING");
    const maxSequence = Number(db.prepare("SELECT COALESCE(MAX(sequence_no), 0) AS value FROM part_numbers WHERE part_root_id = ?").get(root.id).value);
    const now = new Date().toISOString();
    const insertItem = db.prepare("INSERT INTO items (id, company_id, part_number, part_name, current_revision, created_at, updated_at) VALUES (?, 'company-jenfu', ?, ?, 'A', ?, ?)");
    insertItem.run(fixture.parentItemId, fixture.parentPartNumber, "DEV-071 parent", now, now);
    insertItem.run(fixture.childItemId, fixture.childPartNumber, "DEV-071 child", now, now);
    const insertPart = db.prepare(
      "INSERT INTO part_numbers (id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, record_status, created_by, created_at, updated_at) VALUES (?, 'company-jenfu', ?, ?, ?, ?, ?, 'manufactured', 'Released', 'user-engineer-demo', ?, ?)"
    );
    insertPart.run(fixture.parentPartId, root.id, fixture.parentPartNumber, maxSequence + 1, `Q71P${unique}`, "DEV-071 parent", now, now);
    insertPart.run(fixture.childPartId, root.id, fixture.childPartNumber, maxSequence + 2, `Q71C${unique}`, "DEV-071 child", now, now);
    db.prepare(
      "INSERT INTO submissions (id, company_id, item_id, drawing_number, revision, material, surface_finish, document_type, change_description, status, submitted_by, approval_required, released_at, created_at, updated_at) VALUES (?, 'company-jenfu', ?, ?, 'A', 'QC material', 'QC finish', 'Part', 'DEV-071 fixture', 'Released', 'user-engineer-demo', 1, ?, ?, ?)"
    ).run(fixture.childSubmissionId, fixture.childItemId, `DEV071-CHILD-${unique}`, now, now, now);
  } finally { db.close(); }
}

function startServer() {
  childProcess = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: {
      ...process.env,
      PDM_AUTH_MODE: "demo",
      PDM_DB_PROVIDER: "sqlite",
      PDM_DATA_DIR: tempDir,
      PDM_REPOSITORY_DIR: repositoryDir,
      PDM_RELEASE_MODE: "local_stub",
      PDM_LOCAL_FULL_FUNCTION_VALIDATION: "true",
      PDM_PUBLIC_BASE_URL: baseUrl,
      PDM_NEXT_DIST_DIR: distDirRelative,
      PDM_BOM_XMIND_EDITOR_V2_ENABLED: "true"
    },
    stdio: "ignore",
    windowsHide: true
  });
}

async function waitForServer() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/login`, { signal: AbortSignal.timeout(2_000) });
      if (response.status < 500) return;
    } catch {}
    await delay(500);
  }
  throw new Error("DEV071_API_SERVER_START_TIMEOUT");
}

async function stopServer() {
  if (childProcess && !childProcess.killed) {
    const exited = new Promise((resolve) => childProcess.once("exit", resolve));
    childProcess.kill();
    await Promise.race([exited, delay(5_000)]);
  }
  for (const [file, content] of generatedConfigBackups) fs.writeFileSync(path.join(root, file), content);
  if (distDir.startsWith(path.join(root, ".tmp") + path.sep)) fs.rmSync(distDir, { recursive: true, force: true });
  if (tempDir.startsWith(os.tmpdir() + path.sep)) fs.rmSync(tempDir, { recursive: true, force: true });
}

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function login(email) {
  const response = await fetch(`${baseUrl}/api/auth/login?account=${encodeURIComponent(email)}`, { redirect: "manual" });
  record(`login ${email}`, response.status === 303, `HTTP ${response.status}`);
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function json(cookie, url, init = {}) {
  const response = await fetch(`${baseUrl}${url}`, {
    ...init,
    headers: { "content-type": "application/json", cookie, ...(init.headers ?? {}) }
  });
  return { response, body: await response.json().catch(() => ({})) };
}

async function createSubmission(cookie, input) {
  const form = new FormData();
  form.set("drawing_number", input.drawingNumber);
  form.set("part_number", input.partNumber);
  form.set("part_name", input.partName);
  form.set("revision", "A");
  form.set("material", "QC material");
  form.set("surface_finish", "QC finish");
  form.set("document_type", input.documentType ?? "Part");
  form.set("change_description", "DEV-071 QC fixture");
  form.set("cad_references_json", JSON.stringify(input.references ?? []));
  form.append("files", new File([Buffer.from("DEV-071")], `${input.drawingNumber}.pdf`, { type: "application/pdf" }));
  const response = await fetch(`${baseUrl}/api/submissions`, { method: "POST", headers: { cookie }, body: form });
  const body = await response.json().catch(() => ({}));
  record(`create ${input.partNumber}`, response.status === 201, `HTTP ${response.status} ${JSON.stringify(body)}`);
  createdSubmissionIds.push(body.submissionId);
  return { ...input, submissionId: body.submissionId };
}

function database() {
  return new Database(path.join(tempDir, "ai-pdm.sqlite"));
}

function releaseSubmission(submissionId) {
  const db = database();
  try {
    const now = new Date().toISOString();
    db.prepare("UPDATE submissions SET status = 'Released', released_at = ?, updated_at = ? WHERE id = ?").run(now, now, submissionId);
  } finally { db.close(); }
}

function cleanup() {
  const db = database();
  try {
    for (const submissionId of createdSubmissionIds) {
      const draftIds = db.prepare("SELECT id FROM bom_drafts WHERE parent_submission_id = ? OR source_submission_id = ?").all(submissionId, submissionId).map((row) => row.id);
      for (const draftId of draftIds) {
        db.prepare("DELETE FROM bom_release_snapshots WHERE bom_draft_id = ?").run(draftId);
        db.prepare("DELETE FROM bom_review_requests WHERE bom_draft_id = ?").run(draftId);
        db.prepare("DELETE FROM bom_edit_events WHERE bom_draft_id = ?").run(draftId);
        db.prepare("DELETE FROM bom_draft_floating_topics WHERE bom_draft_id = ?").run(draftId);
        db.prepare("DELETE FROM bom_lines_tree WHERE bom_draft_id = ?").run(draftId);
        db.prepare("DELETE FROM bom_drafts WHERE id = ?").run(draftId);
      }
      db.prepare("DELETE FROM file_references WHERE submission_id = ?").run(submissionId);
      db.prepare("DELETE FROM submission_files WHERE submission_id = ?").run(submissionId);
    }
  } finally { db.close(); }
}

async function run() {
  prepareFixture();
  startServer();
  await waitForServer();
  const engineer = await login("engineer@example.com");
  const manager = await login("manager@example.com");
  const manufacturing = await login("manufacturing@example.com");

  const created = await json(engineer, "/api/bom/drafts", {
    method: "POST",
    headers: { "idempotency-key": `dev071-${crypto.randomUUID()}` },
    body: JSON.stringify({ ownerPartNumberId: fixture.parentPartId, bomRevision: "1", source: "manual", draftName: "DEV-071 draft" })
  });
  record("XMB-API-001 draft created", created.response.status === 201, JSON.stringify(created.body));
  const draft = created.body.draft;
  const formalLines = [{ id: "formal-child-dev071", parentLineId: null, nodeType: "item", partNumber: fixture.childPartNumber, revision: null, quantity: 1, sequenceNo: 1 }];

  const loaded = await json(engineer, `/api/bom/drafts/${draft.id}`);
  record("XMB-API-002 editor capability is enabled", loaded.response.ok && loaded.body.editorCapability?.enabled === true, JSON.stringify(loaded.body.editorCapability));
  record("XMB-API-003 initial version and floating graph", loaded.body.draft?.editor_version === 0 && Array.isArray(loaded.body.draft?.floating_topics) && loaded.body.draft.floating_topics.length === 0);

  const floatingSave = await json(engineer, `/api/bom/drafts/${draft.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      expectedEditorVersion: 0,
      reason: "DEV-071 floating save",
      lines: formalLines,
      floatingTopics: [{ id: "floating-dev071", nodeType: "group", groupName: "Floating Topic", sequenceNo: 1, rootPositionX: 480, rootPositionY: 260 }]
    })
  });
  record("XMB-API-004 both graphs save atomically", floatingSave.response.ok && floatingSave.body.draft?.editor_version === 1 && floatingSave.body.draft?.floating_topics?.length === 1, JSON.stringify(floatingSave.body));

  const stale = await json(engineer, `/api/bom/drafts/${draft.id}`, {
    method: "PATCH",
    body: JSON.stringify({ expectedEditorVersion: 0, reason: "stale", lines: [], floatingTopics: [] })
  });
  record("XMB-API-005 stale editor version returns 409", stale.response.status === 409 && stale.body.error === "BOM_DRAFT_EDITOR_VERSION_CONFLICT", JSON.stringify(stale.body));
  const afterStale = await json(engineer, `/api/bom/drafts/${draft.id}`);
  record("XMB-API-006 stale write changes neither graph", afterStale.body.draft?.editor_version === 1 && afterStale.body.draft?.lines?.length === formalLines.length && afterStale.body.draft?.floating_topics?.length === 1);

  const blockedSubmit = await json(engineer, `/api/bom/drafts/${draft.id}/submit-review`, { method: "POST", body: JSON.stringify({ changeReason: "must block" }) });
  record("XMB-API-007 unresolved floating blocks review", blockedSubmit.response.status === 409 && blockedSubmit.body.error === "BOM_FLOATING_TOPICS_UNRESOLVED", JSON.stringify(blockedSubmit.body));

  const resolvedSave = await json(engineer, `/api/bom/drafts/${draft.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      expectedEditorVersion: 1,
      reason: "resolve floating",
      lines: formalLines,
      floatingTopics: []
    })
  });
  record("XMB-API-008 resolving floating increments version", resolvedSave.response.ok && resolvedSave.body.draft?.editor_version === 2 && resolvedSave.body.draft?.floating_topics?.length === 0);

  const denied = await json(manufacturing, `/api/bom/drafts/${draft.id}`);
  record("XMB-API-009 manufacturing cannot access draft editor", denied.response.status === 403, `HTTP ${denied.response.status}`);

  const submitted = await json(engineer, `/api/bom/drafts/${draft.id}/submit-review`, { method: "POST", body: JSON.stringify({ changeReason: "DEV-071 ready" }) });
  record("XMB-API-010 resolved draft submits", submitted.response.status === 201 && submitted.body.review?.status === "PendingReview", JSON.stringify(submitted.body));

  const immutable = await json(engineer, `/api/bom/drafts/${draft.id}`, { method: "PATCH", body: JSON.stringify({ expectedEditorVersion: 2, lines: [], floatingTopics: [] }) });
  record("XMB-API-011 pending review is not editable", immutable.response.status === 403, `HTTP ${immutable.response.status}`);

  const approved = await json(manager, `/api/bom/reviews/${submitted.body.review.id}/approve`, { method: "POST", body: JSON.stringify({ decisionReason: "DEV-071 QC" }) });
  record("XMB-API-012 resolved draft can release", approved.response.ok, `HTTP ${approved.response.status} ${JSON.stringify(approved.body)}`);

  const db = database();
  try {
    const event = db.prepare("SELECT before_json, after_json FROM bom_edit_events WHERE bom_draft_id = ? AND event_type = 'save_tree' ORDER BY created_at DESC LIMIT 1").get(draft.id);
    record("XMB-API-013 audit event records graph counts and version", Boolean(event?.before_json?.includes("floatingTopicCount") && event?.after_json?.includes("editorVersion")), JSON.stringify(event));
  } finally { db.close(); }

  cleanup();
  await stopServer();
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), total: results.length, passed: results.length, failed: 0, results }, null, 2));
}

run().catch(async (error) => {
  try { cleanup(); } catch (cleanupError) { results.push({ name: "cleanup", passed: false, detail: cleanupError.message }); }
  await stopServer();
  console.error(JSON.stringify({ checkedAt: new Date().toISOString(), total: results.length, passed: results.filter((result) => result.passed).length, failed: results.filter((result) => !result.passed).length || 1, results, error: error.message }, null, 2));
  process.exit(1);
});
