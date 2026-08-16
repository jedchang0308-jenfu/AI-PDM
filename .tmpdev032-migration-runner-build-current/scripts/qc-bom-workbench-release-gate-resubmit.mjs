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
  form.set("material", input.material ?? "SUS304");
  form.set("surface_finish", input.surfaceFinish ?? "N/A");
  form.set("document_type", input.documentType ?? "Drawing");
  form.set("change_description", "QC seed for BOM release gate and resubmit");
  form.set("cad_references_json", JSON.stringify(input.references ?? []));
  form.append("files", new File([Buffer.from("bom release gate placeholder")], input.fileName, { type: "application/octet-stream" }));

  const response = await fetch(`${baseUrl}/api/submissions`, { method: "POST", headers: { cookie }, body: form });
  const body = await response.json().catch(() => ({}));
  record(`${input.drawingNumber} created`, response.status === 201, `HTTP ${response.status} ${JSON.stringify(body)}`);
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

function markSubmissionStatus(submissionId, status, offsetMs = 0) {
  const db = getDb();
  try {
    const at = new Date(Date.now() + offsetMs).toISOString();
    db.prepare(
      `
      UPDATE submissions
      SET status = ?,
          released_at = ?,
          rejected_at = ?,
          obsolete_at = ?,
          updated_at = ?
      WHERE id = ?
    `
    ).run(status, status === "Released" ? at : null, status === "Rejected" ? at : null, status === "Obsolete" ? at : null, at, submissionId);
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

async function createChild(engineerCookie, label, options = {}) {
  const revision = options.revision ?? "A";
  const partNumber = options.partNumber ?? `P-BOMGATE-${label}-${unique}`;
  const child = await createSubmission(engineerCookie, {
    drawingNumber: `BOMGATE-${label}-${revision}-${unique}`,
    partNumber,
    partName: `BOM Gate ${label} Child`,
    revision,
    fileName: `BOMGATE-${label}-${revision}-${unique}.sldprt`
  });
  if (options.status && options.status !== "Pending") {
    markSubmissionStatus(child.submissionId, options.status, options.offsetMs ?? 0);
  }
  return child;
}

async function createParent(engineerCookie, label, child) {
  const parentFileName = `BOMGATE-${label}-PARENT-${unique}.sldasm`;
  return createSubmission(engineerCookie, {
    drawingNumber: `BOMGATE-${label}-PARENT-${unique}`,
    partNumber: `P-BOMGATE-${label}-PARENT-${unique}`,
    partName: `BOM Gate ${label} Parent`,
    revision: "A",
    material: "Assembly",
    documentType: "Assembly",
    fileName: parentFileName,
    references: child
      ? [
          {
            sourceFilename: parentFileName,
            sourceFileRole: "sldasm",
            referencedFilename: `${child.partNumber}.sldprt`,
            referencedPartNumber: child.partNumber,
            referencedDrawingNumber: child.drawingNumber,
            referencedRevision: child.revision,
            referenceType: "assembly_component",
            quantity: 1,
            extractionMethod: "qc_bom_release_gate_resubmit",
            confidence: "high"
          }
        ]
      : []
  });
}

async function createDraft(managerCookie, submissionId, name, setActive = true) {
  const result = await getJson(managerCookie, "/api/bom/drafts/from-assembly", {
    method: "POST",
    body: JSON.stringify({ submissionId, draftName: name, setActive })
  });
  record(`${name} draft created`, result.response.status === 201, `HTTP ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body.draft;
}

async function saveSingleLine(cookie, draftId, label, line) {
  const result = await getJson(cookie, `/api/bom/drafts/${draftId}`, {
    method: "PATCH",
    body: JSON.stringify({
      reason: `${label} tree update`,
      lines: [
        {
          id: `${label}-line`,
          nodeType: "item",
          partNumber: line.partNumber,
          revision: line.revision ?? "A",
          quantity: line.quantity ?? 1,
          sequenceNo: 1
        }
      ]
    })
  });
  record(`${label} draft tree saved`, result.response.ok, `HTTP ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body.draft;
}

async function submitReview(cookie, draftId, reason, label) {
  const result = await getJson(cookie, `/api/bom/drafts/${draftId}/submit-review`, {
    method: "POST",
    body: JSON.stringify({ changeReason: reason })
  });
  record(`${label} review submitted`, result.response.status === 201, `HTTP ${result.response.status} ${JSON.stringify(result.body)}`);
  return result.body.review;
}

async function approveReview(cookie, reviewId, reason) {
  return getJson(cookie, `/api/bom/reviews/${reviewId}/approve`, {
    method: "POST",
    body: JSON.stringify({ decisionReason: reason })
  });
}

async function rejectReview(cookie, reviewId, reason) {
  return getJson(cookie, `/api/bom/reviews/${reviewId}/reject`, {
    method: "POST",
    body: JSON.stringify({ decisionReason: reason })
  });
}

async function assertReleaseGate(cookie, reviewId, expectation) {
  const result = await approveReview(cookie, reviewId, `Expect ${expectation.name} gate block`);
  const issue = result.body.issues?.find((candidate) => {
    if (candidate.code !== expectation.code) return false;
    if (expectation.partNumber && candidate.part_number !== expectation.partNumber) return false;
    return true;
  });
  record(
    `BOM-GATE ${expectation.name}`,
    result.response.status === 409 &&
      result.body.error === "BOM_RELEASE_GATE_BLOCKED" &&
      Boolean(issue) &&
      (!expectation.childStatus || issue.child_status === expectation.childStatus) &&
      (!expectation.latestReleasedRevision || issue.latest_released_revision === expectation.latestReleasedRevision),
    `HTTP ${result.response.status} ${JSON.stringify(result.body)}`
  );
}

async function runReleaseGateScenario(engineerCookie, managerCookie, scenario) {
  const child = scenario.child ?? (await createChild(engineerCookie, scenario.name, { status: scenario.status }));
  const parent = await createParent(engineerCookie, scenario.name, child);
  const draft = await createDraft(managerCookie, parent.submissionId, `${scenario.name} Gate Draft`);
  if (scenario.line) await saveSingleLine(managerCookie, draft.id, scenario.name, scenario.line);
  const review = await submitReview(engineerCookie, draft.id, `${scenario.name} release gate`, scenario.name);
  await assertReleaseGate(managerCookie, review.id, scenario.expectation);
}

async function runPendingReviewUniqueness(engineerCookie, managerCookie, releasedChild) {
  const parent = await createParent(engineerCookie, "PENDINGREVIEW", releasedChild);
  const firstDraft = await createDraft(managerCookie, parent.submissionId, "Pending Review Draft #1");
  await submitReview(engineerCookie, firstDraft.id, "First pending review", "pending-review first");

  const secondDraft = await createDraft(managerCookie, parent.submissionId, "Pending Review Draft #2");
  const secondSubmit = await getJson(engineerCookie, `/api/bom/drafts/${secondDraft.id}/submit-review`, {
    method: "POST",
    body: JSON.stringify({ changeReason: "Second pending review should be blocked" })
  });
  record(
    "BOM-REVIEW one PendingReview per parent revision",
    secondSubmit.response.status === 400 && secondSubmit.body.error === "BOM_PENDING_REVIEW_EXISTS",
    `HTTP ${secondSubmit.response.status} ${JSON.stringify(secondSubmit.body)}`
  );
}

async function runRejectedResubmit(engineerCookie, managerCookie, releasedChild) {
  const parent = await createParent(engineerCookie, "RESUBMIT", releasedChild);
  const draft = await createDraft(managerCookie, parent.submissionId, "Rejected Resubmit Draft");
  const firstReview = await submitReview(engineerCookie, draft.id, "Initial review to reject", "resubmit first");
  const reject = await rejectReview(managerCookie, firstReview.id, "Fix BOM structure");
  record("BOM-RESUBMIT manager rejects first review", reject.response.ok && reject.body.result?.draft?.status === "Rejected", `HTTP ${reject.response.status}`);

  await saveSingleLine(managerCookie, draft.id, "RESUBMIT", { partNumber: releasedChild.partNumber, revision: releasedChild.revision, quantity: 2 });
  const secondReview = await submitReview(engineerCookie, draft.id, "Resubmit after manager rejection", "resubmit second");

  const db = getDb();
  try {
    const draftRow = db.prepare("SELECT status, review_attempt FROM bom_drafts WHERE id = ?").get(draft.id);
    const reviewRows = db.prepare("SELECT status FROM bom_review_requests WHERE bom_draft_id = ? ORDER BY submitted_at ASC, rowid ASC").all(draft.id);
    record(
      "BOM-RESUBMIT review attempt increments",
      draftRow?.status === "PendingReview" && Number(draftRow?.review_attempt ?? 0) === 2,
      JSON.stringify(draftRow)
    );
    record(
      "BOM-RESUBMIT keeps rejected review history",
      reviewRows.length === 2 && reviewRows[0]?.status === "Rejected" && reviewRows[1]?.status === "PendingReview",
      JSON.stringify(reviewRows)
    );
  } finally {
    db.close();
  }

  const approve = await approveReview(managerCookie, secondReview.id, "Approve resubmitted BOM");
  record("BOM-RESUBMIT approved after resubmit", approve.response.ok && approve.body.result?.draft?.status === "Released", `HTTP ${approve.response.status}`);
}

async function run() {
  const engineerCookie = await login("engineer@example.com");
  const managerCookie = await login("manager@example.com");

  const releasedChild = await createChild(engineerCookie, "RELEASED", { status: "Released" });

  await runReleaseGateScenario(engineerCookie, managerCookie, {
    name: "MISSING",
    child: releasedChild,
    line: { partNumber: `P-BOMGATE-MISSING-${unique}`, revision: "A" },
    expectation: { name: "missing child", code: "missing_child_item", partNumber: `P-BOMGATE-MISSING-${unique}` }
  });

  await runReleaseGateScenario(engineerCookie, managerCookie, {
    name: "PENDING",
    status: "Pending",
    expectation: { name: "pending child", code: "child_not_released", childStatus: "Pending" }
  });

  await runReleaseGateScenario(engineerCookie, managerCookie, {
    name: "REJECTED",
    status: "Rejected",
    expectation: { name: "rejected child", code: "child_not_released", childStatus: "Rejected" }
  });

  await runReleaseGateScenario(engineerCookie, managerCookie, {
    name: "OBSOLETE",
    status: "Obsolete",
    expectation: { name: "obsolete child", code: "child_not_released", childStatus: "Obsolete" }
  });

  const outdatedPartNumber = `P-BOMGATE-OUTDATED-${unique}`;
  const oldRevision = await createChild(engineerCookie, "OUTDATED-A", { partNumber: outdatedPartNumber, revision: "A", status: "Released", offsetMs: 1000 });
  await createChild(engineerCookie, "OUTDATED-B", { partNumber: outdatedPartNumber, revision: "B", status: "Released", offsetMs: 2000 });
  await runReleaseGateScenario(engineerCookie, managerCookie, {
    name: "OUTDATED",
    child: oldRevision,
    expectation: {
      name: "outdated released child",
      code: "child_outdated_revision",
      partNumber: outdatedPartNumber,
      latestReleasedRevision: "B"
    }
  });

  await runPendingReviewUniqueness(engineerCookie, managerCookie, releasedChild);
  await runRejectedResubmit(engineerCookie, managerCookie, releasedChild);

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
