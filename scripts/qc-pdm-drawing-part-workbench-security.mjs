import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertContains(relativePath, expected, label) {
  const content = read(relativePath);
  if (!content.includes(expected)) {
    failures.push(`${label}: ${relativePath} missing ${JSON.stringify(expected)}`);
  }
}

function assertNotContains(relativePath, unexpected, label) {
  const content = read(relativePath);
  if (content.includes(unexpected)) {
    failures.push(`${label}: ${relativePath} still contains ${JSON.stringify(unexpected)}`);
  }
}

function assertFile(relativePath, label) {
  if (!fs.existsSync(path.join(root, relativePath))) {
    failures.push(`${label}: ${relativePath} does not exist`);
  }
}

assertContains("db/schema.sql", "CREATE TABLE IF NOT EXISTS submission_snapshots", "snapshot table");
assertContains("db/schema.sql", "CREATE TABLE IF NOT EXISTS submission_attempts", "attempt audit table");
assertContains("db/schema.sql", "UNIQUE (company_id, actor_id, idempotency_key)", "attempt idempotency uniqueness");
assertContains("db/schema.sql", "UNIQUE (submission_id, file_role, original_filename)", "duplicate filename DB guard");

assertContains("src/lib/db.ts", "ensureSubmissionSnapshotAndAttemptSchema", "runtime schema migration");
assertContains("src/lib/repositories/submission-write-async-repository.ts", "submission.snapshot.created", "snapshot audit trail");
assertContains("src/lib/repositories/submission-write-async-repository.ts", "canonicalJsonStringify", "canonical snapshot hash");

assertContains("src/lib/drawing-submission-workbench.ts", "idempotencyKey", "controlled submission idempotency");
assertContains("src/lib/drawing-submission-workbench.ts", "upsertSubmissionAttempt", "attempt audit writes");
assertContains("src/lib/drawing-submission-workbench.ts", "findDuplicateAttachmentFilename", "preflight duplicate filename guard");
assertContains("src/lib/drawing-submission-workbench.ts", "送審附件中有重複檔名", "human duplicate filename error");
assertContains("src/lib/drawing-submission-workbench.ts", "resolveRootSubmissionReadiness", "root readiness API service");
assertContains("src/lib/drawing-submission-workbench.ts", "multiple_primary_drawings", "ambiguous primary drawing blocker");
assertContains("src/lib/drawing-submission-workbench.ts", "multiple_primary_parts", "ambiguous primary part blocker");

assertContains(
  "src/app/api/numbering/drawings/[drawingNumber]/submissions/route.ts",
  "idempotencyKey: String(body.idempotencyKey ?? \"\")",
  "drawing submission API idempotency payload"
);
assertContains("src/app/api/submissions/route.ts", "GENERIC_SUBMISSION_RETIRED", "generic submission POST retired");
assertContains("src/app/api/submissions/route.ts", "status: 410", "generic submission retired status");

assertFile("src/app/api/numbering/roots/[rootCode]/submission-readiness/route.ts", "root readiness route");
assertFile("src/app/api/numbering/drawings/[drawingNumber]/submission-readiness/route.ts", "drawing readiness route");
assertFile("src/app/numbering/submissions/drawings/[drawingNumber]/page.tsx", "controlled drawing submission page");
assertContains("src/app/upload/page.tsx", "RetiredGenericUploadPage", "generic upload page retired UX");
assertContains("src/app/numbering/drawings/page.tsx", "/submission-workbench", "drawing module canonical submission workbench link");
assertNotContains("src/app/numbering/drawings/page.tsx", "/upload?source=drawing", "drawing module must not link generic upload");

if (failures.length > 0) {
  console.error("PDM drawing-part workbench security QC failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PDM drawing-part workbench security QC passed.");
