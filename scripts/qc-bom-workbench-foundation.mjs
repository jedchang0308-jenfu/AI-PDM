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
  form.set("change_description", "QC seed for BOM workbench foundation");
  form.set("cad_references_json", JSON.stringify(input.references ?? []));
  form.append("files", new File([Buffer.from("bom workbench placeholder")], input.fileName, { type: "application/octet-stream" }));
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

async function run() {
  const engineerCookie = await login("engineer@example.com");
  const managerCookie = await login("manager@example.com");

  const db = getDb();
  try {
    for (const table of [
      "bom_drafts",
      "bom_lines_tree",
      "bom_import_profiles",
      "bom_import_jobs",
      "bom_edit_events",
      "bom_review_requests",
      "bom_release_snapshots"
    ]) {
      const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
      record(`BOM-WB-SCHEMA table exists ${table}`, Boolean(row), table);
    }
    for (const index of ["idx_bom_drafts_one_active", "idx_bom_drafts_one_pending_review", "idx_bom_lines_tree_draft_parent"]) {
      const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?").get(index);
      record(`BOM-WB-SCHEMA index exists ${index}`, Boolean(row), index);
    }
  } finally {
    db.close();
  }

  const child = await createSubmission(engineerCookie, {
    drawingNumber: `BOMWB-CHILD-${unique}`,
    partNumber: `P-BOMWB-CHILD-${unique}`,
    partName: "BOM Workbench Child",
    revision: "A",
    material: "SUS304",
    surfaceFinish: "Polished",
    fileName: `BOMWB-CHILD-${unique}.sldprt`
  });

  const parentFileName = `BOMWB-PARENT-${unique}.sldasm`;
  const parent = await createSubmission(engineerCookie, {
    drawingNumber: `BOMWB-PARENT-${unique}`,
    partNumber: `P-BOMWB-PARENT-${unique}`,
    partName: "BOM Workbench Parent",
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
        quantity: 2,
        extractionMethod: "qc_bom_workbench",
        confidence: "high"
      },
      {
        sourceFilename: parentFileName,
        sourceFileRole: "sldasm",
        referencedFilename: `${child.partNumber}-duplicate.sldprt`,
        referencedPartNumber: child.partNumber,
        referencedDrawingNumber: child.drawingNumber,
        referencedRevision: "A",
        referenceType: "assembly_component",
        quantity: 3,
        extractionMethod: "qc_bom_workbench",
        confidence: "high"
      },
      {
        sourceFilename: parentFileName,
        sourceFileRole: "sldasm",
        referencedFilename: `P-BOMWB-MISSING-${unique}.sldprt`,
        referencedPartNumber: `P-BOMWB-MISSING-${unique}`,
        referencedDrawingNumber: `BOMWB-MISSING-${unique}`,
        referencedRevision: "A",
        referenceType: "assembly_component",
        quantity: 1,
        extractionMethod: "qc_bom_workbench",
        confidence: "medium"
      }
    ]
  });

  const legacyBom = await getJson(managerCookie, `/api/submissions/${parent.submissionId}/bom`);
  record("BOM-WB-001 legacy BOM route remains compatible", legacyBom.response.ok && legacyBom.body.bom?.lines?.length === 3, `HTTP ${legacyBom.response.status}`);

  const firstDraft = await getJson(managerCookie, "/api/bom/drafts/from-assembly", {
    method: "POST",
    body: JSON.stringify({ submissionId: parent.submissionId, draftName: "CAD Auto #1", setActive: true })
  });
  record("BOM-WB-002 create workbench draft returns 201", firstDraft.response.status === 201, `HTTP ${firstDraft.response.status}`);
  record("BOM-WB-003 workbench draft merges duplicate children", firstDraft.body.draft?.lines?.length === 2, JSON.stringify(firstDraft.body.draft?.lines ?? []));
  const mergedLine = firstDraft.body.draft?.lines?.find((line) => line.part_number === child.partNumber);
  record("BOM-WB-004 merged line quantity sums references", Number(mergedLine?.quantity) === 5, String(mergedLine?.quantity ?? ""));
  record("BOM-WB-005 first workbench draft is active", firstDraft.body.draft?.is_active === 1);

  const draftDetail = await getJson(managerCookie, `/api/bom/drafts/${firstDraft.body.draft.id}`);
  record("BOM-WB-006 draft detail route returns tree", draftDetail.response.ok && draftDetail.body.draft?.lines?.length === 2, `HTTP ${draftDetail.response.status}`);

  const secondDraft = await getJson(managerCookie, "/api/bom/drafts/from-assembly", {
    method: "POST",
    body: JSON.stringify({ submissionId: parent.submissionId, draftName: "CAD Auto #2", setActive: true })
  });
  record("BOM-WB-007 second draft returns 201", secondDraft.response.status === 201, `HTTP ${secondDraft.response.status}`);

  const workbench = await getJson(managerCookie, `/api/bom/workbench?submissionId=${encodeURIComponent(parent.submissionId)}`);
  record("BOM-WB-008 workbench summary returns 200", workbench.response.ok, `HTTP ${workbench.response.status}`);
  record("BOM-WB-009 workbench keeps multiple drafts", (workbench.body.workbench?.drafts?.length ?? 0) >= 2);
  record("BOM-WB-010 latest draft becomes active", workbench.body.workbench?.active_draft?.id === secondDraft.body.draft.id);
  const inactiveFirst = workbench.body.workbench?.drafts?.find((draft) => draft.id === firstDraft.body.draft.id);
  record("BOM-WB-011 prior draft is no longer active", inactiveFirst?.is_active === 0, String(inactiveFirst?.is_active ?? ""));

  const db2 = getDb();
  try {
    const event = db2.prepare("SELECT event_type FROM bom_edit_events WHERE bom_draft_id = ?").get(secondDraft.body.draft.id);
    record("BOM-WB-012 draft creation writes edit event", event?.event_type === "create_from_assembly", event?.event_type ?? "");
    const audit = db2
      .prepare("SELECT action FROM audit_logs WHERE submission_id = ? AND action = 'BomWorkbenchDraftCreated' ORDER BY created_at DESC LIMIT 1")
      .get(parent.submissionId);
    record("BOM-WB-013 draft creation writes audit log", audit?.action === "BomWorkbenchDraftCreated", audit?.action ?? "");
  } finally {
    db2.close();
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
