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
  form.set("change_description", "QC seed for BOM release export");
  form.set("cad_references_json", JSON.stringify(input.references ?? []));
  form.append("files", new File([Buffer.from("bom release export placeholder")], input.fileName, { type: "application/octet-stream" }));

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

async function createParentFixture(engineerCookie, child) {
  const parentFileName = `BOMEXPORT-PARENT-${unique}.sldasm`;
  return createSubmission(engineerCookie, {
    drawingNumber: `BOMEXPORT-PARENT-${unique}`,
    partNumber: `P-BOMEXPORT-PARENT-${unique}`,
    partName: "BOM Export Parent",
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
        quantity: 3,
        extractionMethod: "qc_bom_release_export",
        confidence: "high"
      }
    ]
  });
}

async function createReleasedSnapshot(engineerCookie, managerCookie) {
  const child = await createSubmission(engineerCookie, {
    drawingNumber: `BOMEXPORT-CHILD-${unique}`,
    partNumber: `P-BOMEXPORT-CHILD-${unique}`,
    partName: "BOM Export Child",
    revision: "A",
    fileName: `BOMEXPORT-CHILD-${unique}.sldprt`
  });
  markReleased(child.submissionId);

  const parent = await createParentFixture(engineerCookie, child);
  const draftResult = await getJson(managerCookie, "/api/bom/drafts/from-assembly", {
    method: "POST",
    body: JSON.stringify({ submissionId: parent.submissionId, draftName: "Export Draft", setActive: true })
  });
  record("BOM-EXPORT draft created", draftResult.response.status === 201, `HTTP ${draftResult.response.status}`);

  const submit = await getJson(engineerCookie, `/api/bom/drafts/${draftResult.body.draft.id}/submit-review`, {
    method: "POST",
    body: JSON.stringify({ changeReason: "Release for export" })
  });
  record("BOM-EXPORT review submitted", submit.response.status === 201, `HTTP ${submit.response.status}`);

  const approve = await getJson(managerCookie, `/api/bom/reviews/${submit.body.review.id}/approve`, {
    method: "POST",
    body: JSON.stringify({ decisionReason: "Approve export fixture" })
  });
  record("BOM-EXPORT review approved", approve.response.ok && Boolean(approve.body.result?.snapshotId), `HTTP ${approve.response.status}`);
  return { child, parent, snapshotId: approve.body.result.snapshotId };
}

async function run() {
  const engineerCookie = await login("engineer@example.com");
  const managerCookie = await login("manager@example.com");
  const { child, parent, snapshotId } = await createReleasedSnapshot(engineerCookie, managerCookie);
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const expectedBase = `BOM_${parent.partNumber}_Rev${parent.revision}_${stamp}`;

  const csv = await fetch(`${baseUrl}/api/bom/releases/${snapshotId}/export?format=csv`, {
    headers: { cookie: managerCookie }
  });
  const csvText = await csv.text();
  record("BOM-EXPORT CSV returns 200", csv.status === 200, `HTTP ${csv.status}`);
  record("BOM-EXPORT CSV filename is fixed", csv.headers.get("content-disposition")?.includes(`${expectedBase}.csv`) ?? false, csv.headers.get("content-disposition") ?? "");
  record("BOM-EXPORT CSV content type", csv.headers.get("content-type")?.startsWith("text/csv") ?? false, csv.headers.get("content-type") ?? "");
  record("BOM-EXPORT CSV contains fixed columns", csvText.includes('"level","line_no","parent_part_number","child_part_number"'), csvText.slice(0, 160));
  record("BOM-EXPORT CSV contains released child", csvText.includes(child.partNumber) && csvText.includes('"3"'), csvText);

  const xlsx = await fetch(`${baseUrl}/api/bom/releases/${snapshotId}/export?format=xlsx`, {
    headers: { cookie: managerCookie }
  });
  const xlsxBuffer = Buffer.from(await xlsx.arrayBuffer());
  const xlsxText = xlsxBuffer.toString("utf8");
  record("BOM-EXPORT XLSX returns 200", xlsx.status === 200, `HTTP ${xlsx.status}`);
  record("BOM-EXPORT XLSX filename is fixed", xlsx.headers.get("content-disposition")?.includes(`${expectedBase}.xlsx`) ?? false, xlsx.headers.get("content-disposition") ?? "");
  record(
    "BOM-EXPORT XLSX content type",
    xlsx.headers.get("content-type") === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xlsx.headers.get("content-type") ?? ""
  );
  record("BOM-EXPORT XLSX has zip header", xlsxBuffer.readUInt32LE(0) === 0x04034b50, xlsxBuffer.slice(0, 4).toString("hex"));
  record("BOM-EXPORT XLSX has end of central directory", xlsxBuffer.readUInt32LE(xlsxBuffer.length - 22) === 0x06054b50, xlsxBuffer.slice(-22, -18).toString("hex"));
  record("BOM-EXPORT XLSX contains workbook parts", xlsxText.includes("[Content_Types].xml") && xlsxText.includes("xl/worksheets/sheet1.xml"), "xlsx parts");
  record("BOM-EXPORT XLSX contains BOM values", xlsxText.includes(parent.partNumber) && xlsxText.includes(child.partNumber), "xlsx values");

  const unsupported = await fetch(`${baseUrl}/api/bom/releases/${snapshotId}/export?format=xls`, {
    headers: { cookie: managerCookie }
  });
  const unsupportedBody = await unsupported.json().catch(() => ({}));
  record("BOM-EXPORT unsupported format is rejected", unsupported.status === 400 && unsupportedBody.error === "BOM_EXPORT_FORMAT_UNSUPPORTED", JSON.stringify(unsupportedBody));

  const missing = await fetch(`${baseUrl}/api/bom/releases/missing-snapshot/export?format=csv`, {
    headers: { cookie: managerCookie }
  });
  record("BOM-EXPORT missing snapshot returns 404", missing.status === 404, `HTTP ${missing.status}`);

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
