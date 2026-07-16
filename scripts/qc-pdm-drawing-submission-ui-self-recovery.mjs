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
  if (missing.length === 0) pass(id, message);
  else fail(id, `${message}; missing: ${missing.join(", ")}`);
}

function assertNotIncludes(id, source, needles, message) {
  const present = needles.filter((needle) => source.includes(needle));
  if (present.length === 0) pass(id, message);
  else fail(id, `${message}; present: ${present.join(", ")}`);
}

const packageJson = JSON.parse(read("package.json"));
const uploadPage = read("src/app/upload/page.tsx");
const workbench = read("src/lib/drawing-submission-workbench.ts");
const returnRoute = read("src/app/api/submissions/[id]/return-for-correction/route.ts");
const statusRepository = read("src/lib/repositories/submission-status-async-repository.ts");
const submissionDetailPage = read("src/app/submissions/[id]/page.tsx");
const devTask = read(".ai-doc/dev_task.md");
const spec = read(".ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-003-ui-self-recovery.md");

assertIncludes(
  "DSU-QC-001",
  JSON.stringify(packageJson.scripts ?? {}),
  ['"qc:pdm-drawing-submission-ui-self-recovery":"node scripts/qc-pdm-drawing-submission-ui-self-recovery.mjs"'],
  "focused UI self-recovery QC command is exposed through package.json"
);

assertIncludes(
  "DSU-QC-002",
  devTask + spec,
  [
    "DEV-PDM-DRAWING-SUBMISSION-WORKBENCH-003",
    "Attachment organizer",
    "Return-for-correction with explicit selected attachment IDs",
    "Normal UI does not show `DUPLICATE_RELEASE_FILENAME`"
  ],
  "development task and spec preserve the UI self-recovery contract"
);

assertIncludes(
  "DSU-QC-003",
  uploadPage,
  [
    "送審附件整理",
    "uploadDrawingAttachment",
    "deleteDrawingAttachment",
    "補上附件",
    "加入附件庫",
    "附件整理已鎖定"
  ],
  "drawing submission workbench exposes attachment organizer and locked-state copy"
);

assertIncludes(
  "DSU-QC-004",
  uploadPage,
  [
    "canManageDrawingAttachments",
    "isSubmissionInputLocked",
    "hasSubmissionConflict",
    "hasStateOrPermissionBlocker",
    "此版次不可送審",
    "建立修正送審"
  ],
  "UI distinguishes normal submission, release-incomplete correction and locked formal states"
);

assertIncludes(
  "DSU-QC-005",
  uploadPage,
  [
    "releaseIncompleteSummary",
    "DUPLICATE_RELEASE_FILENAME:",
    'replace(/\\brev\\b/gi, "版次")',
    "發行未完成，需要先修正附件再重新送審。",
    "此檔名已被正式紀錄"
  ],
  "technical release-failure details are converted to human Chinese UI language"
);

assertNotIncludes(
  "DSU-QC-006",
  uploadPage,
  ["UNIQUE constraint failed:", "Internal Server Error</", "stack trace"],
  "normal UI source does not contain raw SQL/stack-error rendering"
);

assertIncludes(
  "DSU-QC-007",
  workbench,
  [
    "release_filename_conflict",
    "releaseConflict",
    "enrichAttachmentsWithReleaseConflicts",
    "findReleasedFilenameConflictForAttachmentRows",
    "releaseFilenameConflictMessage"
  ],
  "server-side workbench exposes released-filename preflight for UI and submit-time enforcement"
);

assertIncludes(
  "DSU-QC-008",
  workbench,
  [
    "selectedAttachmentIds",
    "buildReleaseFailedCorrectionFilesFromCurrentAttachments",
    "requestedAttachmentIds",
    "sourceMasterAttachmentId: row.id",
    "correctsSubmissionId: source.id"
  ],
  "correction submission uses explicit current drawing attachment selection instead of blind failed-file copy"
);

assertIncludes(
  "DSU-QC-009",
  returnRoute,
  [
    "selectedAttachmentIds",
    "Array.isArray(body.selectedAttachmentIds)",
    "returnReleaseFailedSubmissionForCorrectionAsync"
  ],
  "return-for-correction API accepts explicit selected attachment IDs"
);

assertIncludes(
  "DSU-QC-010",
  statusRepository,
  [
    "SELECT_ASYNC_RELATED_RELEASE_FAILED_SUBMISSIONS_SQL",
    "MARK_ASYNC_CORRECTED_RELEASE_FAILED_RESOLVED_SQL",
    "ReleaseFailedResolvedByCorrection",
    "resolved_release_failed_count"
  ],
  "successful correction release resolves related unresolved ReleaseFailed records"
);

assertIncludes(
  "DSU-QC-011",
  submissionDetailPage,
  [
    "到工作台修正附件",
    "若是暫時性發布失敗可重新發行",
    "若是附件或檔名問題，請到工作台修正附件後建立新的送審"
  ],
  "submission detail sends attachment-related release failures back to the workbench"
);

for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"} ${check.id}: ${check.message}`);
}

const failures = checks.filter((check) => !check.ok);
if (failures.length > 0) {
  console.error(`PDM drawing submission UI self-recovery QC failed: ${failures.length}/${checks.length}`);
  process.exit(1);
}

console.log(`PDM drawing submission UI self-recovery QC passed: ${checks.length}/${checks.length}`);
