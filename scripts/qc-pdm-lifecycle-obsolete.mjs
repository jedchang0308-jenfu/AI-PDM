#!/usr/bin/env node

import { projectFileExists, readProjectFile } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const checks = [];

function assert(condition, message, detail = "") {
  checks.push({ message, passed: Boolean(condition), detail });
  if (!condition) throw new Error(`${message}${detail ? `: ${detail}` : ""}`);
}

function source(relativePath) {
  assert(projectFileExists(root, relativePath), `Required file exists: ${relativePath}`);
  return readProjectFile(root, relativePath);
}

const policy = source("src/lib/pdm-lifecycle-policy.ts");
const numberingRepository = source("src/lib/repositories/numbering-repository.ts");
const asyncRepository = source("src/lib/repositories/numbering-async-repository.ts");
const asyncFacade = source("src/lib/numbering-async.ts");
const obsoleteRoute = source("src/app/api/lifecycle/obsolete-requests/route.ts");
const approvalRequestsRoute = source("src/app/api/numbering/approval-requests/route.ts");
const approvalBatchesRoute = source("src/app/api/numbering/approval-batches/route.ts");
const approvalsPage = source("src/app/numbering/approvals/page.tsx");
const bomRepository = source("src/lib/repositories/bom-workbench-async-repository.ts");
const bomFacade = source("src/lib/bom-workbench-async.ts");
const bomObsoleteRoute = source("src/app/api/bom/drafts/[draftId]/obsolete-request/route.ts");
const bomReviewsPage = source("src/app/bom/reviews/page.tsx");
const bomWorkbenchPage = source("src/app/bom/workbench/page.tsx");
const dashboardPage = source("src/components/dashboard.tsx");
const submissionRepository = source("src/lib/repositories/submission-lifecycle-async-repository.ts");
const submissionFacade = source("src/lib/submission-lifecycle-async.ts");
const submissionObsoleteRoute = source("src/app/api/submissions/[id]/obsolete-request/route.ts");
const submissionObsoleteApproveRoute = source("src/app/api/submission-lifecycle-requests/[requestId]/approve/route.ts");
const submissionObsoleteRejectRoute = source("src/app/api/submission-lifecycle-requests/[requestId]/reject/route.ts");
const dbSchema = source("db/schema.sql");
const postgresInitialSchema = source("db/postgres/001_initial_schema.sql");

for (const entityType of ['"numbering_part_number"', '"numbering_drawing_number"']) {
  assert(policy.includes(entityType), `Formal lifecycle policy supports ${entityType}`);
}
assert(policy.includes("buildNumberingFormalRecordLifecyclePolicy"), "Formal numbering lifecycle policy builder exists");
assert(policy.includes("pendingObsoleteRequest"), "Formal policy has pending obsolete review state");
assert(policy.includes('"controlled_history"'), "Obsolete formal records use controlled history surface");
assert(policy.includes("LIFE_FORMAL_DELETE_BLOCKED"), "Formal records block direct delete");
assert(policy.includes("LIFE_OBSOLETE_ALREADY_REQUESTED"), "Formal policy blocks duplicate obsolete request");
assert(policy.includes("LIFE_OBSOLETE_ALREADY_APPROVED"), "Formal policy blocks already obsolete records");
assert(policy.includes("LIFE_OBSOLETE_NOT_FORMAL"), "Formal policy rejects draft/review records");

for (const actionCode of ['"obsolete_part_number"', '"obsolete_ma_drawing"']) {
  assert(numberingRepository.includes(actionCode), `Sync repository action code exists: ${actionCode}`);
  assert(asyncRepository.includes(actionCode), `Async repository action code exists: ${actionCode}`);
  assert(obsoleteRoute.includes(actionCode.replaceAll('"', "")), `Lifecycle obsolete API maps ${actionCode}`);
  assert(approvalRequestsRoute.includes(actionCode.replaceAll('"', "")), `Approval request API allowlists ${actionCode}`);
  assert(approvalBatchesRoute.includes(actionCode.replaceAll('"', "")), `Approval batch API lists ${actionCode}`);
}

assert(numberingRepository.includes("RequestNumberingObsoleteApprovalInput"), "Obsolete approval input type is exported");
assert(numberingRepository.includes("NumberingObsoleteApprovalResult"), "Obsolete approval result type is exported");
assert(asyncRepository.includes("requestNumberingObsoleteApproval"), "Async repository exposes obsolete approval request service");
assert(asyncFacade.includes("requestNumberingObsoleteApprovalAsync"), "Async facade exposes obsolete approval request service");
assert(asyncRepository.includes("SELECT_ASYNC_PENDING_OBSOLETE_APPROVAL_SQL"), "Duplicate pending obsolete request is blocked");
assert(asyncRepository.includes("createNumberingApprovalBatchInClient"), "Obsolete request creates an approval batch immediately");
assert(asyncRepository.includes("UPDATE_ASYNC_APPROVAL_OBSOLETE_PART_SQL"), "Approved part obsolete mutates part status");
assert(asyncRepository.includes("UPDATE_ASYNC_MAIN_DRAWING_OBSOLETE_SQL"), "Approved drawing obsolete mutates drawing status");
assert(asyncRepository.includes("UPDATE_ASYNC_PART_MAIN_DRAWING_INVALID_SQL"), "Approved MA drawing obsolete invalidates impacted parts");
assert(asyncRepository.includes("markRootClosedIfNoOpenParts"), "Approved part obsolete closes root only when no open parts remain");
assert(asyncRepository.includes("lifecycle.obsolete.approved"), "Approved obsolete action writes lifecycle audit");
assert(asyncRepository.includes("previousRecordStatus") && asyncRepository.includes("newRecordStatus"), "Obsolete audit keeps before/after status evidence");

assert(obsoleteRoute.includes("requireNumberingActionAsync"), "Lifecycle obsolete API enforces action permission");
assert(obsoleteRoute.includes("resolveNumberingCompanyContextAsync"), "Lifecycle obsolete API enforces PDM company context");
assert(obsoleteRoute.includes("requestNumberingObsoleteApprovalAsync"), "Lifecycle obsolete API calls service");
assert(obsoleteRoute.includes("buildNumberingFormalRecordLifecyclePolicy"), "Lifecycle obsolete API returns updated policy");
assert(obsoleteRoute.includes("pendingObsoleteRequest: true"), "Lifecycle obsolete API returns review-stage policy after request");

assert(approvalsPage.includes("正式資料審核"), "Approval page title covers obsolete approvals");
assert(approvalsPage.includes("料號作廢"), "Approval page labels part obsolete action");
assert(approvalsPage.includes("圖號作廢"), "Approval page labels drawing obsolete action");
assert(!approvalsPage.includes("<th>DVT/發行動作</th>"), "Approval page no longer labels the action column as DVT/release only");

assert(policy.includes('"bom_workbench_draft"'), "Lifecycle policy supports BOM workbench formal records");
assert(policy.includes("buildBomWorkbenchDraftLifecyclePolicy"), "BOM lifecycle policy builder exists");
assert(policy.includes("pendingObsoleteRequest?: boolean"), "BOM policy accepts pending obsolete state");
assert(policy.includes('input.status === "Released" && input.pendingObsoleteRequest'), "BOM policy has released pending-obsolete branch");
assert(policy.includes("LIFE_OBSOLETE_FORMAL_RECORD"), "BOM formal records expose obsolete-only lifecycle rule");
assert(policy.includes("LIFE_OBSOLETE_CONTROLLED_HISTORY"), "BOM obsolete records use controlled-history lifecycle rule");

assert(dbSchema.includes("lifecycle_action TEXT NOT NULL DEFAULT 'release'"), "SQLite schema stores BOM review lifecycle action");
assert(postgresInitialSchema.includes("lifecycle_action TEXT NOT NULL DEFAULT 'release'"), "Postgres initial schema stores BOM review lifecycle action");
assert(bomRepository.includes("BomWorkbenchLifecycleAction"), "BOM review model supports release and obsolete actions");
assert(bomRepository.includes("requestObsoleteReview"), "BOM repository exposes obsolete request service");
assert(bomRepository.includes("SELECT_ASYNC_BOM_WORKBENCH_EXISTING_PENDING_OBSOLETE_REVIEW_SQL"), "BOM repository blocks duplicate obsolete requests");
assert(bomRepository.includes("OBSOLETE_ASYNC_BOM_WORKBENCH_DRAFT_RELEASE_SNAPSHOTS_SQL"), "BOM approval marks release snapshots obsolete");
assert(bomRepository.includes("OBSOLETE_ASYNC_BOM_WORKBENCH_DRAFT_SQL"), "BOM approval marks released draft obsolete");
assert(bomRepository.includes('lifecycleAction: "obsolete"'), "BOM obsolete requests enter the review queue with obsolete action type");
assert(bomRepository.includes("lifecycle.obsolete.requested"), "BOM obsolete request writes lifecycle audit");
assert(bomRepository.includes("lifecycle.obsolete.approved"), "BOM obsolete approval writes lifecycle audit");
assert(bomRepository.includes("lifecycle.obsolete.rejected"), "BOM obsolete rejection writes lifecycle audit");
assert(bomRepository.includes("approve_obsolete"), "BOM obsolete approval writes edit event");
assert(bomRepository.includes("reject_obsolete"), "BOM obsolete rejection writes edit event");
assert(bomFacade.includes("requestBomWorkbenchObsoleteReviewAsync"), "BOM facade exports obsolete request service");
assert(bomObsoleteRoute.includes("canReadBomDraftAsync"), "BOM obsolete API enforces BOM draft access");
assert(bomObsoleteRoute.includes("requestBomWorkbenchObsoleteReviewAsync"), "BOM obsolete API calls service");
assert(bomObsoleteRoute.includes("buildBomWorkbenchDraftLifecyclePolicy"), "BOM obsolete API returns policy");
assert(bomObsoleteRoute.includes("pendingObsoleteRequest: true"), "BOM obsolete API returns review-stage policy after request");
assert(bomReviewsPage.includes("核准作廢"), "BOM review UI exposes obsolete approval action");
assert(bomReviewsPage.includes("退回申請"), "BOM review UI exposes obsolete rejection action");
assert(bomReviewsPage.includes("作廢審核"), "BOM review UI labels obsolete review cards");
assert(bomWorkbenchPage.includes("/obsolete-request"), "BOM workbench UI posts obsolete request");
assert(bomWorkbenchPage.includes('selectedDraft?.status === "Released"'), "BOM workbench UI only exposes obsolete action on released drafts");
assert(bomWorkbenchPage.includes("作廢原因"), "BOM workbench UI collects obsolete reason");
assert(bomWorkbenchPage.includes("申請作廢"), "BOM workbench UI uses formal obsolete label");

assert(policy.includes('"submission"'), "Lifecycle policy supports formal submission records");
assert(policy.includes("buildSubmissionLifecyclePolicy"), "Submission lifecycle policy builder exists");
assert(policy.includes("input.status === \"Released\" && input.pendingObsoleteRequest"), "Submission policy has released pending-obsolete branch");
assert(dbSchema.includes("CREATE TABLE IF NOT EXISTS submission_lifecycle_requests"), "SQLite schema stores submission obsolete requests");
assert(postgresInitialSchema.includes("CREATE TABLE IF NOT EXISTS submission_lifecycle_requests"), "Postgres schema stores submission obsolete requests");
assert(submissionRepository.includes("SELECT_ASYNC_PENDING_SUBMISSION_OBSOLETE_REQUEST_SQL"), "Submission repository blocks duplicate obsolete requests");
assert(submissionRepository.includes("OBSOLETE_ASYNC_SUBMISSION_SQL"), "Submission approval marks formal record obsolete");
assert(submissionRepository.includes("lifecycle.obsolete.requested"), "Submission obsolete request writes audit");
assert(submissionRepository.includes("lifecycle.obsolete.approved"), "Submission obsolete approval writes audit");
assert(submissionRepository.includes("lifecycle.obsolete.rejected"), "Submission obsolete rejection writes audit");
assert(submissionFacade.includes("requestSubmissionObsoleteReviewAsync"), "Submission facade exports obsolete request service");
assert(submissionObsoleteRoute.includes("requestSubmissionObsoleteReviewAsync"), "Submission obsolete API calls request service");
assert(submissionObsoleteRoute.includes("buildSubmissionLifecyclePolicy"), "Submission obsolete API returns policy");
assert(submissionObsoleteApproveRoute.includes("approveSubmissionObsoleteReviewAsync"), "Submission obsolete approval API calls service");
assert(submissionObsoleteRejectRoute.includes("rejectSubmissionObsoleteReviewAsync"), "Submission obsolete rejection API calls service");
assert(dashboardPage.includes("申請作廢"), "Dashboard uses formal obsolete request label");
assert(dashboardPage.includes("核准作廢"), "Dashboard uses formal obsolete approval label");
assert(dashboardPage.includes("退回申請"), "Dashboard uses formal obsolete rejection label");
assert(dashboardPage.includes("已作廢"), "Dashboard shows approved obsolete state");

console.log(`qc:pdm-lifecycle-obsolete passed ${checks.length}/${checks.length} checks`);
