import fs from "node:fs";
import path from "node:path";

// Historical drawing-source data/compatibility check. Principal-only release
// evidence comes from DEV-121 route policy, resource and Production L4 checks.

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

function record(id, ok, message) {
  if (ok) pass(id, message);
  else fail(id, message);
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
const directDrawingSubmissionPage = read("src/app/drawings/[drawingNumber]/submission-workbench/page.tsx");
const uploadLayout = read("src/app/upload/layout.tsx");
const workbench = read("src/lib/drawing-submission-workbench.ts");
const contextRoute = read("src/app/api/numbering/drawings/[drawingNumber]/submission-context/route.ts");
const createRoute = read("src/app/api/numbering/drawings/[drawingNumber]/submissions/route.ts");
const asyncWriter = read("src/lib/repositories/submission-write-async-repository.ts");
const schema = read("db/schema.sql");
const db = read("src/lib/db.ts");

record("DRS-QC-001",
  drawingPage.includes('CanonicalPdmWorkbench entityType="drawing"') &&
    !drawingPage.includes("/submission-workbench"),
  "current drawing entry uses the canonical Principal workbench, not the old submission CTA");
assertNotIncludes(
  "DRS-QC-002",
  drawingPage,
  ['href="/upload"', "/upload?source=drawing"],
  "drawing detail no longer links send-review to generic upload"
);
assertIncludes(
  "DRS-QC-003",
  uploadPage + uploadLayout,
  ["DrawingSourceSubmissionWorkbench", 'routeState.source === "drawing"', "GenericUploadPage", "void children"],
  "historical upload source remains available for fixtures but the live layout does not mount it"
);
assertIncludes(
  "DRS-QC-004",
  uploadPage,
  ["送審來源：", "主資料只讀", "送審備註", "selectedAttachmentIds"],
  "drawing-source UI exposes source banner, read-only context, attachment selection, and note"
);
record("DRS-QC-004B",
  [controlledDrawingSubmissionPage, directDrawingSubmissionPage].every((source) =>
    source.includes("/numbering/drawings?query=") && source.includes("redirect(") &&
    !source.includes("DrawingSourceSubmissionWorkbench")),
  "both direct historical submission pages route to the canonical drawing search");
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
  ["withPrincipalNumberingCompanyRead", "numbering.drawings.view", "resolveDrawingSubmissionContext"],
  "historical context read has a Principal drawing-view guard and company scope"
);
assertIncludes(
  "DRS-QC-009",
  createRoute,
  ["requirePdmRouteAuthorizationAsync", "selectedAttachmentIds", "note", "createDrawingSourceSubmission"],
  "historical create route still enters the legacy guard; Platform-mode rejection is verified separately"
);
record("DRS-QC-010",
  !/\bbody\.(?:drawing_number|part_number|part_name|revision|material|surface_finish|document_type)\b/u.test(createRoute) &&
    !/\bbody\[(?:"|')(?:drawing_number|part_number|part_name|revision|material|surface_finish|document_type)(?:"|')\]/u.test(createRoute),
  "historical create route does not parse client-supplied PDM master-data fields");
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
