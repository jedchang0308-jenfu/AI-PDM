import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function pass(id, message) {
  checks.push({ id, ok: true, message });
}

function fail(id, message) {
  checks.push({ id, ok: false, message });
}

function assertFile(id, relativePath, message) {
  if (exists(relativePath)) pass(id, message);
  else fail(id, `${message}; missing file: ${relativePath}`);
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

function extractStatement(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) return "";
  const end = source.indexOf(";", start);
  return end >= 0 ? source.slice(start, end + 1) : source.slice(start);
}

const packageJson = JSON.parse(read("package.json"));
const spec = read(".ai-doc/specs/SPEC-PDM-DRAWING-SUBMISSION-WORKBENCH-002-release-recovery.md");
const qa = read(".ai-doc/qa/qa-pdm-drawing-submission-workbench-recovery-validation-plan-2026-07-02.md");
const schema = read("db/schema.sql");
const db = read("src/lib/db.ts");
const types = read("src/lib/types.ts");
const asyncProvider = read("src/lib/db-async-provider.ts");
const dbProviderContractQc = read("scripts/qc-db-provider-contract-test.mjs");
const dbProviderPostgresQc = read("scripts/qc-db-provider-postgres.mjs");
const workbench = read("src/lib/drawing-submission-workbench.ts");
const asyncWriter = read("src/lib/repositories/submission-write-async-repository.ts");
const asyncStatusRepository = read("src/lib/repositories/submission-status-async-repository.ts");
const uploadPage = read("src/app/upload/page.tsx");
const submissionDetailPage = read("src/app/submissions/[id]/page.tsx");
const drawingPage = read("src/app/numbering/drawings/page.tsx");
const searchPage = read("src/app/numbering/search/page.tsx");
const workbenchRoute = read("src/app/api/numbering/drawings/[drawingNumber]/submission-workbench/route.ts");
const contextRoute = read("src/app/api/numbering/drawings/[drawingNumber]/submission-context/route.ts");
const createRoute = read("src/app/api/numbering/drawings/[drawingNumber]/submissions/route.ts");
const cancelRoute = read("src/app/api/submissions/[id]/cancel/route.ts");
const retryRoute = read("src/app/api/submissions/[id]/retry-release/route.ts");
const returnRoute = read("src/app/api/submissions/[id]/return-for-correction/route.ts");
const approveRoute = read("src/app/api/submissions/[id]/approve/route.ts");
const releaseWorkflow = read("src/lib/submission-release-workflow.ts");
const dashboard = read("src/components/dashboard.tsx");
const adaptiveTaskFeed = read("src/lib/adaptive-task-feed.ts");
const notificationAsync = read("src/lib/repositories/notification-async-repository.ts");
const notificationSync = read("src/lib/repositories/notification-repository.ts");

assertIncludes(
  "DSW-QC-001",
  JSON.stringify(packageJson.scripts ?? {}),
  ['"qc:pdm-drawing-submission-workbench-recovery":"node scripts/qc-pdm-drawing-submission-workbench-recovery.mjs"'],
  "focused QC command is exposed through package.json"
);

assertIncludes(
  "DSW-QC-002",
  spec + qa,
  [
    "release_incomplete_conflict",
    "same_revision_in_progress",
    "obsolete_revision_locked",
    "transaction-boundary candidate",
    "Phase 2 and Phase 3 are `RD Contract Ready`, not `RD Implementation Ready`",
    "Production deploy, production migration, direct DB cleanup, historical data repair and data deletion are not authorized"
  ],
  "spec and QA document the Phase 1 lifecycle matrix, transaction gate, and authorization boundary"
);

[
  "src/app/drawings/[drawingNumber]/submission-workbench/page.tsx",
  "src/app/api/numbering/drawings/[drawingNumber]/submission-workbench/route.ts",
  "src/app/api/submissions/[id]/cancel/route.ts",
  "src/app/api/submissions/[id]/retry-release/route.ts",
  "src/app/api/submissions/[id]/return-for-correction/route.ts",
  "src/app/submissions/[id]/page.tsx"
].forEach((relativePath, index) => {
  assertFile(`DSW-QC-003${String.fromCharCode(65 + index)}`, relativePath, `Phase 1 route surface exists: ${relativePath}`);
});

const schemaBlockingIndex = extractStatement(schema, "CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_blocking_same_revision_unique");
const dbBlockingIndex = extractStatement(db, "CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_blocking_same_revision_unique");
assertIncludes(
  "DSW-QC-004",
  schema + db + types,
  [
    "Cancelled",
    "returned_for_correction_at",
    "returned_for_correction_by",
    "returned_for_correction_reason",
    "corrects_submission_id",
    "resolved_by_submission_id",
    "idx_submissions_release_failed_resolution",
    "idx_submissions_corrects_submission"
  ],
  "schema, runtime schema guard, and types include additive cancellation/release-recovery fields"
);
assertIncludes(
  "DSW-QC-005",
  schemaBlockingIndex + dbBlockingIndex,
  ["WHERE status IN ('Pending', 'Releasing', 'Released', 'Obsolete')"],
  "blocking same-revision DB uniqueness covers active/formal states"
);
assertNotIncludes(
  "DSW-QC-006",
  schemaBlockingIndex + dbBlockingIndex,
  ["ReleaseFailed", "Cancelled", "Rejected"],
  "blocking same-revision unique index excludes ReleaseFailed, Cancelled and Rejected so recovery can create a linked Pending correction"
);

assertIncludes(
  "DSW-QC-007",
  asyncProvider,
  [
    "const state = this.database as SqliteDatabase & { inTransaction?: boolean }",
    "this.database.exec(\"BEGIN\")",
    "return await fn(this);",
    "this.database.exec(\"COMMIT\")",
    "this.database.exec(\"ROLLBACK\")",
    "class PostgresTransactionClient"
  ],
  "async DB provider has awaited SQLite transaction boundaries and active transaction reuse"
);
assertIncludes(
  "DSW-QC-008",
  dbProviderContractQc + dbProviderPostgresQc,
  [
    "SQLite async transaction supports awaited callbacks",
    "Postgres transaction client reuses active transaction",
    "PG-PROVIDER-007 transaction client reuses active transaction"
  ],
  "DB provider QC scripts validate the transaction-boundary candidate"
);

assertIncludes(
  "DSW-QC-009",
  asyncWriter,
  [
    "status IN ('Pending', 'Releasing', 'Released', 'Obsolete')",
    "OR (status = 'ReleaseFailed' AND resolved_by_submission_id IS NULL)",
    "corrects_submission_id",
    "correctsSubmissionId",
    "await this.client.transaction(create);"
  ],
  "submission writer blocks unresolved same-revision conflicts at service level and creates records transactionally"
);

assertIncludes(
  "DSW-QC-010",
  workbench,
  [
    "sameRevisionRecords",
    "nonBlockingHistory",
    "release_incomplete_conflict",
    "released_revision_exists",
    "obsolete_revision_locked",
    "發行未完成：此圖號版次已通過審核，但尚未完成發行，需要主管或 Admin 處理。",
    "曾有未完成送審，不影響本次送審。",
    "發行未完成，已由新版送審處理完成。",
    "row.status === \"ReleaseFailed\" && Boolean(row.resolved_by_submission_id || row.resolved_at)"
  ],
  "workbench classifies same-revision records by lifecycle state and exposes non-blocking history"
);

assertIncludes(
  "DSW-QC-011",
  workbench,
  [
    "returnReleaseFailedSubmissionForCorrectionAsync",
    "source.status !== \"ReleaseFailed\"",
    "release_incomplete_already_resolved",
    "release_incomplete_correction_exists",
    "correctsSubmissionId: source.id",
    "client.transaction(async (transactionClient)",
    "new AsyncSubmissionWriteRepository(transactionClient).createSubmissionRecord(correctionInput)",
    "returned_for_correction_at",
    "resolved_by_submission_id IS NULL"
  ],
  "return-for-correction creates linked Pending correction and old failed-submission relation inside a transaction candidate"
);

assertIncludes(
  "DSW-QC-012",
  releaseWorkflow + approveRoute + retryRoute + asyncStatusRepository,
  [
    "executeSubmissionReleaseWorkflowAsync",
    "markSubmissionReleasedAndObsoletePreviousAsync",
    "MARK_ASYNC_CORRECTED_RELEASE_FAILED_RESOLVED_SQL",
    "corrects_submission_id",
    "resolved_by_submission_id",
    "await this.client.transaction(applyLifecycle);",
    "ReleaseFailed",
    "release_incomplete.retry_requested",
    "重新發行失敗，此送審仍是發行未完成"
  ],
  "approve/retry release flow shares release workflow and transactionally resolves corrected ReleaseFailed records"
);

assertIncludes(
  "DSW-QC-013",
  cancelRoute + retryRoute + returnRoute,
  [
    "requireRoleAsync(request, [\"R&D Manager\", \"Admin\"])",
    "submission.submitted_by === auth.user.id || auth.user.role === \"R&D Manager\" || auth.user.role === \"Admin\"",
    "你目前不能取消這筆送審，請由送審建立者、主管或 Admin 處理。",
    "只有待審核中的送審可以取消。",
    "只有發行未完成的送審可以重新發行。",
    "退回修正建立失敗，請重新整理後再試或通知管理員。"
  ],
  "recovery routes enforce submitter/manager/admin boundaries and use Chinese recovery messages"
);

assertIncludes(
  "DSW-QC-014",
  workbenchRoute + contextRoute + createRoute + returnRoute,
  [
    "圖面送審工作台讀取失敗，請重新整理或通知管理員。",
    "圖面送審資料讀取失敗，請重新整理或通知管理員。",
    "送審建立失敗，請稍後重試或通知管理員。",
    "退回修正建立失敗，請重新整理後再試或通知管理員。"
  ],
  "normal API generic failures are shielded with human Chinese messages"
);
assertNotIncludes(
  "DSW-QC-015",
  workbenchRoute + contextRoute + createRoute + returnRoute,
  ["message: error instanceof Error", "message: message", "message }, { status: 500 }"],
  "normal API generic failure paths do not return raw exception messages"
);

assertIncludes(
  "DSW-QC-016",
  drawingPage + searchPage,
  [
    "/drawings/",
    "encodeURIComponent",
    "/submission-workbench"
  ],
  "圖號 and 圖料 module entry points target canonical drawing submission workbench"
);
assertNotIncludes(
  "DSW-QC-017",
  drawingPage + searchPage,
  ["/upload?source=drawing"],
  "module submission CTAs do not use generic upload as primary flow"
);

assertIncludes(
  "DSW-QC-018",
  uploadPage,
  [
    "sameRevisionRecords",
    "nonBlockingHistory",
    "same_revision_in_progress",
    "release_incomplete_conflict",
    "obsolete_revision_locked",
    "UNIQUE constraint failed",
    "Internal Server Error",
    "此圖號版次已有相關送審紀錄，請依提示查看既有送審、處理發行未完成或改用新版次。",
    "圖面送審處理失敗，請重新整理後再試或通知管理員。"
  ],
  "compatibility upload workbench renders same-revision states and maps technical errors to Chinese text"
);

assertIncludes(
  "DSW-QC-019",
  submissionDetailPage,
  [
    "ReleaseFailed: \"發行未完成\"",
    "Cancelled: \"已取消\"",
    "重新發行",
    "退回修正",
    "取消送審",
    "這筆發行未完成已由後續送審處理完成，不會再阻擋同版次工作。"
  ],
  "submission detail page exposes user-facing recovery labels and resolved ReleaseFailed guidance"
);

assertIncludes(
  "DSW-QC-020",
  dashboard + adaptiveTaskFeed + notificationAsync + notificationSync,
  [
    "ReleaseFailed",
    "resolved_by_submission_id",
    "發行未完成"
  ],
  "dashboard, task feed and notifications understand ReleaseFailed and resolution de-noising fields"
);
assertIncludes(
  "DSW-QC-021",
  adaptiveTaskFeed + dashboard,
  ["!submission.resolved_by_submission_id", "status === \"ReleaseFailed\" && !submission.resolved_by_submission_id"],
  "main dashboard/task surfaces exclude resolved ReleaseFailed from active action counts"
);

assertIncludes(
  "DSW-QC-022",
  approveRoute,
  [
    "getDuplicateActiveSubmissionConflictForReviewAsync",
    "submission.review.blocked_duplicate_active",
    "message: duplicateConflict.message"
  ],
  "reviewer-side duplicate guard remains active after same-revision lifecycle refinement"
);

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  console.log(`${check.ok ? "PASS" : "FAIL"} ${check.id}: ${check.message}`);
}

if (failed.length > 0) {
  console.error(`PDM drawing submission workbench recovery QC failed: ${failed.length}/${checks.length}`);
  process.exit(1);
}

console.log(`PDM drawing submission workbench recovery QC passed: ${checks.length}/${checks.length}`);
