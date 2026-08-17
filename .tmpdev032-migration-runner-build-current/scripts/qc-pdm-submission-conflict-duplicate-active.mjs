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

const packageJson = read("package.json");
const spec = read(".ai-doc/specs/SPEC-PDM-SUBMISSION-CONFLICT-001-duplicate-active-submission.md");
const qa = read(".ai-doc/qa/qa-pdm-submission-conflict-duplicate-active-validation-plan-2026-07-02.md");
const workbench = read("src/lib/drawing-submission-workbench.ts");
const createRoute = read("src/app/api/numbering/drawings/[drawingNumber]/submissions/route.ts");
const uploadPage = read("src/app/upload/page.tsx");
const approveRoute = read("src/app/api/submissions/[id]/approve/route.ts");
const dashboard = read("src/components/dashboard.tsx");
const submissionDetailPage = read("src/app/submissions/[id]/page.tsx");
const submissionRecoverySummaryRoute = read("src/app/api/submissions/[id]/recovery-summary/route.ts");

assertIncludes(
  "PSC-QC-001",
  packageJson,
  ['"qc:pdm-submission-conflict-duplicate-active": "node scripts/qc-pdm-submission-conflict-duplicate-active.mjs"'],
  "focused QC command is exposed through npm script"
);

assertIncludes(
  "PSC-QC-002",
  spec + qa,
  [
    "duplicate_active_submission",
    "submission_conflict",
    "must not be classified",
    "Raw `UNIQUE constraint failed`"
  ],
  "spec and QA plan capture duplicate conflict classification and raw DB shielding"
);

assertIncludes(
  "PSC-QC-003",
  workbench,
  [
    "export type DrawingSubmissionBlockerGroup",
    'return "submission_conflict";',
    "existingSubmission?: ExistingSubmissionSummary",
    "existingSubmissionRecoveryHref",
    "makeDuplicateSubmissionBlocker",
    "findBlockingSubmissionByDrawingRevision"
  ],
  "workbench has grouped blocker contract and existing submission summary"
);

assertIncludes(
  "PSC-QC-004",
  workbench,
  [
    "existingAttempt?.status === \"created\"",
    "findBlockingSubmissionByDrawingRevision(client",
    "blockerPayload: buildBlockedAttemptPayload",
    "errorCode: blocker.code",
    "group: blocker.group"
  ],
  "submit service preserves idempotent replay and blocks duplicate revision with structured audit"
);

assertIncludes(
  "PSC-QC-005",
  workbench,
  [
    "isSubmissionRevisionUniqueError",
    "removeSubmissionUploadFolder(submissionFolderName)",
    "throw new DrawingSubmissionWorkbenchError(blocker.code, blocker.message, 409"
  ],
  "DB uniqueness race fallback is converted to domain conflict after cleanup"
);

assertIncludes(
  "PSC-QC-006",
  createRoute,
  [
    "group: error.options.group",
    "existingSubmission: error.options.existingSubmission",
    'error: "duplicate_active_submission"',
    'group: "submission_conflict"',
    'recoveryHref: "/"',
    "送審建立失敗，請稍後重試或通知管理員。"
  ],
  "drawing submission API returns grouped Chinese domain errors and shields generic 500 raw message"
);

assertNotIncludes(
  "PSC-QC-007",
  createRoute,
  ["message }, { status: 500 }", "message: message"],
  "drawing submission API does not return raw exception message in generic 500 path"
);

assertIncludes(
  "PSC-QC-008",
  uploadPage,
  [
    "DrawingSubmissionBlockerGroup",
    "groupDrawingSubmissionBlockers",
    "drawingSubmissionBlockerGroupMeta",
    "同版次送審需處理",
    "此圖號版次正在送審或發行中",
    "主資料尚未完成",
    "附件選取需修正",
    "userFacingDrawingSubmissionError(body.message ?? body.code ?? body.error"
  ],
  "drawing-source UI groups blockers and maps duplicate conflict to Chinese recovery"
);

assertIncludes(
  "PSC-QC-009",
  approveRoute + workbench,
  [
    "getDuplicateActiveSubmissionConflictForReviewAsync",
    "submission.review.blocked_duplicate_active",
    "duplicateActiveReviewMessage",
    "activeSubmissions"
  ],
  "reviewer approval route blocks legacy duplicate active conflicts and records audit"
);

assertIncludes(
  "PSC-QC-010",
  dashboard,
  ["alert(body.message ?? body.error ?? \"操作失敗\")"],
  "reviewer UI action prefers human Chinese message over internal error code"
);

assertIncludes(
  "PSC-QC-011",
  workbench + submissionDetailPage,
  [
    "existingSubmissionRecoveryHref(existingSubmission)",
    "`/submissions/${encodeURIComponent(existingSubmission.submissionId)}`",
    "送審明細",
    "送審附件"
  ],
  "duplicate conflict recovery opens the exact existing submission detail page instead of a dashboard or numbering task list"
);

assertNotIncludes(
  "PSC-QC-012",
  workbench + createRoute,
  ['recoveryHref: "/numbering/tasks"', "`/?submissionId=${encodeURIComponent(existingSubmission.submissionId)}`"],
  "duplicate conflict recovery must not route to numbering tasks or generic dashboard"
);

assertIncludes(
  "PSC-QC-013",
  submissionDetailPage + submissionRecoverySummaryRoute,
  [
    "fetch(`/api/submissions/${encodeURIComponent(submissionId)}`)",
    "recovery-summary",
    "RestrictedSubmissionView",
    "只能查看受限摘要",
    "submission.drawing_number",
    "submission.part_number",
    "submission.revision",
    "submission.files.map",
    "canReadSubmissionCompanySummary"
  ],
  "single submission detail page renders the target submission identity, attachments, and restricted same-company recovery summary"
);

assertNotIncludes(
  "PSC-QC-014",
  submissionDetailPage,
  ["Insufficient role permission</p>", "body.error ?? \"讀取送審資料失敗\""],
  "single submission detail page must not expose raw English permission errors"
);

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"} ${check.id}: ${check.message}`);
}

if (failed.length > 0) {
  console.error(`PDM duplicate active submission conflict QC failed: ${failed.length}/${checks.length}`);
  process.exit(1);
}

console.log(`PDM duplicate active submission conflict QC passed: ${checks.length}/${checks.length}`);
