import path from "node:path";
import Database from "better-sqlite3";

const baseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3000";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const unique = Date.now().toString().slice(-6);
const results = [];

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
  form.set("change_description", "QC seed for productized BOM export");
  form.set("cad_references_json", JSON.stringify(input.references ?? []));
  form.append("files", new File([Buffer.from("bom productized placeholder")], input.fileName, { type: "application/octet-stream" }));
  const response = await fetch(`${baseUrl}/api/submissions`, { method: "POST", headers: { cookie }, body: form });
  const body = await response.json().catch(() => ({}));
  record(`${input.drawingNumber} created`, response.status === 201, `HTTP ${response.status}`);
  return { submissionId: body.submissionId, ...input };
}

function markReleased(submissionId) {
  const root = process.cwd();
  const dataDir = process.env.PDM_DATA_DIR ? path.resolve(root, process.env.PDM_DATA_DIR) : path.join(root, "data");
  const db = new Database(path.join(dataDir, "ai-pdm.sqlite"));
  const releasedAt = new Date().toISOString();
  db.prepare("UPDATE submissions SET status = 'Released', released_at = ?, release_error = NULL, updated_at = ? WHERE id = ?").run(
    releasedAt,
    releasedAt,
    submissionId
  );
  db.close();
}

async function run() {
  const engineerCookie = await login("engineer@example.com");
  const managerCookie = await login("manager@example.com");
  const child = await createSubmission(engineerCookie, {
    drawingNumber: `BOM-CHILD-${unique}`,
    partNumber: `P-BOM-CHILD-${unique}`,
    partName: "BOM Productized Child",
    revision: "A",
    material: `ChildMaterial-${unique}`,
    surfaceFinish: `ChildFinish-${unique}`,
    fileName: `BOM-CHILD-${unique}.sldprt`
  });
  markReleased(child.submissionId);

  const parentFileName = `BOM-PARENT-${unique}.sldasm`;
  const parent = await createSubmission(engineerCookie, {
    drawingNumber: `BOM-PARENT-${unique}`,
    partNumber: `P-BOM-PARENT-${unique}`,
    partName: "BOM Productized Parent",
    revision: "A",
    material: `ParentMaterial-${unique}`,
    surfaceFinish: `ParentFinish-${unique}`,
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
        quantity: 4,
        extractionMethod: "qc_bom_productized",
        confidence: "high"
      }
    ]
  });

  const detailResponse = await fetch(`${baseUrl}/api/submissions/${parent.submissionId}`, { headers: { cookie: managerCookie } });
  const detailBody = await detailResponse.json().catch(() => ({}));
  record("BOMPROD-001 detail exposes BOM", detailResponse.ok && detailBody.submission?.bom?.lines?.length === 1);
  const line = detailBody.submission?.bom?.lines?.[0];
  record("BOMPROD-002 detail enriches child drawing", line?.child_drawing_number === child.drawingNumber);
  record("BOMPROD-003 detail enriches child material and status", line?.child_material === child.material && line?.child_status === "Released");

  const csvResponse = await fetch(`${baseUrl}/api/submissions/${parent.submissionId}/bom/export?format=csv`, { headers: { cookie: managerCookie } });
  const csvText = await csvResponse.text();
  record("BOMPROD-004 CSV export returns 200", csvResponse.status === 200, `HTTP ${csvResponse.status}`);
  for (const header of [
    "parent_drawing_number",
    "parent_material",
    "parent_surface_finish",
    "parent_status",
    "exported_at",
    "child_drawing_number",
    "child_part_name",
    "child_material",
    "child_surface_finish",
    "child_status"
  ]) {
    record(`BOMPROD-005 CSV header ${header}`, csvText.includes(header));
  }
  record(
    "BOMPROD-006 CSV contains manufacturing-ready values",
    csvText.includes(parent.material) &&
      csvText.includes(parent.surfaceFinish) &&
      csvText.includes(child.drawingNumber) &&
      csvText.includes(child.partName) &&
      csvText.includes(child.material) &&
      csvText.includes(child.surfaceFinish) &&
      csvText.includes("Released") &&
      csvText.includes("4")
  );

  const xlsResponse = await fetch(`${baseUrl}/api/submissions/${parent.submissionId}/bom/export?format=xls`, { headers: { cookie: managerCookie } });
  const xlsText = await xlsResponse.text();
  record("BOMPROD-007 Excel export returns 200", xlsResponse.status === 200, `HTTP ${xlsResponse.status}`);
  record("BOMPROD-008 Excel export contains enriched child fields", xlsText.includes(child.drawingNumber) && xlsText.includes(child.material));

  const noBom = await createSubmission(engineerCookie, {
    drawingNumber: `BOM-NONE-${unique}`,
    partNumber: `P-BOM-NONE-${unique}`,
    partName: "No BOM Seed",
    revision: "A",
    material: "NoBomMaterial",
    surfaceFinish: "NoBomFinish",
    fileName: `BOM-NONE-${unique}.pdf`
  });
  const noBomExport = await fetch(`${baseUrl}/api/submissions/${noBom.submissionId}/bom/export?format=csv`, { headers: { cookie: managerCookie } });
  record("BOMPROD-009 no assembly reference does not create fake BOM", noBomExport.status === 404, `HTTP ${noBomExport.status}`);

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
}

run().catch((error) => {
  const failed = results.filter((result) => !result.passed).length || 1;
  console.error(JSON.stringify({ passed: results.length - failed, failed, results, error: error.message }, null, 2));
  process.exit(1);
});
