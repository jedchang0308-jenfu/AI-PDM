import path from "node:path";
import Database from "better-sqlite3";

const baseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3000";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const unique = Date.now().toString().slice(-8);
const results = [];
const createdSubmissionIds = [];

function record(name, passed, detail = "") {
  const ok = Boolean(passed);
  results.push({ name, passed: ok, detail });
  if (!ok) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
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

async function requestJson(cookie, url, init = {}) {
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

async function requestRaw(cookie, url, init = {}) {
  const response = await fetch(`${baseUrl}${url}`, {
    ...init,
    headers: {
      cookie,
      ...(init.headers ?? {})
    }
  });
  const body = await response.text();
  return { response, body };
}

async function createSubmission(cookie, input) {
  const form = new FormData();
  form.set("drawing_number", input.drawingNumber);
  form.set("part_number", input.partNumber);
  form.set("part_name", input.partName);
  form.set("revision", input.revision);
  form.set("material", input.material ?? "SUS304");
  form.set("surface_finish", input.surfaceFinish ?? "N/A");
  form.set("document_type", input.documentType ?? "Drawing");
  form.set("change_description", "QC seed for BOM released-only permission");
  form.set("cad_references_json", JSON.stringify(input.references ?? []));
  form.append("files", new File([Buffer.from("bom released only placeholder")], input.fileName, { type: "application/octet-stream" }));

  const response = await fetch(`${baseUrl}/api/submissions`, { method: "POST", headers: { cookie }, body: form });
  const body = await response.json().catch(() => ({}));
  record(`${input.drawingNumber} created`, response.status === 201, `HTTP ${response.status} ${JSON.stringify(body)}`);
  createdSubmissionIds.push(body.submissionId);
  return { submissionId: body.submissionId, ...input };
}

function getDb() {
  const root = process.cwd();
  const dataDir = process.env.PDM_DATA_DIR ? path.resolve(root, process.env.PDM_DATA_DIR) : path.join(root, "data");
  return new Database(path.join(dataDir, "ai-pdm.sqlite"));
}

function markSubmissionReleased(submissionId) {
  const db = getDb();
  try {
    const now = new Date().toISOString();
    db.prepare(
      `
      UPDATE submissions
      SET status = 'Released',
          released_at = ?,
          updated_at = ?
      WHERE id = ?
    `
    ).run(now, now, submissionId);
  } finally {
    db.close();
  }
}

function cleanup() {
  const db = getDb();
  try {
    const submissionPlaceholders = createdSubmissionIds.map(() => "?").join(",");
    if (!submissionPlaceholders) return;

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
  } finally {
    db.close();
  }
}

async function assertForbidden(cookie, label, url, init = {}) {
  const result = await requestJson(cookie, url, init);
  record(label, result.response.status === 403, `HTTP ${result.response.status} ${JSON.stringify(result.body)}`);
}

async function assertReleasedOnlyRole(roleName, cookie, parent, draft, snapshotId) {
  await assertForbidden(cookie, `${roleName} cannot read pending submission detail`, `/api/submissions/${parent.submissionId}`);
  await assertForbidden(cookie, `${roleName} cannot read BOM workbench draft summary`, `/api/bom/workbench?submissionId=${encodeURIComponent(parent.submissionId)}`);
  await assertForbidden(cookie, `${roleName} cannot read BOM draft detail`, `/api/bom/drafts/${draft.id}`);
  await assertForbidden(cookie, `${roleName} cannot patch BOM draft`, `/api/bom/drafts/${draft.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      reason: `${roleName} should not patch`,
      lines: []
    })
  });
  await assertForbidden(cookie, `${roleName} cannot set active draft`, `/api/bom/drafts/${draft.id}/active`, { method: "POST" });
  await assertForbidden(cookie, `${roleName} cannot submit draft review`, `/api/bom/drafts/${draft.id}/submit-review`, {
    method: "POST",
    body: JSON.stringify({ changeReason: `${roleName} should not submit` })
  });
  await assertForbidden(cookie, `${roleName} cannot create draft from assembly`, "/api/bom/drafts/from-assembly", {
    method: "POST",
    body: JSON.stringify({ submissionId: parent.submissionId, draftName: `${roleName} blocked draft` })
  });

  const csv = await requestRaw(cookie, `/api/bom/releases/${snapshotId}/export?format=csv`);
  const disposition = csv.response.headers.get("content-disposition") ?? "";
  record(`${roleName} can export Released BOM CSV`, csv.response.status === 200, `HTTP ${csv.response.status}`);
  record(`${roleName} export uses fixed BOM filename`, disposition.includes(`BOM_${parent.partNumber}_Rev${parent.revision}_`), disposition);
  record(`${roleName} export contains released child`, csv.body.includes(parent.partNumber) && csv.body.includes("P-BOMPERM-CHILD"), csv.body.slice(0, 200));
}

async function run() {
  const engineerCookie = await login("engineer@example.com");
  const managerCookie = await login("manager@example.com");
  const manufacturingCookie = await login("manufacturing@example.com");
  const procurementCookie = await login("procurement@example.com");

  const child = await createSubmission(engineerCookie, {
    drawingNumber: `BOMPERM-CHILD-${unique}`,
    partNumber: `P-BOMPERM-CHILD-${unique}`,
    partName: "BOM Permission Child",
    revision: "A",
    fileName: `BOMPERM-CHILD-${unique}.sldprt`
  });
  markSubmissionReleased(child.submissionId);

  const parentFileName = `BOMPERM-PARENT-${unique}.sldasm`;
  const parent = await createSubmission(engineerCookie, {
    drawingNumber: `BOMPERM-PARENT-${unique}`,
    partNumber: `P-BOMPERM-PARENT-${unique}`,
    partName: "BOM Permission Parent",
    revision: "A",
    material: "Assembly",
    documentType: "Assembly",
    fileName: parentFileName,
    references: [
      {
        sourceFilename: parentFileName,
        sourceFileRole: "sldasm",
        referencedFilename: `${child.partNumber}.sldprt`,
        referencedPartNumber: child.partNumber,
        referencedDrawingNumber: child.drawingNumber,
        referencedRevision: child.revision,
        referenceType: "assembly_component",
        quantity: 2,
        extractionMethod: "qc_bom_released_only_permission",
        confidence: "high"
      }
    ]
  });

  const createDraft = await requestJson(managerCookie, "/api/bom/drafts/from-assembly", {
    method: "POST",
    body: JSON.stringify({ submissionId: parent.submissionId, draftName: "Released-only Permission Draft", setActive: true })
  });
  record("Manager can create BOM draft before release", createDraft.response.status === 201, `HTTP ${createDraft.response.status} ${JSON.stringify(createDraft.body)}`);
  const draft = createDraft.body.draft;

  const managerWorkbench = await requestJson(managerCookie, `/api/bom/workbench?submissionId=${encodeURIComponent(parent.submissionId)}`);
  record("Manager can read draft workbench", managerWorkbench.response.status === 200 && managerWorkbench.body.workbench?.active_draft?.id === draft.id);

  const managerDraft = await requestJson(managerCookie, `/api/bom/drafts/${draft.id}`);
  record("Manager can read draft detail", managerDraft.response.status === 200 && managerDraft.body.draft?.lines?.length === 1);

  const review = await requestJson(engineerCookie, `/api/bom/drafts/${draft.id}/submit-review`, {
    method: "POST",
    body: JSON.stringify({ changeReason: "Release BOM for manufacturing/procurement visibility" })
  });
  record("Engineer submits BOM draft review", review.response.status === 201, `HTTP ${review.response.status} ${JSON.stringify(review.body)}`);

  const approve = await requestJson(managerCookie, `/api/bom/reviews/${review.body.review.id}/approve`, {
    method: "POST",
    body: JSON.stringify({ decisionReason: "Approve released-only permission QC" })
  });
  const snapshotId = approve.body.result?.snapshotId;
  record("Manager approves and creates Released Snapshot", approve.response.status === 200 && typeof snapshotId === "string", `HTTP ${approve.response.status}`);

  await assertReleasedOnlyRole("Manufacturing", manufacturingCookie, parent, draft, snapshotId);
  await assertReleasedOnlyRole("Procurement", procurementCookie, parent, draft, snapshotId);

  cleanup();
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), total: results.length, passed: results.length, failed: 0, results }, null, 2));
}

run().catch((error) => {
  cleanup();
  console.error(error);
  console.error(JSON.stringify({ checkedAt: new Date().toISOString(), total: results.length, failed: 1, results }, null, 2));
  process.exit(1);
});
