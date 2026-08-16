import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const baseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3000";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const unique = Date.now().toString().slice(-8);
const results = [];
const createdSubmissionIds = [];
const createdDraftIds = [];
const createdImportJobIds = [];
const createdAssetIds = [];

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
  form.set("change_description", "QC seed for SolidWorks BOM XLS import");
  form.set("cad_references_json", JSON.stringify(input.references ?? []));
  form.append("files", new File([Buffer.from("solidworks xls import placeholder")], input.fileName, { type: "application/octet-stream" }));

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

function cleanup() {
  const db = getDb();
  try {
    const assetPlaceholders = createdAssetIds.map(() => "?").join(",");
    if (assetPlaceholders) db.prepare(`DELETE FROM file_assets WHERE id IN (${assetPlaceholders})`).run(...createdAssetIds);

    const jobPlaceholders = createdImportJobIds.map(() => "?").join(",");
    if (jobPlaceholders) db.prepare(`DELETE FROM bom_import_jobs WHERE id IN (${jobPlaceholders})`).run(...createdImportJobIds);

    const draftPlaceholders = createdDraftIds.map(() => "?").join(",");
    if (draftPlaceholders) {
      db.prepare(`DELETE FROM bom_release_snapshots WHERE bom_draft_id IN (${draftPlaceholders})`).run(...createdDraftIds);
      db.prepare(`DELETE FROM bom_review_requests WHERE bom_draft_id IN (${draftPlaceholders})`).run(...createdDraftIds);
      db.prepare(`DELETE FROM bom_edit_events WHERE bom_draft_id IN (${draftPlaceholders})`).run(...createdDraftIds);
      db.prepare(`DELETE FROM bom_lines_tree WHERE bom_draft_id IN (${draftPlaceholders})`).run(...createdDraftIds);
      db.prepare(`DELETE FROM bom_drafts WHERE id IN (${draftPlaceholders})`).run(...createdDraftIds);
    }

    const submissionPlaceholders = createdSubmissionIds.map(() => "?").join(",");
    if (submissionPlaceholders) {
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

function rememberImport(result) {
  if (result?.draft?.id) createdDraftIds.push(result.draft.id);
  if (result?.importJob?.id) createdImportJobIds.push(result.importJob.id);
  if (result?.importJob?.source_asset_id) createdAssetIds.push(result.importJob.source_asset_id);
}

async function run() {
  const engineerCookie = await login("engineer@example.com");
  const managerCookie = await login("manager@example.com");

  const childA = await createSubmission(engineerCookie, {
    drawingNumber: `BOMXLS-CHILD-A-${unique}`,
    partNumber: `P-BOMXLS-CHILD-A-${unique}`,
    partName: "BOM XLS Child A",
    revision: "A",
    fileName: `BOMXLS-CHILD-A-${unique}.sldprt`
  });
  const childB = await createSubmission(engineerCookie, {
    drawingNumber: `BOMXLS-CHILD-B-${unique}`,
    partNumber: `P-BOMXLS-CHILD-B-${unique}`,
    partName: "BOM XLS Child B",
    revision: "B",
    fileName: `BOMXLS-CHILD-B-${unique}.sldprt`
  });
  const parent = await createSubmission(engineerCookie, {
    drawingNumber: `BOMXLS-PARENT-${unique}`,
    partNumber: `P-BOMXLS-PARENT-${unique}`,
    partName: "BOM XLS Parent",
    revision: "A",
    material: "Assembly",
    documentType: "Assembly",
    fileName: `BOMXLS-PARENT-${unique}.sldasm`
  });

  const tsv = [
    ["Item No.", "Part Number", "Description", "Rev", "Qty."],
    ["1", childA.partNumber, "Child A first row", "A", "2"],
    ["2", childA.partNumber, "Child A duplicate row", "A", "3"],
    ["3", childB.partNumber, "Child B row", "B", "1"]
  ]
    .map((row) => row.join("\t"))
    .join("\r\n");

  const firstImport = await getJson(managerCookie, "/api/bom/drafts/import-xls", {
    method: "POST",
    body: JSON.stringify({
      submissionId: parent.submissionId,
      draftName: "SolidWorks TSV #1",
      setActive: true,
      originalFilename: `solidworks-bom-${unique}.xls`,
      content: tsv
    })
  });
  rememberImport(firstImport.body);
  record("BOM-XLS-001 import route returns 201", firstImport.response.status === 201, `HTTP ${firstImport.response.status}`);
  record("BOM-XLS-002 imported draft uses solidworks_xls source", firstImport.body.draft?.source === "solidworks_xls", firstImport.body.draft?.source ?? "");
  record("BOM-XLS-003 duplicate part revision rows merge", firstImport.body.draft?.lines?.length === 2, JSON.stringify(firstImport.body.draft?.lines ?? []));
  const mergedChild = firstImport.body.draft?.lines?.find((line) => line.part_number === childA.partNumber);
  const secondChild = firstImport.body.draft?.lines?.find((line) => line.part_number === childB.partNumber);
  record("BOM-XLS-004 merged quantity sums source rows", Number(mergedChild?.quantity) === 5, String(mergedChild?.quantity ?? ""));
  record("BOM-XLS-005 child revision is preserved", secondChild?.revision === "B", secondChild?.revision ?? "");
  record("BOM-XLS-006 imported draft is active", firstImport.body.draft?.is_active === 1);
  record("BOM-XLS-007 import job reports raw row count", firstImport.body.importJob?.row_count === 3, String(firstImport.body.importJob?.row_count ?? ""));

  const html = `
    <html><body><table>
      <tr><th>Item No.</th><th>Part No.</th><th>Revision</th><th>Quantity</th></tr>
      <tr><td>1</td><td>${childB.partNumber}</td><td>B</td><td>4</td></tr>
    </table></body></html>
  `;
  const secondImport = await getJson(managerCookie, "/api/bom/drafts/import-xls", {
    method: "POST",
    body: JSON.stringify({
      submissionId: parent.submissionId,
      draftName: "SolidWorks HTML #2",
      setActive: true,
      originalFilename: `solidworks-bom-html-${unique}.xls`,
      content: html
    })
  });
  rememberImport(secondImport.body);
  record("BOM-XLS-008 HTML XLS import returns 201", secondImport.response.status === 201, `HTTP ${secondImport.response.status}`);
  record("BOM-XLS-009 second import creates a new draft", secondImport.body.draft?.id && secondImport.body.draft.id !== firstImport.body.draft.id);

  const workbench = await getJson(managerCookie, `/api/bom/workbench?submissionId=${encodeURIComponent(parent.submissionId)}`);
  record("BOM-XLS-010 workbench keeps both imported drafts", (workbench.body.workbench?.drafts?.length ?? 0) >= 2);
  record("BOM-XLS-011 latest import becomes active", workbench.body.workbench?.active_draft?.id === secondImport.body.draft.id);
  const oldDraft = workbench.body.workbench?.drafts?.find((draft) => draft.id === firstImport.body.draft.id);
  record("BOM-XLS-012 previous import draft is not overwritten", oldDraft?.is_active === 0 && oldDraft?.line_count === 2, JSON.stringify(oldDraft ?? {}));

  const binary = await getJson(managerCookie, "/api/bom/drafts/import-xls", {
    method: "POST",
    body: JSON.stringify({
      submissionId: parent.submissionId,
      originalFilename: "binary.xls",
      contentBase64: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).toString("base64")
    })
  });
  record("BOM-XLS-013 binary xls is rejected with explicit code", binary.response.status === 400 && binary.body.error === "BOM_XLS_BINARY_UNSUPPORTED", JSON.stringify(binary.body));

  const db = getDb();
  try {
    const profile = db.prepare("SELECT * FROM bom_import_profiles WHERE id = ?").get(firstImport.body.importJob.import_profile_id);
    record("BOM-XLS-014 default import profile is stored", profile?.profile_name === "solidworks_bom_default" && profile?.version === "v1", JSON.stringify(profile ?? {}));
    record("BOM-XLS-015 profile mapping keeps column aliases", String(profile?.mapping_json ?? "").includes("partNumber") && String(profile?.mapping_json ?? "").includes("quantity"));

    const job = db.prepare("SELECT * FROM bom_import_jobs WHERE id = ?").get(firstImport.body.importJob.id);
    record("BOM-XLS-016 import job preserves filename", job?.original_filename === `solidworks-bom-${unique}.xls`, job?.original_filename ?? "");
    record("BOM-XLS-017 import job preserves actor and timestamp", Boolean(job?.created_by && job?.created_at), JSON.stringify(job ?? {}));
    const metadata = JSON.parse(job?.error_json ?? "{}");
    record("BOM-XLS-018 import metadata preserves hash and format", metadata.format === "delimited" && typeof metadata.sha256 === "string", JSON.stringify(metadata));

    const asset = db.prepare("SELECT * FROM file_assets WHERE id = ?").get(job.source_asset_id);
    record("BOM-XLS-019 original file asset row is stored", asset?.linked_entity_type === "bom_import_job" && asset?.linked_entity_id === job.id, JSON.stringify(asset ?? {}));
    record("BOM-XLS-020 original file is written to repository", Boolean(asset?.original_path && fs.existsSync(asset.original_path)), asset?.original_path ?? "");

    const importedLine = db.prepare("SELECT * FROM bom_lines_tree WHERE bom_draft_id = ? AND part_number = ?").get(firstImport.body.draft.id, childA.partNumber);
    record("BOM-XLS-021 imported line source priority is SolidWorks", importedLine?.source === "solidworks_xls" && importedLine?.source_priority === 20, JSON.stringify(importedLine ?? {}));
    record("BOM-XLS-022 imported line stores source filename", importedLine?.source_filename === `solidworks-bom-${unique}.xls`, importedLine?.source_filename ?? "");

    const event = db.prepare("SELECT event_type FROM bom_edit_events WHERE bom_draft_id = ? AND event_type = 'import_solidworks_xls'").get(firstImport.body.draft.id);
    record("BOM-XLS-023 import writes edit event", event?.event_type === "import_solidworks_xls", event?.event_type ?? "");
    const audit = db
      .prepare("SELECT action FROM audit_logs WHERE submission_id = ? AND action = 'BomWorkbenchDraftImported' ORDER BY created_at DESC LIMIT 1")
      .get(parent.submissionId);
    record("BOM-XLS-024 import writes audit log", audit?.action === "BomWorkbenchDraftImported", audit?.action ?? "");
  } finally {
    db.close();
  }

  const manualOverride = await getJson(managerCookie, `/api/bom/drafts/${firstImport.body.draft.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      reason: "QC manual correction after SolidWorks import",
      lines: [
        {
          id: "manual-xls-child-a",
          nodeType: "item",
          partNumber: childA.partNumber,
          revision: "A",
          quantity: 6,
          sequenceNo: 1
        },
        {
          id: "manual-xls-child-b",
          nodeType: "item",
          partNumber: childB.partNumber,
          revision: "B",
          quantity: 1,
          sequenceNo: 2
        }
      ]
    })
  });
  record("BOM-XLS-025 manual correction after XLS import returns 200", manualOverride.response.ok, `HTTP ${manualOverride.response.status}`);
  record("BOM-XLS-026 manual correction promotes draft source", manualOverride.body.draft?.source === "manual", manualOverride.body.draft?.source ?? "");
  const manualChild = manualOverride.body.draft?.lines?.find((line) => line.part_number === childA.partNumber);
  record(
    "BOM-XLS-027 manual correction has highest source priority",
    manualChild?.source === "manual" && manualChild?.source_priority === 30 && Number(manualChild?.quantity) === 6,
    JSON.stringify(manualChild ?? {})
  );

  const dbAfterManual = getDb();
  try {
    const saveEvent = dbAfterManual
      .prepare("SELECT event_type FROM bom_edit_events WHERE bom_draft_id = ? AND event_type = 'save_tree' ORDER BY created_at DESC LIMIT 1")
      .get(firstImport.body.draft.id);
    record("BOM-XLS-028 manual correction writes save_tree event", saveEvent?.event_type === "save_tree", saveEvent?.event_type ?? "");
    const saveAudit = dbAfterManual
      .prepare("SELECT action FROM audit_logs WHERE submission_id = ? AND action = 'BomWorkbenchDraftSaved' ORDER BY created_at DESC LIMIT 1")
      .get(parent.submissionId);
    record("BOM-XLS-029 manual correction writes audit log", saveAudit?.action === "BomWorkbenchDraftSaved", saveAudit?.action ?? "");
  } finally {
    dbAfterManual.close();
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
