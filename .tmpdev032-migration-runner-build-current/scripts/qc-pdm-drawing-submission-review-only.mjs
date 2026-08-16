import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function pass(id, message) {
  checks.push({ id, ok: true, message });
}

function fail(id, message) {
  checks.push({ id, ok: false, message });
}

function assertIncludes(id, source, needles, message) {
  const missing = needles.filter((needle) => !source.includes(needle));
  if (missing.length === 0) {
    pass(id, message);
  } else {
    fail(id, `${message}; missing: ${missing.join(", ")}`);
  }
}

function assertNotIncludes(id, source, needles, message) {
  const present = needles.filter((needle) => source.includes(needle));
  if (present.length === 0) {
    pass(id, message);
  } else {
    fail(id, `${message}; present: ${present.join(", ")}`);
  }
}

const drawingPage = read("src/app/numbering/drawings/page.tsx");
const uploadPage = read("src/app/upload/page.tsx");
const controlledDrawingSubmissionPage = read("src/app/numbering/submissions/drawings/[drawingNumber]/page.tsx");
const workbench = read("src/lib/drawing-submission-workbench.ts");
const contextRoute = read("src/app/api/numbering/drawings/[drawingNumber]/submission-context/route.ts");
const createRoute = read("src/app/api/numbering/drawings/[drawingNumber]/submissions/route.ts");
const asyncWriter = read("src/lib/repositories/submission-write-async-repository.ts");
const schema = read("db/schema.sql");
const db = read("src/lib/db.ts");

assertIncludes(
  "DRS-QC-001",
  drawingPage,
  ["/drawings/", "encodeURIComponent(drawing.drawingNumber)", "/submission-workbench"],
  "drawing detail send-review CTA routes to canonical drawing submission workbench"
);
assertNotIncludes(
  "DRS-QC-002",
  drawingPage,
  ['href="/upload"', "/upload?source=drawing"],
  "drawing detail no longer links send-review to generic upload"
);
assertIncludes(
  "DRS-QC-003",
  uploadPage,
  ["DrawingSourceSubmissionWorkbench", 'routeState.source === "drawing"', "GenericUploadPage"],
  "upload page branches drawing-source mode away from generic upload"
);
assertIncludes(
  "DRS-QC-004",
  uploadPage,
  ["送審來源：", "主資料只讀", "送審備註", "selectedAttachmentIds"],
  "drawing-source UI exposes source banner, read-only context, attachment selection, and note"
);
assertIncludes(
  "DRS-QC-004B",
  controlledDrawingSubmissionPage,
  ["DrawingSourceSubmissionWorkbench", "decodeURIComponent(drawingNumber)"],
  "controlled numbering submission page reuses drawing-source workbench"
);
assertNotIncludes(
  "DRS-QC-005",
  uploadPage,
  [
    'name="drawing_number"',
    'name="part_number"',
    'name="part_name"',
    'name="revision"',
    'name="material"',
    'name="surface_finish"',
    'name="document_type"'
  ],
  "drawing-source UI has no named editable PDM master-data fields"
);
assertIncludes(
  "DRS-QC-006",
  workbench,
  [
    "resolveDrawingSubmissionContext",
    "createDrawingSourceSubmission",
    "selectedAttachmentIds",
    "validateSubmissionInput",
    'sourceEntityType: "drawing_number"',
    "sourceMasterAttachmentId: attachment.id"
  ],
  "server-side workbench derives submission from drawing context and source attachments"
);
assertIncludes(
  "DRS-QC-007",
  workbench,
  [
    "WHERE d.company_id = :companyId",
    "WHERE linked_entity_type = 'drawing_number'",
    "AND linked_entity_id = :drawingNumberId",
    "duplicate_active_submission"
  ],
  "resolver enforces company-scoped drawing lookup, drawing-owned attachment lookup, and duplicate prevention"
);
assertIncludes(
  "DRS-QC-008",
  contextRoute,
  ["requireNumberingPageAsync", "numbering.drawings.view", "resolveDrawingSubmissionContext"],
  "submission context API is protected by drawing view permission"
);
assertIncludes(
  "DRS-QC-009",
  createRoute,
  ["requireRoleAsync", "selectedAttachmentIds", "note", "createDrawingSourceSubmission"],
  "submission create API accepts only review-package fields"
);
assertNotIncludes(
  "DRS-QC-010",
  createRoute,
  [
    "body.drawing_number",
    "body.part_number",
    "body.part_name",
    "body.revision",
    "body.material",
    "body.surface_finish",
    "body.document_type",
    'body["drawing_number"]',
    'body["part_number"]',
    'body["part_name"]'
  ],
  "submission create API does not parse client-supplied PDM master-data fields"
);
assertIncludes(
  "DRS-QC-011",
  asyncWriter,
  ["source_entity_type", "source_entity_id", "source_master_attachment_id"],
  "submission writer records drawing and source attachment traceability when provided"
);
assertIncludes(
  "DRS-QC-012",
  schema + db,
  ["source_entity_type", "source_entity_id", "source_master_attachment_id"],
  "schema and local schema guard contain additive traceability columns"
);
assertIncludes(
  "DRS-QC-013",
  uploadPage,
  ["RetiredGenericUploadPage", "上傳送審已退役"],
  "generic upload page is retired for formal submission creation"
);

for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"} ${check.id} ${check.message}`);
}

const failures = checks.filter((check) => !check.ok);
if (failures.length > 0) {
  console.error(`\n${failures.length} drawing-source submission QC check(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} drawing-source submission QC checks passed.`);
