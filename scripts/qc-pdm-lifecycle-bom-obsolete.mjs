#!/usr/bin/env node

import Database from "better-sqlite3";
import path from "node:path";

const root = process.cwd();
const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3000";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const dbPath = path.join(root, "data", "ai-pdm.sqlite");
const token = Date.now().toString().slice(-7);
const results = [];
const createdSubmissionIds = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function login(email) {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  record(`Login ${email}`, response.ok, `HTTP ${response.status}`);
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function requestJson(cookie, route, init = {}) {
  const response = await fetch(`${apiBaseUrl}${route}`, {
    ...init,
    headers: {
      cookie,
      ...(init.body instanceof FormData ? {} : { "content-type": "application/json" }),
      ...(init.headers ?? {})
    }
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function createSubmission(cookie, input) {
  const form = new FormData();
  form.set("drawing_number", input.drawingNumber);
  form.set("part_number", input.partNumber);
  form.set("part_name", input.partName);
  form.set("revision", "1");
  form.set("material", "QC-Material");
  form.set("surface_finish", "QC-Finish");
  form.set("document_type", input.documentType ?? "Part");
  form.set("change_description", "QC seed for BOM lifecycle obsolete");
  if (input.references) form.set("cad_references_json", JSON.stringify(input.references));
  form.append("files", new File([Buffer.from("bom lifecycle obsolete qc")], `${input.drawingNumber}.pdf`, { type: "application/pdf" }));

  const { response, body } = await requestJson(cookie, "/api/submissions", { method: "POST", body: form });
  record(`Create ${input.partNumber}`, response.status === 201, `HTTP ${response.status} ${JSON.stringify(body)}`);
  createdSubmissionIds.push(body.submissionId);
  return { submissionId: body.submissionId, revision: "1", ...input };
}

function markReleased(...submissionIds) {
  const db = new Database(dbPath);
  try {
    const now = new Date().toISOString();
    const update = db.prepare("UPDATE submissions SET status = 'Released', released_at = ?, updated_at = ? WHERE id = ?");
    for (const submissionId of submissionIds) update.run(now, now, submissionId);
  } finally {
    db.close();
  }
}

function cleanup() {
  if (!createdSubmissionIds.length) return;
  const db = new Database(dbPath);
  try {
    const placeholders = createdSubmissionIds.map(() => "?").join(",");
    const draftRows = db.prepare(`SELECT id FROM bom_drafts WHERE parent_submission_id IN (${placeholders})`).all(...createdSubmissionIds);
    const draftIds = draftRows.map((row) => row.id);
    const draftPlaceholders = draftIds.map(() => "?").join(",");
    if (draftPlaceholders) {
      db.prepare(`DELETE FROM bom_release_snapshots WHERE bom_draft_id IN (${draftPlaceholders})`).run(...draftIds);
      db.prepare(`DELETE FROM bom_review_requests WHERE bom_draft_id IN (${draftPlaceholders})`).run(...draftIds);
      db.prepare(`DELETE FROM bom_edit_events WHERE bom_draft_id IN (${draftPlaceholders})`).run(...draftIds);
      db.prepare(`DELETE FROM bom_lines_tree WHERE bom_draft_id IN (${draftPlaceholders})`).run(...draftIds);
      db.prepare(`DELETE FROM bom_drafts WHERE id IN (${draftPlaceholders})`).run(...draftIds);
    }
    db.prepare(`DELETE FROM bom_lines WHERE bom_header_id IN (SELECT id FROM bom_headers WHERE parent_submission_id IN (${placeholders}))`).run(
      ...createdSubmissionIds
    );
    db.prepare(`DELETE FROM bom_headers WHERE parent_submission_id IN (${placeholders})`).run(...createdSubmissionIds);
    db.prepare(`DELETE FROM file_references WHERE submission_id IN (${placeholders})`).run(...createdSubmissionIds);
    db.prepare(`DELETE FROM submission_files WHERE submission_id IN (${placeholders})`).run(...createdSubmissionIds);
  } finally {
    db.close();
  }
}

async function run() {
  const engineerCookie = await login("engineer@example.com");
  const managerCookie = await login("manager@example.com");

  const child = await createSubmission(engineerCookie, {
    drawingNumber: `BOMOBS-${token}-A`,
    partNumber: `P-BOMOBS-${token}-A`,
    partName: "QC BOM obsolete child",
    documentType: "Part"
  });
  markReleased(child.submissionId);

  const parent = await createSubmission(engineerCookie, {
    drawingNumber: `BOMOBS-${token}-ASM`,
    partNumber: `P-BOMOBS-${token}-ASM`,
    partName: "QC BOM obsolete assembly",
    documentType: "Assembly",
    references: [
      {
        sourceFilename: `BOMOBS-${token}-ASM.sldasm`,
        sourceFileRole: "sldasm",
        referencedFilename: `${child.drawingNumber}.sldprt`,
        referencedPartNumber: child.partNumber,
        referencedDrawingNumber: child.drawingNumber,
        referencedRevision: child.revision,
        referenceType: "assembly_component",
        quantity: 1,
        extractionMethod: "qc-pdm-lifecycle-bom-obsolete",
        confidence: "high"
      }
    ]
  });

  const draft = (await requestJson(engineerCookie, "/api/bom/drafts/from-assembly", {
    method: "POST",
    body: JSON.stringify({ submissionId: parent.submissionId, draftName: "QC BOM obsolete release", setActive: true })
  })).body.draft;
  record("Create BOM draft for obsolete flow", Boolean(draft?.id), JSON.stringify(draft));

  const releaseReview = (await requestJson(engineerCookie, `/api/bom/drafts/${draft.id}/submit-review`, {
    method: "POST",
    body: JSON.stringify({ changeReason: "QC release before obsolete" })
  })).body.review;
  record("Submit release review before obsolete", releaseReview?.lifecycle_action === "release", JSON.stringify(releaseReview));

  const releaseApproval = await requestJson(managerCookie, `/api/bom/reviews/${releaseReview.id}/approve`, {
    method: "POST",
    body: JSON.stringify({ decisionReason: "QC approve release before obsolete" })
  });
  record("Approve release before obsolete", releaseApproval.response.ok && Boolean(releaseApproval.body.result?.snapshotId), JSON.stringify(releaseApproval.body));

  const obsoleteRequest = await requestJson(engineerCookie, `/api/bom/drafts/${draft.id}/obsolete-request`, {
    method: "POST",
    body: JSON.stringify({ reason: "QC lifecycle obsolete request" })
  });
  record("Request BOM obsolete review", obsoleteRequest.response.status === 201, `HTTP ${obsoleteRequest.response.status} ${JSON.stringify(obsoleteRequest.body)}`);
  record("Obsolete review uses obsolete lifecycle action", obsoleteRequest.body.review?.lifecycle_action === "obsolete", JSON.stringify(obsoleteRequest.body.review));
  record("Obsolete request returns review-stage policy", obsoleteRequest.body.policy?.stageLabel === "審核中", JSON.stringify(obsoleteRequest.body.policy));

  const pending = await requestJson(managerCookie, "/api/bom/reviews/pending");
  record(
    "Pending BOM reviews include obsolete request",
    pending.body.reviews?.some((review) => review.id === obsoleteRequest.body.review.id && review.lifecycle_action === "obsolete"),
    `${pending.body.reviews?.length ?? 0} pending`
  );

  const obsoleteApproval = await requestJson(managerCookie, `/api/bom/reviews/${obsoleteRequest.body.review.id}/approve`, {
    method: "POST",
    body: JSON.stringify({ decisionReason: "QC approve lifecycle obsolete" })
  });
  record("Approve BOM obsolete review", obsoleteApproval.response.ok && obsoleteApproval.body.result?.snapshotId === null, JSON.stringify(obsoleteApproval.body));

  const db = new Database(dbPath);
  try {
    const draftRow = db.prepare("SELECT status, is_active FROM bom_drafts WHERE id = ?").get(draft.id);
    const snapshotRow = db.prepare("SELECT obsolete_at, obsolete_by FROM bom_release_snapshots WHERE bom_draft_id = ?").get(draft.id);
    const auditRow = db
      .prepare("SELECT action FROM audit_logs WHERE submission_id = ? AND action = 'lifecycle.obsolete.approved' ORDER BY created_at DESC LIMIT 1")
      .get(parent.submissionId);
    record("Approved BOM draft becomes Obsolete", draftRow?.status === "Obsolete" && draftRow?.is_active === 0, JSON.stringify(draftRow));
    record("Approved BOM release snapshot is marked obsolete", Boolean(snapshotRow?.obsolete_at && snapshotRow?.obsolete_by), JSON.stringify(snapshotRow));
    record("Approved BOM obsolete writes audit evidence", auditRow?.action === "lifecycle.obsolete.approved", JSON.stringify(auditRow));
  } finally {
    db.close();
  }
}

run()
  .then(() => {
    cleanup();
    console.log(
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          total: results.length,
          passed: results.filter((result) => result.passed).length,
          failed: results.filter((result) => !result.passed).length,
          results
        },
        null,
        2
      )
    );
  })
  .catch((error) => {
    try {
      cleanup();
    } catch (cleanupError) {
      results.push({ name: "Cleanup", passed: false, detail: cleanupError.message });
    }
    console.error(
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          total: results.length,
          passed: results.filter((result) => result.passed).length,
          failed: results.filter((result) => !result.passed).length || 1,
          results,
          error: error.message
        },
        null,
        2
      )
    );
    process.exit(1);
  });
