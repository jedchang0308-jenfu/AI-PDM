import path from "node:path";
import Database from "better-sqlite3";

const baseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3000";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const unique = Date.now().toString().slice(-8);
const results = [];
const createdSubmissionIds = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function login(email) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  record(`login ${email}`, response.ok, `HTTP ${response.status}`);
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function createSubmission(cookie, input) {
  const form = new FormData();
  form.set("drawing_number", input.drawingNumber);
  form.set("part_number", input.partNumber);
  form.set("part_name", input.partName);
  form.set("revision", input.revision);
  form.set("material", input.material);
  form.set("surface_finish", input.surfaceFinish);
  form.set("document_type", input.documentType ?? "Drawing");
  form.set("change_description", "QC seed for BOM workbench review release");
  form.set("cad_references_json", JSON.stringify(input.references ?? []));
  form.append("files", new File([Buffer.from("bom review placeholder")], input.fileName, { type: "application/octet-stream" }));
  const response = await fetch(`${baseUrl}/api/submissions`, { method: "POST", headers: { cookie }, body: form });
  const body = await response.json().catch(() => ({}));
  record(`${input.drawingNumber} created`, response.status === 201, `HTTP ${response.status}`);
  createdSubmissionIds.push(body.submissionId);
  return { submissionId: body.submissionId, ...input };
}

async function getJson(cookie, url, init = {}) {
  const response = await fetch(`${baseUrl}${url}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      cookie,
      ...(init.headers ?? {})
    }
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function getDb() {
  const root = process.cwd();
  const dataDir = process.env.PDM_DATA_DIR ? path.resolve(root, process.env.PDM_DATA_DIR) : path.join(root, "data");
  return new Database(path.join(dataDir, "ai-pdm.sqlite"));
}

function markReleased(submissionId) {
  const db = getDb();
  try {
    const now = new Date().toISOString();
    db.prepare("UPDATE submissions SET status = 'Released', released_at = ?, updated_at = ? WHERE id = ?").run(now, now, submissionId);
  } finally {
    db.close();
  }
}

function cleanup() {
  const db = getDb();
  try {
    const submissionPlaceholders = createdSubmissionIds.map(() => "?").join(",");
    if (submissionPlaceholders) {
      const draftRows = db
        .prepare(`SELECT id FROM bom_drafts WHERE parent_submission_id IN (${submissionPlaceholders})`)
        .all(...createdSubmissionIds);
      const draftIds = draftRows.map((row) => row.id);
      const draftPlaceholders = draftIds.map(() => "?").join(",");
      if (draftPlaceholders) {
        db.prepare(`DELETE FROM bom_release_snapshots WHERE bom_draft_id IN (${draftPlaceholders})`).run(...draftIds);
        db.prepare(`DELETE FROM bom_review_requests WHERE bom_draft_id IN (${draftPlaceholders})`).run(...draftIds);
        db.prepare(`DELETE FROM bom_edit_events WHERE bom_draft_id IN (${draftPlaceholders})`).run(...draftIds);
        db.prepare(`DELETE FROM bom_lines_tree WHERE bom_draft_id IN (${draftPlaceholders})`).run(...draftIds);
        db.prepare(`DELETE FROM bom_drafts WHERE id IN (${draftPlaceholders})`).run(...draftIds);
      }
      db.prepare(`DELETE FROM bom_lines WHERE bom_header_id IN (SELECT id FROM bom_headers WHERE parent_submission_id IN (${submissionPlaceholders}))`).run(
        ...createdSubmissionIds
      );
      db.prepare(`DELETE FROM bom_headers WHERE parent_submission_id IN (${submissionPlaceholders})`).run(...createdSubmissionIds);
      db.prepare(`DELETE FROM file_references WHERE submission_id IN (${submissionPlaceholders})`).run(...createdSubmissionIds);
      db.prepare(`DELETE FROM submission_files WHERE submission_id IN (${submissionPlaceholders})`).run(...createdSubmissionIds);
    }
  } finally {
    db.close();
  }
}

async function createParentFixture(engineerCookie, child) {
  const parentFileName = `BOMREL-PARENT-${unique}.sldasm`;
  return createSubmission(engineerCookie, {
    drawingNumber: `BOMREL-PARENT-${unique}`,
    partNumber: `P-BOMREL-PARENT-${unique}`,
    partName: "BOM Release Parent",
    revision: "A",
    material: "Assembly",
    surfaceFinish: "N/A",
    documentType: "Assembly",
    fileName: parentFileName,
    references: [
      {
        sourceFilename: parentFileName,
        sourceFileRole: "sldasm",
        referencedFilename: `${child.partNumber}.sldprt`,
        referencedPartNumber: child.partNumber,
        referencedDrawingNumber: child.drawingNumber,
        referencedRevision: "A",
        referenceType: "assembly_component",
        quantity: 1,
        extractionMethod: "qc_bom_review_release",
        confidence: "high"
      }
    ]
  });
}

async function createDraft(managerCookie, submissionId, name, setActive = true) {
  const result = await getJson(managerCookie, "/api/bom/drafts/from-assembly", {
    method: "POST",
    body: JSON.stringify({ submissionId, draftName: name, setActive })
  });
  record(`${name} draft created`, result.response.status === 201, `HTTP ${result.response.status}`);
  return result.body.draft;
}

async function run() {
  const engineerCookie = await login("engineer@example.com");
  const managerCookie = await login("manager@example.com");

  const child = await createSubmission(engineerCookie, {
    drawingNumber: `BOMREL-CHILD-${unique}`,
    partNumber: `P-BOMREL-CHILD-${unique}`,
    partName: "BOM Release Child",
    revision: "A",
    material: "SUS304",
    surfaceFinish: "Polished",
    fileName: `BOMREL-CHILD-${unique}.sldprt`
  });
  markReleased(child.submissionId);

  const parent = await createParentFixture(engineerCookie, child);
  const firstDraft = await createDraft(managerCookie, parent.submissionId, "Release Draft #1");

  const missingReason = await getJson(engineerCookie, `/api/bom/drafts/${firstDraft.id}/submit-review`, {
    method: "POST",
    body: JSON.stringify({ changeReason: "" })
  });
  record("BOM-REL-001 submit review requires reason", missingReason.response.status === 400 && missingReason.body.error === "BOM_REVIEW_CHANGE_REASON_REQUIRED");

  const submit = await getJson(engineerCookie, `/api/bom/drafts/${firstDraft.id}/submit-review`, {
    method: "POST",
    body: JSON.stringify({ changeReason: "Initial release" })
  });
  record("BOM-REL-002 engineer submits review", submit.response.status === 201 && submit.body.review?.status === "PendingReview", `HTTP ${submit.response.status}`);

  const engineerApprove = await getJson(engineerCookie, `/api/bom/reviews/${submit.body.review.id}/approve`, {
    method: "POST",
    body: JSON.stringify({ decisionReason: "Should not approve" })
  });
  record("BOM-REL-003 engineer cannot approve", engineerApprove.response.status === 403, `HTTP ${engineerApprove.response.status}`);

  const approve = await getJson(managerCookie, `/api/bom/reviews/${submit.body.review.id}/approve`, {
    method: "POST",
    body: JSON.stringify({ decisionReason: "Approved release" })
  });
  record("BOM-REL-004 manager approves review", approve.response.ok && approve.body.result?.review?.status === "Approved", `HTTP ${approve.response.status}`);
  record("BOM-REL-005 approved draft becomes Released", approve.body.result?.draft?.status === "Released", approve.body.result?.draft?.status ?? "");

  const secondDraft = await createDraft(managerCookie, parent.submissionId, "Release Draft #2");
  const secondSave = await getJson(managerCookie, `/api/bom/drafts/${secondDraft.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      reason: "Quantity update",
      lines: [{ id: "second-line", nodeType: "item", partNumber: child.partNumber, revision: "A", quantity: 2, sequenceNo: 1 }]
    })
  });
  record("BOM-REL-006 second draft tree saved", secondSave.response.ok, `HTTP ${secondSave.response.status}`);
  const secondSubmit = await getJson(engineerCookie, `/api/bom/drafts/${secondDraft.id}/submit-review`, {
    method: "POST",
    body: JSON.stringify({ changeReason: "Quantity update release" })
  });
  record("BOM-REL-007 second draft submitted", secondSubmit.response.status === 201, `HTTP ${secondSubmit.response.status}`);
  const secondApprove = await getJson(managerCookie, `/api/bom/reviews/${secondSubmit.body.review.id}/approve`, {
    method: "POST",
    body: JSON.stringify({ decisionReason: "Approve quantity update" })
  });
  record("BOM-REL-008 second release approved", secondApprove.response.ok && secondApprove.body.result?.draft?.status === "Released", `HTTP ${secondApprove.response.status}`);

  const db = getDb();
  try {
    const obsoleteCount = db
      .prepare("SELECT COUNT(*) AS count FROM bom_release_snapshots WHERE parent_submission_id = ? AND obsolete_at IS NOT NULL")
      .get(parent.submissionId);
    record("BOM-REL-009 prior snapshot becomes obsolete", Number(obsoleteCount?.count ?? 0) >= 1, String(obsoleteCount?.count ?? 0));
  } finally {
    db.close();
  }

  const rejectedDraft = await createDraft(managerCookie, parent.submissionId, "Rejected Draft #1");
  const rejectedSubmit = await getJson(engineerCookie, `/api/bom/drafts/${rejectedDraft.id}/submit-review`, {
    method: "POST",
    body: JSON.stringify({ changeReason: "Needs manager feedback" })
  });
  record("BOM-REL-010 rejected draft submitted", rejectedSubmit.response.status === 201, `HTTP ${rejectedSubmit.response.status}`);
  const reject = await getJson(managerCookie, `/api/bom/reviews/${rejectedSubmit.body.review.id}/reject`, {
    method: "POST",
    body: JSON.stringify({ decisionReason: "Fix structure" })
  });
  record("BOM-REL-011 manager rejects review", reject.response.ok && reject.body.result?.draft?.status === "Rejected", `HTTP ${reject.response.status}`);

  const blockedDraft = await createDraft(managerCookie, parent.submissionId, "Blocked Draft #1");
  const blockedSave = await getJson(managerCookie, `/api/bom/drafts/${blockedDraft.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      reason: "Missing child gate",
      lines: [{ id: "missing-child", nodeType: "item", partNumber: `P-BOMREL-MISSING-${unique}`, revision: "A", quantity: 1, sequenceNo: 1 }]
    })
  });
  record("BOM-REL-012 blocked draft saved", blockedSave.response.ok, `HTTP ${blockedSave.response.status}`);
  const blockedSubmit = await getJson(engineerCookie, `/api/bom/drafts/${blockedDraft.id}/submit-review`, {
    method: "POST",
    body: JSON.stringify({ changeReason: "Should be blocked by gate" })
  });
  record("BOM-REL-013 blocked draft submitted", blockedSubmit.response.status === 201, `HTTP ${blockedSubmit.response.status}`);
  const blockedApprove = await getJson(managerCookie, `/api/bom/reviews/${blockedSubmit.body.review.id}/approve`, {
    method: "POST",
    body: JSON.stringify({ decisionReason: "Try blocked approve" })
  });
  record(
    "BOM-REL-014 release gate blocks missing child",
    blockedApprove.response.status === 409 &&
      blockedApprove.body.error === "BOM_RELEASE_GATE_BLOCKED" &&
      blockedApprove.body.issues?.some((issue) => issue.code === "missing_child_item"),
    JSON.stringify(blockedApprove.body)
  );

  const auditDb = getDb();
  try {
    for (const action of ["BomWorkbenchReviewSubmitted", "BomWorkbenchReviewApproved", "BomWorkbenchReviewRejected"]) {
      const row = auditDb
        .prepare("SELECT action FROM audit_logs WHERE submission_id = ? AND action = ? ORDER BY created_at DESC LIMIT 1")
        .get(parent.submissionId, action);
      record(`BOM-REL audit ${action}`, row?.action === action, row?.action ?? "");
    }
  } finally {
    auditDb.close();
  }

  cleanup();
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), total: results.length, passed: results.length, failed: 0, results }, null, 2));
}

run().catch((error) => {
  try {
    cleanup();
  } catch (cleanupError) {
    results.push({ name: "cleanup", passed: false, detail: cleanupError.message });
  }
  const failed = results.filter((result) => !result.passed).length || 1;
  console.error(JSON.stringify({ checkedAt: new Date().toISOString(), total: results.length, passed: results.length - failed, failed, results, error: error.message }, null, 2));
  process.exit(1);
});
