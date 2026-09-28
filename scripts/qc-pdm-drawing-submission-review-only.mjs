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
const canonicalDrawingWorkspace = read("src/components/canonical-drawing-change-workspace.tsx");
const principalSubmitRoute = read("src/app/api/pdm/drawing-revision-works/[workId]/submit/route.ts");
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
  ["void children", "NumberStateLegacyRoute", "destination"],
  "legacy upload layout renders only the canonical object-entry redirect"
);
assertIncludes(
  "DRS-QC-004",
  canonicalDrawingWorkspace + principalSubmitRoute,
  ["送出審核", "drawing-revision-works", "withPrincipalDev087Route", "submitPrincipal"],
  "current drawing work uses the Principal submit command"
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
  ["DRAWING_SOURCE_SUBMISSION_RETIRED", "status: 410", "/numbering/drawings"],
  "historical context read is retired with a canonical recovery target"
);
assertIncludes(
  "DRS-QC-009",
  createRoute,
  ["DRAWING_SOURCE_SUBMISSION_RETIRED", "status: 410", "/numbering/drawings"],
  "historical create route cannot enter a legacy authorization or writer path"
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
  uploadPage + uploadLayout,
  ["return null", "上傳送審已改由物件進入"],
  "legacy upload page cannot mount a submit UI"
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
