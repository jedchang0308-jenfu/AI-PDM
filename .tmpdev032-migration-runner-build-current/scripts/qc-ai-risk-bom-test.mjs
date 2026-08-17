import path from "node:path";
import Database from "better-sqlite3";

const apiBaseUrl = process.env.PDM_BASE_URL ?? "http://127.0.0.1:3000";
const password = process.env.PDM_DEMO_PASSWORD ?? "pdm-demo";
const unique = Date.now().toString().slice(-6);
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function apiLogin(email) {
  const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
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
  if (input.productLine) form.set("product_line", input.productLine);
  if (input.customer) form.set("customer", input.customer);
  if (input.projectCode) form.set("project_code", input.projectCode);
  if (input.processName) form.set("process_name", input.processName);
  if (input.machine) form.set("machine", input.machine);
  form.set("material", "AIRISK-QC-Material");
  form.set("surface_finish", "AIRISK-QC-Finish");
  form.set("document_type", input.documentType ?? "Drawing");
  form.set("change_description", "QC seed for AI BOM risk report");
  form.set("cad_references_json", JSON.stringify(input.references ?? []));
  form.append("files", new File([Buffer.from("ai risk placeholder")], input.fileName, { type: "application/octet-stream" }));

  const response = await fetch(`${apiBaseUrl}/api/submissions`, {
    method: "POST",
    headers: { cookie },
    body: form
  });
  const body = await response.json().catch(() => ({}));
  record(`${input.drawingNumber} rev ${input.revision} created`, response.status === 201, `HTTP ${response.status}`);
  return { submissionId: body.submissionId, ...input };
}

function markReleased(submissionId, offsetMs = 0) {
  const root = process.cwd();
  const dataDir = process.env.PDM_DATA_DIR ? path.resolve(root, process.env.PDM_DATA_DIR) : path.join(root, "data");
  const db = new Database(path.join(dataDir, "ai-pdm.sqlite"));
  const releasedAt = new Date(Date.now() + offsetMs).toISOString();
  db.prepare("UPDATE submissions SET status = 'Released', released_at = ?, release_error = NULL, updated_at = ? WHERE id = ?").run(
    releasedAt,
    releasedAt,
    submissionId
  );
  db.close();
}

function reference(sourceFilename, child, revision, quantity) {
  return {
    sourceFilename,
    sourceFileRole: "sldasm",
    referencedFilename: `${child}.sldprt`,
    referencedPartNumber: child,
    referencedDrawingNumber: `D-${child}`,
    referencedRevision: revision,
    referenceType: "assembly_component",
    quantity,
    extractionMethod: "qc_ai_risk_bom",
    confidence: "high"
  };
}

async function getJson(cookie, url) {
  const response = await fetch(`${apiBaseUrl}${url}`, { headers: { cookie } });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function run() {
  const engineerCookie = await apiLogin("engineer@example.com");
  const managerCookie = await apiLogin("manager@example.com");
  const oldPartNumber = `P-AIRISK-OLD-${unique}`;
  const pendingPartNumber = `P-AIRISK-PENDING-${unique}`;
  const duplicatePartNumber = `P-AIRISK-DUP-${unique}`;
  const missingPartNumber = `P-AIRISK-MISSING-${unique}`;

  const oldA = await createSubmission(engineerCookie, {
    drawingNumber: `AIRISK-OLD-${unique}`,
    partNumber: oldPartNumber,
    partName: "AI risk old child",
    revision: "A",
    fileName: `AIRISK-OLD-${unique}-A.sldprt`
  });
  markReleased(oldA.submissionId, 1);
  const oldB = await createSubmission(engineerCookie, {
    drawingNumber: `AIRISK-OLD-${unique}`,
    partNumber: oldPartNumber,
    partName: "AI risk old child",
    revision: "B",
    fileName: `AIRISK-OLD-${unique}-B.sldprt`
  });
  markReleased(oldB.submissionId, 2);
  await createSubmission(engineerCookie, {
    drawingNumber: `AIRISK-PENDING-${unique}`,
    partNumber: pendingPartNumber,
    partName: "AI risk pending child",
    revision: "A",
    fileName: `AIRISK-PENDING-${unique}.sldprt`
  });

  const parentFileName = `AIRISK-PARENT-${unique}.sldasm`;
  const parent = await createSubmission(engineerCookie, {
    drawingNumber: `AIRISK-PARENT-${unique}`,
    partNumber: `P-AIRISK-PARENT-${unique}`,
    partName: "AI risk parent",
    revision: "A",
    documentType: "Assembly",
    fileName: parentFileName,
    references: [
      reference(parentFileName, oldPartNumber, "A", 1),
      reference(parentFileName, pendingPartNumber, "A", 1),
      reference(parentFileName, missingPartNumber, "A", 1),
      reference(parentFileName, duplicatePartNumber, "A", 1),
      reference(parentFileName, duplicatePartNumber, "A", 2)
    ]
  });

  const riskResult = await getJson(managerCookie, `/api/submissions/${parent.submissionId}/ai-risks`);
  record("AIRISK-001 risk API returns 200", riskResult.response.status === 200, `HTTP ${riskResult.response.status}`);
  const risks = riskResult.body.report?.risks ?? [];
  const codes = new Set(risks.map((risk) => risk.code));
  record("AIRISK-002 detects BOM missing child", codes.has("bom_child_missing"));
  record("AIRISK-003 detects BOM not released child", codes.has("bom_child_not_released"));
  record("AIRISK-004 detects BOM outdated child", codes.has("bom_child_outdated"));
  record("AIRISK-005 detects duplicate BOM child part", codes.has("bom_duplicate_child_part"));
  record("AIRISK-006 detects missing submission fields", codes.has("submission_required_fields_missing"));
  record("AIRISK-007 every risk has traceable sources", risks.every((risk) => Array.isArray(risk.sources) && risk.sources.length > 0));

  const detailAfterRisk = await getJson(managerCookie, `/api/submissions/${parent.submissionId}`);
  record("AIRISK-008 AI risks do not mutate submission status", detailAfterRisk.body.submission?.status === "Pending");

  const noBom = await createSubmission(engineerCookie, {
    drawingNumber: `AIRISK-NOBOM-${unique}`,
    partNumber: `P-AIRISK-NOBOM-${unique}`,
    partName: "AI risk no BOM",
    revision: "A",
    fileName: `AIRISK-NOBOM-${unique}.pdf`,
    productLine: "Line",
    customer: "Customer",
    projectCode: "Project",
    processName: "Process",
    machine: "Machine"
  });
  const noBomRiskResult = await getJson(managerCookie, `/api/submissions/${noBom.submissionId}/ai-risks`);
  const noBomCodes = new Set((noBomRiskResult.body.report?.risks ?? []).map((risk) => risk.code));
  record(
    "AIRISK-009 no BOM does not fabricate BOM risks",
    !["bom_child_missing", "bom_child_not_released", "bom_child_outdated", "bom_duplicate_child_part"].some((code) => noBomCodes.has(code))
  );

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
}

run().catch((error) => {
  const failed = results.filter((result) => !result.passed).length || 1;
  console.error(JSON.stringify({ passed: results.length - failed, failed, results, error: error.message }, null, 2));
  process.exit(1);
});
